/* ══════════════════════════════════════════════════════════════════════
   MAPA — el intermediario entre Cobra y Google Maps  (21-ago-2026)

   POR QUE EXISTE ESTA FUNCION Y NO SE LLAMA A GOOGLE DESDE LA PANTALLA:

   Cada restaurante conecta SU cuenta de Google, con SU tarjeta. O sea que
   su llave no es un dato de configuracion mas: es su plata. Si la llave
   baja al navegador, cualquiera que abra la pantalla puede sacarla y
   gastarle el cupo — y el cobro le llega a el, no a Cobra.

   Aqui la llave se guarda CIFRADA, nunca sale del servidor, y cada
   llamada pasa por un contador con tope. Un dueno de restaurante no
   puede descubrir un cobro de Google por algo que hizo el sistema.

   PRECIOS DE GOOGLE (verificados el 21-ago-2026; cambian, hay que
   volver a mirarlos antes de prometer nada). Ya no existe el credito de
   200 USD/mes: cada API tiene su cupo gratis y NO se comparten.
       Geocodificacion  10.000/mes gratis, luego 5 USD por mil
       Mapa estatico    10.000/mes gratis, luego 2 USD por mil
       Mapa dinamico    10.000/mes gratis, luego 7 USD por mil

   Por eso se usa el MAPA ESTATICO (el mas barato) y Cobra le dibuja los
   puntos encima. Mover el punto del domiciliario no le cuesta a Google
   ni una sola llamada: la imagen de fondo es siempre la misma.

   Y la geocodificacion se guarda para siempre: a una direccion se le
   pregunta UNA vez en la vida. Un restaurante reparte a las mismas casas
   todos los dias.
   ══════════════════════════════════════════════════════════════════════ */

const serve = Deno.serve;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
const MASTER_B64   = Deno.env.get("MAPAS_MASTER_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const JSON_H = { ...CORS, "Content-Type": "application/json" };

function ok(data: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { headers: { ...JSON_H, ...extra } });
}
function mal(msg: string, code = 400) {
  return new Response(JSON.stringify({ error: msg }), { status: code, headers: JSON_H });
}

/* ── Cifrado de la llave ──────────────────────────────────────────────
   AES-GCM con una llave maestra que vive SOLO como secreto del servidor.
   Asi, ni con acceso a la base se puede leer la llave de un restaurante. */
async function masterKey(): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(MASTER_B64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function cifrar(texto: string): Promise<string> {
  const k = await masterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(texto));
  const todo = new Uint8Array(iv.length + buf.byteLength);
  todo.set(iv, 0);
  todo.set(new Uint8Array(buf), iv.length);
  return btoa(String.fromCharCode(...todo));
}

async function descifrar(b64: string): Promise<string> {
  const k = await masterKey();
  const todo = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const iv = todo.slice(0, 12);
  const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, k, todo.slice(12));
  return new TextDecoder().decode(buf);
}

/* ── Supabase con service_role ────────────────────────────────────────── */
async function sbSel(path: string): Promise<Array<Record<string, unknown>>> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!r.ok) { console.error("sbSel", path, await r.text()); return []; }
  return r.json();
}

async function sbRpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!r.ok) { console.error("sbRpc", fn, await r.text()); return null; }
  return r.json();
}

async function sbUpsert(tabla: string, fila: Record<string, unknown>, onConflict: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabla}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(fila),
  });
  if (!r.ok) console.error("sbUpsert", tabla, await r.text());
}

/* ── Quien esta llamando ──────────────────────────────────────────────
   El tenant NO lo manda la pantalla: se saca del token. Si lo mandara la
   pantalla, cualquiera podria pedir el mapa —y gastar el cupo— de otro
   restaurante cambiando un numero. */
async function quienLlama(req: Request): Promise<{ tenant: string; sub: string } | null> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const u = await r.json();
  const tenant = u?.user_metadata?.tenant_id;
  if (!tenant) return null;
  return { tenant: String(tenant), sub: String(u.id || "") };
}

