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
async function sbPost(path: string, data: unknown, devolver = false) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: "POST",
    headers: { ...H, "Prefer": devolver ? "return=representation" : "return=minimal" },
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
async function fichaCliente(tenantId: string, clienteId: string) {
  const rows = await sbGet(`/pos_clientes?id=eq.${clienteId}&select=id,nombre,telefono,direccion,barrio,direcciones&limit=1`) as Array<Record<string, unknown>> | null;
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

  /* Los últimos pedidos, para la lista de actividad del inicio. Solo lo que el
     cliente puede ver de lo suyo: qué pidió, cuándo y cuánto. */
  const ped = await sbGet(
    `/pos_orders?cliente_id=eq.${clienteId}&status=neq.cancelled&select=id,total,total_final,created_at,channel,estado&order=created_at.desc&limit=8`
  ) as Array<Record<string, unknown>> | null;

  return {
    id: c.id, nombre: c.nombre || "", telefono: tel,
    /* El saldo recargable todavía no existe: se manda en cero para que la
       tarjeta se pueda pintar desde ya y no haya que tocar la página cuando
       entre. */
    saldo: 0,
    pedidos: (ped || []).map((o) => ({
      id: o.id, total: Number(o.total_final ?? o.total ?? 0),
      fecha: o.created_at, canal: o.channel, estado: o.estado,
    })),
    direccion: c.direccion || "", barrio: c.barrio || "",
    direcciones: c.direcciones || [],
    puntos: Number(pts?.[0]?.puntos || 0),
    // El gasto acumulado NO sale de aquí: el cliente ve su rango y su avance,
    // nunca cuánto lleva gastado. Es la razón de ser de la barra de experiencia.
    nivel: nivel ? {
      nombre: nivel.nivel, color: nivel.color, siguiente: nivel.siguiente,
      xp: nivel.valor, falta: nivel.falta, progreso: nivel.progreso,
      pedidos: nivel.pedidos, dias_para_caducar: nivel.dias_para_caducar,
    } : null,
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
