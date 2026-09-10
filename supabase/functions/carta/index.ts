// c��══════════════════════════════════════════════════════════════════════════
//  carta — la carta que abre el cliente desde WhatsApp
//
//  Sirve dos cosas y nada más:
//
//    abrir   → con un token, devuelve la carta de ESE restaurante, sus medios
//              de pago, lo que se le puede ofrecer, y —si es él— su saldo y
//              sus puntos.
//    guardar → escribe lo que escogió en el `pedido_borrador` de su
//              conversación, que es el mismo que Paco ya entiende.
//
//  ── LO QUE NO HACE, Y ES A PROPÓSITO ───────────────────────────────────────
//  No cobra. No descuenta saldo. No gasta puntos. No crea el pedido.
//
//  Regla de Sergio (8-sep): *"si ya se va al chat, ya se queda en el chat"*.
//  La página recoge la intención y se cierra; todo lo que toca dinero pasa
//  después, con Paco, donde la persona ya está. Así esta función queda de
//  SOLO LECTURA frente al dinero: aunque alguien la manipule, no puede gastar
//  nada de nadie.
//
//  ── EL TOKEN ES LA IDENTIDAD ───────────────────────────────────────────────
//  Quien abre esto no tiene cuenta ni sesión. El token dice de qué
//  conversación es, y de ahí salen el restaurante y el teléfono. Por eso el
//  cuerpo NUNCA manda tenant ni teléfono: si se creyera lo que manda la
//  pantalla, cualquiera podría pedir a nombre de otro número — y ese pedido
//  entra a la cocina.
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/*  La abre gente sin sesión, desde el navegador de WhatsApp. Sin esto el
    preflight se responde con 405 y la pantalla dice "Failed to fetch" sin
    explicar nada — ya nos pasó con el cobro.                              */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (c: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: c, headers: { ...CORS, "Content-Type": "application/json" } });

async function db(ruta: string, opts: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, {
    ...opts,
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json", ...(opts.headers || {}),
    },
  });
  const t = await r.text();
  let d: unknown = null;
  try { d = t ? JSON.parse(t) : null; } catch { /* no era JSON */ }
  return { ok: r.ok, status: r.status, text: t, data: d };
}

/*  ══ LA BILLETERA: QUIEN ES, CUANTO TIENE, Y EL CODIGO ════════════════════

    ⚠️ COPIA A PROPOSITO de lo que ya hace el motor (`clienteBilleteraDR`,
    `enviarCodigoPagoDR`). Las Edge Functions se despliegan como UN archivo:
    no hay modulo comun. Lo que SI se comparte es lo que importa —la misma
    tabla `pos_web_codigos`, el mismo motivo "pago", los mismos topes— asi que
    un codigo pedido aqui y uno pedido en el chat son el mismo libro.       */
async function sha256Hex(s: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function clienteBilletera(tenant: string, tel10: string) {
  const r = await db(`pos_clientes?tenant_id=eq.${tenant}&telefono=like.*${tel10}&select=id,telefono&limit=5`);
  const c = filas(r.data).find((x) => String(x.telefono || "").replace(/\D/g, "").slice(-10) === tel10);
  if (!c) return null;
  const cr = await db(`pos_web_credenciales?cliente_id=eq.${c.id}&select=cliente_id&limit=1`);
  return { id: String(c.id), registrado: filas(cr.data).length > 0 };
}

/*  El saldo se lee por la MISMA funcion con la que el motor lo descuenta. La
    tabla `pos_saldo` sirve para enseNarlo; para decidir si alcanza, no: si las
    dos fuentes se separan, aqui diriamos que si y alli que no.            */
async function saldoDe(tenant: string, clienteId: string): Promise<number> {
  const r = await db(`rpc/fn_saldo_cliente`, {
    method: "POST", body: JSON.stringify({ p_tenant: tenant, p_cliente: clienteId }),
  });
  const d = r.data as unknown;
  const v = Array.isArray(d) ? (d[0] as Fila)?.saldo : d;
  return Math.round(Number(v) || 0);
}

/*  Se manda por SMS a proposito, no por WhatsApp: si el codigo viajara por el
    mismo sitio donde se esta pidiendo, quien tuviera el WhatsApp abierto lo
    tendria todo. Dos canales distintos es lo que lo hace una comprobacion. */
async function mandarCodigoSMS(tenant: string, tel10: string, monto: number, marca: string, dominio: string): Promise<string> {
  /*  ══ ¿YA TIENE UNO VIVO? ══════════════════════════════════════════════
      Entonces no se le manda otro. El que tiene en la mano sirve, y dos
      mensajes seguidos solo consiguen que pruebe el equivocado. De paso, el
      que toca "Usar mi saldo", se arrepiente y vuelve, no gasta un SMS cada
      vez ni se choca contra el tope.                                     */
  const vivo = await db(`pos_web_codigos?tenant_id=eq.${tenant}&telefono=eq.${tel10}` +
    `&usado=eq.false&motivo=eq.pago&expira_at=gt.${new Date().toISOString()}` +
    `&intentos=lt.3&order=created_at.desc&select=id&limit=1`);
  if (filas(vivo.data).length > 0) return "";

  const desdeHora = new Date(Date.now() - 3600000).toISOString();
  const ult = await db(`pos_web_codigos?tenant_id=eq.${tenant}&telefono=eq.${tel10}&created_at=gte.${desdeHora}&select=id`);
  if (filas(ult.data).length >= 3) return "pediste varios códigos seguidos. Espera unos minutos y vuelve a intentarlo";
  const codigo = String(Math.floor(100000 + Math.random() * 900000));
  const ins = await db(`pos_web_codigos`, {
    method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      tenant_id: tenant, telefono: tel10,
      codigo_hash: await sha256Hex(codigo + "|" + tel10),
      motivo: "pago", expira_at: new Date(Date.now() + 10 * 60000).toISOString(),
    }),
  });
  if (!ins.ok) return "no pudimos preparar tu código. Inténtalo otra vez";
  const sid = Deno.env.get("TWILIO_SID") || "", tok = Deno.env.get("TWILIO_TOKEN") || "", desde = Deno.env.get("TWILIO_FROM") || "";
  if (!sid || !tok || !desde) return "no pudimos enviarte el código a tu celular";
  /*  ══ EL RENGLON QUE HACE QUE ANDROID LO ESCRIBA SOLO ═══════════════
      Chrome en Android no lee los SMS: espera un formato exacto (WebOTP).
      El mensaje tiene que TERMINAR en "@dominio #codigo", en su propio
      renglon y sin nada detras. Un espacio de mas y deja de funcionar.

      El dominio sale de la configuracion de la carta, no escrito a mano: si
      el restaurante la sirve desde otro dominio, tiene que ir el suyo o
      Android lo ignora — y ademas es una comprobacion de seguridad, no un
      adorno: asi el codigo solo se autocompleta en NUESTRA pagina.

      A iOS este renglon no le estorba: el lee el numero del texto.

      Sin tildes: un SMS con acentos se parte en dos y se cobra doble.   */
  const texto = codigo + " es tu codigo para pagar $ " + Math.round(monto).toLocaleString("es-CO")
    + " en " + marca + ". Vence en 10 minutos. No se lo compartas a nadie."
    + (dominio ? "\n\n@" + dominio + " #" + codigo : "");
  const r = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + sid + "/Messages.json", {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(sid + ":" + tok), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: "+57" + tel10, From: desde, Body: texto }).toString(),
  });
  if (!r.ok) {
    console.error("[carta/billetera] SMS:", (await r.text()).slice(0, 200));
    return "no pudimos enviarte el código a tu celular";
  }
  return "";
}

/*  Devuelve "" si el codigo es bueno; si no, lo que hay que decirle. Los topes
    son los de siempre: 10 minutos, 3 intentos.                            */
