// voz/index.ts — el puerto de las voces de Cobra
/* ══════════════════════════════════════════════════════════════════════
   voz — EL PUERTO DE LAS VOCES DE COBRA (10-sep-2026)

   La cocina le manda aqui la frase ("Salchipapa, para la mesa 1") y recibe
   el audio ya hecho. Asi la voz suena IGUAL en la tablet, en el programa de
   Windows y en cualquier navegador: el aparato solo reproduce.

   Sergio: "deja todas las instalaciones cuadradas de una vez... que las
   voces las podamos traer de varios sitios — archivos hechos por nosotros,
   ElevenLabs, de muchas partes — y que puedan engancharse, conectarse".

   UN PUERTO, VARIOS ENCHUFES. El catalogo (`pos_voces`) dice de que
   `proveedor` es cada voz y con que `config`. Aqui hay un enchufe por
   proveedor (ENCHUFES, abajo). Una voz nueva de un proveedor que ya existe
   = una fila en la tabla. Un proveedor nuevo = un enchufe aqui. Lo demas
   (plan, topes, memoria, rastro) no se toca.

   EN ORDEN, para cada frase:
     1. Quien llama: el restaurante sale del TOKEN, no de la pantalla.
     2. El plan: su plan tiene que traer 'voz_cocina' (pos_planes.funciones,
        la MISMA lista que usa la pantalla). Hoy: Pro y Premium.
     3. Que voz: la que pidio (solo el administrador de la plataforma puede
        pedir otra, para comparar) → la de su sede → la de Cobra por defecto.
     4. La memoria: si esa frase con esa voz ya se dijo, sale de ahi, gratis.
     5. El tope: por restaurante y de TODO Cobra, en caracteres.
     6. El enchufe del proveedor hace el audio; se guarda en la memoria.

   Las llaves de los proveedores viven en los secretos del servidor y NUNCA
   bajan al aparato.
   ══════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;

//  Topes en CARACTERES al mes. 80 caracteres ≈ un pedido leido.
const TOPE_RESTAURANTE = Number(Deno.env.get("VOZ_TOPE_RESTAURANTE") || "300000");   // ≈ 3.750 pedidos
const TOPE_GLOBAL      = Number(Deno.env.get("VOZ_TOPE_GLOBAL") || "3500000");       // bajo los 4 M gratis de Google WaveNet
const MAX_TEXTO = 500;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function ok(data: unknown) {
  return new Response(JSON.stringify(data), { headers: { ...CORS, "content-type": "application/json" } });
}

async function fetchCorto(url: string, init?: RequestInit, ms = 12000): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...init, signal: c.signal }); } finally { clearTimeout(t); }
}
const SRV = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
async function sbSel(path: string): Promise<Array<Record<string, unknown>>> {
  const r = await fetchCorto(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SRV });
  return r.ok ? await r.json() : [];
}
async function sbRpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const r = await fetchCorto(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST", headers: { ...SRV, "content-type": "application/json" }, body: JSON.stringify(args),
  });
  return r.ok ? await r.json().catch(() => null) : null;
}
async function diag(donde: string, mensaje: string, extra: Record<string, unknown> = {}) {
  try {
    await fetchCorto(`${SUPABASE_URL}/rest/v1/pos_diag`, {
      method: "POST", headers: { ...SRV, "content-type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ donde, mensaje, extra }),
    });
  } catch (_) { /* el rastro no puede tumbar la voz */ }
}

