// web-acceso — la puerta de entrada de la página de clientes.
//
// UN SOLO CAMINO, NO DOS. El código de WhatsApp no "registra" ni "inicia
// sesión": lo único que hace es probar que el teléfono es de quien lo escribe.
// Después se mira si ya existe un cliente con ese número: si existe se enlaza,
// si no se crea. Por eso aquí nunca puede salir "este número ya está
// registrado" — el error que rompió la aprobación de clientes en agosto.
//
// El teléfono ES la cuenta: es donde ya viven los puntos y el nivel, y es el
// único dato que tienen los 72 clientes (ninguno tiene correo).
//
// Acciones:
//   pedir-codigo      → manda 6 dígitos por WhatsApp
//   verificar-codigo  → comprueba el código y devuelve lo que ya se sabe del cliente
//   crear-cuenta      → guarda nombre, dirección y contraseña, y abre sesión
//   entrar            → teléfono + contraseña (el camino de todos los días)
//   sesion            → ¿este token sigue vivo? devuelve al cliente con sus puntos
//   salir             → cierra la sesión

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Reglas del acceso ────────────────────────────────────────────────
const CODIGO_VIVE_MIN     = 10;   // el código vence a los 10 minutos
const CODIGO_INTENTOS      = 3;   // tres oportunidades y se quema
const CODIGOS_POR_HORA     = 3;   // tope por número: sin esto la página sería
const CODIGOS_POR_DIA      = 8;   // una forma de llenarle el WhatsApp a alguien
const SESION_CORTA_HORAS   = 12;
const SESION_LARGA_DIAS    = 90;  // la casilla "mantener mi sesión"
const PBKDF2_VUELTAS       = 120000;

// ── Base ─────────────────────────────────────────────────────────────
async function sbGet(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { headers: H });
  return r.ok ? await r.json() : null;
}
async function sbPost(path: string, data: unknown, devolver = false, prefer = "") {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: "POST",
    /* `prefer` extra para los upsert: PostgREST necesita
       "resolution=merge-duplicates" para no fallar si la fila ya existe. */
    headers: { ...H, "Prefer": [devolver ? "return=representation" : "return=minimal", prefer].filter(Boolean).join(",") },
    body: JSON.stringify(data),
  });
  if (!r.ok) { console.error("sbPost", path, (await r.text()).slice(0, 300)); return null; }
  return devolver ? await r.json() : true;
}
async function sbPatch(path: string, data: unknown) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: "PATCH", headers: { ...H, "Prefer": "return=minimal" }, body: JSON.stringify(data),
  });
  if (!r.ok) console.error("sbPatch", path, (await r.text()).slice(0, 300));
  return r.ok;
}

// ── Piezas ───────────────────────────────────────────────────────────
const tel10 = (t: unknown) => String(t ?? "").replace(/\D/g, "").slice(-10);
/* Para comparar direcciones: "Calle 5 #10-20" y "calle 5 # 10 - 20" son la
   misma casa y no se pueden guardar dos veces. */
const normDir = (s: unknown) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/* Las direcciones guardadas antes de esto no tienen `id` (se guardaban como
   {dir, barrio}). Se les pone uno estable derivado de su contenido, y así el
   resto del sistema puede tratarlas a todas igual sin migrar la tabla. */
function conIds(lista: unknown): Array<{ id: string; dir: string; barrio: string }> {
  return (Array.isArray(lista) ? lista : [])
    .map((d: Record<string, unknown>, i: number) => ({
      id: String(d?.id || ("d" + i + "_" + normDir(String(d?.dir || "")).slice(0, 12))),
      dir: String(d?.dir || ""), barrio: String(d?.barrio || ""),
    }))
    .filter((d) => d.dir);
}

function aleatorio(bytes: number) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return b;
}
const aB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function sha256(txt: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
  return aB64(new Uint8Array(d));
}

/* La contraseña se guarda derivada, nunca tal cual. PBKDF2 con 120.000 vueltas:
   aunque alguien se llevara la tabla, probar contraseñas le costaría carísimo.
   Se usa lo que trae el propio motor (Web Crypto) para no depender de librerías
   de terceros en algo tan delicado. */
async function derivar(clave: string, salB64: string, vueltas: number) {
  const sal = Uint8Array.from(atob(salB64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(clave), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: sal, iterations: vueltas, hash: "SHA-256" }, k, 256);
  return aB64(new Uint8Array(bits));
}
async function cifrarClave(clave: string) {
  const sal = aB64(aleatorio(16));
  return `pbkdf2$${PBKDF2_VUELTAS}$${sal}$${await derivar(clave, sal, PBKDF2_VUELTAS)}`;
}
async function claveCuadra(clave: string, guardado: string) {
  const p = String(guardado || "").split("$");
  if (p.length !== 4 || p[0] !== "pbkdf2") return false;
  return igualesSinFiltrar(await derivar(clave, p[2], Number(p[1]) || PBKDF2_VUELTAS), p[3]);
}

/* Comparar SIEMPRE en tiempo constante. Un `===` corriente se sale en cuanto
   encuentra la primera letra distinta, y esa diferencia de milésimas alcanza
   para ir adivinando una credencial letra por letra. */
