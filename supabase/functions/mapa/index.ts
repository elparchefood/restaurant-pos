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
  const r = await fetchCorto(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!r.ok) { console.error("sbSel", path, await r.text()); return []; }
  return r.json();
}

async function sbRpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const r = await fetchCorto(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!r.ok) { console.error("sbRpc", fn, await r.text()); return null; }
  /*  UNA FUNCION QUE NO DEVUELVE NADA RESPONDE CON EL CUERPO VACIO, y
      `r.json()` sobre un cuerpo vacio revienta. Aqui se caia CADA
      direccion nueva: se guardaba bien en la base, pero la pantalla
      recibia un error y el mapa no aparecia. El sintoma enganaba —
      parecia que Google fallaba— y el problema estaba en esta linea. */
  const txt = await r.text();
  if (!txt) return null;
  try { return JSON.parse(txt); } catch (e) { return null; }
}

async function sbUpsert(tabla: string, fila: Record<string, unknown>, onConflict: string) {
  const r = await fetchCorto(`${SUPABASE_URL}/rest/v1/${tabla}?on_conflict=${onConflict}`, {
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
  const r = await fetchCorto(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const u = await r.json();
  const sub = String(u.id || "");
  let tenant = u?.user_metadata?.tenant_id;
  /*  LA APP DEL DOMICILIARIO NO ESCRIBE METADATA. Entra con su propio
      login y nunca llama a `updateUser`, asi que aqui llegaba sin
      `tenant_id` y se le respondia "no autorizado" — el mapa no le habria
      funcionado nunca y el sintoma habria parecido un problema de
      permisos. Se pregunta a la tabla, que es donde vive la verdad. */
  if (!tenant && sub) {
    const f = await sbSel(`pos_users?select=tenant_id&auth_user_id=eq.${sub}&limit=1`);
    if (f && f.length) tenant = f[0].tenant_id;
  }
  if (!tenant) return null;
  return { tenant: String(tenant), sub };
}

/* ── QUE LLAVE SE USA PARA ESTE RESTAURANTE ──────────────────────────

   Hay dos caminos, y el primero es el normal:

   1. LA LLAVE DE COBRA (`MAPAS_CLAVE_COBRA`). Una sola, de Cobra, para
      todos los restaurantes. El dueno no tiene que hacer NADA: abre
      Cobra y el mapa ya funciona. El costo va dentro de lo que Cobra le
      cobra por el plan.

   2. LA LLAVE PROPIA DEL RESTAURANTE. Si conecta la suya, manda la
      suya. Sirve para el que consume mucho —una cadena con varias
      sedes— o para el que prefiere que el gasto vaya a su cuenta.

   El tope por restaurante corre IGUAL en los dos casos, y es lo que
   protege la tarjeta de Cobra en el primero: por mucho que un solo
   restaurante se dispare, no puede vaciarle el cupo a los demas.       */
/*  ══ EL MAPA SE CONTRATA APARTE ══════════════════════════════════════
    Sergio, 27-ago-2026.

    Antes venia dentro del plan Pro. Sergio hizo cuentas y lo saco, con
    razon: el mapa es LO UNICO de Cobra que le cuesta dinero cada vez que
    se usa. Una pantalla, un informe o una impresion cuestan lo mismo con
    un restaurante que con cincuenta; un mapa abierto se le cobra a el.
    Meter un costo variable dentro de un precio fijo es apostar a que
    nadie lo use mucho, y esa apuesta se pierde con el primer cliente que
    hace cuarenta domicilios diarios.

    Quien no lo contrate usa la app del domiciliario COMPLETA —ve sus
    pedidos, cobra, marca entregado— y al tocar «Ruta» ve un letrero que
    dice que ese servicio no esta incluido. Es un letrero de venta, no un
    error: por eso el boton se queda donde esta y no se esconde.

    El interruptor es de COBRA. No sale en la pantalla de configuracion
    del restaurante, porque si saliera cualquiera se lo activaria solo.  */
async function contratado(tenant: string): Promise<boolean> {
  const f = await sbSel(`pos_mapas_config?tenant_id=eq.${tenant}&select=addon`);
  return !!(f && f.length && f[0].addon);
}

const SIN_SERVICIO = {
  ok: false, motivo: "sin_servicio",
  mensaje: "Este restaurante no tiene el servicio de mapas.",
  detalle: "El mapa y las rutas se contratan aparte del plan. Comunicate con Cobra para activarlo.",
};

async function llaveDe(tenant: string): Promise<{ clave: string; propia: boolean } | null> {
  const filas = await sbSel(`pos_mapas_config?tenant_id=eq.${tenant}&select=clave_cifrada,activo`);
  const c = filas[0];
  if (c && c.activo && c.clave_cifrada) {
    try { return { clave: await descifrar(String(c.clave_cifrada)), propia: true }; }
    catch (e) { console.error("descifrar", e); }
  }
  const central = Deno.env.get("MAPAS_CLAVE_COBRA") || "";
  if (central) return { clave: central, propia: false };
  return null;
}

/*  CUANTOS KILOMETROS HAY ENTRE DOS PUNTOS.
    Formula de siempre (haversine). Sirve para una sola cosa: comprobar que
    lo que devolvio Google esta donde puede estar un domicilio.            */
function kmEntre(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, g = Math.PI / 180;
  const dLat = (b.lat - a.lat) * g, dLng = (b.lng - a.lng) * g;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * g) * Math.cos(b.lat * g) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/*  EL PUNTO DE LA CIUDAD DEL RESTAURANTE.

    Es el ancla contra la que se mide todo lo demas. Se le pregunta a Google
    UNA vez por ciudad y se guarda para siempre en la misma tabla de
    direcciones, con una clave que no se puede confundir con la de un
    cliente. Una ciudad no se mueve.                                       */
async function puntoCiudad(tenant: string, ciudad: string, clave: string):
    Promise<{ lat: number; lng: number } | null> {
  if (!ciudad) return null;
  const k = "__ciudad__ " + normTexto(ciudad);

  const g = await sbSel(
    `pos_direcciones_geo?tenant_id=eq.${tenant}&clave=eq.${encodeURIComponent(k)}&select=lat,lng`);
  if (g.length && g[0].lat != null) return { lat: Number(g[0].lat), lng: Number(g[0].lng) };

  const url = "https://maps.googleapis.com/maps/api/geocode/json"
    + "?address=" + encodeURIComponent(ciudad + ", Colombia")
    + "&components=" + encodeURIComponent("country:CO")
    + "&region=co&language=es&key=" + encodeURIComponent(clave);
  const r = await fetchCorto(url);
  const j = await r.json().catch(() => null);
  const loc = j?.results?.[0]?.geometry?.location;
  if (j?.status !== "OK" || !loc) {
    console.error("[mapa] ciudad", ciudad, j?.status, j?.error_message);
    return null;
  }
  await sbRpc("fn_direccion_guardar", {
    p_tenant: tenant, p_clave: k, p_direccion: ciudad, p_barrio: "",
    p_lat: loc.lat, p_lng: loc.lng, p_origen: "google_ciudad",
    p_place_id: j.results[0].place_id || null,
    p_exactitud: j.results[0].geometry?.location_type || null,
    p_canonica: ciudad,
  });
  return { lat: Number(loc.lat), lng: Number(loc.lng) };
}

/*  ═════════════════════════════════════════════════════════════════
    BUSCAR POR NOMBRE, QUE NO ES LO MISMO QUE BUSCAR UNA DIRECCION
    ═════════════════════════════════════════════════════════════════
    Google tiene DOS indices y no son intercambiables:

      • El de direcciones (Geocoding), que sabe de calles y numeros.
      • El de sitios (Places), que sabe de conjuntos, centros comerciales,
        hospitales, colegios, aeropuertos — lo que tiene nombre propio.

    Una ciudadela no esta en el indice de calles. Preguntarle por ella al de
    direcciones es como buscar un telefono en el diccionario: contesta algo,
    y ese algo fue el centro de Cali.

    Es tambien como busca una persona: nadie escribe la direccion de la
    Ciudadela Llanos de Calibio, escribe el nombre y ya.

    SI PLACES NO CONTESTA, SE SIGUE POR EL CAMINO VIEJO. Puede no estar
    habilitada en la cuenta de Google, y eso no puede dejar sin mapa al
    domiciliario: se responde null y quien llama busca como antes.        */
/*  Una llamada a Google CON PLAZO.

    Sin esto, si Google se queda callado la funcion entera se queda colgada y
    el telefono espera para siempre. Paso: la pantalla se quedo en "Abriendo el
    mapa" sin fallar nunca. Ocho segundos y se sigue: mas vale responder "no la
    encontre" que no responder.                                            */
async function fetchCorto(url: string, init?: RequestInit, ms = 8000): Promise<Response> {
  const corte = new AbortController();
  const t = setTimeout(() => corte.abort(), ms);
  try {
    return await fetch(url, { ...(init || {}), signal: corte.signal });
  } finally {
    clearTimeout(t);
  }
}

async function buscarPorNombre(
  texto: string, ancla: { lat: number; lng: number } | null, clave: string,
): Promise<{ lat: number; lng: number; nombre: string; direccion: string } | null> {
  /*  GOOGLE TIENE DOS VERSIONES DE ESTO Y HAY QUE PROBAR LAS DOS.

      La vieja (`maps.googleapis.com/.../textsearch`) es la que casi todos
      los ejemplos de internet usan, pero Google dejo de habilitarla en los
      proyectos nuevos. La nueva (`places.googleapis.com/v1`) es otra
      direccion, otro formato y otra API que hay que prender aparte.

      Cual de las dos tiene prendida un restaurante no se sabe de antemano,
      asi que se intentan las dos y se deja escrito en el registro cual
      contesto. Adivinar cual es ya costo una tarde.                     */

  //  1) La nueva.
  try {
    const r = await fetchCorto("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": clave,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location",
      },
      body: JSON.stringify({
        textQuery: texto, languageCode: "es", regionCode: "CO", maxResultCount: 3,
        ...(ancla
          ? { locationBias: { circle: { center: { latitude: ancla.lat, longitude: ancla.lng }, radius: 50000 } } }
          : {}),
      }),
    });
    const j = await r.json().catch(() => null);
    const p = j?.places?.[0];
    if (p?.location) {
      console.log("[mapa] places-nuevo OK", texto, "->", p.displayName?.text);
      return {
        lat: Number(p.location.latitude), lng: Number(p.location.longitude),
        nombre: String(p.displayName?.text || ""),
        direccion: String(p.formattedAddress || ""),
      };
    }
    console.error("[mapa] places-nuevo sin resultado", texto, r.status, JSON.stringify(j?.error || j).slice(0, 300));
  } catch (e) { console.error("[mapa] places-nuevo", String(e)); }

  //  2) La vieja.
  let url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
    + "?query=" + encodeURIComponent(texto)
    + "&region=co&language=es&key=" + encodeURIComponent(clave);
  //  El ancla aqui pesa mas que en las direcciones: hay una "Ciudadela
  //  Comfandi" en media Colombia y la buena es la de esta ciudad.
  if (ancla) url += "&location=" + ancla.lat + "," + ancla.lng + "&radius=50000";

  const r2 = await fetchCorto(url);
  const j2 = await r2.json().catch(() => null);
  if (j2?.status !== "OK" || !j2?.results?.length) {
    console.error("[mapa] places-viejo", texto, j2?.status, j2?.error_message);
    return null;
  }
  const p2 = j2.results[0];
  const loc = p2.geometry?.location;
  if (!loc) return null;
  console.log("[mapa] places-viejo OK", texto, "->", p2.name);
  return {
    lat: Number(loc.lat), lng: Number(loc.lng),
    nombre: String(p2.name || ""),
    direccion: String(p2.formatted_address || ""),
  };
}

/*  HASTA DONDE PUEDE ESTAR UN DOMICILIO.

    50 km del centro de la ciudad. Es holgado a proposito: un corregimiento
    o una vereda de las afueras entra sin problema, y una respuesta de otra
    ciudad (Cali esta a 111 km de Popayan) no.                             */
const KM_MAXIMO = 50;

/* ── Pedir permiso al contador ────────────────────────────────────────── */
async function consumir(tenant: string, sku: string, propia: boolean, n = 1): Promise<{ permitido: boolean; usado: number; tope: number; global?: boolean }> {
  /*  DOS FRENOS, NO UNO.

      El primero es por restaurante: que ninguno se dispare.

      El segundo solo corre cuando se esta usando la llave de COBRA, y es
      el que de verdad protege su tarjeta: veinte restaurantes portandose
      bien pueden sumar una cuenta que nadie miro. El tope por
      restaurante no lo ve, porque cada uno por separado va tranquilo. */
  if (!propia) {
    const tg = Number(Deno.env.get("MAPAS_TOPE_GLOBAL") || "18000");
    const g = await sbRpc("fn_mapas_consumir_global", { p_sku: sku, p_tope: tg }) as
      Array<{ permitido: boolean; usado: number; tope: number }> | null;
    if (!g || !g.length || !g[0].permitido) {
      console.error("[mapa] TOPE GLOBAL DE COBRA ALCANZADO", sku, g && g[0]);
      return { permitido: false, usado: (g && g[0] && g[0].usado) || 0, tope: tg, global: true };
    }
  }
  const r = await sbRpc("fn_mapas_consumir", { p_tenant: tenant, p_sku: sku, p_n: n }) as
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

/* ── DE COMO LO ESCRIBE LA GENTE A COMO LO ENTIENDE GOOGLE ───────────

   Una misma casa llega escrita de mil formas:
       "carrera 9 b # 63 n - 58 apto 502"
       "Cra 9B #63N-58 Apto 502"
       "KRA 9 B 63 N 58, apartamento 502"

   Antes se le mandaba a Google el texto TAL CUAL lo escribio el cajero.
   Google entiende bastante, pero no es lo mismo: mientras mas raro llega
   el texto, mas se acerca a "no lo encontre" o —peor— a devolver el
   centro del barrio como si fuera la casa.

   Aqui se arma la forma CANONICA colombiana, que es la que usa el DANE y
   con la que estan escritos los datos de Google en Colombia:
       Carrera 9B # 63N-58

   Y el complemento (apto, torre, interior) se SEPARA: Google no sabe que
   hacer con "apto 502" y meterselo solo empeora el resultado. Al
   domiciliario si se le muestra, que para eso sirve.                    */

type Direccion = {
  canonica: string;      // lo que se le manda a Google
  complemento: string;   // apto / torre / interior — para el domiciliario
  estructurada: boolean; // false = no se reconocio como direccion de calle
};

//  El orden importa: primero las compuestas ("avenida carrera") o
//  "avenida" se comeria la palabra y quedaria mal.
const VIAS: Array<[RegExp, string]> = [
  [/^(?:av(?:enida)?\s*(?:cra|kra|carrera)|ac)\b/, "Avenida Carrera"],
  [/^(?:av(?:enida)?\s*(?:cll|calle)|ak)\b/, "Avenida Calle"],
  [/^(?:carrera|carr|cra|kra|krr|kr|cr|k)\b/, "Carrera"],
  [/^(?:calle|cll|cl|ca)\b/, "Calle"],
  [/^(?:avenida|avda|ave|av)\b/, "Avenida"],
  [/^(?:diagonal|diag|dgn|dg)\b/, "Diagonal"],
  [/^(?:transversal|transv|trans|tvl|tv|tr)\b/, "Transversal"],
  [/^(?:circunvalar|circunv)\b/, "Circunvalar"],
  [/^(?:circular|circ)\b/, "Circular"],
  [/^(?:autopista|autop|auto)\b/, "Autopista"],
  [/^(?:peatonal|peat)\b/, "Peatonal"],
];

//  Donde empieza lo que Google NO debe recibir.
const COMPLEMENTO = new RegExp(
  "\\b(apartamento|apartaestudio|apto|aptos|apt|ap|casa|torre|bloque|blq|bl|" +
  "interior|int|piso|oficina|ofic|ofc|of|local|lc|conjunto|edificio|edif|ed|" +
  "urbanizacion|urb|etapa|manzana|mzn|mz|lote|lt|garaje|parqueadero|porteria|" +
  "unidad|agrupacion|barrio|br)\\b",
);

function limpiar(t: string): string {
  return String(t || "")
    .toLowerCase()
    .normalize("NFD").replace(SIN_TILDES, "")
    .replace(/[#º°]/g, " # ")     // #, º, ° -> separador
    //  "No 63" / "Nro 63" -> "# 63". OJO: la "n" SOLA no cuenta nunca.
    //  En "Carrera 9 B 63 N 58" esa N es NORTE; tomarla por "número"
    //  partía la dirección y se perdía el "58", y el domiciliario se
    //  quedaba con media dirección.
    .replace(/\b(?:no|nro|num|numero)\.?\s*(?=\d)/g, " # ")
    .replace(/[^a-z0-9#\-]+/g, " ")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function mayus(t: string): string {
  return t.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

/*  numero + letra pegada.  "9 b" y "9b" dan los dos "9B".
    La letra se deja PEGADA porque asi se escribe en Colombia
    ("Carrera 9B") y asi estan los datos de Google aqui. */
function numeroYLetra(t: string): { txt: string; resto: string } | null {
  const m = t.match(/^(\d+)\s*/);
  if (!m) return null;
  let txt = m[1];
  let resto = t.slice(m[0].length);

  const CARD = /^(norte|sur|este|oeste|occidente|oriente)\b/;
  const LETRA_CARD: Record<string, string> = { n: "Norte", s: "Sur", e: "Este", o: "Oeste" };

  //  El punto cardinal escrito con todas sus letras se mira ANTES. Al
  //  reves, "10 sur" se leia como el numero 10 mas una letra "su", y
  //  salia "Calle 10SU".
  let cardinal = "";
  const cPalabra = resto.match(CARD);
  if (cPalabra) {
    cardinal = mayus(cPalabra[1]);
    resto = resto.slice(cPalabra[0].length).trim();
  } else {
    //  Letras de nomenclatura, hasta 3 y que no sean el principio de otra
    //  palabra.
    const l = resto.match(/^([a-z]{1,3})(?![a-z])/);
    if (l) {
      let letras = l[1];
      resto = resto.slice(l[0].length).trim();
      /*  LA "N" SIEMPRE ES NORTE (confirmado por Sergio, que es quien
          conoce la nomenclatura de Popayan). Y existen calles como "9BN",
          que son la letra B MAS Norte: por eso el cardinal se separa de
          la letra en vez de dejarlo pegado.
          Con "9B" a secas no pasa nada, porque la B no es cardinal. */
      const ultima = letras.slice(-1);
      if (LETRA_CARD[ultima]) {
        cardinal = LETRA_CARD[ultima];
        letras = letras.slice(0, -1);
      }
      if (letras) txt += letras.toUpperCase();
    }
    const bis = resto.match(/^bis\b/);
    if (bis) { txt += " Bis"; resto = resto.slice(3).trim(); }
    if (!cardinal) {
      const c2 = resto.match(CARD);
      if (c2) { cardinal = mayus(c2[1]); resto = resto.slice(c2[0].length).trim(); }
    }
  }
  if (cardinal) txt += " " + cardinal;

  return { txt, resto: resto.trim() };
}

function canonizar(dir: string): Direccion {
  const t = limpiar(dir);
  if (!t) return { canonica: "", complemento: "", estructurada: false };

  //  Se parte donde empieza el complemento: eso no va a Google.
  const mComp = t.match(COMPLEMENTO);
  const via = mComp ? t.slice(0, mComp.index).trim() : t;
  const comp = mComp ? t.slice(mComp.index).trim() : "";

  //  ¿Empieza por un tipo de via reconocible?
  let tipo = "", resto = via;
  for (const [re, nombre] of VIAS) {
    const m = via.match(re);
    if (m) { tipo = nombre; resto = via.slice(m[0].length).trim(); break; }
  }

  if (!tipo) {
    /*  No es una direccion de calle: es un nombre propio ("Conjunto
        Arrayanes del Uvo", "Centro Comercial Campanario"). Se manda tal
        cual, que para eso Google es bueno buscando nombres. */
    return { canonica: mayus(t), complemento: "", estructurada: false };
  }

  const a = numeroYLetra(resto);
  if (!a) return { canonica: mayus(via), complemento: mayus(comp), estructurada: false };

  //  Despues del "#" viene la via que cruza, y tras el "-" la placa.
  let r = a.resto.replace(/^#\s*/, "").trim();
  const b = numeroYLetra(r);

  let canonica = tipo + " " + a.txt;
  if (b) {
    canonica += " # " + b.txt;
    const placa = b.resto.match(/^-?\s*(\d+)/);
    if (placa) canonica += "-" + placa[1];
  }

  return { canonica, complemento: mayus(comp), estructurada: !!b };
}

/* ── LOS CONJUNTOS SE BUSCAN POR NOMBRE, NO POR NOMENCLATURA ─────────

   Un conjunto cerrado es un sitio con nombre propio, y Google los tiene
   guardados asi: "Conjunto Arrayanes del Uvo, Popayan" le basta.
   Pedirle nomenclatura de calle a quien vive en un conjunto es pelear
   con el problema equivocado — la casa 13 no tiene carrera ni numero.

   Y hay una ganancia grande escondida aqui: TODOS los pedidos a un mismo
   conjunto comparten UN punto, el de la porteria. Da igual si es la casa
   13, la torre 2 apartamento 501 o el bloque C: el domiciliario llega a
   la misma puerta. Asi que un conjunto se le pregunta a Google UNA vez
   en la vida, no una por cada apartamento.

   El Parche tiene 51 conjuntos configurados: son 51 consultas en total,
   no una por cada cliente que viva en ellos.

   La lista sale de lo que el restaurante ya tiene puesto en el flujo de
   Paco (`ia_config.domicilios.zonas[].conjuntos[]`). No se inventa una
   lista nueva ni se le pide al dueno que la vuelva a escribir.        */

function normTexto(t: string): string {
  return String(t || "").toLowerCase()
    .normalize("NFD").replace(SIN_TILDES, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

//  Palabras que aparecen en casi todos los nombres y no distinguen nada.
//  Sin quitarlas, "Conjunto Los Robles" y "Conjunto Las Palmas" se
//  parecerian solo por el "conjunto".
const RELLENO = /\b(conjunto|residencial|urbanizacion|urb|unidad|cerrado|agrupacion|villa|villas|los|las|el|la|de|del|y)\b/g;

function nucleo(t: string): string {
  return normTexto(t).replace(RELLENO, " ").replace(/\s+/g, " ").trim();
}

/*  ¿Este texto habla de alguno de los conjuntos del restaurante?
    Devuelve el nombre TAL COMO lo escribio el dueno, que es el que se le
    manda a Google. */
function cualConjunto(texto: string, lista: string[], estricto = false): string | null {
  const t = normTexto(texto);
  const tn = nucleo(texto);
  if (!t) return null;
  /*  ⚠️ PALABRAS QUE NO IDENTIFICAN NADA POR SI SOLAS.

      Encontrado con pedidos REALES de El Parche: "Reserva del Bosque Bloque
      1 Casa 8" se emparejo con el conjunto "Villa del Bosque", que es OTRO
      sitio. El culpable fue la palabra "bosque": el nucleo de "Villa del
      Bosque" es solo "bosque", y "reserva bosque" lo contiene.

      Al domiciliario se le habrian dado las coordenadas del conjunto
      equivocado, con toda confianza y sin ningun aviso. Por eso un nombre
      que se reduce a una de estas palabras exige que ademas sea la PRIMERA
      del texto: "Bosque casa 8" si es Villa del Bosque; "Reserva del
      Bosque casa 8" no lo es.                                            */
  const GENERICAS = new Set([
    "bosque", "bosques", "rio", "río", "villa", "portal", "altos", "alto",
    "reserva", "ciudadela", "torres", "torre", "mirador", "prados", "prado",
    "colinas", "colina", "jardines", "jardin", "parque", "parques", "sol",
    "campo", "campos", "valle", "lago", "lagos", "mar", "norte", "sur",
    "centro", "nuevo", "nueva", "san", "santa", "casa", "casas", "vista",
  ]);

  function palabras(x: string): string[] {
    return x.split(" ").filter(Boolean);
  }

  //  "torre" y "torres" son la misma palabra para esto.
  function raiz(w: string): string {
    /*  Solo se quita la "s" final. Con la regla de "-es" que tenia antes,
        "torres" quedaba en "torr" y ya no casaba con "torre": justo el caso
        de "Torres de San Eduardo", que era para lo que se hizo. Lo que
        importa aqui no es acertar el singular de verdad, sino que las dos
        formas caigan en lo mismo — y para eso basta la "s". */
    return w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w;
  }
  const palabrasTexto = new Set(palabras(tn).map(raiz));

  let mejor: string | null = null, mejorLargo = 0;
  for (const c of lista) {
    if (!c) continue;
    const cn = nucleo(c);
    if (!cn || cn.length < 4) continue;
    const pc = palabras(cn);

    //  Si lo que queda del nombre es UNA sola palabra y encima es de las
    //  genericas, tiene que abrir el texto para valer.
    if (pc.length === 1 && GENERICAS.has(pc[0])) {
      /*  Y si la pregunta viene del campo BARRIO, ni asi: tiene que ser el
          nombre completo, identico.

          El caso real: el barrio "Bosque" y el conjunto "Villa del Bosque"
          se reducen los dos a "bosque". Un "Bloque 7 Casa 10" en el barrio
          Bosque acababa emparejado con Villa del Bosque, cuando los propios
          pedidos dicen que ese bloque y casa son de Claros del Bosque.    */
      if (estricto && normTexto(c) !== t) continue;
      if (palabras(tn)[0] !== pc[0]) continue;
    }

    /*  TODAS las palabras del nombre tienen que estar en el texto, aunque
        vengan sueltas y en desorden.

        Esto es lo que hace funcionar la regla de Sergio para San Eduardo:
        "Torres de San Eduardo" solo se reconoce si la direccion dice
        "torre" — porque San Eduardo tambien es un barrio con casas
        normales, y ahi la palabra "torre" es lo unico que distingue.
        Con el barrio a secas faltaria "torres" y no empareja.            */
    const todasPresentes = pc.every((w) => palabrasTexto.has(raiz(w)));

    if (todasPresentes || (tn && tn.includes(cn)) || t.includes(normTexto(c))) {
      //  Gana el nombre MAS LARGO: entre "Portal" y "Portal de Pomona",
      //  el segundo es el que de verdad identifica el sitio.
      if (cn.length > mejorLargo) { mejor = c; mejorLargo = cn.length; }
    }
  }
  if (mejor) return mejor;

  /*  LA GENTE ABREVIA. Quien vive en "Arrayanes del Uvo" escribe
      "Arrayanes, torre 2 apto 501" y se queda tan tranquilo.

      Asi que si el nombre completo no aparece, se prueba con la primera
      palabra distintiva — PERO solo si esa palabra apunta a UN conjunto
      y nada mas. En la lista de El Parche hay "Pinares del Rio" y
      "Guayacanes del Rio": si se aceptara "rio" a secas, el domiciliario
      acabaria en el conjunto equivocado. Ante la duda, no se adivina: se
      devuelve nulo y la direccion se lee como una calle normal.        */
  /*  EN MODO ESTRICTO NO SE ABREVIA.

      Esta regla existe para que quien vive en "Arrayanes del Uvo" pueda
      escribir solo "Arrayanes". Pero cuando el texto viene del BARRIO —o
      de barrio y direccion mezclados— es demasiado suelta:

        "Carrera 8k N 66 BN 26" + barrio SAN EDUARDO  -> emparejaba con
        "Torres de San Eduardo" por la palabra "eduardo", cuando esa
        direccion es una casa normal del barrio.

        "Casa 13" + barrio POMONA -> emparejaba con "Real Pomona" por la
        palabra "pomona", cuando Pomona es el barrio y no sabemos en cual
        de sus conjuntos vive.

      Abreviar solo vale sobre lo que la persona ESCRIBIO como direccion. */
  if (estricto) return null;

  //  Y tampoco vale abreviar con una palabra generica, aunque en ESTA
  //  lista apunte a uno solo: manana el restaurante agrega otro conjunto
  //  con "bosque" en el nombre y el emparejamiento cambia de sitio sin que
  //  nadie toque una linea de codigo.
  const sueltas = palabras(tn).filter((w) => w.length >= 5 && !GENERICAS.has(w));
  for (const w of sueltas) {
    const candidatos = lista.filter((c) => palabras(nucleo(c)).includes(w));
    if (candidatos.length === 1) return candidatos[0];
  }
  return null;
}

/*  ¿La direccion se queda sin decir un nombre propio?

    "casa 45" o "apto 302" no dicen donde queda nada: ahi el barrio es lo
    unico que hay y toca usarlo. "Reserva del Bosque Bloque 1" si dice un
    nombre, y entonces el barrio sobra —y estorba, porque puede emparejar
    con otro conjunto parecido.

    Se quitan las palabras de relleno, las de complemento (casa, torre,
    apto, bloque...) y los numeros. Si no queda nada, no habia nombre.   */
function direccionSinNombre(dir: string): boolean {
  const t = normTexto(dir).replace(RELLENO, " ")
    .replace(/\b(casa|apartamento|apto|apt|ap|torre|bloque|blq|bl|interior|int|piso|oficina|ofic|of|local|lc|etapa|lote|lt|manzana|mz|unidad|numero|nro|num|no)\b/g, " ")
    .replace(/\b\d+[a-z]?\b/g, " ")
    .replace(/\b[a-z]\b/g, " ")
    .replace(/\s+/g, " ").trim();
  return t.length === 0;
}

/*  La lista de conjuntos del restaurante, de todas sus sedes. Un conjunto
    esta donde esta, sin importar por cual sede entre el pedido. */
async function conjuntosDe(tenant: string): Promise<string[]> {
  const filas = await sbSel(`ia_config?tenant_id=eq.${tenant}&select=domicilios`);
  const fuera: string[] = [];
  for (const f of filas) {
    const dom = (f.domicilios || {}) as Record<string, unknown>;
    const zonas = (dom.zonas as Array<{ conjuntos?: string[] }>) || [];
    for (const z of zonas) for (const c of (z.conjuntos || [])) if (c) fuera.push(c);
  }
  return fuera;
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
  /*  DOS COSAS DISTINTAS QUE ANTES ERAN UNA.

      `incluido` significaba "Cobra pone la llave, aqui no hay nada que
      hacer". Desde que el mapa se contrata aparte (27-ago-2026) eso ya no
      basta: la llave de Cobra puede estar puesta y el restaurante no haber
      contratado el servicio. Son dos preguntas y hay que contestar las dos,
      porque la pantalla dice cosas muy distintas segun cual falle.       */
  const hayLlaveCobra = !!Deno.env.get("MAPAS_CLAVE_COBRA");
  const activo = await contratado(tenant);
  const incluido = hayLlaveCobra && activo;
  return ok({
    activo: !!e.activo,
    contratado: activo,
    incluido,
    funcionando: activo && (!!e.activo || hayLlaveCobra),
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

/* ══════════════════════════════════════════════════════════════════════
   LA LLAVE QUE SI BAJA AL CELULAR
   ══════════════════════════════════════════════════════════════════════
   El mapa interactivo de Google se dibuja EN EL TELEFONO, y para eso
   necesita una llave alli. No hay forma de evitarlo: no existe manera de
   pintar ese mapa desde el servidor.

   Lo que si se puede es que esa llave no sirva para nada mas, y que no se
   la lleve cualquiera. Cuatro condiciones, y ninguna sobra:

     1. SESION VALIDA. La llave no esta escrita en ningun archivo: se pide
        aqui. Quien baje la APK o abra la pagina sin cuenta no encuentra
        nada. Esta es la barrera grande, y la propuso Sergio.
     2. SERVICIO DE MAPAS CONTRATADO. Se vende aparte del plan.
     3. TURNO DE CAJA ABIERTO. Fuera del horario de trabajo no se entrega.
        Tambien idea de Sergio: el domiciliario no sabe que existe un
        turno, asi que no puede "abrirlo" para sacar la llave de noche.
     4. BAJO EL TOPE. Y el tope es de cada restaurante, no de Cobra: si
        alguien se pone a jugar, se gasta SU cupo y su dueno lo ve.

   Y ES OTRA LLAVE, no la del servidor. Google le pone los candados a la
   llave entera, no a cada uso: la del servidor tiene que estar suelta
   para poder buscar direcciones, asi que mandarla al telefono seria
   mandar la que si puede gastar. La del navegador va restringida a
   dibujar mapas y solo desde cobrapos.app.

   SI NO SE CUMPLE ALGUNA, SE DICE CUAL. Un mapa en blanco sin explicacion
   es una tarde perdida buscando un fallo que no existe. */
async function accNavegador(tenant: string) {
  const clave = Deno.env.get("MAPAS_CLAVE_NAVEGADOR") || "";
  if (!clave) return ok({ ok: false, motivo: "sin_llave",
    mensaje: "El mapa todavia no esta configurado en Cobra." });

  //  2. ¿Contrato el servicio? (ya no se mira el plan: ver `contratado`)
  if (!await contratado(tenant)) return ok(SIN_SERVICIO);

  //  3. ¿Hay turno de caja abierto?
  const ses = await sbSel(
    `pos_sessions?select=id&tenant_id=eq.${tenant}&closed_at=is.null&limit=1`);
  if (!ses || !ses.length) return ok({ ok: false, motivo: "sin_turno",
    mensaje: "El mapa se activa cuando abran la caja del restaurante." });

  //  4. ¿Queda cupo?
  const cuenta = await llaveDe(tenant);
  if (!cuenta) return ok({ ok: false, motivo: "sin_llave",
    mensaje: "El mapa todavia no esta configurado en Cobra." });
  const permiso = await consumir(tenant, "navegador", cuenta.propia);
  if (!permiso.permitido) return ok({ ok: false, motivo: "tope",
    mensaje: "Se acabo el cupo de mapas de este mes.",
    usado: permiso.usado, tope: permiso.tope });

  /*  EL "MAP ID": lo que hace que el mapa pueda GIRAR.

      Un mapa de Google normal esta hecho de fotos de cuadritos y no gira: se
      queda con el norte arriba pase lo que pase. Para que gire hay que pedirle
      la version vectorial, y esa solo se entrega si se le manda un
      identificador de estilo creado en la consola de Google.

      Va aqui y no escrito en la pagina porque es del restaurante, no del
      programa. Si no esta configurado se responde vacio y la pagina hace lo de
      siempre: mapa con el norte arriba y la flecha girando sola. Se ve peor,
      pero funciona — nunca dejar sin mapa a un domiciliario por un ajuste que
      alguien no hizo.                                                     */
  return ok({
    ok: true, clave,
    mapaId: Deno.env.get("MAPAS_MAP_ID") || "",
    usado: permiso.usado, tope: permiso.tope,
  });
}

/* ══════════════════════════════════════════════════════════════════════
   LA RUTA
   ══════════════════════════════════════════════════════════════════════
   Esta SI se calcula en el servidor, con la llave de Cobra, que nunca
   sale. El telefono manda de donde a donde y recibe la linea ya dibujada.
   Asi el gasto grande queda del lado seguro. */
async function accRuta(tenant: string, body: Record<string, unknown>) {
  const desde = String(body.desde || "").trim();   // "lat,lng"
  const hasta = String(body.hasta || "").trim();   // "lat,lng" o direccion
  if (!desde || !hasta) return mal("Faltan el origen o el destino");

  const cuenta = await llaveDe(tenant);
  if (!cuenta) return mal("Sin llave de mapas configurada");
  const permiso = await consumir(tenant, "ruta", cuenta.propia);
  if (!permiso.permitido) {
    return ok({ ok: false, motivo: "tope",
      mensaje: "Se acabo el cupo de rutas de este mes.",
      usado: permiso.usado, tope: permiso.tope });
  }

  const url = "https://maps.googleapis.com/maps/api/directions/json"
    + "?origin=" + encodeURIComponent(desde)
    + "&destination=" + encodeURIComponent(hasta)
    + "&mode=driving&language=es&region=co"
    + "&key=" + encodeURIComponent(cuenta.clave);

  const r = await fetchCorto(url);
  if (!r.ok) {
    console.error("[mapa] directions", r.status, await r.text());
    return ok({ ok: false, motivo: "google", mensaje: "Google no contesto la ruta." });
  }
  const d = await r.json();
  if (d.status !== "OK" || !d.routes || !d.routes.length) {
    console.error("[mapa] directions", d.status, d.error_message);
    return ok({ ok: false, motivo: "sin_ruta",
      mensaje: "No se encontro camino hasta esa direccion." });
  }
  const ruta = d.routes[0];
  const tramo = (ruta.legs && ruta.legs[0]) || {};
  return ok({
    ok: true,
    linea:    ruta.overview_polyline && ruta.overview_polyline.points,
    metros:   tramo.distance && tramo.distance.value,
    segundos: tramo.duration && tramo.duration.value,
    texto:    (tramo.distance && tramo.distance.text) + " · " + (tramo.duration && tramo.duration.text),
    usado: permiso.usado, tope: permiso.tope,
  });
}

/* ═════════════════════════════════════════════════════════════════════
   LA TANDA: VARIOS PEDIDOS, UNA SOLA RUTA
   ═════════════════════════════════════════════════════════════════════
   Sergio, 27-ago-2026: «si la cajera coloca en camino varios pedidos
   asignados al mismo domiciliario, la aplicacion automaticamente lo enruta».

   LA TANDA NO LA DECIDE ESTA FUNCION NI EL DOMICILIARIO: la decide quien
   maneja los pedidos, poniendolos EN CAMINO. Eso es lo que hace que esto sea
   simple: aqui no hay que adivinar que pedidos van juntos ni inventar una
   pantalla para armar tandas. Ya existe un gesto en caja que significa
   exactamente «estos se van ahora», y ese gesto ya se hace todos los dias.

   EL ORDEN LO CALCULA GOOGLE, no nosotros. Ordenar paradas por distancia en
   linea recta es lo que hace que un domiciliario cruce un rio dos veces: dos
   casas a 800 metros una de otra pueden estar a 6 km por calle. Google lo
   resuelve con `optimize:true`.

   EL TRUCO DEL DESTINO. Google reordena las paradas intermedias pero respeta
   el destino final, asi que hay que darle uno. Se toma la MAS LEJANA en linea
   recta: casi siempre es la ultima de la mejor ruta, y cuando no lo es, el
   error es de una parada, no del recorrido entero. La alternativa —cerrar el
   circulo volviendo al restaurante— obligaria a saber donde queda el
   restaurante en coordenadas, y hoy eso es una direccion escrita a mano en un
   formulario.                                                              */
function lejosDe(o: { lat: number; lng: number }, p: { lat: number; lng: number }) {
  const dx = (p.lng - o.lng) * Math.cos((o.lat * Math.PI) / 180);
  const dy = p.lat - o.lat;
  return dx * dx + dy * dy;          // sin raiz: solo se usa para comparar
}

async function accRutaTanda(tenant: string, body: Record<string, unknown>) {
  const desde = String(body.desde || "").trim();
  const crudas = Array.isArray(body.paradas) ? body.paradas : [];
  const paradas = crudas
    .map((x) => x as Record<string, unknown>)
    .filter((x) => isFinite(Number(x.lat)) && isFinite(Number(x.lng)))
    .map((x) => ({ id: String(x.id || ""), lat: Number(x.lat), lng: Number(x.lng) }))
    /*  DIEZ PARADAS. No es un limite de Google (admite mas), es de la moto:
        nadie sale con quince domicilios en una tanda, y si alguien lo
        intentara, una ruta de quince paradas tarda tanto en calcularse que el
        domiciliario cree que se colgo. */
    .slice(0, 10);

  if (!desde || paradas.length < 2) return mal("Faltan el origen o las paradas");

  const cuenta = await llaveDe(tenant);
  if (!cuenta) return mal("Sin llave de mapas configurada");
  /*  Se cobra una por parada, no una por tanda: cinco casas le cuestan a
      Google casi lo mismo que cinco rutas sueltas, y si contara como una
      sola, el tope dejaria de proteger nada. */
  const permiso = await consumir(tenant, "ruta", cuenta.propia, paradas.length);
  if (!permiso.permitido) {
    return ok({ ok: false, motivo: "tope",
      mensaje: "Se acabo el cupo de rutas.",
      usado: permiso.usado, tope: permiso.tope });
  }

  const origen = (function () {
    const m = desde.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
    return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
  })();
  if (!origen) return mal("El origen no es una coordenada");

  let iFin = 0;
  paradas.forEach((p, i) => { if (lejosDe(origen, p) > lejosDe(origen, paradas[iFin])) iFin = i; });
  const fin = paradas[iFin];
  const medio = paradas.filter((_, i) => i !== iFin);

  const url = "https://maps.googleapis.com/maps/api/directions/json"
    + "?origin=" + encodeURIComponent(desde)
    + "&destination=" + encodeURIComponent(fin.lat + "," + fin.lng)
    + "&waypoints=" + encodeURIComponent("optimize:true|" + medio.map((p) => p.lat + "," + p.lng).join("|"))
    + "&mode=driving&language=es&region=co"
    + "&key=" + encodeURIComponent(cuenta.clave);

  const r = await fetchCorto(url, undefined, 12000);
  if (!r.ok) {
    console.error("[mapa] tanda", r.status, await r.text());
    return ok({ ok: false, motivo: "google", mensaje: "Google no contesto la ruta." });
  }
  const d = await r.json();
  if (d.status !== "OK" || !d.routes || !d.routes.length) {
    console.error("[mapa] tanda", d.status, d.error_message);
    return ok({ ok: false, motivo: "sin_ruta", mensaje: "No se encontro camino entre esas direcciones." });
  }

  /*  `waypoint_order` trae los indices de las paradas INTERMEDIAS ya en el
      orden bueno. El destino no esta ahi —Google no lo movio— asi que se pega
      al final a mano. Leer esto mal significaria mandar al domiciliario en el
      orden equivocado con una ruta que en pantalla se ve perfecta.        */
  const ruta = d.routes[0];
  const orden: typeof paradas = [];
  const wo = Array.isArray(ruta.waypoint_order) ? ruta.waypoint_order : medio.map((_, i) => i);
  wo.forEach((i: number) => { if (medio[i]) orden.push(medio[i]); });
  orden.push(fin);

  const legs = ruta.legs || [];
  let metros = 0, segundos = 0;
  const tramos = orden.map((p, i) => {
    const l = legs[i] || {};
    metros += (l.distance && l.distance.value) || 0;
    segundos += (l.duration && l.duration.value) || 0;
    return {
      id: p.id, lat: p.lat, lng: p.lng,
      metros: (l.distance && l.distance.value) || 0,
      segundos: (l.duration && l.duration.value) || 0,
      texto: [(l.distance && l.distance.text), (l.duration && l.duration.text)].filter(Boolean).join(" · "),
    };
  });

  return ok({
    ok: true,
    linea: ruta.overview_polyline && ruta.overview_polyline.points,
    orden: orden.map((p) => p.id),
    tramos, metros, segundos,
    texto: Math.round(metros / 100) / 10 + " km · " + Math.round(segundos / 60) + " min",
    usado: permiso.usado, tope: permiso.tope,
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
  const prueba = await fetchCorto(
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

/* Direccion → punto.

   El orden importa, y es todo lo contrario de "preguntarle a Google":

   1. Lo que YA se sabe. Gratis y al instante.
   2. Solo si nunca se ha preguntado, se le pregunta a Google — pero con
      la direccion ya ORDENADA, no como la escribio el cajero.           */
async function accGeocodificar(tenant: string, body: Record<string, unknown>) {
  const dir = String(body.direccion || "").trim();
  const barrio = String(body.barrio || "").trim();
  const ciudad = String(body.ciudad || "").trim();
  /*  EL CONJUNTO, DICHO POR EL CAJERO Y NO ADIVINADO.

      Antes el nombre del conjunto llegaba metido en el campo del barrio y
      aqui habia que deducir si "LLANOS DE CALIBIO" era un barrio o un nombre
      propio. Se dedujo mal y el pedido acabo marcando otra ciudad. Ahora la
      pantalla de domicilios tiene su campo aparte y lo manda dicho.

      Lo de abajo (deducirlo) se queda, pero solo como respaldo para los
      pedidos viejos y para los que entran por el chat.                    */
  const conjDicho = String(body.conjunto || "").trim();

  /*  DESDE DONDE SE BUSCA — y por que ya no manda el nombre de la ciudad.

      Hasta ahora el ancla salia del campo "Ciudad" de la sede. Eso es un texto
      que alguien escribio en un formulario: puede estar mal, vacio, mal
      escrito, o quedar viejo cuando el negocio se muda. Y cuando esta mal, el
      resultado no es un error visible sino una casa de OTRA ciudad, dada con
      toda confianza.

      Sergio lo dijo mejor que yo: el restaurante puede llamarse como sea y la
      ciudad puede decir cualquier cosa; lo que no miente es DONDE ESTA
      PARADO quien pide el mapa. El domiciliario esta, por definicion, dentro
      de la zona de reparto.

      Asi que manda el punto real de quien pregunta. La ciudad se queda solo de
      respaldo, para cuando nadie tiene GPS — el computador de la caja.       */
  const cerca = String(body.cerca || "").trim();
  const anclaGps = (function () {
    const m = cerca.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const lat = Number(m[1]), lng = Number(m[2]);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  })();
  if (!dir && !barrio) return mal("Falta la dirección");

  /*  PRIMERO: ¿es un conjunto?

      Si lo es, no hay nada que descifrar. Se le manda a Google el nombre
      y ya, porque los conjuntos estan en Google por nombre. Y el punto se
      guarda POR CONJUNTO, no por apartamento: la casa 13 y la torre 2
      apto 501 llegan a la misma porteria, asi que comparten punto y a
      Google se le pregunta una sola vez por todo el conjunto.

      El nombre puede venir en la direccion o en el barrio: hay clientes
      que escriben el conjunto en un campo y hay quien lo escribe en el
      otro. Se miran los dos.                                          */
  /*  EL BARRIO SOLO SE MIRA SI LA DIRECCION NO DICE UN NOMBRE.

      Encontrado con pedidos reales: "Reserva del Bosque Bloque 1 Casa 8"
      con el barrio escrito como "Bosque". La direccion no coincidia con
      ningun conjunto de la lista —correcto, "Reserva del Bosque" no esta
      registrado— pero entonces se caia al barrio, y "Bosque" si emparejaba
      con "Villa del Bosque". Resultado: las coordenadas de OTRO conjunto,
      dadas con toda confianza.

      La direccion siempre es mas especifica que el barrio. Si trae un
      nombre propio, manda ella; el barrio solo sirve cuando la direccion
      es un "casa 45" que por si solo no dice donde.                      */
  const lista = await conjuntosDe(tenant);
  const conj = lista.length
    ? (cualConjunto(dir, lista)
        || cualConjunto(dir + " " + barrio, lista, true)
        || (direccionSinNombre(dir) ? cualConjunto(barrio, lista, true) : null))
    : null;

  /*  ¿ESTO ES UNA CALLE O ES UN SITIO CON NOMBRE?

      No es un detalle: decide a cual de los dos indices de Google se le
      pregunta, y preguntarle al equivocado devuelve un punto en otra ciudad
      con toda la confianza del mundo.

      Hay tres formas de que el nombre aparezca, y las tres pasan a diario:

        1. Esta REGISTRADO como conjunto del restaurante. Es el mejor caso.
        2. La direccion misma es un nombre — "Centro Comercial Campanario",
           "Hospital San Jose"—. `canonizar` ya lo sabe: no le reconoce
           ningun tipo de via y devuelve `estructurada: false`.
        3. La direccion es SOLO un complemento —"Casa 32", "Torre D Apto
           603"— y el nombre esta en el campo del barrio. Este fue el caso
           de Llanos de Calibio, y es el mas comun de los tres: el cajero
           escribe la casa en un campo y la ciudadela en el otro.        */
  const cn = canonizar(dir);
  const dirEsNombre = !conjDicho && !cn.estructurada && !direccionSinNombre(dir);
  const barrioEsNombre = !conjDicho && !conj && !dirEsNombre && direccionSinNombre(dir)
    && !!barrio && !canonizar(barrio).estructurada;

  //  Lo dicho manda sobre lo deducido, siempre.
  const nombre = conjDicho ? mayus(conjDicho)
    : (conj ? conj : (dirEsNombre ? cn.canonica : (barrioEsNombre ? mayus(barrio) : "")));

  /*  Y si hay nombre, el punto se guarda POR NOMBRE, no por casa. La casa 32
      y la torre D del mismo conjunto llegan a la misma porteria: comparten
      punto y a Google se le pregunta una sola vez por toda la ciudadela. */
  const clave = nombre
    ? "nombre " + nucleo(nombre) + " " + normTexto(ciudad)
    : normalizar(dir, barrio, ciudad);
  /*  La clave si sigue llevando la ciudad escrita, y esta bien: si el dueno la
      corrige, las direcciones viejas —resueltas con la ciudad mala— quedan
      guardadas aparte y no contaminan las nuevas. Es un cajon por ciudad, no
      un dato que decida donde buscar.                                      */
  if (!clave) return mal("Falta la dirección");

  const orden = nombre
    ? { canonica: mayus(nombre), complemento: dirEsNombre ? "" : mayus(dir), estructurada: true }
    : cn;

  //  1) ¿Ya la tenemos, y todavia vale?
  //     `vence_at` solo lo llevan los puntos que calculo Google: sus
  //     condiciones dejan guardarlos 30 dias. Los que puso una persona
  //     (el domiciliario en la puerta, el cliente por WhatsApp) son
  //     nuestros, no caducan nunca, y ademas son mejores.
  const guardada = await sbSel(
    `pos_direcciones_geo?tenant_id=eq.${tenant}&clave=eq.${encodeURIComponent(clave)}` +
    `&select=lat,lng,origen,exactitud,canonica,vence_at`);
  if (guardada.length) {
    const g = guardada[0];
    const vencida = g.vence_at ? new Date(String(g.vence_at)) < new Date() : false;
    if (!vencida) {
      return ok({
        lat: g.lat, lng: g.lng, origen: g.origen,
        exactitud: g.exactitud || null,
        canonica: g.canonica || orden.canonica,
        complemento: orden.complemento,
        aproximada: String(g.origen) === "google_aprox",
        conjunto: conj || null,
        cache: true,
      });
    }
  }

  //  2) Toca preguntarle a Google.
  const cuenta = await llaveDe(tenant);
  if (!cuenta) return ok({ sin_conectar: true, canonica: orden.canonica });

  const permiso = await consumir(tenant, "geocoding", cuenta.propia);
  if (!permiso.permitido) {
    return ok({ tope_alcanzado: true, usado: permiso.usado, tope: permiso.tope });
  }

  /*  LO QUE SE LE MANDA A GOOGLE.

      Antes iba el texto tal cual lo escribio el cajero. Google entiende
      bastante, pero no es lo mismo: mientras mas raro le llega, mas se
      acerca a "no lo encontre" o —peor— a devolver el centro del barrio
      como si fuera la casa.

      Ahora va la forma canonica colombiana ("Carrera 9B # 63 Norte-58"),
      que es como estan escritos los datos de Google en Colombia, y SIN el
      complemento: "apto 502" no le dice nada y solo le estorba.

      NO SE FILTRA POR MUNICIPIO, Y ESTO SE APRENDIO FALLANDO.

      Antes iba `components=locality:<ciudad>`, para que "Calle 5 # 4-30"
      —que existe en media Colombia— no cayera en otra ciudad. Suena bien
      y esta mal: los domicilios se salen del municipio todos los dias.
      Un pedido a "Ciudadela Llanos de Calibio", que es un sitio que Google
      conoce por nombre, quedaba fuera del municipio y Google, obligado a
      contestar dentro de el, devolvio el centro de la ciudad como si fuera
      la casa. El filtro que existia para no equivocarse de ciudad fue justo
      lo que mando el pedido a otra ciudad.

      Ahora se hacen dos cosas distintas, que antes eran una sola mal hecha:

        - Se le SUGIERE la zona con `bounds` (un recuadro alrededor de la
          ciudad). Sugerir no es obligar: si la respuesta buena esta un poco
          afuera, Google la puede dar igual.
        - Y despues SE MIDE. Si lo que contesto queda a mas de 50 km del
          centro de la ciudad, no se acepta. Medir es mas seguro que
          prohibir: atrapa el error de ciudad sin romper las afueras.     */
  //  A un sitio con nombre NO se le agrega el barrio: el nombre propio ya lo
  //  identifica, y meterle mas palabras solo confunde la busqueda. (Y cuando
  //  el nombre SALIO del barrio, pegarselo seria repetirlo dos veces.)
  const partes = [orden.canonica];
  if (barrio && !nombre) partes.push(barrio);
  if (ciudad) partes.push(ciudad);
  const texto = partes.filter(Boolean).join(", ");

  //  El GPS de quien pregunta manda; la ciudad es el respaldo.
  const ancla = anclaGps || await puntoCiudad(tenant, ciudad, cuenta.clave);

  /*  CAMINO 1: TIENE NOMBRE. Se le pregunta al indice de sitios.
      Al nombre NO se le pega el barrio ni el numero de casa: el nombre
      propio ya identifica el sitio y lo demas solo le estorba a la
      busqueda. El "Casa 32" se queda como complemento, que es lo que el
      domiciliario lee en la tarjeta del pedido.                          */
  if (nombre) {
    const sitio = await buscarPorNombre(nombre + ", " + (ciudad || "Colombia"), ancla, cuenta.clave);
    if (sitio) {
      const lejos = ancla ? kmEntre(ancla, sitio) : 0;
      if (lejos <= KM_MAXIMO) {
        await sbRpc("fn_direccion_guardar", {
          p_tenant: tenant, p_clave: clave, p_direccion: dir, p_barrio: barrio,
          p_lat: sitio.lat, p_lng: sitio.lng, p_origen: "google_sitio",
          p_place_id: null, p_exactitud: "PLACE", p_canonica: orden.canonica,
        });
        return ok({
          lat: sitio.lat, lng: sitio.lng, origen: "google_sitio",
          exactitud: "PLACE",
          canonica: orden.canonica, complemento: orden.complemento,
          /*  Un sitio de Places NO es aproximado: es el sitio, con su
              nombre. Marcarlo de amarillo seria mentir al reves.       */
          aproximada: false,
          sitio: sitio.nombre, conjunto: conj || null,
        });
      }
      console.error("[mapa] sitio lejano", nombre, Math.round(lejos) + " km");
    }
    //  Si Places no contesto, se sigue por el camino de las direcciones.
  }

  //  CAMINO 2: es una calle (o el nombre no dio nada). El de siempre.
  let url = "https://maps.googleapis.com/maps/api/geocode/json"
    + "?address=" + encodeURIComponent(texto)
    + "&components=" + encodeURIComponent("country:CO")
    + "&region=co&language=es"
    + "&key=" + encodeURIComponent(cuenta.clave);
  if (ancla) {
    //  Medio grado ≈ 55 km a cada lado: la zona de reparto de cualquier
    //  restaurante cabe de sobra ahi.
    const d = 0.5;
    url += "&bounds=" + encodeURIComponent(
      (ancla.lat - d) + "," + (ancla.lng - d) + "|" + (ancla.lat + d) + "," + (ancla.lng + d));
  }

  const r = await fetchCorto(url);
  const j = await r.json().catch(() => null);

  if (j?.status === "ZERO_RESULTS") {
    //  Google tampoco la encontro. Se responde que no, sin inventar un
    //  punto: un punto equivocado manda al domiciliario a otra casa.
    return ok({ no_encontrada: true, canonica: orden.canonica, complemento: orden.complemento });
  }
  if (j?.status !== "OK" || !j?.results?.length) {
    const msg = j?.error_message || j?.status || "Google no respondió";
    if (cuenta.propia) {
      await sbUpsert("pos_mapas_config",
        { tenant_id: tenant, ultimo_error: String(msg), updated_at: new Date().toISOString() }, "tenant_id");
    }
    console.error("[mapa] geocode", msg);
    return ok({ fallo: String(msg) });
  }

  const res0 = j.results[0];
  const loc = res0.geometry?.location;
  const tipo = String(res0.geometry?.location_type || "");
  if (!loc) return ok({ no_encontrada: true });

  /*  LA MEDIDA. Si la respuesta cae lejisimos, no se guarda ni se muestra:
      un punto en otra ciudad se ve perfectamente normal en el mapa, y ese
      es justo el problema. Se responde "no la encontre", que es la verdad. */
  if (ancla) {
    const lejos = kmEntre(ancla, { lat: Number(loc.lat), lng: Number(loc.lng) });
    if (lejos > KM_MAXIMO) {
      console.error("[mapa] respuesta lejana", texto, Math.round(lejos) + " km");
      return ok({
        no_encontrada: true, lejos: Math.round(lejos),
        canonica: orden.canonica, complemento: orden.complemento,
      });
    }
  }

  /*  QUE TAN EXACTO ES LO QUE DEVOLVIO.

      ROOFTOP            = la puerta. Exacto.
      RANGE_INTERPOLATED = calculado entre dos numeros de la cuadra. Sirve.
      GEOMETRIC_CENTER   = el centro de la via. Sirve para llegar cerca.
      APPROXIMATE        = NO encontro la casa: devolvio el centro del
                           barrio o del pueblo.

      Ese ultimo caso es el peligroso: es un punto que se ve perfectamente
      normal en el mapa y esta a kilometros. Se guarda aparte
      (`google_aprox`) para no volver a pagar por preguntarlo, pero queda
      marcado, la pantalla lo advierte, y el primer domiciliario que
      entregue ahi lo reemplaza por el punto de verdad.                  */
  const aproximada = tipo === "APPROXIMATE" || !tipo;
  const origen = aproximada ? "google_aprox" : "google";

  await sbRpc("fn_direccion_guardar", {
    p_tenant: tenant, p_clave: clave, p_direccion: dir, p_barrio: barrio,
    p_lat: loc.lat, p_lng: loc.lng, p_origen: origen,
    p_place_id: res0.place_id || null,
    p_exactitud: tipo || null,
    p_canonica: orden.canonica,
  });

  return ok({
    lat: loc.lat, lng: loc.lng, origen,
    exactitud: tipo || null,
    aproximada,
    canonica: orden.canonica,
    complemento: orden.complemento,
    conjunto: conj || null,
    le_mande_a_google: texto,
  });
}

/* La imagen del mapa. Se devuelve la IMAGEN, no la direccion de Google:
   asi la llave nunca viaja al navegador.

   Va SIN puntos dibujados a proposito. Los puntos —el domiciliario
   moviendose, la casa del cliente— los pinta Cobra encima. De la otra
   forma, cada vez que el domiciliario avanza una cuadra habria que
   pedirle a Google una imagen nueva, y eso SI se paga. */
async function accEstatico(tenant: string, u: URL) {
  const cuenta = await llaveDe(tenant);
  if (!cuenta) return mal("Todavía no hay una cuenta de Google conectada para los mapas", 409);

  const lat = Number(u.searchParams.get("lat"));
  const lng = Number(u.searchParams.get("lng"));
  const zoom = Math.min(20, Math.max(1, Number(u.searchParams.get("zoom") || 14)));
  const w = Math.min(640, Math.max(100, Number(u.searchParams.get("w") || 640)));
  const h = Math.min(640, Math.max(100, Number(u.searchParams.get("h") || 400)));
  if (!isFinite(lat) || !isFinite(lng)) return mal("Faltan las coordenadas del centro");

  const permiso = await consumir(tenant, "static", cuenta.propia);
  if (!permiso.permitido) {
    return new Response(JSON.stringify({ tope_alcanzado: true, usado: permiso.usado, tope: permiso.tope }),
      { status: 429, headers: JSON_H });
  }

  const url = "https://maps.googleapis.com/maps/api/staticmap"
    + `?center=${lat},${lng}&zoom=${zoom}&size=${w}x${h}&scale=2`
    + "&maptype=roadmap&language=es&region=co"
    + "&key=" + encodeURIComponent(cuenta.clave);

  const r = await fetchCorto(url);
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
      if (acc === "estatico") {
        if (!await contratado(quien.tenant)) return ok(SIN_SERVICIO);
        return await accEstatico(quien.tenant, u);
      }
      if (acc === "estado")   return await accEstado(quien.tenant);
      return mal("Acción no reconocida");
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const acc = String(body.accion || "");

    if (acc === "estado")        return await accEstado(quien.tenant);
    if (acc === "navegador")     return await accNavegador(quien.tenant);

    /*  TODO LO QUE GASTA MAPA PASA POR AQUI.

        El candado va en la puerta y no dentro de cada funcion a proposito: el
        dia que se agregue una accion nueva que dibuje algo, queda protegida
        sin que nadie se acuerde de ponerle el candado. Al reves —una accion
        nueva que se olvida de comprobarlo— es una funcion regalada que nadie
        nota hasta que llega la factura de Google.

        `estado`, `guardar` y `desconectar` NO estan: son la pantalla de
        configuracion. El dueno tiene que poder ver como esta su servicio y
        conectar su propia llave aunque todavia no lo haya contratado.      */
    if (acc === "ruta" || acc === "ruta_tanda" || acc === "geocodificar") {
      if (!await contratado(quien.tenant)) return ok(SIN_SERVICIO);
    }

    if (acc === "ruta")          return await accRuta(quien.tenant, body);
    if (acc === "ruta_tanda")    return await accRutaTanda(quien.tenant, body);
    if (acc === "geocodificar")  return await accGeocodificar(quien.tenant, body);
    if (acc === "guardar")       return await accGuardar(quien.tenant, String(body.clave || ""));
    if (acc === "desconectar")   return await accDesconectar(quien.tenant);

    return mal("Acción no reconocida: " + acc);
  } catch (e) {
    console.error("[mapa]", e);
    return mal("Error interno", 500);
  }
});