/* ── La llave del restaurante, descifrada ─────────────────────────────── */
async function llaveDe(tenant: string): Promise<string | null> {
  const filas = await sbSel(`pos_mapas_config?tenant_id=eq.${tenant}&select=clave_cifrada,activo`);
  const c = filas[0];
  if (!c || !c.activo || !c.clave_cifrada) return null;
  try { return await descifrar(String(c.clave_cifrada)); }
  catch (e) { console.error("descifrar", e); return null; }
}

/* ── Pedir permiso al contador ────────────────────────────────────────── */
async function consumir(tenant: string, sku: string): Promise<{ permitido: boolean; usado: number; tope: number }> {
  const r = await sbRpc("fn_mapas_consumir", { p_tenant: tenant, p_sku: sku, p_n: 1 }) as
    Array<{ permitido: boolean; usado: number; tope: number }> | null;
  if (!r || !r.length) return { permitido: false, usado: 0, tope: 0 };
  return r[0];
}

/* ── Normalizar la direccion ──────────────────────────────────────────
   "Cra 9B #63N-58" y "carrera 9 b # 63 n 58" son la MISMA casa. Sin esto
   se le preguntaria a Google —y se le pagaria— por cada forma de
   escribirla. */
const SIN_TILDES = new RegExp("[\u0300-\u036f]", "g");