/* ── 1. Quien llama (igual que en `mapa`) ─────────────────────────────── */
async function quienLlama(req: Request): Promise<{ tenant: string; sub: string; token: string } | null> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const r = await fetchCorto(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json();
  const sub = String(u.id || "");
  let tenant = u?.user_metadata?.tenant_id;
  if (!tenant && sub) {
    //  Algunos usuarios viejos guardan el id de la sesion en `id` y no en
    //  `auth_user_id` (la cocina los busca por los dos, igual aqui).
    const f = await sbSel(`pos_users?select=tenant_id&or=(auth_user_id.eq.${sub},id.eq.${sub})&limit=1`);
    if (f.length) tenant = f[0].tenant_id;
  }
  return tenant ? { tenant: String(tenant), sub, token } : null;
}
async function esAdminPlataforma(token: string): Promise<boolean> {
  const r = await fetchCorto(`${SUPABASE_URL}/rest/v1/rpc/es_admin_plataforma`, {
    method: "POST", headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}",
  });
  return r.ok ? (await r.json().catch(() => false)) === true : false;
}

/* ── 2. El plan: la MISMA lista que mira la pantalla ──────────────────── */
async function planTraeVoz(tenant: string): Promise<boolean> {
  const t = await sbSel(`tenants?select=plan&id=eq.${tenant}&limit=1`);
  const plan = t.length ? String(t[0].plan || "") : "";
  if (!plan) return false;
  const p = await sbSel(`pos_planes?select=funciones&plan=eq.${encodeURIComponent(plan)}&limit=1`);
  const f = p.length ? (p[0].funciones as string[] | null) : null;
  return Array.isArray(f) && f.includes("voz_cocina");
}

/* ── 3. Que voz ───────────────────────────────────────────────────────── */
type Voz = { id: string; nombre: string; proveedor: string; config: Record<string, unknown> };
async function vozPorId(id: string): Promise<Voz | null> {
  const v = await sbSel(`pos_voces?select=id,nombre,proveedor,config&id=eq.${encodeURIComponent(id)}&activa=eq.true&limit=1`);
  return v.length ? (v[0] as unknown as Voz) : null;
}
async function vozPorDefecto(): Promise<Voz | null> {
  const v = await sbSel(`pos_voces?select=id,nombre,proveedor,config&por_defecto=eq.true&activa=eq.true&limit=1`);
  return v.length ? (v[0] as unknown as Voz) : null;
}
async function vozDeLaSede(tenant: string, branch: string): Promise<string | null> {
  if (!branch) return null;
  const b = await sbSel(`branches?select=operacion_config&id=eq.${branch}&tenant_id=eq.${tenant}&limit=1`);
  const op = (b.length ? b[0].operacion_config : null) as Record<string, any> | null;
  return (op && op.cocinaNotif && op.cocinaNotif.voz) ? String(op.cocinaNotif.voz) : null;
}

/* ── 6. LOS ENCHUFES ──────────────────────────────────────────────────────
   Cada uno recibe el texto y la `config` de la voz y devuelve el MP3.
   Si le falta su llave, dice "no_conectado": el catalogo puede tener la
   voz lista antes de que el proveedor este conectado, y no se cae nada. */
