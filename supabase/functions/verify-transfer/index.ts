const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY    = Deno.env.get("OPENAI_API_KEY")!;
const GMAIL_CLIENT_ID     = Deno.env.get("GMAIL_CLIENT_ID")!;
const GMAIL_CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const { conversation_id, manual } = await req.json() as { conversation_id: string; manual?: boolean };
  if (!conversation_id) return new Response("Missing conversation_id", { status: 400 });

  let orderId: string | null = null;
  try {
    orderId = await verifyTransfer(conversation_id, !!manual);
  } catch (err) {
    console.error("verify-transfer error:", err);
  }

  return new Response(JSON.stringify({ ok: true, order_id: orderId }), {
    headers: { "Content-Type": "application/json" },
  });
});

async function verifyTransfer(conversationId: string, manual = false): Promise<string | null> {
  // 1. Cargar conversación
  const convRows = await sbGet(
    `/rest/v1/chat_conversations?id=eq.${conversationId}&select=*&limit=1`
  ) as Array<Record<string, unknown>> | null;
  const conv = convRows?.[0];
  if (!conv) { console.error("conversation not found:", conversationId); return null; }

  const fromPhone   = String(conv.from_phone   || conv.contact_handle || "");
  const branchId    = String(conv.branch_id    || "");
  const tenantId    = String(conv.tenant_id    || "");
  const pendingData = conv.pending_order_data as Record<string, unknown> | null;

  // 2. Canal WhatsApp — FIX: meta es JSON serializado como string; usar phone_id no phone_number_id
  const channels = await sbGet(
    `/rest/v1/chat_channels?branch_id=eq.${branchId}&channel=eq.whatsapp&limit=1`
  ) as Array<Record<string, unknown>> | null;
  const channel = channels?.[0];
  const metaRaw = channel?.meta;
  const metaParsed = (() => {
    if (!metaRaw) return {} as Record<string, string>;
    if (typeof metaRaw === "string") { try { return JSON.parse(metaRaw) as Record<string, string>; } catch { return {} as Record<string, string>; } }
    return metaRaw as Record<string, string>;
  })();
  const phoneId     = String(metaParsed?.phone_id     || "");
  const accessToken = String(metaParsed?.access_token || "");

  console.log("phoneId:", phoneId ? "OK" : "VACÍO", "accessToken:", accessToken ? "OK(truncado)" : "VACÍO");

  // 3. Config de la sucursal
  const cfgRows = await sbGet(
    `/rest/v1/ia_config?branch_id=eq.${branchId}&select=gmail_refresh_token,gmail_email,pagos,frases,domicilios,zona_horaria,moneda&limit=1`
  ) as Array<Record<string, unknown>> | null;
  const cfg          = cfgRows?.[0] || {};
  const refreshToken = cfg?.gmail_refresh_token as string | null;
  const pagos        = (cfg?.pagos as Record<string, unknown>) || {};
  const frases       = (cfg?.frases as Record<string, string>) || {};
  const llaveCfg     = String(pagos?.llave || "");
  // Región configurable por restaurante (defaults Colombia): zona horaria, moneda y bancos del correo
  const monedaCfg    = (cfg?.moneda as Record<string, unknown>) || null;
  const tzRest       = tzStrFromCfg(cfg?.zona_horaria);
  const bancosRe     = bancosRegexFromCfg(pagos);

  // ── CONFIRMACIÓN HUMANA (manual=true, botón "Confirmar pago" en Cobra) ──────
  // El operador ya revisó el comprobante con sus propios ojos: SIN chequeos
  // automáticos. Se crea el pedido, se limpian las banderas y se avisa al cliente.
  // (Best-effort: se extrae la referencia del comprobante para quemarla igual.)
  if (manual) {
    let refManual = "";
    try {
      const imgsM = await sbGet(
        `/rest/v1/chat_messages?conversation_id=eq.${conversationId}&direction=eq.in&media_type=eq.image&order=sent_at.desc&limit=1`
      ) as Array<Record<string, unknown>> | null;
      const imgUrlM = imgsM?.[0]?.media_url as string | null;
      if (imgUrlM) {
        const vM = await extractComprobante(imgUrlM);
        refManual = String(vM.referencia || "").replace(/[^A-Za-z0-9]/g, "");
      }
    } catch (_) { /* la confirmación humana no depende de Vision */ }

    let orderIdM: string | null = null;
    if (pendingData) {
      orderIdM = await crearPedido(conversationId, branchId, tenantId, fromPhone, pendingData, cfg, refManual);
    }
    await sbPatch(`/rest/v1/chat_conversations?id=eq.${conversationId}`, {
      pago_pendiente: false, pending_order_data: null, human_takeover: false, recordar_at: null,
    });
    const cierreM = frases.cierre_pedido || "En un momento preparamos tu pedido 🍟 ¡Con muchísimo gusto!";
    const mixtoM = pendingData?.pago_mixto as Record<string, unknown> | null | undefined;
    const saldoM = mixtoM && Number(mixtoM.monto_efectivo) > 0
      ? " " + ((frases.saldo_efectivo as string) || "Quedan {{monto_efectivo}} en efectivo al recibir 🙌")
          .replace(/\{\{?\s*monto_efectivo\s*\}?\}/g, fmtMonto(Number(mixtoM.monto_efectivo), monedaCfg))
      : "";
    const msgM = `✅ ¡Pago confirmado!${saldoM} ${cierreM}`;
    await sendWhatsApp(fromPhone, phoneId, accessToken, msgM);
    await saveOutMessage(conversationId, tenantId, msgM, fromPhone, phoneId, accessToken);
    console.log("Confirmación HUMANA completada. Pedido:", orderIdM);
    return orderIdM;
  }

  // 4. Imagen más reciente del chat (comprobante)
  const imgMsgs = await sbGet(
    `/rest/v1/chat_messages?conversation_id=eq.${conversationId}&direction=eq.in&media_type=eq.image&order=sent_at.desc&limit=1`
  ) as Array<Record<string, unknown>> | null;
  const imageUrl = imgMsgs?.[0]?.media_url as string | null;

  if (!imageUrl) {
    console.error("No image found for conversation:", conversationId);
    const msg = "No encontramos el comprobante. Por favor envíalo de nuevo como imagen 📷";
    await sendWhatsApp(fromPhone, phoneId, accessToken, msg);
    await saveOutMessage(conversationId, tenantId, msg, fromPhone, phoneId, accessToken);
    return null;
  }

  // 4b. Avisar de inmediato que estamos verificando (la verificación con Gmail puede
  // tardar 1-2 min porque el correo del banco no llega al instante)
  const msgVerificando = (frases.verificando_pago as string) ||
    "Recibimos tu comprobante 🧾 Dame un momento mientras lo verifico ⏳";
  await sendWhatsApp(fromPhone, phoneId, accessToken, msgVerificando);
  await saveOutMessage(conversationId, tenantId, msgVerificando, fromPhone, phoneId, accessToken);

  // 5. GPT-4o Vision: extraer datos del comprobante
  const visionResult = await extractComprobante(imageUrl);
  console.log("Vision result:", JSON.stringify(visionResult));

  // 6. Si la imagen no parece un comprobante en absoluto (editado, foto aleatoria)
  // NO rechazar solo porque la UI de Nequi muestra texto "pendiente" — eso es normal
  // en su interfaz aunque el pago ya salió. Solo rechazar si no tiene monto visible.
  if (!visionResult.parece_valido && !visionResult.monto) {
    const msg = "⚠️ No pudimos leer el monto en el comprobante. Por favor envíanos una foto más clara o el comprobante definitivo 📷";
    await sendWhatsApp(fromPhone, phoneId, accessToken, msg);
    await saveOutMessage(conversationId, tenantId, msg, fromPhone, phoneId, accessToken);
    return null;
  }

  // 7. Comparar llave/cuenta del comprobante contra la nuestra en ia_config
  const llaveEnComprobante = visionResult.llave.replace(/\s/g, "");
  const llaveConfigLimpia  = llaveCfg.replace(/\s/g, "");
  const llaveCoincide = !llaveConfigLimpia || !llaveEnComprobante ||
    llaveEnComprobante.includes(llaveConfigLimpia) ||
    llaveConfigLimpia.includes(llaveEnComprobante);

  console.log(`Llave comprobante: "${llaveEnComprobante}", config: "${llaveConfigLimpia}", coincide: ${llaveCoincide}`);

  if (!llaveCoincide) {
    const msg = `⚠️ El número de cuenta del comprobante (${llaveEnComprobante}) no coincide con el nuestro (${llaveCfg}). Por favor verifica que enviaste el pago al número correcto y contáctanos 📞`;
    await sendWhatsApp(fromPhone, phoneId, accessToken, msg);
    await saveOutMessage(conversationId, tenantId, msg, fromPhone, phoneId, accessToken);
    await sbPatch(`/rest/v1/chat_conversations?id=eq.${conversationId}`, { human_takeover: true });
    return null;
  }

  // 8. Calcular total esperado desde pending_order_data y comparar con monto.
  // PAGO MIXTO: el comprobante se compara contra la PARTE digital acordada
  // (pendingData.pago_mixto.monto_digital), no contra el total del pedido.
  const totalEsperado = await calcularTotalEsperado(pendingData, branchId, cfg);
  const mixtoPD = pendingData?.pago_mixto as Record<string, unknown> | null | undefined;
  const parteDigital = mixtoPD && Number(mixtoPD.monto_digital) > 0 ? Number(mixtoPD.monto_digital) : 0;
  const esperadoTransfer = parteDigital > 0 ? parteDigital : totalEsperado;
  const montoComprobante = Number(visionResult.monto.replace(/\D/g, "")) || 0;
  let montoCoincide = true;
  if (esperadoTransfer > 0 && montoComprobante > 0) {
    const diferencia = Math.abs(montoComprobante - esperadoTransfer);
    const porcentaje = diferencia / esperadoTransfer;
    montoCoincide = porcentaje <= 0.12; // tolerancia 12% (cubre variaciones de redondeo y domicilio)
    console.log(`Monto comprobante: ${montoComprobante}, esperado: ${esperadoTransfer}${parteDigital > 0 ? " (parte digital de pago mixto)" : ""}, diff: ${porcentaje.toFixed(2)}, ok: ${montoCoincide}`);
  }

  if (!montoCoincide) {
    const msg = `⚠️ El monto del comprobante (${fmtMonto(Number(visionResult.monto.replace(/\D/g,"")), monedaCfg)}) no coincide con ${parteDigital > 0 ? "la parte acordada por transferencia" : "el total del pedido"} (${fmtMonto(esperadoTransfer, monedaCfg)}). Un agente lo revisará en breve.`;
    await sendWhatsApp(fromPhone, phoneId, accessToken, msg);
    await saveOutMessage(conversationId, tenantId, msg, fromPhone, phoneId, accessToken);
    await sbPatch(`/rest/v1/chat_conversations?id=eq.${conversationId}`, { human_takeover: true });
    return null;
  }

  // 8b. ANTI-REPLAY: un mismo comprobante (referencia) NO puede pagar dos pedidos.
  // La referencia se guarda en las notas del pedido al verificar; si vuelve a llegar,
  // se rechaza (protege contra clientes que reusan el pantallazo de un pago anterior).
  const refLimpia = String(visionResult.referencia || "").replace(/[^A-Za-z0-9]/g, "");
  if (refLimpia.length >= 5) {
    const dup = await sbGet(
      `/rest/v1/pos_orders?branch_id=eq.${branchId}&notes=ilike.*Ref:${refLimpia}*&select=id&limit=1`
    ) as Array<Record<string, unknown>> | null;
    if (dup && dup.length > 0) {
      console.log(`ANTI-REPLAY: referencia ${refLimpia} ya usada en pedido ${dup[0].id}`);
      const msg = "⚠️ Este comprobante ya fue usado para un pedido anterior. Si crees que es un error, un agente te atenderá en breve 🙏";
      await sendWhatsApp(fromPhone, phoneId, accessToken, msg);
      await saveOutMessage(conversationId, tenantId, msg, fromPhone, phoneId, accessToken);
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${conversationId}`, { human_takeover: true });
      return null;
    }
  }

  // 9. Buscar en Gmail un correo bancario que confirme el monto
  let confirmed = false;
  let verifyDetail = "";

  if (refreshToken) {
    const gmailAccessToken = await refreshGmailToken(refreshToken);
    if (gmailAccessToken) {
      // Ventana de aceptación configurable por restaurante (default 5h = el turno)
      const ventanaHoras = Number(pagos?.ventana_comprobante_horas) || 5;
      // El correo del banco NO llega al instante (segundos a 1-2 min). Reintentar:
      // hasta 3 búsquedas con ~35s de espera entre cada una antes de rendirse.
      for (let intento = 1; intento <= 3; intento++) {
        const gmailMatch = await searchGmailForAmount(gmailAccessToken, visionResult.monto, visionResult.fecha, visionResult.hora, llaveCfg, ventanaHoras, bancosRe, tzRest);
        confirmed    = gmailMatch.found;
        verifyDetail = gmailMatch.detail;
        console.log(`Gmail intento ${intento}/3:`, confirmed, verifyDetail);
        if (confirmed) break;
        if (intento < 3) await new Promise(r => setTimeout(r, 35000));
      }
    } else {
      console.error("No se pudo refrescar el token Gmail — confiando en Vision");
      confirmed    = visionResult.parece_valido;
      verifyDetail = "Token Gmail expirado — verificación por imagen";
    }
  } else {
    // Sin Gmail: confiar en Vision + llave
    confirmed    = visionResult.parece_valido;
    verifyDetail = "Gmail no configurado — verificación por imagen + llave";
    console.log("Sin Gmail — usando Vision:", confirmed);
  }

  if (confirmed) {
    // 10a. Crear el pedido y confirmar al cliente
    let orderId: string | null = null;
    if (pendingData) {
      orderId = await crearPedido(conversationId, branchId, tenantId, fromPhone, pendingData, cfg, refLimpia);
    }
    console.log("Pedido creado tras verificación:", orderId);

    await sbPatch(`/rest/v1/chat_conversations?id=eq.${conversationId}`, {
      pago_pendiente:     false,
      pending_order_data: null,
      human_takeover:     false,
      /* La alarma de la espera se apaga con el pago: si quedara puesta, el
         despertador seguiria mandando señales por un pedido ya cobrado. */
      recordar_at:        null,
    });

    const montoStr   = visionResult.monto ? ` de ${fmtMonto(Number(visionResult.monto.replace(/\D/g,"")), monedaCfg)}` : "";
    const cierreFrase = frases.cierre_pedido || "¡Con muchísimo gusto! En un momento preparamos tu pedido.";
    // Pago mixto: recordar el saldo en efectivo (frase configurable)
    const saldoMixto = parteDigital > 0 && totalEsperado > parteDigital
      ? " " + ((frases.saldo_efectivo as string) || "Quedan {{monto_efectivo}} en efectivo al recibir 🙌")
          .replace(/\{\{?\s*monto_efectivo\s*\}?\}/g, fmtMonto(totalEsperado - parteDigital, monedaCfg))
      : "";
    const msg = `✅ ¡Pago verificado${montoStr}!${saldoMixto} ${cierreFrase}`;
    await sendWhatsApp(fromPhone, phoneId, accessToken, msg);
    await saveOutMessage(conversationId, tenantId, msg, fromPhone, phoneId, accessToken);
    return orderId;

  } else {
    // 10b. No se pudo verificar — NO activar human_takeover (silenciaría el bot para siempre)
    // La conversación queda en pestaña "Pagos" de Cobra para revisión manual del operador
    const msg = "⚠️ Recibimos tu comprobante pero no pudimos verificarlo automáticamente. Un agente lo revisará en breve y te confirmamos 🙏";
    await sendWhatsApp(fromPhone, phoneId, accessToken, msg);
    await saveOutMessage(conversationId, tenantId, msg, fromPhone, phoneId, accessToken);
  }
  return null;
}

// ── GPT-4o Vision: extraer datos del comprobante ─────────────────────────────

interface ComprobanteData {
  monto:        string;  // solo dígitos, ej. "33000"
  fecha:        string;  // YYYY-MM-DD o vacío
  hora:         string;  // HH:MM (24h) o vacío
  banco:        string;
  referencia:   string;
  llave:        string;  // número de cuenta/llave/Nequi destino
  parece_valido: boolean;
}

async function extractComprobante(imageUrl: string): Promise<ComprobanteData> {
  const prompt = `Eres un experto en comprobantes de pago bancarios colombianos (Nequi, Bancolombia, Daviplata, etc.).

Analiza esta imagen y extrae en JSON:
{
  "monto": "SOLO dígitos del monto transferido, sin puntos ni comas ni $. Ej: si dice $33.000 → '33000'. Si hay un número de dinero visible, extráelo aunque la pantalla sea de historial o detalle.",
  "fecha": "YYYY-MM-DD si se ve la fecha de la transacción. Vacío si no.",
  "hora": "HH:MM en formato 24 horas si se ve la hora de la transacción (ej: '7:31 p.m.' → '19:31'). Vacío si no se ve.",
  "banco": "nombre del banco o app (Nequi, Bancolombia, Daviplata, etc.)",
  "referencia": "número de referencia o transacción si aparece",
  "llave": "número de celular, cuenta o llave Nequi DESTINO al que fue enviado el pago. Busca etiquetas como 'Para', 'Destinatario', 'A', 'Llave'. Si no se ve, vacío.",
  "parece_valido": true si la imagen muestra una pantalla de pago/transferencia real con un monto visible. Solo false si la imagen está completamente borrosa, es una foto aleatoria, o claramente fue editada digitalmente para falsificar números.
}

NOTA IMPORTANTE: Nequi y otros bancos colombianos a veces muestran 'pendiente' o 'en proceso' en su interfaz incluso cuando el dinero ya salió de la cuenta. NO marques parece_valido=false solo por ver la palabra 'pendiente' — solo hazlo si la imagen no es un comprobante bancario real.
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
  return { monto: "", fecha: "", hora: "", banco: "", referencia: "", llave: "", parece_valido: false };
}

// ── Gmail: refrescar token ────────────────────────────────────────────────────

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

        if (isBankEmail && fechaOk && llaveOk) {
          return { found: true, detail: `Remitente: ${from} | Asunto: ${subject}` };
        }

        // Si la llave no coincide en el email pero todo lo demás sí, devolver found=true
        // (algunos emails no muestran la llave completa)
        if (isBankEmail && fechaOk) {
          return { found: true, detail: `Remitente: ${from} | Asunto: ${subject} (llave no verificada en email)` };
        }
      }
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

    // Buscar parte text/plain
    const plain = parts.find(p => (p.mimeType as string) === "text/plain");
    if (plain?.body) {
      const data = ((plain.body as Record<string,string>).data || "");
      return atob(data.replace(/-/g, "+").replace(/_/g, "/"));
    }

    // Fallback: body directo del payload
    if (payload?.body) {
      const data = ((payload.body as Record<string,string>).data || "");
      return atob(data.replace(/-/g, "+").replace(/_/g, "/"));
    }
  } catch { /* ignorar */ }
  return "";
}