async function comprobarCodigo(tenant: string, tel10: string, codigo: string): Promise<string> {
  const cod = String(codigo || "").replace(/\D/g, "");
  if (cod.length !== 6) return "el código son 6 números";
  const r = await db(`pos_web_codigos?tenant_id=eq.${tenant}&telefono=eq.${tel10}&usado=eq.false&motivo=eq.pago&order=created_at.desc&select=*&limit=1`);
  const c = filas(r.data)[0];
  if (!c) return "ese código ya no está vigente. Vuelve a intentarlo y te mandamos uno nuevo";
  if (new Date(String(c.expira_at)).getTime() < Date.now()) return "ese código ya venció. Vuelve a intentarlo y te mandamos uno nuevo";
  if (Number(c.intentos) >= 3) return "ese código se bloqueó por intentos. Vuelve a intentarlo y te mandamos uno nuevo";
  if ((await sha256Hex(cod + "|" + tel10)) !== String(c.codigo_hash)) {
    await db(`pos_web_codigos?id=eq.${c.id}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ intentos: Number(c.intentos) + 1 }),
    });
    const quedan = 3 - Number(c.intentos) - 1;
    return quedan > 0 ? `ese código no es. Te ${quedan === 1 ? "queda 1 intento" : "quedan " + quedan + " intentos"}`
                      : "ese código se bloqueó por intentos. Vuelve a intentarlo y te mandamos uno nuevo";
  }
  await db(`pos_web_codigos?id=eq.${c.id}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ usado: true }),
  });
  return "";
}

type Fila = Record<string, unknown>;
const filas = (x: unknown) => Array.isArray(x) ? x as Fila[] : [];

/*  ══ EL EMPAQUE ═══════════════════════════════════════════════════════════
    Sergio: *"los clientes se enredan y dicen 'no costaba 52.000'... toca
    explicarle que es por el empaque"*. Así que el precio sale ya sumado.

    La cascada es la MISMA que usa la caja (`posEmpaqueCalc`): general → lo
    pisa la categoría → lo pisa el producto → lo pisa la presentación. Si aquí
    se calculara distinto, la página diría un precio y el tiquete otro, que es
    exactamente el problema que se quería quitar.                          */
function empaqueDe(cfg: Fila, prodId: string, catId: string, presId: string, precio: number): number {
  if (!cfg || !cfg.empaquesActivo) return 0;
  const packs = new Map<string, number>();
  for (const p of filas(cfg.empaquePacks)) packs.set(String(p.id), Number(p.monto) || 0);
  const general = Number(cfg.empaqueMonto) || 0;

  if (cfg.empaqueModo !== "especifico") {
    //  Modo unificado: fijo por unidad, o un porcentaje del precio.
    if (cfg.empaqueTipo === "porcentaje") {
      return Math.round(precio * (Number(cfg.empaquePct) || 0) / 100);
    }
    return cfg.empaqueBase === "pedido" ? 0 : general;   // por pedido no es por unidad
  }

  let fee = general;
  const cc = (cfg.empaqueCatCfg as Record<string, Fila> | undefined)?.[catId];
  if (cc) {
    if (cc.on === false) fee = 0;
    else if (cc.packId) fee = packs.get(String(cc.packId)) || 0;
  }
  const pc = (cfg.empaqueProdCfg as Record<string, string> | undefined)?.[prodId];
  if (pc !== undefined && pc !== null && pc !== "") {
    fee = pc === "none" ? 0 : pc === "general" ? general : (packs.get(pc) || 0);
  }
  const sc = (cfg.empaquePresCfg as Record<string, string> | undefined)?.[`${prodId}::${presId}`];
  if (sc !== undefined && sc !== null && sc !== "") {
    fee = sc === "none" ? 0 : sc === "general" ? general : (packs.get(sc) || 0);
  }
  return fee;
}

/*  ══ ¿ESTA ABIERTO? ══════════════════════════════════════════════════════
    Sergio, 8-sep: *"una persona que tenga el enlace podria entrar y hacer un
    pedido en un dia que tengamos cerrado"*. El enlace dura dos horas, y el
    restaurante puede cerrar en medio.

    La cuenta es la MISMA que hace Paco en `buildHorariosText`: el dia de la
    semana en la zona del restaurante y los minutos desde medianoche. Si aqui
    se calculara distinto, la pagina diria una cosa y Paco otra.

    Se comprueba DOS VECES: al abrir la carta y al mandar el pedido. Entre una
    y otra pueden pasar veinte minutos, y a las 22:30 eso es la diferencia
    entre un pedido y una cocina apagada.                                   */
