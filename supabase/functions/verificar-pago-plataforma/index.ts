/* verificar-pago-plataforma — comprueba el pago de quien COMPRA Cobra POS.
 *
 * Sergio, 29-ago-2026: *"una vez la persona haga la transferencia subirá ahí su
 * comprobante y el sistema de verificación de pagos que ya tenemos se va a
 * encargar de verificar ese pago... y como última instancia, si el sistema no
 * pudo verificarlo, le aparecerá un modal al cliente diciendo que una vez se
 * haya verificado el pago se le otorgará el acceso"*.
 *
 * ── POR QUÉ UNA FUNCIÓN NUEVA Y NO REUSAR LA QUE HAY ─────────────────────
 * El motor de verificación ya existe y funciona bien, pero las tres funciones
 * que lo usan (`verify-transfer`, `verificar-transferencia`,
 * `verificar-pago-manual`) sacan el buzón de `ia_config` **por `branch_id`**:
 * son del correo de UN RESTAURANTE. El pago de una suscripción llega al correo
 * de COBRA, que vive en `plataforma_correo` y no tiene sucursal.
 *
 * No es un detalle de plomería: son dos negocios distintos. El día que Sergio
 * cambie el correo de su restaurante, el de la plataforma no se debe mover.
 *
 * ── LAS DOS COMPROBACIONES ───────────────────────────────────────────────
 * 1. Se LEE el comprobante que subió la persona (imagen → monto, fecha, hora,
 *    y a qué llave le pagó).
 * 2. Se BUSCA en el correo de Cobra el aviso del banco por ese monto.
 *
 * Con la primera sola, cualquiera monta una imagen. Con la segunda sola, un
 * abono de otra persona por la misma cifra daría acceso a quien no pagó. Las
 * dos juntas es lo que hace que valga.
 *
 * ── ES PÚBLICA, ASÍ QUE TIENE TOPE ───────────────────────────────────────
 * La llama la pantalla de registro, donde nadie tiene sesión todavía. Por eso
 * solo actúa sobre solicitudes en estado `pending` que YA tienen comprobante, y
 * lleva la cuenta de los intentos: al tercero deja de leer imágenes. Sin tope,
 * cualquiera podría llamarla en bucle y gastar el saldo del lector.
 *
 * Y lo importante: **esta función no puede regalar acceso**. Solo aprueba si
 * encuentra el dinero de verdad en el correo del banco de Sergio.
 */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY   = Deno.env.get("OPENAI_API_KEY")!;
const GMAIL_CLIENT_ID     = Deno.env.get("GMAIL_CLIENT_ID")!;
const GMAIL_CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET")!;

const TOPE_INTENTOS = 3;
const VENTANA_HORAS = 48;   //  alguien puede transferir y subir el comprobante al rato

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: CORS });
}

const H = {
  "apikey": SERVICE_KEY,
  "Authorization": `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function sbGet(path: string): Promise<Array<Record<string, unknown>>> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H });
    if (!r.ok) return [];
    return await r.json() as Array<Record<string, unknown>>;
  } catch { return []; }
}

async function sbPatch(path: string, body: unknown): Promise<boolean> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: "PATCH", headers: { ...H, "Prefer": "return=minimal" },
      body: JSON.stringify(body),
    });
    return r.ok;
  } catch { return false; }
}

interface Comprobante {
  monto: string; fecha: string; hora: string; banco: string;
  referencia: string; llave: string; destinatario: string;
  parece_valido: boolean;
}
function vacio(): Comprobante {
  return { monto: "", fecha: "", hora: "", banco: "", referencia: "",
           llave: "", destinatario: "", parece_valido: false };
}

/*  El comprobante vive en un balde PRIVADO desde el 24-ago (lleva datos
    bancarios). Para que el lector lo vea hay que firmarle una dirección
    temporal — no se puede hacer público "un momentito".  */
async function urlFirmada(ruta: string): Promise<string | null> {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/storage/v1/object/sign/comprobantes/${encodeURIComponent(ruta)}`,
      { method: "POST", headers: H, body: JSON.stringify({ expiresIn: 600 }) });
    if (!r.ok) { console.error("firmar:", await r.text()); return null; }
    const d = await r.json() as Record<string, string>;
    return d.signedURL ? `${SUPABASE_URL}/storage/v1${d.signedURL}` : null;
  } catch (e) { console.error("firmar:", e); return null; }
}