// ── Resolver pedido desde pending_order_data (estado ACTUAL v119+ y legacy) ──
// Estado actual: { producto, tamano, tipo, cantidad, items:[{producto,...}], nombre, direccion, pago }
// Estado legacy: { productos:[{nombre,...}], cliente, total }
interface ItemNorm { producto: string; tamano: string; tipo: string; cantidad: number; categoria?: string | null;
}
interface PedidoResuelto {
  total: number;
  domiPrecio: number;
  nombreCliente: string;
  itemsRows: Array<Record<string, unknown>>;
}

function normalizarItemsPedido(pendingData: Record<string, unknown>): ItemNorm[] {
  const out: ItemNorm[] = [];
  const push = (p: unknown, tam: unknown, tip: unknown, cant: unknown, cat?: unknown) => {
    const nombre = String(p || "").trim();
    if (nombre) out.push({ producto: nombre, tamano: String(tam || "").trim(), tipo: String(tip || "").trim(), cantidad: Math.max(1, Number(cant) || 1), categoria: String(cat || "").trim() || null });
  };
  for (const it of ((pendingData.items as Array<Record<string, unknown>>) || [])) {
    if (it) push(it.producto, it.tamano, it.tipo, it.cantidad, it.categoria);
  }
  if (pendingData.producto) push(pendingData.producto, pendingData.tamano, pendingData.tipo, pendingData.cantidad, pendingData.producto_categoria);
  if (!out.length) {
    for (const it of ((pendingData.productos as Array<Record<string, unknown>>) || [])) {
      if (it) push(it.nombre || it.producto, it.tamano, it.tipo, it.cantidad);
    }
  }
  return out;
}