function igualesSinFiltrar(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ── WhatsApp ─────────────────────────────────────────────────────────
async function canalWhatsApp(tenantId: string) {
  const rows = await sbGet(
    `/chat_channels?tenant_id=eq.${tenantId}&channel=eq.whatsapp&connected=eq.true&select=meta&limit=1`
  ) as Array<Record<string, unknown>> | null;
  const meta = (rows?.[0]?.meta || {}) as Record<string, string>;
  return meta.phone_id && meta.access_token ? { phoneId: meta.phone_id, token: meta.access_token } : null;
}

async function mandarCodigo(tenantId: string, telefono: string, codigo: string, negocio: string) {
  const wa = await canalWhatsApp(tenantId);
  if (!wa) return false;
  /* Texto plano por ahora. Fuera de la ventana de 24 h Meta exige una plantilla
     aprobada de categoría "Autenticación" — está pedida. Mientras llega, esto
     funciona para quien haya escrito en las últimas 24 h. */
  const cuerpo = `${codigo} es tu código para entrar a ${negocio}.\n\nVence en ${CODIGO_VIVE_MIN} minutos. No se lo compartas a nadie.`;
  const r = await fetch(`https://graph.facebook.com/v22.0/${wa.phoneId}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${wa.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: "57" + telefono, recipient_type: "individual",
      type: "text", text: { body: cuerpo },
    }),
  });
  if (!r.ok) console.error("[acceso] Meta rechazo el codigo:", (await r.text()).slice(0, 300));
  return r.ok;
}

/* EL CLIENTE, BUSCADO COMO SE DEBE (15-ago). Antes se buscaba con
   `telefono=eq.<10 digitos>` exacto, y basta UNA fila guardada con el
   indicativo (573244756271) o con un espacio para que el cliente "no exista":
   la pagina lo mandaba a registrarse de cero teniendo sus datos, sus puntos y
   su historial. Paso de verdad con el primer cliente que intento recuperar su
   contraseña. Se compara por los ULTIMOS 10 DIGITOS, que es la identidad real
   del cliente en todo el sistema (misma regla que pos_tel10 en la base). */
async function buscarCliente(tenantId: string, tel: string, campos = "id,nombre,direccion,barrio") {
  const filas = await sbGet(
    `/pos_clientes?tenant_id=eq.${tenantId}&telefono=like.*${tel}&select=${campos},telefono&limit=5`
  ) as Array<Record<string, unknown>> | null;
  const exacto = (filas || []).find((c) => tel10(c.telefono) === tel);
  if (exacto) return exacto;
  // Respaldo: alguna fila con separadores que el `like` no alcanzó.
  const todas = await sbGet(
    `/pos_clientes?tenant_id=eq.${tenantId}&select=${campos},telefono&limit=5000`
  ) as Array<Record<string, unknown>> | null;
  return (todas || []).find((c) => tel10(c.telefono) === tel) || null;
}

// ── El restaurante, por su dirección ─────────────────────────────────
async function restaurantePorSlug(slug: string) {
  const s = String(slug || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!s) return null;
  const rows = await sbGet(`/tenants?slug=eq.${s}&select=id,name,slug,web_activa,status&limit=1`) as Array<Record<string, unknown>> | null;
  return rows?.[0] || null;
}

// ── Sesión ───────────────────────────────────────────────────────────
async function abrirSesion(tenantId: string, clienteId: string, telefono: string, recordar: boolean) {
  const token = aB64(aleatorio(32));
  const dias  = recordar ? SESION_LARGA_DIAS : SESION_CORTA_HORAS / 24;
  const expira = new Date(Date.now() + dias * 86400000).toISOString();
  // Del token se guarda solo su huella: si alguien leyera la tabla, no podría
  // hacerse pasar por nadie.
  await sbPost(`/pos_web_sesiones`, {
    tenant_id: tenantId, cliente_id: clienteId, telefono,
    token_hash: await sha256(token), recordar, expira_at: expira,
  });
  return { token, expira };
}

async function sesionDe(token: string) {
  if (!token) return null;
  const rows = await sbGet(
    `/pos_web_sesiones?token_hash=eq.${encodeURIComponent(await sha256(token))}&select=*&limit=1`
  ) as Array<Record<string, unknown>> | null;
  const s = rows?.[0];
  if (!s) return null;
  if (new Date(String(s.expira_at)).getTime() < Date.now()) return null;
  return s;
}

// ── El cliente, con lo suyo ──────────────────────────────────────────
/* ═══ EL PRECIO DEL DOMICILIO, AL GUARDAR LA DIRECCION (17-ago) ═══════════
   Antes esto solo pasaba al CREAR el pedido: el cliente armaba todo y al final
   se enteraba de cuanto costaba llegarle — o peor, el domicilio salia en cero
   porque su barrio no estaba en la tabla, y alguien tenia que llamarlo.

   Ahora se resuelve cuando guarda la direccion. Si el barrio se reconoce, el
   precio queda decidido desde ese momento. Si no, se deja anotado para que el
   dueNo le ponga precio, y a partir de ahi ya se sabe.

   ⚠️ `normalizarTexto` y `fuzzyBarrioMatch` son COPIA EXACTA de delay-reply.
   No se reescribieron a proposito: dos comparadores distintos darian dos
   precios distintos para la misma direccion, y el cliente veria uno en la
   pagina y otro en la comanda. Si se toca alla, se toca aqui.
   (Las funciones del servidor no comparten archivos: cada una se despliega
   sola, asi que la copia es el unico camino.) */
function normalizarTexto(s: string): string {
  return s.toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* Copia de delay-reply tambien: `fuzzyBarrioMatch` la usa para tolerar
   una letra de diferencia. Sin ella la funcion reventaba en tiempo de
   ejecucion (500) — el copiar-pegar se llevo la que llama, no la llamada. */
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
    return levenshtein(a, b) <= maxDist;
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

/* Busca el barrio de la tabla que mejor case con lo que escribio el cliente.
   Se queda con el nombre MAS LARGO — "Bella Vista" antes que "Bella" — para no
   cobrar la zona equivocada. Misma regla que usa Paco. */
function zonaDeTexto(domicilios: Record<string, unknown> | null, texto: string) {
  if (!domicilios || !texto) return null;
  const zonas = (domicilios.zonas as Array<Record<string, unknown>>) || [];
  let mejor: { barrio: string; precio: number } | null = null;
  for (const z of zonas) {
    const lista = ((Array.isArray(z.barrios) ? z.barrios : []) as string[])
      .concat((Array.isArray(z.conjuntos) ? z.conjuntos : []) as string[]);
    for (const b of lista) {
      if (!b) continue;
      if (fuzzyBarrioMatch(texto, b) && (!mejor || b.length > mejor.barrio.length)) {
        mejor = { barrio: b, precio: Number(z.precio) || 0 };
      }
    }
  }
  return mejor;
}

/* Deja el barrio anotado para que el dueNo le ponga precio. Va a
   `pos_domi_aprendidos`, que YA es el sitio donde caen los lugares que el
   sistema no conocia y que ya tiene su pantalla de aprobacion en
   Configuracion -> Domicilios. Se cuenta cuantas veces aparece: un barrio que
   piden cinco personas importa mas que uno que pidio una. */
async function anotarBarrioNuevo(tenantId: string, branchId: string, barrio: string, direccion: string) {
  try {
    const b = String(barrio || "").trim();
    if (!b || b.length < 3 || b.length > 60) return;
    const prev = await sbGet(
      `/pos_domi_aprendidos?branch_id=eq.${branchId}&barrio=ilike.${encodeURIComponent(b)}&select=id,veces,descartado&limit=1`
    ) as Array<Record<string, unknown>> | null;
    const fila = prev?.[0];
    /* Lo que el dueño marco como "no es un barrio" no vuelve a la lista. */
    if (fila && fila.descartado === true) return;
    if (fila?.id) {
      await sbPatch(`/pos_domi_aprendidos?id=eq.${fila.id}`, {
        veces: (Number(fila.veces) || 1) + 1, updated_at: new Date().toISOString(),
      });
    } else {
      await sbPost(`/pos_domi_aprendidos`, {
        tenant_id: tenantId, branch_id: branchId,
        barrio: b, precio: 0, tipo: "nuevo", precio_tabla: null,
        direccion: String(direccion || "").slice(0, 200),
      });
    }
  } catch (e) { console.error("[acceso] barrio nuevo:", String(e).slice(0, 200)); }
}

/* Lo que la pagina necesita saber de una direccion recien guardada. */
async function precioDeBarrio(tenantId: string, barrio: string, direccion: string) {
  const brs = await sbGet(`/branches?tenant_id=eq.${tenantId}&select=id&order=created_at&limit=1`) as Array<Record<string, unknown>> | null;
  const branchId = brs?.[0]?.id ? String(brs[0].id) : "";
  if (!branchId) return { conocido: false, precio: 0 };
  const cfg = await sbGet(`/ia_config?branch_id=eq.${branchId}&select=domicilios&limit=1`) as Array<Record<string, unknown>> | null;
  const dom = (cfg?.[0]?.domicilios || null) as Record<string, unknown> | null;
  /* Se busca en el barrio Y en la direccion completa: mucha gente escribe el
     barrio dentro de la direccion y deja el campo del barrio vacio. */
  const hallado = zonaDeTexto(dom, barrio) || zonaDeTexto(dom, direccion);
  if (hallado) return { conocido: true, precio: hallado.precio, zona: hallado.barrio };
  await anotarBarrioNuevo(tenantId, branchId, barrio || direccion, direccion);
  return { conocido: false, precio: 0 };
}


async function fichaCliente(tenantId: string, clienteId: string) {
  const rows = await sbGet(`/pos_clientes?id=eq.${clienteId}&select=id,nombre,telefono,direccion,barrio,direcciones,foto_url&limit=1`) as Array<Record<string, unknown>> | null;
  const c = rows?.[0];
  if (!c) return null;
  const tel = tel10(c.telefono);

  const pts = await sbGet(`/pos_puntos?tenant_id=eq.${tenantId}&telefono=eq.${tel}&select=puntos&limit=1`) as Array<Record<string, unknown>> | null;

  /* El nivel y la barra los calcula la BASE (fn_nivel_cliente), la misma que usa
     el chat. Aquí no se recalcula nada: un solo motor para todo el sistema, y el
     día que el dueño cambie los umbrales, la página cambia sola. */
  let nivel = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fn_nivel_cliente`, {
      method: "POST", headers: H, body: JSON.stringify({ p_tenant: tenantId, p_tel: tel }),
    });
    if (r.ok) { const d = await r.json(); nivel = Array.isArray(d) ? d[0] : d; }
  } catch (e) { console.error("[acceso] nivel:", String(e).slice(0, 200)); }

  /* LA REGLA DE LAS RECARGAS (17-ago). La página ya sabía dibujar el saldo
     extra, pero NADIE le mandaba cuánto vale: `bono_por_bloque` no existía en
     esta respuesta, así que el aviso caía siempre en el texto genérico y el
     cliente jamás veía una cifra. Va aquí, junto al nivel, porque el bono
     DEPENDE del nivel: Estándar, Premium y VIP no reciben lo mismo.
     El mínimo y el bloque también se mandan: estaban escritos a mano en la
     página, y Cobra es multi-restaurante — cada uno pone los suyos. */
  let recarga = null;
  try {
    const rc = await sbGet(
      `/pos_recarga_config?tenant_id=eq.${tenantId}&select=activo,minimo,bloque,bono_nivel&limit=1`
    ) as Array<Record<string, unknown>> | null;
    const cfg = rc?.[0];
    if (cfg && cfg.activo !== false) {
      const porNivel = (cfg.bono_nivel || {}) as Record<string, unknown>;
      recarga = {
        minimo: Number(cfg.minimo || 0),
        bloque: Number(cfg.bloque || 0),
        // Si el nivel no está en la tabla de bonos, no se promete nada: es
        // preferible no mostrar el premio que prometer uno que no se va a dar.
        bono_por_bloque: Number(porNivel[String(nivel?.nivel || "")] || 0),
      };
    }
  } catch (e) { console.error("[acceso] recarga:", String(e).slice(0, 200)); }

  /* Los últimos pedidos, para la lista de actividad del inicio. Solo lo que el
     cliente puede ver de lo suyo: qué pidió, cuándo y cuánto. */
  const ped = await sbGet(
    `/pos_orders?cliente_id=eq.${clienteId}&status=neq.cancelled&select=id,total,total_final,created_at,channel,estado&order=created_at.desc&limit=8`
  ) as Array<Record<string, unknown>> | null;

  /* QUÉ PIDIÓ Y CUÁNTOS PUNTOS GANÓ (16-ago). En el historial, "Pedido ·
     $58.000" no le dice nada a nadie: el cliente reconoce su comida, no un
     número de pedido. Y los puntos son el motivo por el que entra a mirar.

     Las dos consultas van en bloque para TODOS los pedidos, no una por cada
     uno: ocho pedidos serían dieciséis viajes a la base por cada visita. */
  const idsPed = (ped || []).map((o) => String(o.id)).filter(Boolean);
  const porPedido: Record<string, { que: string[]; puntos: number }> = {};
  if (idsPed.length) {
    const lista = idsPed.join(",");
    const its = await sbGet(
      `/pos_order_items?order_id=in.(${lista})&select=order_id,product_name,name,quantity`
    ) as Array<Record<string, unknown>> | null;
    (its || []).forEach((it) => {
      const k = String(it.order_id);
      if (!porPedido[k]) porPedido[k] = { que: [], puntos: 0 };
      /* El nombre guardado trae el plato y su presentación, pero el ORDEN
         cambia según quién creó el pedido ("Mixta · Familiar" desde el chat,
         "Familiar · Mixta" desde la caja). Cortar por el separador dejaba
         "Familiar" o "1.5 Litros" como si fuera el plato — mejor el nombre
         completo, que el diseño recorta con puntos suspensivos si no cabe.
         Solo se quitan las adiciones, que alargan sin identificar. */
      const nom = String(it.product_name || it.name || "").split(" + ")[0].trim();
      const cant = Number(it.quantity) || 1;
      if (nom) porPedido[k].que.push(cant > 1 ? cant + "x " + nom : nom);
    });
    const pts = await sbGet(
      `/pos_puntos_movimientos?order_id=in.(${lista})&tipo=eq.acumulacion&select=order_id,puntos`
    ) as Array<Record<string, unknown>> | null;
    (pts || []).forEach((m) => {
      const k = String(m.order_id);
      if (!porPedido[k]) porPedido[k] = { que: [], puntos: 0 };
      porPedido[k].puntos += Number(m.puntos) || 0;
    });
  }

  /* EL SALDO, DE LA BASE (16-ago). Estaba escrito a mano en CERO de cuando las
     recargas no existian, y se quedo asi despues: un cliente con plata
     recargada entraba y veia $0 — que es lo mismo que no tenerla. */
  const sal = await sbGet(`/pos_saldo?tenant_id=eq.${tenantId}&cliente_id=eq.${clienteId}&select=saldo&limit=1`) as Array<Record<string, unknown>> | null;

  return {
    id: c.id, nombre: c.nombre || "", telefono: tel,
    /* La foto de perfil. La página la pinta desde siempre (`c.foto`) pero aquí
       nunca se devolvía: quien ya tenía una, entraba y veía sus iniciales. */
    foto: c.foto_url || "",
    saldo: Number(sal?.[0]?.saldo || 0),
    pedidos: (ped || []).map((o) => ({
      id: o.id, total: Number(o.total_final ?? o.total ?? 0),
      fecha: o.created_at, canal: o.channel, estado: o.estado,
      que: (porPedido[String(o.id)]?.que || []),
      puntos: porPedido[String(o.id)]?.puntos || 0,
    })),
    direccion: c.direccion || "", barrio: c.barrio || "",
    direcciones: conIds(c.direcciones),
    puntos: Number(pts?.[0]?.puntos || 0),
    // El gasto acumulado NO sale de aquí: el cliente ve su rango y su avance,
    // nunca cuánto lleva gastado. Es la razón de ser de la barra de experiencia.
    nivel: nivel ? {
      nombre: nivel.nivel, color: nivel.color, siguiente: nivel.siguiente,
      xp: nivel.valor, falta: nivel.falta, progreso: nivel.progreso,
      pedidos: nivel.pedidos, dias_para_caducar: nivel.dias_para_caducar,
    } : null,
    recarga,
  };
}

