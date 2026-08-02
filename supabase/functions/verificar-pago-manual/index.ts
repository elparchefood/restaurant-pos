const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY   = Deno.env.get("OPENAI_API_KEY")!;
const GMAIL_CLIENT_ID     = Deno.env.get("GMAIL_CLIENT_ID")!;
const GMAIL_CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function jsonR(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

// ── Handler ───────────────────────────────────────────────────────────────────
// Verificación SOLO-LECTURA de un pago por transferencia, para la vista del operador.
// NO responde al cliente, NO crea pedido, NO cambia banderas. Devuelve el veredicto.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return new Response("Method Not Allowed", { status: 405, headers: CORS });

  try {
    const b = await req.json().catch(() => ({} as Record<string, unknown>));
    const conversationId = String(b.conversation_id || "");
    const montoEsperado  = Number(b.monto) || 0;
    if (!conversationId) return jsonR({ verified: false, razon: "input", mensaje: "Falta conversation_id" }, 400);

    const r = await verificarPagoManual(conversationId, montoEsperado);
    return jsonR(r);
  } catch (e) {
    console.error("verificar-pago-manual error:", e);
    return jsonR({ verified: false, razon: "error", mensaje: "Error interno: " + String(e) }, 500);
  }
});

async function verificarPagoManual(conversationId: string, montoEsperado: number) {
  // 1. Conversación → branch_id
  const convRows = await sbGet(`/rest/v1/chat_conversations?id=eq.${conversationId}&select=*&limit=1`);
  const conv = convRows?.[0];
  if (!conv) return { verified: false, razon: "error", mensaje: "No encontramos la conversación." };
  const branchId = String(conv.branch_id || "");

  // 2. Config de la sucursal (Gmail, llave, región)
  const cfgRows = await sbGet(`/rest/v1/ia_config?branch_id=eq.${branchId}&select=gmail_refresh_token,pagos,zona_horaria,moneda&limit=1`);
  const cfg          = cfgRows?.[0] || {};
  const refreshToken = cfg?.gmail_refresh_token as string | null;
  const pagos        = (cfg?.pagos as Record<string, unknown>) || {};
  const llaveCfg     = String(pagos?.llave || "");
  const monedaCfg    = (cfg?.moneda as Record<string, unknown>) || null;
  const tzRest       = tzStrFromCfg(cfg?.zona_horaria);
  const bancosRe     = bancosRegexFromCfg(pagos);

  // 3. Comprobante = imagen más reciente entrante del chat
  const imgMsgs = await sbGet(`/rest/v1/chat_messages?conversation_id=eq.${conversationId}&direction=eq.in&media_type=eq.image&order=sent_at.desc&limit=1`);
  const imageUrl = imgMsgs?.[0]?.media_url as string | null;
  if (!imageUrl) {
    return { verified: false, razon: "sin_comprobante", mensaje: "No hay ningún comprobante (imagen) en este chat para verificar." };
  }

  // 4. GPT-4o Vision
  const v = await extractComprobante(imageUrl);
  if (!v.parece_valido && !v.monto) {
    return { verified: false, razon: "ilegible", mensaje: "No pudimos leer el monto en el comprobante. La imagen no es clara o no es un comprobante bancario." };
  }

  const montoComprobante = Number(v.monto.replace(/\D/g, "")) || 0;
  const cuentaComprob    = String(v.llave || "").replace(/\s/g, "");
  const cuentaCfgLimpia  = llaveCfg.replace(/\s/g, "");

  // 5. Chequeo CUENTA (llave/cuenta DESTINO del comprobante).
  //    IMPORTANTE (seguridad): si el comprobante NO muestra la cuenta destino
  //    (transferencias tipo Bre-B a un nombre, o texto ilegible) NO se da por
  //    buena — antes se marcaba ✓ y dejaba pasar transferencias a OTRA cuenta.
  //    Solo se omite el chequeo si el restaurante no tiene cuenta configurada
  //    (ahí no hay contra qué comparar; el correo del banco sigue gateando).
  /* La comparacion la hace NUESTRO codigo, no el modelo. Se busca la cuenta
     configurada en CUALQUIER numero del comprobante que no sea del remitente.
     Asi da igual como la etiquete cada banco: "Llave" (Nequi), "Codigo de
     negocio" (Bre-B) o suelta en una frase (Davivienda). */
  const soloDig = (s: string) => String(s || "").replace(/\D/g, "");
  const cfgDig = soloDig(cuentaCfgLimpia);

  const candidatos: string[] = [];
  if (cuentaComprob) candidatos.push(soloDig(cuentaComprob));
  for (const nm of (v.numeros || [])) {
    if (String(nm.donde || "") === "origen") continue;   // el numero de quien envia NO cuenta
    const d = soloDig(nm.valor);
    if (d.length >= 6) candidatos.push(d);
  }

  /* Dos cuentas son la misma si son iguales, o si una termina en la otra
     (los bancos a veces omiten los ceros del principio). Se exige que la mas
     corta tenga al menos 8 digitos: sin eso, un numero de 6 que casualmente
     sea subcadena daria por buena una transferencia a OTRA cuenta. */
  const coincide = (a: string, b: string) => {
    if (!a || !b) return false;
    if (a === b) return true;
    const corta = a.length <= b.length ? a : b;
    const larga = a.length <= b.length ? b : a;
    if (corta.length < 8) return false;
    return larga.endsWith(corta);
  };

  const cuentaOk = !cfgDig
    ? true
    : candidatos.some(x => coincide(x, cfgDig));

  // 6. Chequeo MONTO (tolerancia 12%)
  let montoOk = true;
  if (montoEsperado > 0 && montoComprobante > 0) {
    montoOk = (Math.abs(montoComprobante - montoEsperado) / montoEsperado) <= 0.12;
  }

  // 7. Chequeo CORREO (Gmail confirma el monto dentro de la ventana del turno)
  // Correo del banco = confirmación EXTRA (una sola pasada, sin espera → rápido).
  // Incluye in:anywhere para no perder correos en spam/promociones.
  let correoOk = false;
  let correoDetalle = "";
  if (refreshToken) {
    const gmailToken = await refreshGmailToken(refreshToken);
    if (gmailToken) {
      const ventanaHoras = Number(pagos?.ventana_comprobante_horas) || 5;
      const m = await searchGmailForAmount(gmailToken, v.monto, v.fecha, v.hora, llaveCfg, ventanaHoras, bancosRe, tzRest);
      correoOk = m.found; correoDetalle = m.detail;
    } else {
      correoDetalle = "No se pudo conectar con Gmail.";
    }
  } else {
    correoDetalle = "Gmail no está configurado.";
  }

  const checks = { monto: montoOk, cuenta: cuentaOk, correo: correoOk };
  const datos = {
    monto_comprobante: montoComprobante,
    monto_esperado: montoEsperado,
    monto_comprobante_fmt: fmtMonto(montoComprobante, monedaCfg),
    monto_esperado_fmt: montoEsperado > 0 ? fmtMonto(montoEsperado, monedaCfg) : "",
    cuenta_comprobante: cuentaComprob,
    cuenta_config: cuentaCfgLimpia,
    destinatario: v.destinatario || "",
    fecha: v.fecha, hora: v.hora, banco: v.banco, referencia: v.referencia,
    checks, correo_detalle: correoDetalle,
    numeros_vistos: (v.numeros || []).map(x => x.valor + " (" + x.donde + ")"),
  };

  // 8. Veredicto — razón EXACTA del primer fallo (cuenta > monto > correo)
  if (!cuentaOk) {
    const destino = cuentaComprob || (v.destinatario ? `“${v.destinatario}”` : "no visible");
    return { verified: false, razon: "cuenta", mensaje: `El pago fue enviado a otra cuenta (${destino}), no a la tuya (${llaveCfg}).`, datos };
  }
  if (!montoOk) {
    return { verified: false, razon: "monto", mensaje: `El monto del comprobante (${datos.monto_comprobante_fmt}) no coincide con el del pedido (${datos.monto_esperado_fmt}).`, datos };
  }
  // Verificación ESTRICTA: solo "verificado" si monto + cuenta + correo del banco coinciden.
  // Si el correo no aparece, NO se da por bueno — se avisa que revise la conexión del Gmail.
  if (!correoOk) {
    return {
      verified: false, razon: "correo",
      mensaje: `El monto y la cuenta coinciden, pero NO pudimos confirmar el pago con el correo del banco. Revisa que Cobra esté conectado al Gmail donde te llegan los correos de tus pagos (Configuración → verificación de pago). Detalle: ${correoDetalle}`,
      datos,
    };
  }
  const porC = datos.monto_comprobante_fmt ? " por " + datos.monto_comprobante_fmt : "";
  return { verified: true, razon: "", mensaje: `Pago verificado con éxito${porC}. Confirmado por monto, cuenta y correo del banco. ✅`, datos };
}