const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const NOMBRE_DIA: Record<string, string> = {
  domingo: "domingo", lunes: "lunes", martes: "martes", miercoles: "miércoles",
  jueves: "jueves", viernes: "viernes", sabado: "sábado",
};
function hhmm(s: string): number {
  const p = String(s || "").split(":");
  return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0);
}
function hora12(s: string): string {
  const m = hhmm(s), h = Math.floor(m / 60), mi = m % 60;
  /*  Sin el punto final: la frase ya lo pone y salia "6:30 p.m..".  */
  const ap = h >= 12 ? "p.m" : "a.m";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${mi ? ":" + String(mi).padStart(2, "0") : ""} ${ap}`;
}


/*  Lo que se busca en las zonas: todo lo que el cliente escribio, junto. El
    buscador rastrea el nombre del barrio o del conjunto DENTRO del texto —es
    lo que hace hoy con lo que le escriben a Paco—, asi que darle las cuatro
    casillas pegadas es darle mas donde encontrar, no menos.              */
function textoDireccion(body: Fila): string {
  return [body.conjunto, body.barrio, body.direccion, body.unidad]
    .map((x) => String(x || "").trim()).filter(Boolean).join(" ").slice(0, 200);
}

/*  ══ EL BUSCADOR DE ZONAS ═════════════════════════════════════════════════

    Copiado TAL CUAL de delay-reply, y a proposito: el precio del domicilio lo
    tiene que decidir el MISMO algoritmo aqui y alla. Si aqui se calculara de
    otra forma, el cliente veria un precio en la pantalla de pago y Paco le
    diria otro en el resumen — y el que se equivoca siempre parece el
    restaurante.

    No se puede compartir el archivo: cada funcion de Supabase se despliega
    como UN solo archivo, sin modulos comunes.

    ⚠️ SI SE TOCA EL BUSCADOR, SE TOCA EN LOS DOS SITIOS.                   */
function normalizarTexto(s: string): string {
  return s.toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? prevDiag : 1 + Math.min(prev[j], prev[j - 1], prevDiag);
      prevDiag = tmp;
    }
  }
  return prev[b.length];
}

function fuzzyBarrioMatch(direccion: string, barrio: string): boolean {
  const dirNorm = normalizarTexto(direccion);
  const barNorm = normalizarTexto(barrio);
  if (!dirNorm || !barNorm) return false;

  // 1) El nombre aparece tal cual. Este camino nunca fallo y se conserva.
  if (dirNorm.includes(barNorm)) return true;
  const dirSinEsp = dirNorm.replace(/[ ]/g, "");
  const barSinEsp = barNorm.replace(/[ ]/g, "");
  if (dirSinEsp.includes(barSinEsp)) return true;

  // 2) Palabras de relleno de una direccion: aparecen en casi todas y no
  //    pueden ser las que hagan coincidir un barrio. Sin esto, "Catay"
  //    coincidia con el "casa" de "Monteluna casa 45".
  const RELLENO: Record<string, boolean> = {
    calle: true, carrera: true, cra: true, kra: true, cr: true, kr: true,
    avenida: true, av: true, transversal: true, diagonal: true, via: true,
    casa: true, apto: true, apartamento: true, torre: true, bloque: true,
    manzana: true, mz: true, lote: true, piso: true, interior: true,
    barrio: true, conjunto: true, edificio: true, urbanizacion: true,
    norte: true, sur: true, este: true, oeste: true, numero: true, no: true,
  };

  const dirWords = dirNorm.split(" ").filter(w => w && !RELLENO[w] && !/^[0-9#-]+$/.test(w));
  const barWords = barNorm.split(" ").filter(Boolean);
  if (!dirWords.length || !barWords.length) return false;

  // 3) Un barrio de UNA palabra corta exige coincidencia exacta: con "Catay"
  //    o "Toez" cualquier tolerancia produce falsos.
  if (barWords.length === 1 && barSinEsp.length <= 6) {
    return dirWords.includes(barNorm);
  }

  // 4) Tolerancia estricta: 1 letra en palabras cortas, 2 solo en largas.
  //    Antes una palabra de 5 letras admitia 2 cambios (40% de la palabra) y
  //    por eso "calle" pasaba por "bella".
  const cerca = (a: string, b: string): boolean => {
    if (a === b) return true;
    const maxDist = b.length >= 8 ? 2 : 1;
    if (levenshtein(a, b) > maxDist) return false;
    /* PARA NOMBRES DE UNA SOLA PALABRA la errata ademas tiene que EMPEZAR
       igual (20-ago-2026, pedido real de Fernanda): "viento" —de "Villa del
       viento", un barrio de verdad— quedaba a 1 letra del conjunto "Vivento"
       y el pedido salio con una direccion que la clienta nunca dijo. Un
       error de dedo real ("balmorral" por "Balmoral") conserva el arranque;
       dos palabras distintas casi nunca. */
    if (barWords.length === 1) return a.slice(0, 3) === b.slice(0, 3);
    return true;
  };

  // Cada palabra del barrio debe encontrar SU propia palabra en la direccion:
  // dos palabras del barrio no pueden apoyarse en la misma.
  const usadas: Record<number, boolean> = {};
  const todasCoinciden = barWords.every(bw => {
    if (bw.length <= 2) {
      const i = dirWords.findIndex((dw, k) => !usadas[k] && dw === bw);
      if (i < 0) return false;
      usadas[i] = true;
      return true;
    }
    const i = dirWords.findIndex((dw, k) => !usadas[k] && cerca(dw, bw));
    if (i < 0) return false;
    usadas[i] = true;
    return true;
  });
  if (todasCoinciden) return true;

  // 5) Nombre largo escrito de corrido o con erratas ("bellohorizonte").
  //    Se mantiene, pero mas estricto: 1 error cada 10 letras.
  if (barSinEsp.length >= 10) {
    const L = barSinEsp.length;
    const maxDist = Math.floor(L / 10);
    for (let i = 0; i <= dirSinEsp.length - L; i++) {
      if (levenshtein(dirSinEsp.slice(i, i + L), barSinEsp) <= maxDist) return true;
    }
  }
  return false;
}

function lookupDomiPrice(direccion: string, domicilios: Record<string, unknown> | null | undefined): number | null {
  if (!domicilios) return null;
  const zonas = (domicilios.zonas as Array<{ nombre?: string; barrios?: string[]; conjuntos?: string[]; precio: number }>) || [];
  for (const z of zonas) {
    const barrios = z.barrios ?? (z.nombre ? z.nombre.split(",").map((b: string) => b.trim()) : []);
    for (const b of barrios) { if (fuzzyBarrioMatch(direccion, b)) return z.precio; }
    /* LOS CONJUNTOS TAMBIÉN TIENEN PRECIO. Vivían en su propia lista y esta
       búsqueda solo miraba la de barrios: en cuanto un sitio se marcaba como
       conjunto, el domicilio se quedaba sin precio y Paco pasaba la
       conversación al humano por algo que sí estaba configurado.
       La lista dice CÓMO se pregunta la dirección (torre y apto, o completa);
       el precio es del sitio, esté en la lista que esté. */
    for (const c of (z.conjuntos || [])) { if (c && fuzzyBarrioMatch(direccion, c)) return z.precio; }
  }
  return null;
}

function esConjunto(
  text: string,
  domicilios: Record<string, unknown> | null | undefined,
): string | null {
  if (!domicilios || !text) return null;
  const zonas = (domicilios.zonas as Array<{ conjuntos?: string[] }>) || [];
  for (const z of zonas) {
    for (const c of (z.conjuntos || [])) {
      if (c && fuzzyBarrioMatch(text, c)) return c;
    }
  }
  return null;
}


function estadoHorario(horarios: Fila | null, tzOffset: number) {
  if (!horarios || !Object.keys(horarios).length) return { abierto: true, texto: "" };
  const ahora = new Date(Date.now() + tzOffset * 3600000);
  const hoy = DIAS[ahora.getUTCDay()];
  const min = ahora.getUTCHours() * 60 + ahora.getUTCMinutes();
  const d = horarios[hoy] as Fila | undefined;

  if (d && d.activo && min >= hhmm(String(d.abre)) && min < hhmm(String(d.cierra))) {
    return { abierto: true, texto: `Abierto · cierra a las ${hora12(String(d.cierra))}` };
  }
  //  Cuando vuelve a abrir: hoy más tarde, o el próximo día con servicio.
  if (d && d.activo && min < hhmm(String(d.abre))) {
    return { abierto: false, texto: `Hoy abrimos a las ${hora12(String(d.abre))}.` };
  }
  for (let i = 1; i <= 7; i++) {
    const k = DIAS[(ahora.getUTCDay() + i) % 7];
    const dd = horarios[k] as Fila | undefined;
    if (dd && dd.activo) {
      const cuando = i === 1 ? "mañana" : `el ${NOMBRE_DIA[k]}`;
      return { abierto: false, texto: `Volvemos ${cuando} a las ${hora12(String(dd.abre))}.` };
    }
  }
  return { abierto: false, texto: "" };
}

/*  El enlace: existe, no ha caducado y no se ha usado. Las tres cosas, o no
    se abre. Un enlace usado que siguiera abriendo dejaría pedir dos veces.  */
async function abrirLink(token: string) {
  if (!token || token.length < 20) return { error: "enlace no válido" };
  const r = await db(`pos_carta_links?token=eq.${encodeURIComponent(token)}&select=*&limit=1`);
  const l = filas(r.data)[0];
  if (!l) return { error: "Este enlace no existe. Pídele la carta otra vez por el chat." };
  if (l.usado_at) return { error: "Este enlace ya se usó. Pídele la carta otra vez por el chat." };
  if (new Date(String(l.expira_at)).getTime() < Date.now()) {
    return { error: "Este enlace se venció. Pídele la carta otra vez por el chat." };
  }
  return { link: l };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let body: Fila = {};
  try { body = await req.json(); } catch { return json(400, { error: "cuerpo inválido" }); }
  const action = String(body.action || "");
  const token  = String(body.token || "");

  try {
    // ── ABRIR ─────────────────────────────────────────────────────────────
    if (action === "abrir") {
      const v = await abrirLink(token);
      if (v.error) return json(404, { error: v.error });
      const link = v.link as Fila;
      const tenant = String(link.tenant_id);
      const branch = String(link.branch_id || "");

      //  el restaurante
      const [mRes, bRes, cRes, pRes, iaRes] = await Promise.all([
        db(`brands?tenant_id=eq.${tenant}&select=name,logo_url&limit=1`),
        branch ? db(`branches?id=eq.${branch}&select=name,operacion_config&limit=1`)
               : db(`branches?tenant_id=eq.${tenant}&select=name,operacion_config&limit=1`),
        db(`pos_categories?tenant_id=eq.${tenant}&oculta_carta=is.false&select=id,name,description,sort_order,active&order=sort_order.nullsfirst`),
        db(`pos_products?tenant_id=eq.${tenant}&available=is.true&select=id,name,description,price,photo_url,image_url,presentations,variables,price_mode,mod_group_ids,mod_group_pres,category_id,agotado,sort_order&order=sort_order.nullsfirst`),
        db(`ia_config?tenant_id=eq.${tenant}&select=pagos,flujo_pasos&limit=1`),
      ]);
      if (!cRes.ok || !pRes.ok) {
        console.error("[carta] no se pudo leer la carta:", cRes.status, pRes.status);
        return json(502, { error: "no se pudo leer la carta" });
      }

      const marca = filas(mRes.data)[0] || {};
      const sede  = filas(bRes.data)[0] || {};
      const cfg   = (sede.operacion_config as Fila) || {};

      //  los grupos de adiciones que configuró el dueño
      const gRes = await db(`pos_modifier_groups?tenant_id=eq.${tenant}&select=id,name,options`);
      const grupos = new Map<string, Fila>();
      for (const g of filas(gRes.data)) grupos.set(String(g.id), g);

      const cats = filas(cRes.data).filter((c) => c.active !== false);
      const catNom = new Map<string, string>();
      for (const c of cats) catNom.set(String(c.id), String(c.name));

      /*  ══ LAS BASES, DE DONDE DE VERDAD VIVEN ═════════════════════════════
          `pos_bases` — Inventario > Bases de recetas. Cada base tiene sus
          ingredientes y la lista de productos a los que aplica.

          Va por PRODUCTO y no por categoria, que es mas fino: dos productos
          de la misma categoria pueden llevar bases distintas y esta tabla lo
          permite. (Yo lo habia leido de la descripcion de la categoria: ahi
          esta vacio, y de ahi salio mi "no existe en ninguna parte".)     */
      const baseDe = new Map<string, Fila>();
      try {
        const bRes = await db(`pos_bases?tenant_id=eq.${tenant}&select=name,ingredients,product_ids`);
        for (const bs of filas(bRes.data)) {
          const ing = filas(bs.ingredients).map((x) => String(x)).filter(Boolean);
          if (!ing.length) continue;
          for (const pid of filas(bs.product_ids).map(String)) {
            baseDe.set(pid, { n: String(bs.name || "").trim(), ing });
          }
        }
      } catch (e) { console.error("[carta] bases:", String(e).slice(0, 120)); }

      const prods: Fila[] = [];
      for (const p of filas(pRes.data)) {
        if (p.agotado === true) continue;                       // lo agotado no aparece
        const catId = String(p.category_id || "");
        if (!catNom.has(catId)) continue;                       // categoría escondida o apagada
        const pres = filas(p.presentations);
        if (!pres.length) continue;

        const emp: Record<string, number> = {};
        for (const x of pres) {
          emp[String(x.id)] = empaqueDe(cfg, String(p.id), catId, String(x.id), Number(x.price) || 0);
        }

        //  qué adiciones aplican a cada presentación (Personales / Familiares)
        const adic: Record<string, Fila> = {};
        const mgp = (p.mod_group_pres as Record<string, string[]> | null) || {};
        for (const [gid, presIds] of Object.entries(mgp)) {
          const g = grupos.get(gid);
          if (!g) continue;
          for (const pid of (presIds || [])) adic[pid] = { n: g.name, ops: filas(g.options).map((o) => ({ n: o.name, p: Number(o.price) || 0 })) };
        }
        if (!Object.keys(adic).length) {
          for (const gid of filas(p.mod_group_ids).map(String)) {
            const g = grupos.get(gid);
            if (g) { adic[String(pres[0].id)] = { n: g.name, ops: filas(g.options).map((o) => ({ n: o.name, p: Number(o.price) || 0 })) }; break; }
          }
        }

        prods.push({
          id: p.id, cat: catNom.get(catId), catId,
          /*  Su base: el nombre y sus ingredientes. Si ese producto no tiene
              base asignada, no se habla de ninguna.                     */
          base: baseDe.get(String(p.id)) || null,
          n: String(p.name || "").trim(),
          d: String(p.description || "").slice(0, 120),
          f: p.photo_url || p.image_url || "",
          pres: pres.map((x) => ({ id: x.id, n: x.name || "", p: Number(x.price) || 0 })),
          emp,
          vg: filas(p.variables).map((g) => ({
            id: g.id, n: g.name, precia: g.isPricing === true,
            ops: filas(g.options).map((o) => ({
              id: o.id, n: o.name, p: Number(o.price) || 0,
              prs: filas(o.prices).map((y) => Number(y) || 0),
            })),
          })),
          adic,
        });
      }

      //  los medios de pago activos, en su orden
      const ia = filas(iaRes.data)[0] || {};
      const pagos = filas((ia.pagos as Fila | undefined)?.metodos)
        .filter((m) => m.activo !== false)
        .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0))
        .map((m) => ({ id: m.id, n: m.nombre, tipo: m.tipo, banco: m.banco || "" }));

      /*  Lo que se ofrece al agregar sale del paso `upsell` del flujo de Paco.
          Si se escribiera otra lista aquí, el día que el dueño cambie la suya
          tendríamos a Paco ofreciendo una cosa y a la página otra.        */
      const pasoUp = filas(ia.flujo_pasos).find((x) => x.campo === "upsell");
      const upsell = filas(pasoUp?.upsell_items).map((x) => ({
        tipo: x.tipo, nombre: x.nombre,
        cat: x.cat_id ? catNom.get(String(x.cat_id)) || "" : "",
      })).filter((x) => x.tipo !== "categoria" || x.cat);

      //  su saldo y sus puntos — SOLO para enseñarlos, nunca para gastarlos
      const tel = String(link.telefono || "").replace(/\D/g, "");
      const tel10 = tel.slice(-10);
      const [ptRes, clRes] = await Promise.all([
        db(`pos_puntos?tenant_id=eq.${tenant}&telefono=eq.${encodeURIComponent(tel10)}&select=puntos&limit=1`),
        db(`pos_clientes?tenant_id=eq.${tenant}&telefono=eq.${encodeURIComponent(tel10)}&select=id,nombre&limit=1`),
      ]);
      const cliente = filas(clRes.data)[0];
      let saldo = 0;
      if (cliente) {
        const sRes = await db(`pos_saldo?tenant_id=eq.${tenant}&cliente_id=eq.${cliente.id}&select=saldo&limit=1`);
        saldo = Number(filas(sRes.data)[0]?.saldo) || 0;
      }
      const puntos = Number(filas(ptRes.data)[0]?.puntos) || 0;

      /*  ══ SU DIRECCION DE SIEMPRE ═══════════════════════════════════════
          Para poder ofrecerle "¿va otra vez para alla?" de un toque. Hoy la
          tienen 147 de 303 clientes, y cada pedido por aqui suma uno mas.

          Sale de `fn_cliente_direccion_principal` —la de MAS pedidos, con
          empate por la mas reciente—, que es la regla que Sergio ya decidio y
          que Paco ya usa. Si esa no dice nada, la de la ficha.            */
      let dirGuardada: Fila | null = null;
      let otrasDirs: Fila[] = [];
      if (cliente?.id) {
        try {
          const pr = await db(`rpc/fn_cliente_direccion_principal`, {
            method: "POST", body: JSON.stringify({ p_cliente: cliente.id }),
          });
          const d0 = filas(pr.data)[0];
          if (d0?.direccion) dirGuardada = { direccion: String(d0.direccion), barrio: String(d0.barrio || "") };
        } catch (e) { console.error("[carta] direccion principal:", String(e).slice(0, 120)); }
        /*  Su ficha, para la de siempre y para LAS DEMAS. La lista ya existe
            —119 clientes la tienen llena— y es la que se le va a enseNar si
            dice "otra direccion".                                        */
        const fr = await db(`pos_clientes?id=eq.${cliente.id}&select=direccion,barrio,direcciones&limit=1`);
        const f0 = filas(fr.data)[0];
        if (!dirGuardada && f0?.direccion) {
          dirGuardada = { direccion: String(f0.direccion), barrio: String(f0.barrio || "") };
        }
        /*  Sin repetir la principal: verla dos veces en la lista hace dudar
            de si son la misma o hay una mal escrita.                     */
        const pelar = (s: unknown) => String(s || "").toLowerCase().normalize("NFD")
          .replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
        const yaEsta = pelar(dirGuardada?.direccion);
        otrasDirs = filas(f0?.direcciones)
          .map((x) => ({ direccion: String(x.dir || "").trim(), barrio: String(x.barrio || "").trim() }))
          .filter((x) => x.direccion && pelar(x.direccion) !== yaEsta)
          .slice(0, 6);
      }

      /*  ¿Este restaurante hace domicilios? Un negocio que solo recoge no
          tiene por que ver la pantalla de la entrega.                     */
      const dmRes = await db(`ia_config?tenant_id=eq.${tenant}&select=domicilios&limit=1`);
      const dmCfg = (filas(dmRes.data)[0]?.domicilios as Fila) || {};
      const hayDomicilios = dmCfg.activo !== false;
      /*  ══ PARA RECOGER, ¿SE PAGA ANTES? ═════════════════════════════════
          El MISMO interruptor que ya usa Paco en el chat
          (`domicilios.llevar_prepago`) y la MISMA frase configurable
          (`frases.llevar_efectivo`). No se escribe la regla otra vez: dos
          reglas iguales en dos sitios se separan a la primera.          */

      //  el catálogo de premios, para poder decirle qué alcanza
      const prRes = await db(`pos_puntos_catalogo?tenant_id=eq.${tenant}&select=product_id,pres_nombre,puntos,dinero,activo&order=puntos.asc`);
      /*  Los nombres de los premios salen de `pos_products` directamente, NO de
          la lista que se envía a la pantalla. Muchos premios son adiciones, y
          esa categoría suele estar escondida de la carta pública: buscándolos
          ahí, la "Adición Salsa · Rosada" salía llamándose "Combo · Rosada".  */
      /*  Con sus presentaciones: la pagina necesita el id de la presentacion
          para poder aNadir el premio como una linea mas. Sin filtro de
          "disponible" ni de categoria — un premio puede vivir en una
          categoria escondida de la carta, y de hecho la mayoria vive ahi:
          cinco de los catorce premios son salsas.                        */
      const npRes = await db(`pos_products?tenant_id=eq.${tenant}&select=id,name,presentations`);
      const nomProd = new Map<string, string>();
      const presProd = new Map<string, Fila[]>();
      for (const p of filas(npRes.data)) {
        nomProd.set(String(p.id), String(p.name || "").trim());
        presProd.set(String(p.id), filas(p.presentations));
      }
      const premios = filas(prRes.data)
        .filter((x) => x.activo !== false)
        .map((x) => {
          const base = nomProd.get(String(x.product_id)) || "Combo";
          const pn = String(x.pres_nombre || "").trim();
          /*  `pid` y `pres` viajan para poder cruzar el premio con lo que el
              cliente YA tiene en el carrito. Cruzarlo por el nombre bonito
              seria comparar texto — justo lo que aqui no se hace.        */
          /*  La presentacion exacta: la que se llama igual, o la unica que
              tenga. Si no se encuentra, `pres_id` va vacio y la pagina lo
              manda por el chat en vez de aNadir una linea equivocada.    */
          const lista = presProd.get(String(x.product_id)) || [];
          const elegida = pn
            ? lista.find((y) => String(y.name || "").trim().toLowerCase() === pn.toLowerCase())
            : (lista.length === 1 ? lista[0] : null);
          return { n: pn ? `${base} · ${pn}` : base, pts: Number(x.puntos) || 0,
                   dinero: Number(x.dinero) || 0,
                   pid: String(x.product_id || ""), pres: pn,
                   pres_id: String(elegida?.id || "") };
        });

      /*  ══ EL BOTÓN DE VOLVER AL CHAT ════════════════════════════════════
          Sergio preguntó si la página se puede cerrar sola al terminar. No:
          `window.close()` solo cierra ventanas que abrió el propio código, y
          esta la abre WhatsApp — en su navegador interno no hace nada.

          Lo que sí se puede, y es mejor, es devolverla A LA CONVERSACIÓN. Y
          tiene que ser a la SUYA: alguien puede estar escribiendo por
          Instagram o por Facebook, y mandarlo a WhatsApp sería dejarlo en un
          chat que no es el suyo, con su pedido esperando en otro.
          ⚠️ De `meta` solo se saca lo público. Ahí viven los tokens.      */
      let volver = "";
      const chRes = await db(`chat_conversations?id=eq.${link.conv_id}&select=channel,channel_id&limit=1`);
      const conv = filas(chRes.data)[0] || {};
      if (conv.channel_id) {
        const caRes = await db(`chat_channels?id=eq.${conv.channel_id}&select=channel,handle,meta&limit=1`);
        const ca = filas(caRes.data)[0];
        if (ca) {
          const meta = (ca.meta as Fila) || {};
          const canal = String(ca.channel || conv.channel || "");
          if (canal === "whatsapp") {
            const num = String(ca.handle || "").replace(/\D/g, "");
            if (num) volver = "https://wa.me/" + num;
          } else if (canal === "instagram") {
            const u = String(meta.username || ca.handle || "").replace(/^@/, "");
            if (u) volver = "https://ig.me/m/" + u;
          } else if (canal === "facebook") {
            const pid = String(meta.page_id || "");
            if (pid) volver = "https://m.me/" + pid;
          }
        }
      }

      //  si vuelve a corregir, su pedido tal como quedó
      let borrador: unknown = null;
      if (link.motivo === "correccion") {
        const cvRes = await db(`chat_conversations?id=eq.${link.conv_id}&select=pedido_borrador&limit=1`);
        borrador = filas(cvRes.data)[0]?.pedido_borrador || null;
      }

      /*  El horario del restaurante, con la zona que tenga configurada.  */
      const horaRes = await db(`ia_config?tenant_id=eq.${tenant}&select=horarios,zona_horaria&limit=1`);
      const hCfg = filas(horaRes.data)[0] || {};
      const est = estadoHorario((hCfg.horarios as Fila) || null, Number(hCfg.zona_horaria ?? -5));

      return json(200, {
        ok: true,
        motivo: link.motivo,
        abierto: est.abierto,
        horario_txt: est.texto,
        restaurante: { nombre: marca.name || "", logo: marca.logo_url || "", sede: sede.name || "" },
        telefono: tel10,
        cats: cats.map((c) => String(c.name)),
        prods,
        pagos,
        upsell,
        premios,
        cliente: { saldo, puntos, nombre: cliente?.nombre || "",
                   direccion: dirGuardada, direcciones: otrasDirs },
        domicilios: hayDomicilios,
        /*  Solo el interruptor, no el texto. La regla es la misma que la de
            Paco; las PALABRAS no: el chat conversa y el cartel informa.  */
        llevar_prepago: dmCfg.llevar_prepago !== false,
        empaque_activo: cfg.empaquesActivo === true,
        volver,
        borrador,
      });
    }

    /*  ══ CUANTO CUESTA EL DOMICILIO HASTA ALLA ════════════════════════════

        La pagina manda la direccion y recibe UN NUMERO. Nunca la tabla de
        zonas: los precios de domicilio de un restaurante no tienen por que
        quedar a la vista de cualquiera que abra la carta, y ademas la plata la
        calcula el servidor — la misma regla de los productos.

        `conocida: false` no es un error: es el caso de siempre. El pedido
        entra igual, a la persona le sale el modal del precio y Paco sigue.  */
    if (action === "cotizar") {
      const v = await abrirLink(token);
      if (v.error) return json(404, { error: v.error });
      const link = v.link as Fila;
      const dmRes = await db(`ia_config?tenant_id=eq.${String(link.tenant_id)}&select=domicilios&limit=1`);
      const dm = (filas(dmRes.data)[0]?.domicilios as Fila) || {};
      const texto = textoDireccion(body);
      const precio = texto ? lookupDomiPrice(texto, dm) : null;
      return json(200, { ok: true, domicilio: precio ?? 0, conocida: precio !== null });
    }

    // ── GUARDAR ───────────────────────────────────────────────────────────
    if (action === "guardar") {
      const v = await abrirLink(token);
      if (v.error) return json(404, { error: v.error });
      const link = v.link as Fila;
      const tenant = String(link.tenant_id);

      /*  ⚠️ SE VUELVE A MIRAR EL HORARIO. Entre abrir la carta y darle a
          "hacer mi pedido" pueden pasar veinte minutos: a las 22:30 esa es la
          diferencia entre un pedido y una cocina apagada. Comprobarlo solo al
          abrir seria como mirar el saldo y no volver a mirarlo al cobrar.  */
      const hRes2 = await db(`ia_config?tenant_id=eq.${tenant}&select=horarios,zona_horaria&limit=1`);
      const h2 = filas(hRes2.data)[0] || {};
      const est2 = estadoHorario((h2.horarios as Fila) || null, Number(h2.zona_horaria ?? -5));
      if (!est2.abierto) {
        return json(409, {
          error: "Justo cerramos 😔 " + (est2.texto || "Escríbenos por el chat y te contamos."),
          cerrado: true,
        });
      }

      const items = filas(body.productos);
      if (!items.length) return json(400, { error: "el pedido está vacío" });
      if (items.length > 40) return json(400, { error: "demasiados productos" });

      /*  ══ LOS PRECIOS SE RECALCULAN AQUÍ, SIEMPRE ═══════════════════════
          La pantalla manda QUÉ escogió, nunca CUÁNTO vale. Si se creyera el
          precio que manda el navegador, cualquiera podría pedirse una
          Premium familiar por mil pesos — es exactamente el agujero que ya
          hubo con el monto del registro, donde la pantalla decía $1.000 y se
          cobraban $249.000 solo porque el servidor lo recalculaba.

          Aquí igual: del cuerpo se leen ids y cantidades; los precios salen
          de la base.                                                      */
      const ids = [...new Set(items.map((x) => String(x.product_id || "")))].filter(Boolean);
      const pRes = await db(`pos_products?tenant_id=eq.${tenant}&id=in.(${ids.join(",")})` +
        `&select=id,name,category_id,presentations,variables,mod_group_ids,mod_group_pres,available,agotado`);
      const porId = new Map<string, Fila>();
      for (const p of filas(pRes.data)) porId.set(String(p.id), p);

      const bRes = await db(link.branch_id
        ? `branches?id=eq.${link.branch_id}&select=id,operacion_config&limit=1`
        : `branches?tenant_id=eq.${tenant}&select=id,operacion_config&limit=1`);
      const sede = filas(bRes.data)[0] || {};
      const cfg = (sede.operacion_config as Fila) || {};

      const gRes = await db(`pos_modifier_groups?tenant_id=eq.${tenant}&select=id,name,options`);
      const grupos = new Map<string, Fila>();
      for (const g of filas(gRes.data)) grupos.set(String(g.id), g);

      const cRes = await db(`pos_categories?tenant_id=eq.${tenant}&select=id,name,comanda_alias`);
      const cats = new Map<string, Fila>();
      for (const c of filas(cRes.data)) cats.set(String(c.id), c);

      /*  El catalogo de premios de este restaurante, para comprobar contra el
          las lineas que vienen marcadas como premio.                      */
      const cpRes = await db(`pos_puntos_catalogo?tenant_id=eq.${tenant}&select=product_id,pres_nombre,puntos,activo`);
      const premiosCat = filas(cpRes.data).filter((x) => x.activo !== false);
      let puntosPedidos = 0;

      const productos: Fila[] = [];
      let subtotal = 0, empaque = 0;

      for (const it of items) {
        const p = porId.get(String(it.product_id || ""));
        if (!p) return json(400, { error: "un producto de tu pedido ya no está disponible" });
        if (p.available === false || p.agotado === true) {
          return json(409, { error: `Se acabó ${p.name}. Quita ese producto y vuelve a intentar.` });
        }
        const pres = filas(p.presentations);
        const presId = String(it.pres_id || "");
        const pr = pres.find((x) => String(x.id) === presId);
        if (!pr) return json(400, { error: "falta escoger el tamaño de un producto" });

        const cant = Math.max(1, Math.min(20, Number(it.cantidad) || 1));
        const vars = (it.variantes as Record<string, string> | undefined) || {};

        //  el precio base: por matriz si algún grupo fija el precio
        const vgs = filas(p.variables);
        const precia = vgs.find((g) => g.isPricing === true);
        let unit = Number(pr.price) || 0;
        const varsObj: Fila = {};
        const partes: string[] = [];

        for (const g of vgs) {
          const escogida = String(vars[String(g.id)] || "");
          const o = filas(g.options).find((x) => String(x.id) === escogida);
          if (!o) return json(400, { error: `falta escoger ${g.name} en ${p.name}` });
          varsObj[String(g.id)] = { id: o.id, name: o.name, price: Number(o.price) || 0, group: g.name };
          partes.push(String(o.name));
          if (g === precia) {
            const i = pres.findIndex((x) => String(x.id) === presId);
            const prs = filas(o.prices).map((y) => Number(y) || 0);
            unit = prs[i] != null ? prs[i] : (prs[0] != null ? prs[0] : Number(o.price) || 0);
          } else {
            unit += Number(o.price) || 0;
          }
        }

        //  las adiciones, con el precio del grupo QUE LE TOCA a esa presentación
        const mgp = (p.mod_group_pres as Record<string, string[]> | null) || {};
        let grupoAdic: Fila | null = null;
        for (const [gid, presIds] of Object.entries(mgp)) {
          if ((presIds || []).includes(presId)) { grupoAdic = grupos.get(gid) || null; break; }
        }
        if (!grupoAdic) {
          const uno = filas(p.mod_group_ids).map(String)[0];
          grupoAdic = uno ? (grupos.get(uno) || null) : null;
        }
        const adiciones: Fila[] = [];
        for (const nombre of filas(it.adiciones).map((x) => String((x as Fila).name ?? x))) {
          const o = grupoAdic ? filas(grupoAdic.options).find((x) => String(x.name) === nombre) : null;
          if (!o) return json(400, { error: `esa adición ya no está disponible en ${p.name}` });
          adiciones.push({ id: o.id, name: o.name, price: Number(o.price) || 0 });
          unit += Number(o.price) || 0;
        }

        /*  ══ ¿ESTA LINEA ES UN PREMIO? ═══════════════════════════════════
            Si lo es, cuesta 0 y suma sus puntos. Pero solo si el catalogo lo
            confirma: mismo producto y misma presentacion, y activo. Si no
            cuadra, no se rechaza el pedido entero —seria perder una venta por
            un premio— se cobra normal y el cliente lo ve en el resumen.  */
        let esPremio = false;
        if (it.premio === true) {
          const pm = premiosCat.find((x) => String(x.product_id) === String(p.id)
            && String(x.pres_nombre || "").trim().toLowerCase() === String(pr.name || "").trim().toLowerCase());
          if (pm) {
            esPremio = true;
            /*  Un premio es UNA unidad. Pedir tres y que las tres salgan
                gratis por los puntos de una seria regalar el doble.      */
            puntosPedidos += (Number(pm.puntos) || 0) * cant;
            unit = 0;
          } else {
            console.error("[carta] premio que no esta en el catalogo:", p.name, pr.name);
          }
        }

        const catId = String(p.category_id || "");
        const cat = cats.get(catId) || {};
        const emp = esPremio ? 0 : empaqueDe(cfg, String(p.id), catId, presId, Number(pr.price) || 0);

        //  el nombre, igual que en la comanda: presentación · producto · variantes
        const etiqueta = String(pr.name || "") || String(cat.comanda_alias || cat.name || "");
        productos.push({
          product_id: p.id, cat: catId,
          /*  El nombre COMPUESTO es para la comanda y el resumen; el limpio y
              el de la categoría son para que Paco arme su estado sin tener que
              partir la cadena por los puntos. Partir texto que uno mismo
              compuso es una forma elegante de equivocarse.               */
          nombre: p.name, categoria: cat.name || "",
          tipo_txt: partes.join(", "),
          adiciones_txt: adiciones.map((a) => String(a.name)).join(", "),
          product_name: [etiqueta, p.name].concat(partes).filter(Boolean).join(" · "),
          unit_price: unit, cantidad: cant,
          tamano: pr.name || "", pres_id: presId,
          variantes: varsObj, adiciones,
          notas: String(it.notas || "").slice(0, 200),
          matched: true,
          /*  Para que la comanda y el resumen digan que eso va con puntos, y
              no parezca un producto que se regalo porque si.             */
          premio: esPremio,
          /*  De dónde salió. El día que un pedido llegue raro, esto dice si lo
              escribió alguien o lo tocó en la carta.                       */
          origen: "carta",
        });
        subtotal += unit * cant;
        empaque  += emp * cant;
      }

      /*  ══ LOS PREMIOS, COMPROBADOS CONTRA EL CATALOGO ══════════════════

          Una linea marcada como premio sale gratis, asi que aqui no se cree
          nada: se comprueba que ese producto y esa presentacion esten en el
          catalogo de premios y activos, y que al cliente le alcancen los
          puntos SUMADOS de todos los que pidio.

          Es la misma regla de los precios: lo que decide el navegador es lo
          que el cliente escogio, nunca lo que cuesta.                     */
      if (puntosPedidos > 0) {
        const ptRes2 = await db(`pos_puntos?tenant_id=eq.${tenant}&telefono=eq.${encodeURIComponent(String(link.telefono || "").replace(/\D/g, "").slice(-10))}&select=puntos&limit=1`);
        const tienePts = Number(filas(ptRes2.data)[0]?.puntos) || 0;
        if (puntosPedidos > tienePts) {
          return json(400, { error: `no te alcanzan los puntos: necesitas ${puntosPedidos} y tienes ${tienePts}` });
        }
      }

      /*  El medio de pago tiene que ser uno de los que el restaurante tiene
          activos. Si no, alguien podría mandar "pago: gratis".            */
      const iaRes = await db(`ia_config?tenant_id=eq.${tenant}&select=pagos&limit=1`);
      const metodos = filas((filas(iaRes.data)[0]?.pagos as Fila | undefined)?.metodos)
        .filter((m) => m.activo !== false);
      const pedido = String(body.pago || "");
      const m = metodos.find((x) => String(x.id) === pedido || String(x.nombre) === pedido);
      if (!m) return json(400, { error: "ese medio de pago no existe" });

      /*  ══ LA DIRECCION, COTIZADA OTRA VEZ ══════════════════════════════
          Lo que el navegador enseNo no se cree. Se vuelve a buscar la zona
          desde cero, igual que se rehacen los precios de los productos: entre
          que se cotizo y que se guardo pudieron pasar veinte minutos, y ahi
          cabe desde un cambio de zonas hasta alguien tocando la pagina.   */
      const dmG = await db(`ia_config?tenant_id=eq.${tenant}&select=domicilios&limit=1`);
      const dmCfgG = (filas(dmG.data)[0]?.domicilios as Fila) || {};
      const recoge = String(body.entrega || "") === "recoger";
      const textoDir = recoge ? "" : textoDireccion(body);
      const domiPrecio = textoDir ? lookupDomiPrice(textoDir, dmCfgG) : null;

      /*  "Yo lo recojo" se guarda con una frase que el motor YA reconoce
          (LLEVAR_REGEX). Inventar un segundo mecanismo de "para llevar"
          seria tener dos sitios que se pueden desincronizar.             */
      /*  ══ LA DIRECCION DE QUIEN VIVE EN UN CONJUNTO ═══════════════════
          En un conjunto el campo de dirección es opcional, así que puede
          llegar vacío: la dirección de esa persona es "Balmoral Casa 21".

          Se compone AQUI y no en el motor para que el borrador quede completo
          por sí solo — quien lo lea después no tiene que saber armarlo, y ya
          somos tres los que lo leemos.                                    */
      const conjB = String(body.conjunto || "").trim();
      const uniB  = String(body.unidad || "").trim();
      const dirEscrita = String(body.direccion || "").trim();
      const dirBorrador = recoge
        ? "Paso a recogerlo (para llevar)"
        : (conjB ? [conjB, uniB, dirEscrita].filter(Boolean).join(" ") : dirEscrita).slice(0, 120);

      /*  ══ EL CANDADO, DONDE NO SE PUEDE TOCAR ══════════════════════════
          Lo del navegador es la explicacion; esto es la regla. Un pedido para
          recoger que entra con efectivo se prepara sin estar pago, y eso es
          plata que se pierde.

          Se mira el mismo interruptor que Paco y se comprueba si el metodo es
          digital, igual que en el chat.                                 */
      if (recoge && dmCfgG.llevar_prepago !== false) {
        const esDigital = String(m.tipo || "") === "transferencia"
          || String(m.tipo || "") === "saldo"
          || m.digital === true;
        if (!esDigital) {
          return json(400, { error: "los pedidos para recoger se pagan antes por transferencia" });
        }
      }

      const total = subtotal + empaque;

      /*  ══ LA BILLETERA: PRIMERO DEMUESTRA QUE ERES TU ═══════════════════

          Sergio: *"al tocar pagar con billetera, que el espacio para el codigo
          aparezca ahi mismo en la pagina"*.

          ⚠️ AQUI NO SE COBRA. Esto comprueba QUIEN es, no mueve un peso: la
          plata se descuenta cuando el pedido se crea de verdad, en el motor,
          que es donde vale la regla de "primero la plata, despues la cocina".
          Cobrar aqui dejaria plata descontada de pedidos que el cliente
          todavia puede cancelar en el chat.

          Y la comprobacion NO sobra por venir de WhatsApp: que el mensaje
          llegue de ese numero prueba el numero, no que quien tiene el celular
          en la mano sea su dueNo. El SMS va por OTRO canal a proposito — si
          viajara por el mismo WhatsApp, quien lo tuviera abierto lo tendria
          todo.                                                            */
      const esBilletera = String(m.id || "") === "__saldo" || String(m.tipo || "") === "saldo";
      let saldoVerificado = false;
      if (esBilletera) {
        const tel10B = String(link.telefono || "").replace(/\D/g, "").slice(-10);
        const cliB = await clienteBilletera(tenant, tel10B);
        if (!cliB || !cliB.registrado) {
          return json(400, { error: "para pagar con la Billetera necesitas tu cuenta en nuestra app, registrada con este mismo número", billetera: "sin_cuenta" });
        }
        /*  Con el domicilio incluido: es lo que de verdad va a costar. Decir
            que alcanza y despues que no, es lo peor que puede pasar aqui.  */
        const totalB = total + (domiPrecio || 0);
        const saldoB = await saldoDe(tenant, cliB.id);
        if (saldoB < totalB) {
          return json(400, {
            error: `tu Billetera tiene $${saldoB.toLocaleString("es-CO")} y el pedido va en $${totalB.toLocaleString("es-CO")}. Recarga en la app o escoge otra forma de pago`,
            billetera: "sin_saldo", saldo: saldoB, total: totalB,
          });
        }
        const codigoB = String(body.codigo || "").replace(/\D/g, "");
        if (!codigoB) {
          /*  Primera pasada: se manda el codigo y se PARA. No se guarda el
              borrador ni se quema el enlace — si el cliente cierra la pagina
              aqui, no ha pasado nada.                                     */
          const mkRes = await db(`brands?tenant_id=eq.${tenant}&select=name&limit=1`);
          const marcaB = String(filas(mkRes.data)[0]?.name || "").trim() || String(sede.name || "") || "tu pedido";
          /*  El dominio desde donde se sirve la carta. Es lo que Android
              compara para autocompletar, asi que sale de la configuracion —
              nunca de lo que diga el navegador, que es justo lo que un
              impostor querria poder elegir.                             */
          const cwRes = await db(`ia_config?tenant_id=eq.${tenant}&select=carta_web&limit=1`);
          const cwUrl = String(((filas(cwRes.data)[0]?.carta_web as Fila) || {}).url || "https://cobrapos.app/carta.html");
          let dominioB = "";
          try { dominioB = new URL(cwUrl).hostname; } catch { dominioB = "cobrapos.app"; }
          const falloB = await mandarCodigoSMS(tenant, tel10B, totalB, marcaB, dominioB);
          if (falloB) return json(400, { error: falloB, billetera: "sin_sms" });
          return json(200, {
            codigo_requerido: true, total: totalB, saldo: saldoB,
            telefono: "···" + tel10B.slice(-4),
          });
        }
        const malB = await comprobarCodigo(tenant, tel10B, codigoB);
        if (malB) return json(400, { error: malB, billetera: "codigo_malo" });
        saldoVerificado = true;
      }

      const borrador = {
        productos, subtotal, empaque, total,
        telefono: String(link.telefono || "").replace(/\D/g, "").slice(-10),
        pago: m.nombre, pago_id: m.id,
        branch_id: sede.id || link.branch_id || null,
        tipo: recoge ? "llevar" : "domicilio",
        entrega: recoge ? "recoger" : "domicilio",
        direccion: dirBorrador,
        barrio: recoge ? "" : String(body.barrio || "").slice(0, 80),
        conjunto: recoge ? "" : String(body.conjunto || "").slice(0, 80),
        unidad: recoge ? "" : String(body.unidad || "").slice(0, 40),
        es_conjunto: !recoge && !!String(body.conjunto || "").trim(),
        domi_precio: domiPrecio,
        cliente: "", notas: "",
        /*  Lo que la persona DIJO que quiere hacer con su saldo. Es una
            intención, no un cobro: aquí no se descuenta nada. Paco lo
            confirma en el chat y ahí sí se toca el dinero.               */
        saldo_intencion: Number(body.saldo_usar) || 0,
        /*  Ya demostro en la pagina que la billetera es suya. El motor NO se
            lo vuelve a pedir por el chat: seria pedirle dos veces lo mismo,
            que es justo lo que veniamos quitando.                        */
        saldo_verificado: saldoVerificado,
        /*  Los puntos que dijo que quiere usar. Igual que el saldo: es una
            INTENCION, aqui no se descuenta ni uno. Se descuentan cuando el
            pedido se crea de verdad.                                     */
        puntos_usar: puntosPedidos,
        desde_carta: true,
        /*  "nuevo" o "correccion". El enlace ya lo sabe; guardarlo evita que
            el motor tenga que adivinar si el cliente cambio algo o si es su
            primer pedido — y de eso depende que se le hable de "cambios". */
        motivo: String(link.motivo || "nuevo"),
        carta_at: new Date().toISOString(),
      };

      const up = await db(`chat_conversations?id=eq.${link.conv_id}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ pedido_borrador: borrador }),
      });
      if (!up.ok) {
        console.error("[carta] no se pudo guardar el borrador:", up.status, up.text.slice(0, 200));
        return json(502, { error: "no se pudo guardar tu pedido. Inténtalo otra vez." });
      }

      /*  El enlace se quema. Recargar la pantalla no puede mandar el pedido
          dos veces — y si quiere corregir, Paco le manda uno nuevo.       */
      await db(`pos_carta_links?token=eq.${encodeURIComponent(token)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ usado_at: new Date().toISOString() }),
      });

      /*  ══ DESPERTAR A PACO ══════════════════════════════════════════════
          Paco solo se entera de algo cuando LLEGA UN MENSAJE. Sin esto, el
          cliente termina su pedido, vuelve al chat esperando que le pregunten
          la dirección… y no pasa nada. El mismo tipo de fallo que el de los
          botones: todo parece funcionar hasta que no.

          Se deja constancia en la conversación con `origen: "carta"` — no
          finge ser un mensaje del cliente— y de paso Sergio lo ve en el chat.
          Después se encola la respuesta igual que hace el webhook.        */
      try {
        const ch = await db(`chat_conversations?id=eq.${link.conv_id}&select=channel,channel_id&limit=1`);
        const cv2 = filas(ch.data)[0] || {};
        let phoneId = "", accessToken = "";
        if (cv2.channel_id) {
          const cc = await db(`chat_channels?id=eq.${cv2.channel_id}&select=meta&limit=1`);
          const mt = (filas(cc.data)[0]?.meta as Fila) || {};
          phoneId = String(mt.phone_id || mt.page_id || "");
          accessToken = String(mt.access_token || mt.page_token || "");
        }
        const cuando = new Date().toISOString();
        await db("chat_messages", {
          method: "POST", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            conversation_id: link.conv_id, tenant_id: tenant,
            direction: "in", origen: "carta",
            body: `🧾 Hizo su pedido desde la carta · ${productos.length} producto${productos.length === 1 ? "" : "s"} · ${total}`,
            payload: { accion: "cobra_carta" },
            delivery_status: "delivered", sent_at: cuando,
          }),
        });
        if (phoneId && accessToken) {
          const iaQ = await db(`ia_config?branch_id=eq.${sede.id || link.branch_id}&select=activo,delay_segundos&limit=1`);
          const cQ = filas(iaQ.data)[0];
          if (cQ && cQ.activo) {
            /*  ══ AQUI NO SE ESPERA ═══════════════════════════════════════
                `delay_segundos` existe para AGRUPAR a quien escribe de a
                poquitos: se aguantan unos segundos por si manda tres mensajes
                seguidos y se le contesta una sola vez.

                Aqui no hay nadie escribiendo. El aviso lo pone esta misma
                funcion al terminar el pedido, y ya viene completo. Esperar no
                agrupa nada — solo deja al cliente mirando la pantalla,
                creyendo que lo que hizo en la pagina no sirvio. Sergio:
                *"tiene que ser de inmediato"*.                            */
            const seg = 0;
            await db(`chat_ai_queue?conversation_id=eq.${link.conv_id}&processed=eq.true`, { method: "DELETE" });
            await db("chat_ai_queue", {
              method: "POST", headers: { Prefer: "return=minimal" },
              body: JSON.stringify({
                conversation_id: link.conv_id, branch_id: sede.id || link.branch_id, tenant_id: tenant,
                from_phone: String(link.telefono || ""), phone_id: phoneId, access_token: accessToken,
                batch_start: cuando, fire_at: new Date(Date.now() + seg * 1000).toISOString(),
                processed: false,
              }),
            });
            await db(`chat_conversations?id=eq.${link.conv_id}`, {
              method: "PATCH", headers: { Prefer: "return=minimal" },
              body: JSON.stringify({ ai_typing: true, last_message: "Pedido desde la carta",
                                     last_message_at: cuando, last_sender: "contact", last_read: false }),
            });
            fetch(`${SUPABASE_URL}/functions/v1/delay-reply`, {
              method: "POST",
              headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({ convId: link.conv_id }),
            }).catch((e) => console.error("[carta] no se pudo lanzar a Paco:", String(e).slice(0, 150)));
          }
        } else {
          console.error("[carta] sin credenciales del canal: Paco no se entera del pedido", link.conv_id);
        }
      } catch (e) {
        /*  El pedido YA está guardado. Que no se pueda despertar a Paco es
            malo, pero perder el pedido por eso sería peor.                */
        console.error("[carta] pedido guardado pero no se pudo avisar a Paco:", String(e).slice(0, 200));
      }

      console.log(`[carta] pedido de ${borrador.telefono}: ${productos.length} productos, ${total}`);
      return json(200, { ok: true, total, subtotal, empaque, pago: m.nombre });
    }

    return json(400, { error: "acción desconocida" });
  } catch (e) {
    console.error("[carta]", String(e).slice(0, 300));
    return json(500, { error: String(e).slice(0, 200) });
  }
});