// ── Puerta ───────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

  try {
    const b = await req.json().catch(() => ({})) as Record<string, unknown>;
    const accion = String(b.accion || "");
    const tel    = tel10(b.telefono);

    /* ── SUS DIRECCIONES (16-ago) ────────────────────────────────────────
       El cliente pide desde varios lados —su casa, la oficina, donde la mamá—
       y volver a escribir la dirección en cada pedido es justo donde se
       equivoca y el domiciliario da vueltas. Se guardan en pos_clientes
       .direcciones, que ya existía con la forma {dir, barrio}; aquí se le
       agrega un `id` para poder señalar una sin depender de su posición en la
       lista (si se borra una, las demás no cambian de identidad).

       Quién es lo dice la SESIÓN, nunca el navegador: con el token se sabe de
       qué cliente son, así que nadie puede escribirle direcciones a otro. */
    if (accion === "direccion-agregar" || accion === "direccion-quitar") {
      const s = await sesionDe(String(b.token || ""));
      if (!s) return json({ ok: false, razon: "sesion_vencida" });
      const cli = await sbGet(`/pos_clientes?id=eq.${s.cliente_id}&select=direcciones,direccion,barrio&limit=1`) as Array<Record<string, unknown>> | null;
      const fila = cli?.[0];
      if (!fila) return json({ ok: false, razon: "no_existe" });

      const conId = conIds(fila.direcciones);

      if (accion === "direccion-agregar") {
        const dir    = String(b.direccion || "").trim().slice(0, 160);
        const barrio = String(b.barrio || "").trim().slice(0, 60);
        if (dir.length < 5) return json({ ok: false, razon: "corta", mensaje: "Escribe la dirección completa." });
        if (conId.length >= 10) return json({ ok: false, razon: "muchas", mensaje: "Ya tienes 10 direcciones guardadas. Borra alguna para agregar otra." });
        // La misma dirección no se guarda dos veces aunque la escriba distinto.
        const yaEsta = conId.find((d) => normDir(d.dir) === normDir(dir));
        let dirEnUso = dir, barrioEnUso = barrio;
        if (yaEsta) {
          if (barrio && !yaEsta.barrio) yaEsta.barrio = barrio;    // se completa el barrio que faltaba
          /* Ya la tenía guardada: manda la forma en que está guardada, no la
             que acaba de teclear. Si no, escribir "calle 5 # 10 - 20" dejaba
             esa version descuidada como su direccion, y es la que veria el
             domiciliario. */
          dirEnUso = yaEsta.dir;
          barrioEnUso = barrio || yaEsta.barrio;
        } else {
          conId.push({ id: "d" + Date.now().toString(36), dir, barrio });
        }
        /* La última que agrega pasa a ser la de siempre: es la que acaba de
           escribir, y es la que va a querer usar en su próximo pedido. */
        await sbPatch(`/pos_clientes?id=eq.${s.cliente_id}`, {
          direcciones: conId, direccion: dirEnUso, barrio: barrioEnUso || fila.barrio || null,
          updated_at: new Date().toISOString(),
        });

        /* ESTE es el momento de resolver el domicilio, no el del pedido: el
           cliente acaba de decir donde vive y tiene derecho a saber cuanto le
           cuesta llegarle ANTES de armar nada. Si el barrio no se reconoce,
           queda anotado para que el dueNo le ponga precio. */
        const domi = await precioDeBarrio(String(s.tenant_id), barrioEnUso || "", dirEnUso);
        return json({
          ok: true, domicilio: domi,
          cliente: await fichaCliente(String(s.tenant_id), String(s.cliente_id)),
        });
      } else {
        const id = String(b.id || "");
        const quedan = conId.filter((d) => d.id !== id);
        const borrada = conId.find((d) => d.id === id);
        const patch: Record<string, unknown> = { direcciones: quedan, updated_at: new Date().toISOString() };
        /* Si borró justo la que estaba en uso, la de siempre pasa a ser la
           primera que le quede — nunca se queda con una dirección fantasma. */
        if (borrada && normDir(borrada.dir) === normDir(String(fila.direccion || ""))) {
          patch.direccion = quedan[0] ? quedan[0].dir : null;
          patch.barrio    = quedan[0] ? (quedan[0].barrio || null) : null;
        }
        await sbPatch(`/pos_clientes?id=eq.${s.cliente_id}`, patch);
      }
      return json({ ok: true, cliente: await fichaCliente(String(s.tenant_id), String(s.cliente_id)) });
    }

    /* ── LA FOTO DE PERFIL (16-ago) ───────────────────────────────────
       Llega como imagen en línea (la página ya la achica a 256 px antes de
       mandarla) y se guarda en el almacén, no en la tabla: una foto dentro de
       la fila del cliente viaja en TODAS las respuestas de la ficha, y la
       ficha se pide en cada visita.

       Quién es lo dice la sesión: nadie puede cambiarle la foto a otro. */
    if (accion === "foto") {
      const s = await sesionDe(String(b.token || ""));
      if (!s) return json({ ok: false, razon: "sesion_vencida" });

      const dataUri = String(b.foto || "");
      const m = dataUri.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i);
      if (!m) return json({ ok: false, razon: "formato", mensaje: "Esa imagen no sirve. Prueba con otra foto." });
      const bin = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0));
      /* Tope de tamaño: la página manda 256 px, así que una foto normal pesa
         muy poco. Si llega algo mucho más grande, es que no vino de la página. */
      if (bin.length > 900_000) return json({ ok: false, razon: "grande", mensaje: "La foto pesa demasiado." });

      const ext = m[1].toLowerCase().includes("png") ? "png" : (m[1].toLowerCase().includes("webp") ? "webp" : "jpg");
      const ruta = `clientes/${s.tenant_id}/${s.cliente_id}-${Date.now()}.${ext}`;
      const sub = await fetch(`${SUPABASE_URL}/storage/v1/object/chat-media/${ruta}`, {
        method: "POST",
        headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": m[1] },
        body: bin,
      });
      if (!sub.ok) {
        console.error("[foto] no se pudo subir:", (await sub.text()).slice(0, 200));
        return json({ ok: false, razon: "subida", mensaje: "No pudimos guardar tu foto. Intenta de nuevo." });
      }
      const url = `${SUPABASE_URL}/storage/v1/object/public/chat-media/${ruta}`;
      await sbPatch(`/pos_clientes?id=eq.${s.cliente_id}`, { foto_url: url, updated_at: new Date().toISOString() });
      return json({ ok: true, foto: url });
    }

    /* ── A QUIEN AVISARLE (16-ago) ─────────────────────────────────────
       El celular que acepto notificaciones deja una "direccion de entrega" que
       da el navegador. Se guarda atada al cliente para poder avisarle de SUS
       pedidos, no de los de todos.

       La llave es el endpoint: el mismo celular no puede quedar dos veces. Si
       el cliente reinstala, llega uno nuevo y el viejo se cae solo cuando el
       navegador lo rechace al enviar. */
    /* ── EL PEDIDO QUE ESTA EN CURSO ────────────────────────────────────
       Lo pide la pantalla de seguimiento cada 20 segundos, asi que devuelve lo
       justo: en que va, a que hora paso cada cosa y que lleva. Nada de la
       ficha completa del cliente, que es mucho mas cara de armar. */
    if (accion === "pedido-activo") {
      const s = await sesionDe(String(b.token || ""));
      if (!s) return json({ ok: false, razon: "sesion_vencida" });

      /* ACTIVO = del ultimo dia y todavia sin entregar. El corte por fecha
         evita que un pedido viejo que nadie cerro se quede colgado para
         siempre en la cabecera del cliente. */
      const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const rows = await sbGet(
        `/pos_orders?cliente_id=eq.${s.cliente_id}&created_at=gte.${desde}` +
        `&status=neq.cancelled&order=created_at.desc&limit=5` +
        `&select=id,created_at,status,estado,estado_at,channel,total,subtotal,delivery_fee,` +
        `paid_amount,delivered_at,notes,packaging_fee`
      ) as Array<Record<string, unknown>> | null;

      const vivos = (rows || []).filter((o) => String(o.estado || "") !== "entregado" && !o.delivered_at);
      const o = vivos[0];
      if (!o) return json({ ok: true, pedido: null });

      /* Las lineas, para poder mostrar QUE pidio sin una segunda llamada. */
      const its = await sbGet(
        `/pos_order_items?order_id=eq.${o.id}&select=product_name,quantity,unit_price,selections`
      ) as Array<Record<string, unknown>> | null;

      const pagado = Number(o.paid_amount || 0) >= Number(o.total || 0) && Number(o.total || 0) > 0;
      return json({
        ok: true,
        pedido: {
          /* No hay numero de pedido en la base: se muestran los ultimos seis
             del id, que es lo que ya se usa en otras pantallas. */
          id: o.id, corto: String(o.id || "").slice(-6).toUpperCase(), creado: o.created_at,
          canal: o.channel, estado: o.estado || null, estado_at: o.estado_at,
          pagado, total: Number(o.total || 0), subtotal: Number(o.subtotal || 0),
          domicilio: Number(o.delivery_fee || 0), empaque: Number(o.packaging_fee || 0),
          /* La direccion es lo PRIMERO de las notas, antes de las etiquetas:
             "Cra 9 # 21-46 [barrio:BOLIVAR] [tel:300...] [web]". Se corta en el
             primer corchete. Asi se muestra sin inventar una columna nueva. */
          direccion: String(o.notes || "").split("[")[0].trim() || null,
          barrio: (String(o.notes || "").match(/barrio:([^\]]+)/) || [])[1] || null,
          /* Cuantos pedidos vivos tiene: con dos, la pantalla ofrece cambiar. */
          vivos: vivos.length,
          items: (its || []).map((i) => ({
            nombre: i.product_name, cantidad: Number(i.quantity || 1),
            precio: Number(i.unit_price || 0),
          })),
        },
      });
    }

    if (accion === "push-suscribir") {
      const s = await sesionDe(String(b.token || ""));
      if (!s) return json({ ok: false, razon: "sesion_vencida" });
      const endpoint = String(b.endpoint || "");
      const p256dh = String(b.p256dh || ""), auth = String(b.auth || "");
      if (!endpoint || !p256dh || !auth) return json({ ok: false, razon: "faltan_datos" });

      /* Upsert por endpoint: si el celular ya estaba, se actualiza a que
         cliente pertenece (puede que otra persona entre desde el mismo). */
      await sbPost("/pos_web_push?on_conflict=endpoint", {
        tenant_id: s.tenant_id, cliente_id: s.cliente_id,
        endpoint, p256dh, auth,
      }, false, "resolution=merge-duplicates");
      return json({ ok: true });
    }

    // ── sesion / salir: no necesitan restaurante, el token ya lo dice ──
    if (accion === "sesion" || accion === "salir") {
      const s = await sesionDe(String(b.token || ""));
      if (!s) return json({ ok: false, razon: "sesion_vencida" });
      if (accion === "salir") {
        await sbPatch(`/pos_web_sesiones?id=eq.${s.id}`, { expira_at: new Date().toISOString() });
        return json({ ok: true });
      }
      await sbPatch(`/pos_web_sesiones?id=eq.${s.id}`, { ultimo_uso: new Date().toISOString() });
      const ficha = await fichaCliente(String(s.tenant_id), String(s.cliente_id));
      return json({ ok: true, cliente: ficha });
    }

    const negocio = await restaurantePorSlug(String(b.slug || ""));
    if (!negocio) return json({ ok: false, razon: "no_existe", mensaje: "Esa dirección no corresponde a ningún restaurante." });
    if (negocio.status === "suspended" || negocio.status === "cancelled") {
      return json({ ok: false, razon: "suspendido", mensaje: "Esta página no está disponible en este momento." });
    }
    if (!negocio.web_activa) {
      return json({ ok: false, razon: "apagada", mensaje: "Esta página todavía no está abierta al público." });
    }
    const tenantId = String(negocio.id);

    if (tel.length !== 10) {
      return json({ ok: false, razon: "telefono", mensaje: "Escribe tu número de celular a 10 dígitos." });
    }

    // ── 1. PEDIR CÓDIGO ──────────────────────────────────────────────
    if (accion === "pedir-codigo") {
      const desdeHora = new Date(Date.now() - 3600000).toISOString();
      const desdeDia  = new Date(Date.now() - 86400000).toISOString();
      const ultHora = await sbGet(`/pos_web_codigos?tenant_id=eq.${tenantId}&telefono=eq.${tel}&created_at=gte.${desdeHora}&select=id`) as unknown[] | null;
      const ultDia  = await sbGet(`/pos_web_codigos?tenant_id=eq.${tenantId}&telefono=eq.${tel}&created_at=gte.${desdeDia}&select=id`) as unknown[] | null;
      if ((ultHora?.length || 0) >= CODIGOS_POR_HORA || (ultDia?.length || 0) >= CODIGOS_POR_DIA) {
        return json({ ok: false, razon: "muchos_intentos",
          mensaje: "Ya te enviamos varios códigos. Espera un rato antes de pedir otro." });
      }

      const codigo = String(Math.floor(100000 + Math.random() * 900000));

      /* SE GUARDA PRIMERO, SE MANDA DESPUÉS.
         Al revés —que es como estaba— pasó lo peor posible: al cliente le llegó
         el código por WhatsApp y aquí no se guardó nada, así que al escribirlo
         le decía "pide un código nuevo". Y como no se miraba el resultado del
         guardado, la función respondía "enviado" tan campante.
         Ahora si no se puede guardar, no se manda nada y se dice la verdad. */
      const guardado = await sbPost(`/pos_web_codigos`, {
        tenant_id: tenantId, telefono: tel,
        codigo_hash: await sha256(codigo + "|" + tel),   // el número entra en la huella: un código no sirve en otro teléfono
        motivo: String(b.motivo || "alta"),
        expira_at: new Date(Date.now() + CODIGO_VIVE_MIN * 60000).toISOString(),
      }, true) as Array<Record<string, unknown>> | null;
      const filaId = guardado?.[0]?.id ? String(guardado[0].id) : "";
      if (!filaId) {
        return json({ ok: false, razon: "no_se_guardo",
          mensaje: "No pudimos preparar tu código. Intenta de nuevo en un momento." });
      }

      const enviado = await mandarCodigo(tenantId, tel, codigo, String(negocio.name || "tu restaurante"));
      if (!enviado) {
        // No salió: se quema para que no ocupe el cupo del cliente.
        await sbPatch(`/pos_web_codigos?id=eq.${filaId}`, { usado: true });
        return json({ ok: false, razon: "whatsapp",
          mensaje: "No pudimos enviarte el código por WhatsApp. Escríbele al restaurante y te ayudan." });
      }
      return json({ ok: true, vence_en_min: CODIGO_VIVE_MIN });
    }

    // ── 2. VERIFICAR CÓDIGO ──────────────────────────────────────────
    if (accion === "verificar-codigo") {
      const codigo = String(b.codigo || "").replace(/\D/g, "");
      const rows = await sbGet(
        `/pos_web_codigos?tenant_id=eq.${tenantId}&telefono=eq.${tel}&usado=eq.false&order=created_at.desc&select=*&limit=1`
      ) as Array<Record<string, unknown>> | null;
      const c = rows?.[0];
      if (!c) return json({ ok: false, razon: "sin_codigo", mensaje: "Pide un código nuevo." });
      if (new Date(String(c.expira_at)).getTime() < Date.now()) {
        return json({ ok: false, razon: "vencido", mensaje: "Ese código ya venció. Pide uno nuevo." });
      }
      if (Number(c.intentos) >= CODIGO_INTENTOS) {
        return json({ ok: false, razon: "quemado", mensaje: "Demasiados intentos con ese código. Pide uno nuevo." });
      }
      if (!igualesSinFiltrar(await sha256(codigo + "|" + tel), String(c.codigo_hash))) {
        await sbPatch(`/pos_web_codigos?id=eq.${c.id}`, { intentos: Number(c.intentos) + 1 });
        return json({ ok: false, razon: "no_coincide",
          mensaje: `Ese código no es. Te quedan ${CODIGO_INTENTOS - Number(c.intentos) - 1} intentos.` });
      }
      // Bueno: se quema para que no sirva dos veces.
      await sbPatch(`/pos_web_codigos?id=eq.${c.id}`, { usado: true });

      /* Ya probó que el teléfono es suyo. Se le devuelve lo que el restaurante ya
         sabe de él, para que el formulario salga PRELLENADO — es lo que le dice
         "aquí ya te conocemos". */
      const existente = await buscarCliente(tenantId, tel);
      let tieneClave = false;
      if (existente) {
        const cr = await sbGet(`/pos_web_credenciales?cliente_id=eq.${existente.id}&select=cliente_id&limit=1`) as unknown[] | null;
        tieneClave = !!(cr && cr.length);
      }
      // Pase corto para completar el registro sin volver a pedir el código.
      const pase = aB64(aleatorio(24));
      const pOk = await sbPost(`/pos_web_codigos`, {
        tenant_id: tenantId, telefono: tel, codigo_hash: await sha256("PASE|" + pase + "|" + tel),
        motivo: "pase", expira_at: new Date(Date.now() + 20 * 60000).toISOString(),
      }, true);
      if (!pOk) return json({ ok: false, razon: "no_se_guardo", mensaje: "No se pudo continuar. Intenta de nuevo." });
      return json({
        ok: true, pase, ya_registrado: !!existente, tiene_clave: tieneClave,
        cliente: existente ? { nombre: existente.nombre || "", direccion: existente.direccion || "", barrio: existente.barrio || "" } : null,
      });
    }

    // ── 3. CREAR CUENTA (o ponerle contraseña a un cliente que ya existe) ──
    if (accion === "crear-cuenta") {
      const pase = String(b.pase || "");
      const rows = await sbGet(
        `/pos_web_codigos?tenant_id=eq.${tenantId}&telefono=eq.${tel}&motivo=eq.pase&usado=eq.false&order=created_at.desc&select=*&limit=1`
      ) as Array<Record<string, unknown>> | null;
      const p = rows?.[0];
      if (!p || new Date(String(p.expira_at)).getTime() < Date.now() ||
          !igualesSinFiltrar(await sha256("PASE|" + pase + "|" + tel), String(p.codigo_hash))) {
        return json({ ok: false, razon: "pase", mensaje: "Se venció el tiempo. Vuelve a pedir tu código." });
      }

      const clave  = String(b.clave || "");
      const nombre = String(b.nombre || "").trim().slice(0, 80);
      if (clave.length < 6) return json({ ok: false, razon: "clave_corta", mensaje: "La contraseña debe tener al menos 6 caracteres." });

      const direccion = String(b.direccion || "").trim().slice(0, 160);
      const barrio    = String(b.barrio || "").trim().slice(0, 60);

      /* ENLAZAR O CREAR — la misma operación. La base tiene índice único por
         (restaurante, últimos 10 dígitos), así que aquí no se pueden duplicar
         clientes ni aunque dos personas entren en el mismo instante. */
      const yaEs = await buscarCliente(tenantId, tel, "id,nombre,direccion,barrio,direcciones,telefono");
      let clienteId = yaEs?.id ? String(yaEs.id) : "";

      /* EL NOMBRE SOLO SE EXIGE A QUIEN NO LO TIENE. Quien ya es cliente y solo
         viene a recuperar su contraseña no tiene por que volver a escribir sus
         datos: la pagina le pide unicamente la clave nueva (15-ago). */
      if (nombre.length < 2 && !String(yaEs?.nombre || "").trim()) {
        return json({ ok: false, razon: "nombre", mensaje: "Escribe tu nombre." });
      }

      if (clienteId) {
        // Ya existía: se respeta lo que el restaurante ya tenía si el cliente no
        // escribió nada nuevo.
        const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (nombre) upd.nombre = nombre;
        if (direccion) upd.direccion = direccion;
        if (barrio) upd.barrio = barrio;
        /* De paso se normaliza el telefono a 10 digitos: si esta fila venia con
           indicativo, era justo lo que impedia reconocerlo. */
        if (tel10(yaEs?.telefono) === tel && String(yaEs?.telefono || "") !== tel) upd.telefono = tel;
        await sbPatch(`/pos_clientes?id=eq.${clienteId}`, upd);
      } else {
        const nuevo = await sbPost(`/pos_clientes`, {
          tenant_id: tenantId, nombre, telefono: tel,
          direccion: direccion || null, barrio: barrio || null,
          direcciones: direccion ? [{ dir: direccion, barrio }] : [],
          updated_at: new Date().toISOString(),
        }, true) as Array<Record<string, unknown>> | null;
        clienteId = nuevo?.[0]?.id ? String(nuevo[0].id) : "";
        if (!clienteId) {
          // Carrera: alguien lo creó en el mismo instante. Se lee y se sigue.
          const otra = await sbGet(`/pos_clientes?tenant_id=eq.${tenantId}&telefono=eq.${tel}&select=id&limit=1`) as Array<Record<string, unknown>> | null;
          clienteId = otra?.[0]?.id ? String(otra[0].id) : "";
        }
        if (!clienteId) return json({ ok: false, razon: "no_se_pudo", mensaje: "No pudimos crear tu cuenta. Intenta de nuevo." });
      }

      /* Al registrarse tambien: si puso direccion, el domicilio queda resuelto
         desde el primer minuto. Si su barrio no esta en la tabla, queda
         anotado para que el dueNo le ponga precio antes de que pida. */
      if (direccion) {
        try { await precioDeBarrio(tenantId, barrio, direccion); }
        catch (e) { console.error("[acceso] domi al crear:", String(e).slice(0, 150)); }
      }

      const hash = await cifrarClave(clave);
      const yaTiene = await sbGet(`/pos_web_credenciales?cliente_id=eq.${clienteId}&select=cliente_id&limit=1`) as unknown[] | null;
      if (yaTiene && yaTiene.length) {
        await sbPatch(`/pos_web_credenciales?cliente_id=eq.${clienteId}`, { pass_hash: hash, cambiada_at: new Date().toISOString() });
      } else {
        await sbPost(`/pos_web_credenciales`, { cliente_id: clienteId, tenant_id: tenantId, pass_hash: hash });
      }
      await sbPatch(`/pos_web_codigos?id=eq.${p.id}`, { usado: true });

      const s = await abrirSesion(tenantId, clienteId, tel, !!b.recordar);
      return json({ ok: true, token: s.token, expira: s.expira, cliente: await fichaCliente(tenantId, clienteId) });
    }

    // ── 4. ENTRAR (teléfono + contraseña) ────────────────────────────
    if (accion === "entrar") {
      const clave = String(b.clave || "");
      const cliE = await buscarCliente(tenantId, tel, "id");
      const clienteId = cliE?.id ? String(cliE.id) : "";
      /* Mismo mensaje si el número no existe o si la contraseña está mal. Decir
         "ese número no está registrado" le confirmaría a un desconocido quién es
         cliente del restaurante. */
      const malo = { ok: false, razon: "no_cuadra", mensaje: "El número o la contraseña no son correctos." };
      if (!clienteId) { await derivar(clave, aB64(aleatorio(16)), PBKDF2_VUELTAS); return json(malo); }

      const cr = await sbGet(`/pos_web_credenciales?cliente_id=eq.${clienteId}&select=pass_hash&limit=1`) as Array<Record<string, unknown>> | null;
      const guardado = cr?.[0]?.pass_hash ? String(cr[0].pass_hash) : "";
      if (!guardado) return json({ ok: false, razon: "sin_clave", mensaje: "Todavía no has creado tu contraseña. Pide un código para crearla." });
      if (!(await claveCuadra(clave, guardado))) return json(malo);

      const s = await abrirSesion(tenantId, clienteId, tel, !!b.recordar);
      return json({ ok: true, token: s.token, expira: s.expira, cliente: await fichaCliente(tenantId, clienteId) });
    }

    return json({ ok: false, razon: "accion", mensaje: "Acción desconocida." }, 400);
  } catch (e) {
    console.error("[acceso]", String(e).slice(0, 400));
    return json({ ok: false, razon: "error", mensaje: "Algo falló. Intenta de nuevo." }, 500);
  }
});