// Nombre con el tipo de comida adelante ("Hamburguesa Especial") — igual que el motor
const CAT_SIN_PREFIJO = /bebida|adicion|adición|extra|salsa|postre|combo/i;
function nombreConCategoriaVT(prodName: string, catName: string): string {
  if (!prodName || !catName || CAT_SIN_PREFIJO.test(catName)) return prodName;
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const primera = norm(catName).split(/\s+/)[0].replace(/s$/, "");
  if (!primera || primera.length < 4) return prodName;
  if (norm(prodName).includes(primera)) return prodName;
  const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  return cap(primera) + " " + cap(prodName.toLowerCase());
}

async function resolverPedido(
  pendingData: Record<string, unknown> | null,
  branchId:    string,
  cfg:         Record<string, unknown>,
  tenantId:    string,
): Promise<PedidoResuelto> {
  const vacio: PedidoResuelto = { total: 0, domiPrecio: 0, nombreCliente: "Cliente WhatsApp", itemsRows: [] };
  if (!pendingData) return vacio;
  try {
    const itemsNorm = normalizarItemsPedido(pendingData);
    const nombreCliente = String(pendingData.nombre || pendingData.cliente || "Cliente WhatsApp");
    if (!itemsNorm.length) return { ...vacio, nombreCliente };

    const allProducts = await sbGet(
      `/rest/v1/pos_products?branch_id=eq.${branchId}&available=eq.true&select=id,name,price,price_mode,presentations,variables,category_id(name)`
    ) as Array<Record<string, unknown>> | null;
    if (!allProducts) return { ...vacio, nombreCliente };

    let total = 0;
    const itemsRows: Array<Record<string, unknown>> = [];

    for (const item of itemsNorm) {
      const nombreLow = item.producto.toLowerCase();
      let candidatas = allProducts.filter(p => {
        const pname = String(p.name || "").toLowerCase();
        return pname === nombreLow || pname.includes(nombreLow) || nombreLow.includes(pname.replace(/\s.*/,""));
      });
      // Con nombres repetidos entre categorías, la categoría del item decide el precio
      if (item.categoria && candidatas.length > 1) {
        const catLow = item.categoria.toLowerCase();
        const porCat = candidatas.filter(p => String(((p.category_id as Record<string, unknown> | null)?.name as string) || "").toLowerCase() === catLow);
        if (porCat.length) candidatas = porCat;
      }
      const exacta = candidatas.find(p => String(p.name || "").toLowerCase() === nombreLow);
      const matched = exacta || candidatas[0];
      if (!matched) {
        itemsRows.push({ product_id: null, name: [item.producto, item.tamano, item.tipo].filter(Boolean).join(" · ") || "Producto WhatsApp", product_name: [item.producto, item.tamano, item.tipo].filter(Boolean).join(" · ") || "Producto WhatsApp", product_price: 0, unit_price: 0, total: 0, quantity: item.cantidad, selections: { mods: {}, pres: item.tamano, vars: {} }, branch_id: branchId, tenant_id: tenantId || null, notes: null });
        continue;
      }
      const presentations = (matched.presentations as Array<{id:string;name:string;price:number}>) || [];
      const variables     = (matched.variables     as Array<{id:string;name:string;isPricing?:boolean;options:Array<{id:string;name:string;price:number;prices?:number[]}>}>) || [];
      const priceMode     = String(matched.price_mode || "simple");
      const tamLow        = item.tamano.toLowerCase();
      const presMatch     = presentations.find(p => p.name.toLowerCase() === tamLow) || presentations[0];
      const presIdx       = presMatch ? presentations.indexOf(presMatch) : 0;
      let   price         = Number(presMatch?.price) || Number(matched.price) || 0;
      const varsMap: Record<string, unknown> = {};

      if (priceMode === "matrix" && item.tipo && variables.length > 0) {
        const varGroup = variables[0];
        const varOpt   = varGroup.options.find(o => o.name.toLowerCase() === item.tipo.toLowerCase());
        if (varOpt) {
          if (Array.isArray(varOpt.prices) && presIdx < varOpt.prices.length) price = varOpt.prices[presIdx];
          else if (varOpt.price > 0) price = varOpt.price;
          varsMap[varGroup.id] = { id: varOpt.id, name: varOpt.name, price };
        }
      }

      const itemTotal = price * item.cantidad;
      const nombreItem = [nombreConCategoriaVT(String(matched.name), String(((matched.category_id as Record<string, unknown> | null)?.name as string) || "")), presMatch?.name || item.tamano, item.tipo].filter(Boolean).join(" · ");
      itemsRows.push({
        product_id: String(matched.id),
        name: nombreItem,           // la UI de ventas/domicilios pinta ESTE campo
        product_name: nombreItem,
        product_price: price, unit_price: price, total: itemTotal, quantity: item.cantidad,
        selections: { mods: {}, pres: presMatch?.name || item.tamano, vars: varsMap },
        branch_id: branchId, tenant_id: tenantId || null, notes: null,
      });
      total += itemTotal;
    }

    // Domicilio por zona (si la dirección matchea una zona configurada)
    let domiPrecio = 0;
    const direccion  = String(pendingData.direccion || "");
    const domicilios = (cfg.domicilios as Record<string,unknown>) || {};
    const zonasRaw   = (domicilios.zonas as Array<{nombre?:string;barrios?:string[];precio:number}>) || [];
    if (zonasRaw.length && direccion) {
      // Comparación sin espacios ni tildes: "Bella Vista" matchea "bellavista"
      const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ]/g, "");
      const dirNorm = norm(direccion);
      for (const z of zonasRaw) {
        const barrios = z.barrios ?? (z.nombre ? z.nombre.split(",").map(b => b.trim()) : []);
        if (barrios.some(b => b && b.length >= 4 && dirNorm.includes(norm(b)))) { domiPrecio = Number(z.precio) || 0; break; }
      }
    }

    return { total: total + domiPrecio, domiPrecio, nombreCliente, itemsRows };
  } catch (err) {
    console.error("resolverPedido error:", err);
    return vacio;
  }
}