// ── Helpers reutilizados de verify-transfer ───────────────────────────────────
async function sbGet(path: string): Promise<Array<Record<string, unknown>> | null> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) { console.error("sbGet error", path, res.status); return null; }
  return res.json();
}

interface ComprobanteData {
  monto: string; fecha: string; hora: string; banco: string;
  referencia: string; llave: string; destinatario: string; parece_valido: boolean;
  /* Todos los numeros largos que aparecen en el comprobante, con la seccion
     donde estaban. Se pide para NO depender de que el modelo clasifique bien:
     aunque se equivoque diciendo cual es la llave destino, el numero llego y
     nuestro codigo puede compararlo contra la cuenta configurada. */
  numeros?: Array<{ valor: string; donde: string }>;
}

async function extractComprobante(imageUrl: string): Promise<ComprobanteData> {
  const prompt = `Eres un experto en comprobantes de pago bancarios colombianos (Nequi, Bancolombia, Daviplata, etc.).

Analiza esta imagen y extrae en JSON:
{
  "monto": "SOLO dígitos del monto transferido, sin puntos ni comas ni $. Ej: si dice $33.000 entonces '33000'.",
  "fecha": "YYYY-MM-DD si se ve la fecha de la transacción. Vacío si no.",
  "hora": "HH:MM en formato 24 horas si se ve la hora (ej: '7:31 p.m.' -> '19:31'). Vacío si no.",
  "banco": "nombre del banco o app (Nequi, Bancolombia, Daviplata, etc.)",
  "referencia": "número de referencia o transacción si aparece",
  "llave": "El número (cuenta, celular, NIT o código) que identifica a QUIEN RECIBIÓ la plata. NO te guíes por la etiqueta: cada banco la nombra distinto —'Llave', 'Código de negocio', 'Cuenta destino', 'Convenio', 'Para'— y a veces va suelta en una frase sin etiqueta ('a la llave Bancolombia 0089912015 de El Parche Food'). Guíate por el SIGNIFICADO: es el número del que RECIBE. NUNCA el de quien envía (secciones como '¿De dónde salió?', '¿Desde dónde se hizo el envío?', 'Cuenta origen', 'Desde'). Si el destinatario aparece con nombre Y con número, devuelve el NÚMERO. Vacío solo si de verdad no hay ningún número del receptor.",
  "destinatario": "nombre de la persona/negocio que RECIBE el pago (destinatario). Vacío si no se ve.",
  "numeros": [ { "valor": "solo dígitos del número", "donde": "destino" | "origen" | "referencia" | "otro" } ],
  "parece_valido": true si la imagen muestra una pantalla de pago/transferencia real con monto visible. Solo false si está borrosa, es foto aleatoria, o fue editada para falsificar números.
}

IMPORTANTE sobre "numeros": incluye TODOS los números largos que veas en el comprobante (cuentas, llaves, celulares, códigos de negocio, referencias), cada uno con la sección donde estaba. Es la red de seguridad: si te equivocas eligiendo la llave destino, el número igual queda registrado.

NOTA: Nequi y otros bancos a veces muestran 'pendiente' o 'en proceso' aunque el dinero ya salió. NO marques parece_valido=false solo por ver 'pendiente'.
Responde SOLO el JSON, sin explicación.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: [
            { type: "text",      text: prompt },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
          ],
        }],
      }),
    });
    if (!res.ok) { console.error("Vision error:", await res.text()); return empty(); }
    const data = await res.json() as Record<string, unknown>;
    const raw   = (((data.choices as Array<Record<string,unknown>>)?.[0]?.message as Record<string,unknown>)?.content as string || "").trim();
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as ComprobanteData;
  } catch (err) {
    console.error("extractComprobante error:", err);
    return empty();
  }
}

function empty(): ComprobanteData {
  return { monto: "", fecha: "", hora: "", banco: "", referencia: "", llave: "", destinatario: "", parece_valido: false };
}

async function refreshGmailToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     GMAIL_CLIENT_ID,
        client_secret: GMAIL_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type:    "refresh_token",
      }),
    });
    if (!res.ok) { console.error("Token refresh error:", await res.text()); return null; }
    const data = await res.json() as Record<string, string>;
    return data.access_token || null;
  } catch (err) {
    console.error("refreshGmailToken error:", err);
    return null;
  }
}

interface GmailMatch { found: boolean; detail: string; }

async function searchGmailForAmount(
  accessToken: string,
  monto:       string,
  fecha:       string,
  hora:        string,
  llaveCfg:    string,
  ventanaHoras: number = 5,
  bancosRe:    RegExp = new RegExp(BANCOS_DEFAULT, "i"),
  tzRest:      string = "-05:00",
): Promise<GmailMatch> {
  try {
    const digits = monto.replace(/\D/g, "");
    if (!digits) return { found: false, detail: "monto vacío" };

    const withDots   = digits.replace(/(\d)(?=(\d{3})+$)/g, "$1.");
    const withCommas = digits.replace(/(\d)(?=(\d{3})+$)/g, "$1,");
    const formatos = [...new Set([digits, withDots, withDots + ",00", withCommas, withCommas + ".00"])];

    for (const fmt of formatos) {
      const q = `newer_than:1d "${fmt}"`;
      const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=10`;
      const searchRes = await fetch(searchUrl, { headers: { "Authorization": `Bearer ${accessToken}` } });
      if (!searchRes.ok) { console.error("Gmail search error:", await searchRes.text()); continue; }

      const searchData = await searchRes.json() as Record<string, unknown>;
      const messages = searchData.messages as Array<{ id: string }> | undefined;
      if (!messages?.length) continue;

      for (const gmailMsg of messages) {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailMsg.id}?format=full`,
          { headers: { "Authorization": `Bearer ${accessToken}` } }
        );
        if (!msgRes.ok) continue;
        const msgData    = await msgRes.json() as Record<string, unknown>;
        const headers    = ((msgData.payload as Record<string, unknown>)?.headers as Array<{name:string;value:string}>) || [];
        const from       = headers.find(h => h.name === "From")?.value    || "";
        const subject    = headers.find(h => h.name === "Subject")?.value || "";
        const snippet    = String(msgData.snippet || "");
        const bodyText   = extractEmailBody(msgData);
        const fullText   = (snippet + " " + bodyText + " " + subject).toLowerCase();

        const isBankEmail = bancosRe.test(from + " " + subject);
        if (!isBankEmail) continue;

        let fechaOk = true;
        if (fecha) {
          const [yyyy, mm, dd] = fecha.split("-");
          const variantes = [fecha, `${dd}/${mm}/${yyyy}`, `${dd}-${mm}-${yyyy}`, `${dd}/${mm}`, `${mm}/${dd}`];
          fechaOk = variantes.some(vv => fullText.includes(vv));
        }

        const internalMs = Number(msgData.internalDate || 0);
        if (internalMs && (Date.now() - internalMs) > ventanaHoras * 3600000) continue;

        let tiempoOk = true;
        if (internalMs && fecha) {
          const horaStr = (hora && /^\d{1,2}:\d{2}$/.test(hora.trim())) ? hora.trim().padStart(5, "0") : "";
          const comprobanteMs = Date.parse(`${fecha}T${horaStr || "12:00"}:00${tzRest}`);
          if (!isNaN(comprobanteMs)) {
            const diffHoras = Math.abs(internalMs - comprobanteMs) / 3600000;
            tiempoOk = diffHoras <= (horaStr ? 6 : 36);
          }
        }
        if (!tiempoOk) continue;

        let llaveOk = true;
        if (llaveCfg && llaveCfg.length >= 4) {
          const sufijo = llaveCfg.slice(-4);
          llaveOk = fullText.includes(llaveCfg.replace(/\s/g, "")) || fullText.includes(sufijo);
        }

        if (isBankEmail && fechaOk && llaveOk) {
          return { found: true, detail: `Remitente: ${from}` };
        }
        if (isBankEmail && fechaOk) {
          return { found: true, detail: `Remitente: ${from} (llave no verificada en email)` };
        }
      }
    }

    return { found: false, detail: `Sin correos bancarios con monto ${digits} en las últimas ${ventanaHoras}h` };
  } catch (err) {
    console.error("searchGmailForAmount error:", err);
    return { found: false, detail: String(err) };
  }
}

function extractEmailBody(msgData: Record<string, unknown>): string {
  try {
    const payload = msgData.payload as Record<string, unknown>;
    const parts   = (payload?.parts as Array<Record<string, unknown>>) || [];
    const plain = parts.find(p => (p.mimeType as string) === "text/plain");
    if (plain?.body) {
      const data = ((plain.body as Record<string,string>).data || "");
      return atob(data.replace(/-/g, "+").replace(/_/g, "/"));
    }
    if (payload?.body) {
      const data = ((payload.body as Record<string,string>).data || "");
      return atob(data.replace(/-/g, "+").replace(/_/g, "/"));
    }
  } catch { /* ignorar */ }
  return "";
}

const BANCOS_DEFAULT = "bancolombia|nequi|daviplat|davivienda|bbva|occidente|bogota|popular|itau|wompi|bold|nu[.]com[.]co|nubank";

function tzStrFromCfg(z: unknown): string {
  const parsed = parseFloat(String(z ?? "").replace(":30", ".5").replace(":00", ""));
  const h = (!isNaN(parsed) && parsed >= -12 && parsed <= 14) ? parsed : -5;
  const sign = h < 0 ? "-" : "+";
  const abs = Math.abs(h);
  const hh = String(Math.floor(abs)).padStart(2, "0");
  const mm = abs % 1 !== 0 ? "30" : "00";
  return `${sign}${hh}:${mm}`;
}

function fmtMonto(n: number, moneda: Record<string, unknown> | null | undefined): string {
  const simbolo = String(moneda?.simbolo || "$");
  const miles   = String(moneda?.miles || ".");
  const dec     = Number(moneda?.decimales ?? 0) || 0;
  const decSep  = miles === "." ? "," : ".";
  const s = dec > 0 ? n.toFixed(dec) : String(Math.round(n));
  const parts = s.split(".");
  const ent = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, miles);
  const num = parts[1] ? ent + decSep + parts[1] : ent;
  return moneda?.sufijo ? `${num} ${simbolo}` : `${simbolo}${num}`;
}

function bancosRegexFromCfg(pagos: Record<string, unknown> | null | undefined): RegExp {
  const lista = pagos?.bancos_correo as unknown;
  if (Array.isArray(lista) && lista.length > 0) {
    const parts = lista
      .map(b => String(b).trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .filter(Boolean);
    if (parts.length > 0) return new RegExp(parts.join("|"), "i");
  }
  return new RegExp(BANCOS_DEFAULT, "i");
}