class NoSirve extends Error { constructor(public motivo: string, detalle = "") { super(detalle || motivo); } }
function b64aBytes(b64: string): Uint8Array {
  const s = atob(b64); const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
function bytesAb64(u: Uint8Array): string {
  let s = ""; const paso = 0x8000;
  for (let i = 0; i < u.length; i += paso) s += String.fromCharCode(...u.subarray(i, i + paso));
  return btoa(s);
}

const ENCHUFES: Record<string, (texto: string, c: Record<string, any>) => Promise<Uint8Array>> = {
  //  Google Cloud Text-to-Speech. config: { voz: 'es-US-Neural2-A', idioma: 'es-US', velocidad: 1, tono: 0 }
  async google(texto, c) {
    const key = Deno.env.get("VOZ_GOOGLE_CLAVE") || Deno.env.get("MAPAS_CLAVE_COBRA") || "";
    if (!key) throw new NoSirve("no_conectado", "falta la llave de Google");
    const r = await fetchCorto(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: { text: texto },
        voice: { languageCode: c.idioma || String(c.voz || "es-US").slice(0, 5), name: c.voz },
        audioConfig: { audioEncoding: "MP3", speakingRate: c.velocidad ?? 1, pitch: c.tono ?? 0 },
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.audioContent) throw new NoSirve("proveedor", `google ${r.status}: ${j?.error?.status || ""} ${String(j?.error?.message || "").replace(key, "[llave]")}`);
    return b64aBytes(j.audioContent);
  },

  //  ElevenLabs. config: { voice_id: '...', modelo: 'eleven_multilingual_v2', ajustes: { stability, similarity_boost } }
  async elevenlabs(texto, c) {
    const key = Deno.env.get("ELEVENLABS_API_KEY") || "";
    if (!key) throw new NoSirve("no_conectado", "falta ELEVENLABS_API_KEY");
    const r = await fetchCorto(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(c.voice_id)}?output_format=mp3_44100_64`, {
      method: "POST", headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text: texto, model_id: c.modelo || "eleven_multilingual_v2", voice_settings: c.ajustes || undefined }),
    });
    if (!r.ok) throw new NoSirve("proveedor", `elevenlabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return new Uint8Array(await r.arrayBuffer());
  },

  //  Azure (Microsoft). config: { voz: 'es-CO-SalomeNeural', idioma: 'es-CO', velocidad: '0%' }
  async azure(texto, c) {
    const key = Deno.env.get("AZURE_VOZ_CLAVE") || "", region = Deno.env.get("AZURE_VOZ_REGION") || "";
    if (!key || !region) throw new NoSirve("no_conectado", "falta AZURE_VOZ_CLAVE / AZURE_VOZ_REGION");
    const esc = texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const ssml = `<speak version='1.0' xml:lang='${c.idioma || "es-CO"}'><voice name='${c.voz}'><prosody rate='${c.velocidad || "0%"}'>${esc}</prosody></voice></speak>`;
    const r = await fetchCorto(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST", body: ssml,
      headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3" },
    });
    if (!r.ok) throw new NoSirve("proveedor", `azure ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  },

  /*  ARCHIVOS HECHOS POR NOSOTROS. Frases grabadas enteras, por texto:
      config: { frases: { "voz de la cocina encendida": "https://.../encendida.mp3" } }
      Para lo que no esta grabado dice "sin_archivo" (no inventa). El dia que
      haya grabaciones por PALABRA, este enchufe las junta — sin tocar nada
      mas del sistema.                                                     */
  async archivo(texto, c) {
    const clave = texto.toLowerCase().replace(/[.,;:!?¡¿]/g, "").replace(/\s+/g, " ").trim();
    const url = c.frases && c.frases[clave];
    if (!url) throw new NoSirve("sin_archivo", `no hay grabacion para: ${clave}`);
    const r = await fetchCorto(String(url));
    if (!r.ok) throw new NoSirve("proveedor", `archivo ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  },
};

/* ── 4. La memoria ─────────────────────────────────────────────────────── */
async function sha256(t: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function deLaMemoria(clave: string): Promise<Uint8Array | null> {
  const f = await sbSel(`pos_voz_memoria?select=ruta,usos&clave=eq.${clave}&limit=1`);
  if (!f.length) return null;
  const r = await fetchCorto(`${SUPABASE_URL}/storage/v1/object/voz/${f[0].ruta}`, { headers: SRV });
  if (!r.ok) return null;
  const bytes = new Uint8Array(await r.arrayBuffer());
  fetchCorto(`${SUPABASE_URL}/rest/v1/pos_voz_memoria?clave=eq.${clave}`, {
    method: "PATCH", headers: { ...SRV, "content-type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ usos: Number(f[0].usos || 0) + 1, ultimo_uso_at: new Date().toISOString() }),
  }).catch(() => {});
  return bytes;
}
async function guardarEnMemoria(clave: string, voz: Voz, texto: string, audio: Uint8Array) {
  const ruta = `${clave}.mp3`;
  const s = await fetchCorto(`${SUPABASE_URL}/storage/v1/object/voz/${ruta}`, {
    method: "POST", headers: { ...SRV, "content-type": "audio/mpeg", "x-upsert": "true" }, body: audio,
  });
  if (!s.ok) return;
  await fetchCorto(`${SUPABASE_URL}/rest/v1/pos_voz_memoria`, {
    method: "POST", headers: { ...SRV, "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ clave, voz_id: voz.id, texto, ruta, bytes: audio.length, usos: 1, ultimo_uso_at: new Date().toISOString() }),
  });
}

/* ── El puerto ─────────────────────────────────────────────────────────── */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const quien = await quienLlama(req);
  if (!quien) return ok({ ok: false, motivo: "sin_sesion" });
  const body = await req.json().catch(() => ({})) as Record<string, any>;
  const accion = String(body.accion || "decir");

  //  El catalogo, para escoger (pantallas de configuracion y comparacion).
  if (accion === "voces") {
    const v = await sbSel(`pos_voces?select=id,nombre,proveedor,por_defecto,orden&activa=eq.true&order=orden.asc,nombre.asc`);
    return ok({ ok: true, voces: v });
  }

  if (!(await planTraeVoz(quien.tenant))) return ok({ ok: false, motivo: "plan" });

  const texto = String(body.texto || "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXTO);
  if (!texto) return ok({ ok: false, motivo: "sin_texto" });

  let voz: Voz | null = null;
  if (body.voz && (await esAdminPlataforma(quien.token))) voz = await vozPorId(String(body.voz));
  if (!voz) { const id = await vozDeLaSede(quien.tenant, String(body.branch_id || "")); if (id) voz = await vozPorId(id); }
  if (!voz) voz = await vozPorDefecto();
  if (!voz) return ok({ ok: false, motivo: "sin_voz" });

  const enchufe = ENCHUFES[voz.proveedor];
  if (!enchufe) return ok({ ok: false, motivo: "no_conectado", detalle: `no hay enchufe para ${voz.proveedor}` });

  const clave = await sha256([voz.id, voz.proveedor, JSON.stringify(voz.config), texto].join("|"));
  const guardado = await deLaMemoria(clave);
  if (guardado) {
    sbRpc("fn_voz_desde_memoria", { p_tenant: quien.tenant, p_proveedor: voz.proveedor }).catch(() => {});
    return ok({ ok: true, voz: voz.id, memoria: true, audio: bytesAb64(guardado) });
  }

  const cupo = await sbRpc("fn_voz_consumir", {
    p_tenant: quien.tenant, p_proveedor: voz.proveedor, p_caracteres: texto.length,
    p_tope_restaurante: TOPE_RESTAURANTE, p_tope_global: TOPE_GLOBAL,
  }) as Array<{ permitido: boolean; usado: number; tope: number; global: boolean }> | null;
  if (!cupo || !cupo.length) return ok({ ok: false, motivo: "contador" });
  if (!cupo[0].permitido) {
    if (cupo[0].global) await diag("voz/tope-global", "TOPE GLOBAL DE COBRA ALCANZADO", { usado: cupo[0].usado, tope: cupo[0].tope });
    return ok({ ok: false, motivo: "tope", global: cupo[0].global });
  }

  try {
    const audio = await enchufe(texto, voz.config || {});
    await guardarEnMemoria(clave, voz, texto, audio);
    return ok({ ok: true, voz: voz.id, memoria: false, audio: bytesAb64(audio) });
  } catch (e) {
    //  No salio audio: esos caracteres no se le pagaron a nadie, se devuelven.
    await sbRpc("fn_voz_devolver", { p_tenant: quien.tenant, p_proveedor: voz.proveedor, p_caracteres: texto.length });
    const motivo = e instanceof NoSirve ? e.motivo : "proveedor";
    await diag("voz/" + voz.proveedor, String((e as Error).message || e).slice(0, 400), { voz: voz.id, tenant: quien.tenant });
    return ok({ ok: false, motivo });
  }
});
