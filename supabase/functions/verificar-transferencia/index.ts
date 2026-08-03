// verificar-transferencia — consulta de SOLO LECTURA del correo del banco.
//
// POR QUE EXISTE: el cajero necesita confirmar en la pantalla de cobro que la
// transferencia llego, sin irse al chat. `verify-transfer` NO sirve para eso:
// su modo `manual` da el pago por bueno SIN verificar nada, puede crear un
// pedido duplicado y le manda un WhatsApp al cliente. Aqui no se escribe nada
// ni se le avisa a nadie: solo se busca en el correo del banco un abono por
// ese monto en las ultimas horas y se responde si aparecio o no.
//
// Funciona para CUALQUIER pedido (mesa, venta rapida, domicilio) porque no
// depende de que exista un comprobante en el chat.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GMAIL_CLIENT_ID     = Deno.env.get("GMAIL_CLIENT_ID")!;
const GMAIL_CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET")!;
const H = { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" };

const BANCOS_DEFAULT = "bancolombia|nequi|daviplat|davivienda|bbva|occidente|bogota|popular|itau|wompi|bold|nu[.]com[.]co|nubank";



async function sbGet(path: string) {
  const r = await fetch(`${SUPABASE_URL}${path}`, { headers: H });
  return r.ok ? await r.json() : null;
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

// ── Gmail: buscar correo bancario con el monto ────────────────────────────────

interface GmailMatch {
  varios?:     boolean;
  cuantos?:    number;
  hora?:       string;
  referencia?: string;
  found:  boolean;
  detail: string;
}


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

    const hallazgos: Array<{ hora: string; referencia: string; detalle: string }> = [];
    // tzRest viene como "-05:00"; para pintar la hora local basta el numero.
    const horasTz = Number(String(tzRest).slice(0, 3)) || -5;

    // Formatos que usan los bancos: 40000, 40.000, 40.000,00 (CO) y 40,000, 40,000.00
    // (Bancolombia escribe "$40,000.00" con coma de miles en sus correos)
    const withDots   = digits.replace(/(\d)(?=(\d{3})+$)/g, "$1.");
    const withCommas = digits.replace(/(\d)(?=(\d{3})+$)/g, "$1,");
    const formatos = [...new Set([digits, withDots, withDots + ",00", withCommas, withCommas + ".00"])];

    console.log("Buscando en Gmail con formatos:", formatos.join(" | "));

    for (const fmt of formatos) {
      // Gmail no soporta ventanas por horas en el query → se busca 1 día y la ventana
      // fina (ventanaHoras, default 5h = duración del turno) se aplica abajo en código
      // sobre internalDate (la hora REAL de llegada del correo, infalsificable).
      const q = `newer_than:1d "${fmt}"`;
      const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=10`;
      const searchRes = await fetch(searchUrl, { headers: { "Authorization": `Bearer ${accessToken}` } });
      if (!searchRes.ok) { console.error("Gmail search error:", await searchRes.text()); continue; }

      const searchData = await searchRes.json() as Record<string, unknown>;
      const messages = searchData.messages as Array<{ id: string }> | undefined;
      if (!messages?.length) { console.log(`Gmail: sin resultados para formato "${fmt}"`); continue; }

      // Revisar cada mensaje para confirmar que es de un banco
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

        // Remitentes bancarios: configurables por restaurante (pagos.bancos_correo);
        // default = bancos/billeteras de Colombia
        const isBankEmail = bancosRe.test(from + " " + subject);
        if (!isBankEmail) { console.log("Email no bancario, skip:", from); continue; }

        // Verificar que la fecha del comprobante aparece en el email (si tenemos fecha)
        let fechaOk = true;
        if (fecha) {
          // fecha en formato YYYY-MM-DD → buscar variantes DD/MM/YYYY o DD-MM-YYYY o YYYY-MM-DD
          const [yyyy, mm, dd] = fecha.split("-");
          const variantes = [fecha, `${dd}/${mm}/${yyyy}`, `${dd}-${mm}-${yyyy}`, `${dd}/${mm}`, `${mm}/${dd}`];
          fechaOk = variantes.some(v => fullText.includes(v));
        }

        // VENTANA DEL TURNO: el correo del banco debe haber llegado dentro de las
        // últimas ventanaHoras (default 5h). Una transferencia más vieja NO cuenta —
        // nadie paga un pedido de hace días; esto además refuerza el anti-replay.
        const internalMs = Number(msgData.internalDate || 0);
        if (internalMs && (Date.now() - internalMs) > ventanaHoras * 3600000) {
          console.log(`Email descartado: llegó hace más de ${ventanaHoras}h (fuera del turno)`);
          continue;
        }

        // Cruce TEMPORAL: la hora de llegada real del correo (internalDate) debe ser
        // coherente con la fecha/hora del comprobante (zona horaria del restaurante).
        // Con hora en el comprobante: tolerancia ±6h · solo fecha: ±36h.
        let tiempoOk = true;
        if (internalMs && fecha) {
          const horaStr = (hora && /^\d{1,2}:\d{2}$/.test(hora.trim())) ? hora.trim().padStart(5, "0") : "";
          const comprobanteMs = Date.parse(`${fecha}T${horaStr || "12:00"}:00${tzRest}`);
          if (!isNaN(comprobanteMs)) {
            const diffHoras = Math.abs(internalMs - comprobanteMs) / 3600000;
            tiempoOk = diffHoras <= (horaStr ? 6 : 36);
          }
        }
        if (!tiempoOk) {
          console.log(`Email descartado por tiempo: internalDate no coincide con ${fecha} ${hora}`);
          continue;
        }

        // Verificar que la llave destino aparece en el email (si tenemos llave y config)
        let llaveOk = true;
        if (llaveCfg && llaveCfg.length >= 4) {
          const sufijo = llaveCfg.slice(-4); // últimos 4 dígitos de la llave
          llaveOk = fullText.includes(llaveCfg.replace(/\s/g, "")) || fullText.includes(sufijo);
        }

        console.log(`Gmail: from="${from}" fechaOk=${fechaOk} llaveOk=${llaveOk}`);

        if (isBankEmail && fechaOk) {
          /* Se APUNTAN todos los que cuadran en vez de devolver el primero: si
             hay dos abonos por el mismo monto hay que avisarlo, no escoger uno
             en silencio. Sin comprobante que cruzar, esa es la unica defensa. */
          const hhmm = internalMs
            ? new Date(internalMs + horasTz * 3600000).toISOString().slice(11, 16)
            : "";
          hallazgos.push({
            hora: hhmm,
            referencia: extraerReferencia(bodyText + " " + snippet),
            detalle: `Remitente: ${from} | Asunto: ${subject}`
                   + (llaveOk ? "" : " (llave no verificada en email)"),
          });
        }
      }
    }

    if (hallazgos.length > 0) {
      const h0 = hallazgos[0];
      const partes = [h0.detalle];
      if (h0.hora)       partes.unshift(`Lleg\u00f3 a las ${h0.hora}`);
      if (h0.referencia) partes.push(`Referencia ${h0.referencia}`);
      return {
        found: true,
        varios: hallazgos.length > 1,
        cuantos: hallazgos.length,
        hora: h0.hora,
        referencia: h0.referencia,
        detail: partes.join(" | "),
      };
    }

    return { found: false, detail: `Sin emails bancarios con monto ${digits} en las últimas ${ventanaHoras}h` };
  } catch (err) {
    console.error("searchGmailForAmount error:", err);
    return { found: false, detail: String(err) };
  }
}

// Extrae texto del body del email (parte text/plain o snippet como fallback)

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

/* El NUMERO DE REFERENCIA que da el banco. Es el identificador unico de la
   transferencia, y es lo que va a permitir que un mismo abono no pueda dar por
   bueno dos pedidos distintos. Cada banco lo llama diferente, asi que se
   prueban las etiquetas mas comunes en Colombia. */
function extraerReferencia(texto: string): string {
  const etiquetas = [
    "n[uú]mero de referencia", "referencia", "n[uú]mero de comprobante",
    "comprobante n[oº°.]?", "n[uú]mero de transacci[oó]n", "id de la transacci[oó]n",
    "id de transacci[oó]n", "c[oó]digo de aprobaci[oó]n", "\\bcus\\b", "\\bnro\\b",
  ];
  for (const et of etiquetas) {
    const re = new RegExp(et + "\\s*[:#-]?\\s*([A-Za-z0-9-]{4,40})", "i");
    const m = texto.match(re);
    if (m && m[1] && /\d/.test(m[1])) return m[1];
  }
  return "";
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
  try {
    const b = await req.json().catch(() => ({} as Record<string, unknown>));
    const branchId = String(b.branch_id || "");
    const monto    = String(b.monto || "");
    const horas    = Math.max(1, Math.min(24, Number(b.horas) || 6));
    if (!branchId || !monto) return json({ error: "Falta branch_id o monto" }, 400);

    const cfgRows = await sbGet(
      `/rest/v1/ia_config?branch_id=eq.${branchId}&select=gmail_refresh_token,gmail_email,pagos,zona_horaria&limit=1`
    ) as Array<Record<string, unknown>> | null;
    const cfg = cfgRows?.[0];
    const refreshToken = cfg?.gmail_refresh_token as string | null;
    if (!refreshToken) {
      return json({ ok: false, razon: "sin_gmail",
        mensaje: "El correo del banco no esta conectado. Se conecta en Configuracion → Chat IA → Pagos." });
    }
    const pagos = (cfg?.pagos || {}) as Record<string, unknown>;
    const llave = String(pagos.llave || "");
    const tz    = String(cfg?.zona_horaria || "-05:00");

    const token = await refreshGmailToken(refreshToken);
    if (!token) return json({ ok: false, razon: "token", mensaje: "El acceso al correo expiro. Hay que reconectarlo." });

    // Sin fecha ni hora del comprobante: se busca en la ventana de horas pedida.
    const r = await searchGmailForAmount(token, monto, "", "", llave, horas, bancosRegexFromCfg(pagos), tz);
    return json({
      ok: true, encontrado: !!r.found, detalle: r.detail || "",
      monto, horas,
      // Varios abonos por el MISMO monto: se avisa. Sin comprobante que cruzar,
      // el cajero es el unico que puede saber cual es el de su cliente.
      varios: !!r.varios, cuantos: r.cuantos || (r.found ? 1 : 0),
      hora: r.hora || "", referencia: r.referencia || "",
      mensaje: r.found
        ? (r.varios
            ? `Ojo: hay ${r.cuantos} abonos por ${monto} en las ultimas ${horas} horas. ${r.detail}`
            : `Encontrado en el correo del banco: ${r.detail || monto}`)
        : `No aparece ningun abono por ${monto} en las ultimas ${horas} horas.`,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