function normalizar(dir: string, barrio: string, ciudad: string): string {
  const t = [dir, barrio, ciudad].filter(Boolean).join(" ")
    .toLowerCase()
    .normalize("NFD").replace(SIN_TILDES, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  //  Abreviaturas que la gente escribe de mil formas.
  return t
    .replace(/\b(cra|kra|kr|cr|carr)\b/g, "carrera")
    .replace(/\b(cll|cl|ca)\b/g, "calle")
    .replace(/\b(av|avda)\b/g, "avenida")
    .replace(/\b(apto|apt|ap)\b/g, "apartamento")
    .replace(/\b(nro|num|no)\b/g, "")
    //  NUMERO Y LETRA SIEMPRE SEPARADOS. "Cra 9B" y "Carrera 9 B" son la
    //  misma casa, pero sin esto quedan como "9b" y "9 b": dos claves
    //  distintas, y a Google se le pregunta —y se le paga— DOS VECES por
    //  la misma casa. Lo mismo con "63N-58" contra "63 N 58".
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/* ══════════════════════════════════════════════════════════════════════
   ACCIONES
   ══════════════════════════════════════════════════════════════════════ */

/* Cuenta como va el mes. NUNCA devuelve la llave, solo los ultimos 4
   caracteres para que el dueno reconozca cual puso. */
async function accEstado(tenant: string) {
  const r = await sbRpc("fn_mapas_estado", { p_tenant: tenant }) as
    Array<Record<string, unknown>> | null;
  const e = (r && r[0]) || {};
  const tope = Number(e.tope || 9000);
  const usado = Number(e.geocoding || 0) + Number(e.estatico || 0);
  return ok({
    activo: !!e.activo,
    pista: e.pista || null,
    tope,
    geocoding: Number(e.geocoding || 0),
    estatico: Number(e.estatico || 0),
    restante: Math.max(0, tope - usado),
    error: e.error || null,
    //  Lo que Google regala al mes, para poder explicarlo en pantalla.
    gratis_google: 10000,
  });
}

/* Guarda la llave — pero solo despues de PROBARLA. Si el dueno se
   equivoca al copiarla, se entera aqui y no tres dias despues cuando un
   mapa no cargue. */
async function accGuardar(tenant: string, clave: string) {
  clave = (clave || "").trim();
  if (!clave) return mal("Falta la llave");
  if (!/^[A-Za-z0-9_\-]{20,80}$/.test(clave)) {
    return mal("Esa no parece una llave de Google. Son unas 39 letras y numeros seguidos, sin espacios.");
  }

  //  Prueba real: una direccion conocida. Si Google la rechaza, se dice
  //  por que, con el mensaje de Google traducido a algo entendible.
  const prueba = await fetch(
    "https://maps.googleapis.com/maps/api/geocode/json?address=" +
    encodeURIComponent("Parque Caldas, Popayan, Colombia") + "&key=" + encodeURIComponent(clave),
  );
  const pj = await prueba.json().catch(() => null);
  const st = pj?.status;

  if (st !== "OK" && st !== "ZERO_RESULTS") {
    const explica: Record<string, string> = {
      REQUEST_DENIED: "Google rechazó la llave. Revisa que hayas activado la API de Geocoding y que la llave no tenga restricciones de sitio web.",
      OVER_QUERY_LIMIT: "Esa llave ya se pasó del cupo de Google, o la cuenta no tiene facturación activa.",
      INVALID_REQUEST: "La llave se copió incompleta.",
    };
    const msg = explica[st] || (pj?.error_message ? String(pj.error_message) : "Google no aceptó la llave.");
    await sbUpsert("pos_mapas_config",
      { tenant_id: tenant, ultimo_error: msg, updated_at: new Date().toISOString() }, "tenant_id");
    return mal(msg);
  }

  await sbUpsert("pos_mapas_config", {
    tenant_id: tenant,
    clave_cifrada: await cifrar(clave),
    clave_pista: clave.slice(-4),
    activo: true,
    conectada_at: new Date().toISOString(),
    ultimo_error: null,
    updated_at: new Date().toISOString(),
  }, "tenant_id");

  return ok({ ok: true, pista: clave.slice(-4) });
}

async function accDesconectar(tenant: string) {
  await sbUpsert("pos_mapas_config", {
    tenant_id: tenant, clave_cifrada: null, clave_pista: null,
    activo: false, ultimo_error: null, updated_at: new Date().toISOString(),
  }, "tenant_id");
  return ok({ ok: true });
}

/* Direccion → punto. Mira PRIMERO lo que ya se sabe: a Google solo se le
   pregunta por lo que nunca se le ha preguntado. */
async function accGeocodificar(tenant: string, body: Record<string, unknown>) {
  const dir = String(body.direccion || "").trim();
  const barrio = String(body.barrio || "").trim();
  const ciudad = String(body.ciudad || "").trim();
  if (!dir && !barrio) return mal("Falta la dirección");

  const clave = normalizar(dir, barrio, ciudad);
  if (!clave) return mal("Falta la dirección");

  //  1) ¿Ya la tenemos? Gratis y al instante.
  const guardada = await sbSel(
    `pos_direcciones_geo?tenant_id=eq.${tenant}&clave=eq.${encodeURIComponent(clave)}&select=lat,lng,origen`);
  if (guardada.length) {
    const g = guardada[0];
    return ok({ lat: g.lat, lng: g.lng, origen: g.origen, cache: true });
  }

  //  2) Hay que preguntarle a Google.
  const key = await llaveDe(tenant);
  if (!key) return ok({ sin_conectar: true }, {});

  const permiso = await consumir(tenant, "geocoding");
  if (!permiso.permitido) {
    return ok({ tope_alcanzado: true, usado: permiso.usado, tope: permiso.tope });
  }

  const texto = [dir, barrio, ciudad, "Colombia"].filter(Boolean).join(", ");
  const r = await fetch("https://maps.googleapis.com/maps/api/geocode/json?address="
    + encodeURIComponent(texto) + "&region=co&key=" + encodeURIComponent(key));
  const j = await r.json().catch(() => null);

  if (j?.status === "ZERO_RESULTS") {
    //  Google tampoco la encontro. Se responde que no, sin inventar un
    //  punto: un punto equivocado manda al domiciliario a otra casa.
    return ok({ no_encontrada: true });
  }
  if (j?.status !== "OK" || !j?.results?.length) {
    const msg = j?.error_message || j?.status || "Google no respondió";
    await sbUpsert("pos_mapas_config",
      { tenant_id: tenant, ultimo_error: String(msg), updated_at: new Date().toISOString() }, "tenant_id");
    return ok({ fallo: String(msg) });
  }

  const loc = j.results[0].geometry?.location;
  const tipo = j.results[0].geometry?.location_type;   // ROOFTOP es el mas exacto
  if (!loc) return ok({ no_encontrada: true });

  await sbRpc("fn_direccion_guardar", {
    p_tenant: tenant, p_clave: clave, p_direccion: dir, p_barrio: barrio,
    p_lat: loc.lat, p_lng: loc.lng, p_origen: "google",
  });

  return ok({ lat: loc.lat, lng: loc.lng, origen: "google", exactitud: tipo || null });
}

/* La imagen del mapa. Se devuelve la IMAGEN, no la direccion de Google:
   asi la llave nunca viaja al navegador.

   Va SIN puntos dibujados a proposito. Los puntos —el domiciliario
   moviendose, la casa del cliente— los pinta Cobra encima. De la otra
   forma, cada vez que el domiciliario avanza una cuadra habria que
   pedirle a Google una imagen nueva, y eso SI se paga. */
async function accEstatico(tenant: string, u: URL) {
  const key = await llaveDe(tenant);
  if (!key) return mal("Este restaurante no tiene conectada su cuenta de Google", 409);

  const lat = Number(u.searchParams.get("lat"));
  const lng = Number(u.searchParams.get("lng"));
  const zoom = Math.min(20, Math.max(1, Number(u.searchParams.get("zoom") || 14)));
  const w = Math.min(640, Math.max(100, Number(u.searchParams.get("w") || 640)));
  const h = Math.min(640, Math.max(100, Number(u.searchParams.get("h") || 400)));
  if (!isFinite(lat) || !isFinite(lng)) return mal("Faltan las coordenadas del centro");

  const permiso = await consumir(tenant, "static");
  if (!permiso.permitido) {
    return new Response(JSON.stringify({ tope_alcanzado: true, usado: permiso.usado, tope: permiso.tope }),
      { status: 429, headers: JSON_H });
  }

  const url = "https://maps.googleapis.com/maps/api/staticmap"
    + `?center=${lat},${lng}&zoom=${zoom}&size=${w}x${h}&scale=2`
    + "&maptype=roadmap&language=es&region=co"
    + "&key=" + encodeURIComponent(key);

  const r = await fetch(url);
  if (!r.ok) {
    console.error("staticmap", r.status, await r.text());
    return mal("Google no devolvió el mapa", 502);
  }
  const img = await r.arrayBuffer();
  return new Response(img, {
    headers: {
      ...CORS,
      "Content-Type": r.headers.get("content-type") || "image/png",
      //  Un dia en el navegador: el mapa de una ciudad no cambia, y cada
      //  recarga evitada es una llamada que el restaurante no paga.
      "Cache-Control": "public, max-age=86400",
    },
  });
}

/* ══════════════════════════════════════════════════════════════════════ */
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    if (!MASTER_B64) return mal("Falta configurar MAPAS_MASTER_KEY en el servidor", 500);

    const u = new URL(req.url);
    const quien = await quienLlama(req);
    if (!quien) return mal("Sesión no válida", 401);

    //  La imagen se pide por GET, para que el navegador la pueda cachear
    //  y ponerla directo en un <img>.
    if (req.method === "GET") {
      const acc = u.searchParams.get("accion") || "estatico";
      if (acc === "estatico") return await accEstatico(quien.tenant, u);
      if (acc === "estado")   return await accEstado(quien.tenant);
      return mal("Acción no reconocida");
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const acc = String(body.accion || "");

    if (acc === "estado")        return await accEstado(quien.tenant);
    if (acc === "geocodificar")  return await accGeocodificar(quien.tenant, body);
    if (acc === "guardar")       return await accGuardar(quien.tenant, String(body.clave || ""));
    if (acc === "desconectar")   return await accDesconectar(quien.tenant);

    return mal("Acción no reconocida: " + acc);
  } catch (e) {
    console.error("[mapa]", e);
    return mal("Error interno", 500);
  }
});