async function calcularTotalEsperado(
  pendingData: Record<string, unknown> | null,
  branchId:    string,
  cfg:         Record<string, unknown>,
): Promise<number> {
  const r = await resolverPedido(pendingData, branchId, cfg, "");
  return r.total;
}

// ── Crear pedido ──────────────────────────────────────────────────────────────

async function crearPedido(
  conversationId: string,
  branchId:       string,
  tenantId:       string,
  fromPhone:      string,
  pendingData:    Record<string, unknown>,
  cfg:            Record<string, unknown>,
  referencia:     string = "",
): Promise<string | null> {
  // Resolver el pedido con el ESTADO ACTUAL (v119+): precios reales del catálogo,
  // nombre del cliente del pedido, ítems con desglose. (Antes leía el formato viejo
  // → total $0, "Cliente WhatsApp" y sin productos.)
  const pedido = await resolverPedido(pendingData, branchId, cfg, tenantId);

  // La referencia del comprobante queda en las notas — es la marca del ANTI-REPLAY
  const notasPedido = [String(pendingData.direccion || ""), referencia ? `Ref:${referencia}` : ""]
    .filter(Boolean).join(" · ");

  // PARA LLEVAR → sección "rápidas" (channel='rapido'); domicilio → 'domicilio'
  const LLEVAR_RE = /\b(para\s+llevar|para\s+recoger|l[oa]s?\s+recojo|l[oa]s?\s+busco|voy\s+a\s+recoger(?:l[oa]s?)?|voy\s+por\s+(?:el\s+pedido|[ée]l|ella|eso)|pa\s+llevar|a\s+recoger|yo\s+paso|yo\s+l[oa]s?\s+recojo|paso\s+a\s+(?:recoger|buscar)(?:l[oa]s?)?|paso\s+por\s+(?:el\s+pedido|[ée]l|ella|ellas|ellos|eso)|paso\s+al\s+local|recojo\s+en\s+el\s+local)\b/i;
  const esLlevarOrden = LLEVAR_RE.test(String(pendingData.direccion || "").toLowerCase());

  // Lo PAGADO por el cliente: el total (transferencia completa) o solo la parte
  // digital si es pago mixto. Queda en pos_orders.paid_amount + una fila en
  // pos_payments — el mismo circuito de abonos que usa la caja del POS.
  const mixtoCP = pendingData.pago_mixto as Record<string, unknown> | null | undefined;
  const montoPagado = mixtoCP && Number(mixtoCP.monto_digital) > 0
    ? Math.min(Number(mixtoCP.monto_digital), pedido.total)
    : pedido.total;

  const orderRecord: Record<string, unknown> = {
    branch_id:      branchId,
    tenant_id:      tenantId || null,
    channel:        esLlevarOrden ? "rapido" : "domicilio",
    customer_name:  pedido.nombreCliente,
    notes:          notasPedido || null,
    payment_method: mixtoCP ? "multiple" : (String(pendingData.pago || "") || null),
    status:         "open",
    total:          pedido.total,
    subtotal:       pedido.total,
    total_final:    pedido.total,
    paid_amount:    montoPagado,
    waiter_name:    "Asistente IA",
    visible_cocina: true,
    opened_at:      new Date().toISOString(),
  };

  // Cliente
  if (fromPhone) {
    const telefonoClean = fromPhone.replace(/\D/g, "");
    const direccion     = String(pendingData.direccion || "");
    const existing      = await sbGet(
      `/rest/v1/pos_clientes?telefono=eq.${encodeURIComponent(telefonoClean)}&tenant_id=eq.${tenantId}&limit=1`
    ) as Array<Record<string, unknown>> | null;

    if (existing && existing.length > 0) {
      orderRecord.cliente_id = String(existing[0].id);
    } else {
      const newCliente = await sbPostRep(`/rest/v1/pos_clientes`, {
        tenant_id: tenantId || null, branch_id: branchId,
        nombre: pedido.nombreCliente, telefono: telefonoClean, direccion: direccion || null,
      });
      if (newCliente?.[0]?.id) orderRecord.cliente_id = String(newCliente[0].id);
    }
  }

  const created = await sbPostRep(`/rest/v1/pos_orders`, orderRecord) as Array<Record<string, unknown>> | null;
  const orderId = String(created?.[0]?.id || "");
  if (!orderId) return null;

  for (const item of pedido.itemsRows) {
    await sbPost(`/rest/v1/pos_order_items`, { ...item, order_id: orderId });
  }

  // Registrar el pago verificado como abono en pos_payments (visible en caja,
  // recibos e informes — mismo desglose que usa la pantalla de cobro)
  if (montoPagado > 0) {
    await sbPost(`/rest/v1/pos_payments`, {
      order_id:  orderId,
      branch_id: branchId,
      tenant_id: tenantId || null,
      method:    String(pendingData.pago || "transferencia"),
      amount:    montoPagado,
      received:  montoPagado,
      vuelto:    0,
    });
  }

  return orderId;
}