async function leerComprobante(url: string): Promise<Comprobante> {
  const prompt = `Eres un experto en comprobantes de pago bancarios colombianos (Nequi, Bancolombia, Daviplata, etc.).

Analiza esta imagen y extrae en JSON:
{
  "monto": "SOLO dígitos del monto transferido, sin puntos ni comas ni $. Ej: si dice $149.000 entonces '149000'.",
  "fecha": "YYYY-MM-DD si se ve la fecha de la transacción. Vacío si no.",
  "hora": "HH:MM en 24 horas si se ve la hora (ej: '7:31 p.m.' -> '19:31'). Vacío si no.",
  "banco": "nombre del banco o app (Nequi, Bancolombia, Daviplata, etc.)",
  "referencia": "número de referencia o transacción si aparece",
  "llave": "El número (cuenta, celular, NIT o código) de QUIEN RECIBIÓ la plata. NO te guíes por la etiqueta: cada banco la nombra distinto —'Llave', 'Código de negocio', 'Cuenta destino', 'Para'—. Guíate por el SIGNIFICADO: es el número del que RECIBE. NUNCA el de quien envía ('Desde', 'Cuenta origen', '¿De dónde salió?').",
  "destinatario": "nombre de la persona o negocio que RECIBE el pago. Vacío si no se ve.",
  "parece_valido": true si la imagen muestra una pantalla de pago real con monto visible. false solo si está borrosa, es una foto cualquiera, o fue editada.
}

NOTA: Nequi y otros a veces muestran 'pendiente' o 'en proceso' aunque el dinero ya salió. NO marques parece_valido=false solo por eso.
Responde SOLO el JSON.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o", max_tokens: 300,
        messages: [{ role: "user", content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url, detail: "high" } },
        ] }],
      }),
    });
    if (!res.ok) { console.error("lector:", await res.text()); return vacio(); }
    const d = await res.json() as Record<string, unknown>;
    const raw = (((d.choices as Array<Record<string, unknown>>)?.[0]?.message as Record<string, unknown>)?.content as string || "").trim();
    return JSON.parse(raw.replace(/```json|```/g, "").trim()) as Comprobante;
  } catch (e) { console.error("lector:", e); return vacio(); }
}

async function tokenGmail(refresh: string): Promise<string | null> {
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GMAIL_CLIENT_ID, client_secret: GMAIL_CLIENT_SECRET,
        refresh_token: refresh, grant_type: "refresh_token",
      }),
    });
    if (!r.ok) { console.error("token:", await r.text()); return null; }
    const d = await r.json() as Record<string, string>;
    return d.access_token || null;
  } catch (e) { console.error("token:", e); return null; }
}

function cuerpoCorreo(msg: Record<string, unknown>): string {
  const partes: string[] = [];
  const rec = (p: Record<string, unknown>) => {
    const body = p.body as Record<string, unknown> | undefined;
    if (body?.data) {
      try {
        partes.push(atob(String(body.data).replace(/-/g, "+").replace(/_/g, "/")));
      } catch { /* una parte ilegible no invalida el resto */ }
    }
    for (const s of (p.parts as Array<Record<string, unknown>> | undefined) || []) rec(s);
  };
  rec((msg.payload as Record<string, unknown>) || {});
  return partes.join(" ");
}

const BANCOS = /bancolombia|nequi|daviplat|davivienda|bbva|occidente|bogota|popular|itau|nu[.]com[.]co|nubank|scotiabank|av villas/i;

/*  Busca en el correo de Cobra un aviso del banco por ese monto.
    Devuelve por qué sí o por qué no: ese texto es lo que Sergio lee luego en
    la consola, así que tiene que decir algo que se entienda.  */
async function buscarEnCorreo(
  token: string, montoDigitos: string, llaveCobra: string,
): Promise<{ hallado: boolean; detalle: string }> {
  if (!montoDigitos) return { hallado: false, detalle: "el comprobante no tenía un monto legible" };

  const conPuntos = montoDigitos.replace(/(\d)(?=(\d{3})+$)/g, "$1.");
  const conComas  = montoDigitos.replace(/(\d)(?=(\d{3})+$)/g, "$1,");
  const formatos  = [...new Set([montoDigitos, conPuntos, conPuntos + ",00", conComas, conComas + ".00"])];

  for (const fmt of formatos) {
    const q = `newer_than:3d "${fmt}"`;
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=10`,
      { headers: { "Authorization": `Bearer ${token}` } });
    if (!r.ok) { console.error("gmail:", await r.text()); continue; }
    const lista = (await r.json() as Record<string, unknown>).messages as Array<{ id: string }> | undefined;
    if (!lista?.length) continue;

    for (const m of lista) {
      const mr = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
        { headers: { "Authorization": `Bearer ${token}` } });
      if (!mr.ok) continue;
      const msg = await mr.json() as Record<string, unknown>;
      const cab = ((msg.payload as Record<string, unknown>)?.headers as Array<{ name: string; value: string }>) || [];
      const de  = cab.find(h => h.name === "From")?.value || "";
      const asu = cab.find(h => h.name === "Subject")?.value || "";
      const txt = (String(msg.snippet || "") + " " + cuerpoCorreo(msg) + " " + asu).toLowerCase();

      if (!BANCOS.test(de + " " + asu)) continue;

      //  Que sea de estos días: un abono de la semana pasada por la misma
      //  cifra no es este pago.
      const cuando = Number(msg.internalDate || 0);
      if (cuando && (Date.now() - cuando) > VENTANA_HORAS * 3600000) continue;

      //  Y que sea a NUESTRA llave, si el aviso la menciona.
      let llaveOk = true;
      if (llaveCobra && llaveCobra.length >= 4) {
        const suf = llaveCobra.slice(-4);
        llaveOk = txt.includes(llaveCobra.replace(/\s/g, "")) || txt.includes(suf);
      }

      return llaveOk
        ? { hallado: true, detalle: `Abono de $${conPuntos} confirmado en el correo del banco (${de})` }
        : { hallado: true, detalle: `Abono de $${conPuntos} confirmado (${de}) — el aviso no menciona la llave` };
    }
  }
  return { hallado: false, detalle: `No llegó ningún aviso del banco por $${conPuntos} en los últimos ${VENTANA_HORAS / 24} días` };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* cuerpo vacío -> falta el id */ }
  const regId = String(body.registration_id || "");
  if (!regId) return json({ error: "falta registration_id" }, 400);

  // 1. La solicitud
  const regs = await sbGet(`pos_registrations?id=eq.${regId}&limit=1`);
  const reg = regs[0];
  if (!reg) return json({ error: "solicitud no encontrada" }, 404);

  if (reg.status === "approved") {
    return json({ ok: true, verificado: true, ya: true, detalle: "esta solicitud ya estaba aprobada" });
  }
  if (reg.status !== "pending") {
    return json({ ok: true, verificado: false, detalle: "la solicitud no está pendiente" });
  }
  const intentos = Number(reg.verif_intentos || 0);
  if (intentos >= TOPE_INTENTOS) {
    return json({ ok: true, verificado: false, tope: true,
      detalle: "Ya lo intentamos varias veces. Un humano lo va a revisar." });
  }
  const ruta = String(reg.comprobante_url || "");
  if (!ruta) return json({ ok: true, verificado: false, detalle: "todavía no hay comprobante" });

  //  Se cuenta el intento ANTES de gastar nada. Si se contara al final, un
  //  fallo a mitad dejaría el contador quieto y el tope no serviría de nada.
  await sbPatch(`pos_registrations?id=eq.${regId}`, {
    verif_intentos: intentos + 1, verif_at: new Date().toISOString(),
  });

  const fallar = async (detalle: string, extraido: unknown = null) => {
    await sbPatch(`pos_registrations?id=eq.${regId}`,
      { verif_detalle: detalle, ...(extraido ? { verif_extraido: extraido } : {}) });
    return json({ ok: true, verificado: false, detalle });
  };

  // 2. ¿Hay buzón de plataforma conectado?
  const correo = (await sbGet("plataforma_correo?id=eq.1&limit=1"))[0];
  const refresh = String(correo?.gmail_refresh_token || "");
  if (!refresh) {
    return await fallar("El correo de verificación de Cobra no está conectado en la consola");
  }

  // 3. Leer el comprobante
  const firmada = await urlFirmada(ruta);
  if (!firmada) return await fallar("No se pudo abrir el comprobante");

  const c = await leerComprobante(firmada);
  if (!c.parece_valido || !c.monto) {
    return await fallar("La imagen no parece un comprobante de pago legible", c);
  }

  // 4. ¿Coincide con lo que tenía que pagar?
  const esperado = Math.round(Number(reg.monto_total || 0));
  const pagado   = Number(String(c.monto).replace(/\D/g, "")) || 0;
  if (esperado > 0 && pagado !== esperado) {
    return await fallar(
      `El comprobante dice $${pagado.toLocaleString("es-CO")} y el plan cuesta $${esperado.toLocaleString("es-CO")}`, c);
  }

  // 5. ¿Está el dinero en el correo del banco?
  const token = await tokenGmail(refresh);
  if (!token) return await fallar("No se pudo entrar al correo de verificación (vuelve a conectarlo en la consola)", c);

  const cuenta = (await sbGet("plataforma_cobro?id=eq.1&limit=1"))[0];
  const llave  = String(cuenta?.numero || "").replace(/\s/g, "");

  const hallazgo = await buscarEnCorreo(token, String(pagado), llave);
  if (!hallazgo.hallado) return await fallar(hallazgo.detalle, c);

  // 6. Sí llegó: se aprueba de verdad.
  await sbPatch(`pos_registrations?id=eq.${regId}`,
    { verif_detalle: hallazgo.detalle, verif_extraido: c });

  const ap = await fetch(`${SUPABASE_URL}/functions/v1/provision`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "approve", registration_id: regId, interno: true }),
  });
  const ad = await ap.json().catch(() => ({})) as Record<string, unknown>;
  if (!ap.ok || !ad.ok) {
    /*  El dinero SÍ llegó. Que la creación falle no puede leerse como "no
        pagó": se deja dicho y Sergio lo remata a mano con un botón.  */
    const d = "Pago confirmado, pero la cuenta no se pudo crear sola: " + String(ad.error || "").slice(0, 160);
    await sbPatch(`pos_registrations?id=eq.${regId}`, { verif_detalle: d });
    return json({ ok: true, verificado: true, creado: false, detalle: d });
  }

  return json({ ok: true, verificado: true, creado: true, detalle: hallazgo.detalle });
});