// ── WhatsApp helpers ──────────────────────────────────────────────────────────

async function sendWhatsApp(fromPhone: string, phoneId: string, accessToken: string, text: string): Promise<void> {
  if (!phoneId || !accessToken || !fromPhone) {
    console.error("sendWhatsApp: faltan credenciales — phoneId:", !!phoneId, "accessToken:", !!accessToken, "fromPhone:", !!fromPhone);
    return;
  }
  const res = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to:   fromPhone,
      type: "text",
      text: { body: text },
    }),
  });
  if (!res.ok) console.error("sendWhatsApp error:", await res.text());
  else console.log("Mensaje enviado a WhatsApp:", text.slice(0, 60));
}

async function saveOutMessage(
  conversationId: string,
  tenantId:       string,
  body:           string,
  _fromPhone:     string,
  _phoneId:       string,
  _accessToken:   string,
): Promise<void> {
  await sbPost(`/rest/v1/chat_messages`, {
    conversation_id: conversationId,
    tenant_id:       tenantId,
    direction: "out", origen: "sistema", origen: "sistema",
    body,
    delivery_status: "sent",
    sent_at:         new Date().toISOString(),
  });
  await sbPatch(`/rest/v1/chat_conversations?id=eq.${conversationId}`, {
    last_message:    body,
    last_message_at: new Date().toISOString(),
    last_sender:     "agent",
    ai_typing:       false,
  });
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function sbGet(path: string): Promise<Array<Record<string, unknown>> | null> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) { console.error("sbGet error", path, res.status); return null; }
  return res.json();
}

async function sbPost(path: string, data: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json", "Prefer": "return=minimal",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) console.error("sbPost error", path, await res.text());
}

async function sbPostRep(path: string, data: Record<string, unknown>): Promise<Array<Record<string, unknown>> | null> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json", "Prefer": "return=representation",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) { console.error("sbPostRep error", path, await res.text()); return null; }
  return res.json();
}

async function sbPatch(path: string, data: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: "PATCH",
    headers: {
      "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) console.error("sbPatch error", path, await res.text());
}

// ── Región configurable por restaurante (defaults Colombia) ───────────────────
const BANCOS_DEFAULT = "bancolombia|nequi|daviplat|davivienda|bbva|occidente|bogota|popular|itau|wompi|bold|nu[.]com[.]co|nubank";

// ia_config.zona_horaria (horas vs UTC, ej. "-5", "-6", "1", "-3.5") → "-05:00"
function tzStrFromCfg(z: unknown): string {
  const parsed = parseFloat(String(z ?? "").replace(":30", ".5").replace(":00", ""));
  const h = (!isNaN(parsed) && parsed >= -12 && parsed <= 14) ? parsed : -5;
  const sign = h < 0 ? "-" : "+";
  const abs = Math.abs(h);
  const hh = String(Math.floor(abs)).padStart(2, "0");
  const mm = abs % 1 !== 0 ? "30" : "00";
  return `${sign}${hh}:${mm}`;
}

// ia_config.moneda {simbolo, miles, decimales, sufijo} → "$40.000" / "$40,000.00" / "40,00 €"
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

// pagos.bancos_correo (lista editable de remitentes bancarios) → regex; default Colombia
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
