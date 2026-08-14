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
    /* Un error nuestro tampoco se le explica al cliente: pasa al humano con el
       motivo, igual que los demas. */
    console.error("verify-transfer error:", err);
    try { await pagoSinConfirmar(conversation_id, `Error interno al verificar: ${String(err).slice(0, 160)}`); } catch (_) { /* nada mas que hacer */ }
  }

  return new Response(JSON.stringify({ ok: true, order_id: orderId }), {
    headers: { "Content-Type": "application/json" },
  });
});

/* CUANDO ALGO NO CUADRA, AL CLIENTE NO SE LE DICE NADA.

   Regla de Sergio: comprobante falso, repetido, ilegible, con un monto que no
   coincide o un fallo interno nuestro — da igual cual sea. El cliente no
   recibe ninguna explicacion. Ya se le dijo "dame un momento mientras lo
   verifico" y ahi se queda, esperando, mientras un humano lo resuelve.

   Por que se calla: una explicacion automatica o acusa a un cliente honesto de
   algo que fue un fallo nuestro, o le enseña al deshonesto exactamente que
   chequeo burlo y como esquivarlo la proxima vez.

   La conversacion pasa al humano y sigue en la pestaña "Pagos por confirmar",
   ahora con el MOTIVO escrito para que el dueño sepa que revisar antes de
   tocar "Confirmar pago". */
async function pagoSinConfirmar(conversationId: string, motivo: string): Promise<null> {
  console.log(`[pago] sin confirmar -> pasa al humano: ${motivo}`);
  try {
    await sbPatch(`/rest/v1/chat_conversations?id=eq.${conversationId}`, {
      human_takeover: true,
      handoff_at:     new Date().toISOString(),
      handoff_motivo: motivo,
      /* Sigue pendiente: es lo que lo mantiene en la pestaña de Pagos. */
      pago_pendiente: true,
    });
  } catch (err) {
    console.error("[pago] no se pudo marcar la conversacion:", err);
  }
  return null;
}

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
    /* El dueño ya lo miró y lo confirmó: la conversación vuelve al bot y el
       motivo se borra. Si quedara puesto, mañana seguiría diciendo que algo
       falló en un pago que ya está resuelto. */
    await sbPatch(`/rest/v1/chat_conversations?id=eq.${conversationId}`, {
      pago_pendiente: false, pending_order_data: null, human_takeover: false, recordar_at: null,
      handoff_motivo: null, handoff_at: null,
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
    return await pagoSinConfirmar(conversationId, "No llegó ninguna imagen de comprobante");
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
    return await pagoSinConfirmar(conversationId, "No se pudo leer el monto en la imagen");
  }

  // 7. Comparar llave/cuenta del comprobante contra la nuestra en ia_config
  const llaveEnComprobante = visionResult.llave.replace(/\s/g, "");
  const llaveConfigLimpia  = llaveCfg.replace(/\s/g, "");
  const llaveCoincide = !llaveConfigLimpia || !llaveEnComprobante ||
    llaveEnComprobante.includes(llaveConfigLimpia) ||
    llaveConfigLimpia.includes(llaveEnComprobante);

  console.log(`Llave comprobante: "${llaveEnComprobante}", config: "${llaveConfigLimpia}", coincide: ${llaveCoincide}`);

  if (!llaveCoincide) {
    return await pagoSinConfirmar(conversationId,
      `El pago fue a otra cuenta: el comprobante dice ${llaveEnComprobante} y la nuestra es ${llaveCfg}`);
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
    return await pagoSinConfirmar(conversationId,
      `Pagó ${fmtMonto(montoComprobante, monedaCfg)} y ${parteDigital > 0 ? "lo acordado por transferencia era" : "el pedido es"} ${fmtMonto(esperadoTransfer, monedaCfg)}`);
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
      return await pagoSinConfirmar(conversationId,
        `Comprobante repetido: la referencia ${refLimpia} ya pagó otro pedido`);
    }
  }

  // 9. Buscar en Gmail un correo bancario que confirme el monto
  let confirmed = false;
  let verifyDetail = "";
  /* El correo que respalda ESTE pago. Queda enlazado al pedido para que no
     pueda respaldar ningún otro. */
  let mailUsado = "";

  if (refreshToken) {
    const gmailAccessToken = await refreshGmailToken(refreshToken);
    if (gmailAccessToken) {
      // Ventana de aceptación configurable por restaurante (default 5h = el turno)
      const ventanaHoras = Number(pagos?.ventana_comprobante_horas) || 5;
      // El correo del banco NO llega al instante (segundos a 1-2 min). Reintentar:
      // hasta 3 búsquedas con ~35s de espera entre cada una antes de rendirse.
      for (let intento = 1; intento <= 3; intento++) {
        const gmailMatch = await searchGmailForAmount(gmailAccessToken, visionResult.monto, visionResult.fecha, visionResult.hora, llaveCfg, ventanaHoras, bancosRe, tzRest, branchId);
        confirmed    = gmailMatch.found;
        verifyDetail = gmailMatch.detail;
        if (gmailMatch.mailId) mailUsado = gmailMatch.mailId;
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
      orderId = await crearPedido(conversationId, branchId, tenantId, fromPhone, pendingData, cfg, refLimpia, mailUsado);
    }
    console.log("Pedido creado tras verificación:", orderId, mailUsado ? `· correo quemado: ${mailUsado}` : "· SIN correo (verificado por imagen)");

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
    /* 10b. No aparecio el correo del banco que respalde el pago. Es el caso
       del comprobante editado: los numeros de la imagen pueden cuadrar, pero
       el correo no se puede fabricar. */
    return await pagoSinConfirmar(conversationId,
      `No apareció el correo del banco que respalde el pago${verifyDetail ? " — " + verifyDetail : ""}`);
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

  /* LA IMAGEN VIAJA ADENTRO DEL MENSAJE, no como un enlace.

     Antes se le pasaba a OpenAI la direccion de la imagen en Supabase y él
     tenia que ir a descargarla. Cuando Supabase se demora, OpenAI desiste:

       Vision error: "Timeout while downloading .../chat-media/image/wamid....jpg"
                      code: invalid_image_url

     y el cliente recibia "no pudimos leer el monto" con un comprobante
     perfectamente legible — con la transferencia ya hecha. Es el mismo
     tropiezo que ya tuvimos con la carta y Meta: quien recibe el enlace
     descarga cuando puede, y si tarda se rinde en silencio.

     Bajandola nosotros y mandandola dentro del propio mensaje no hay descarga
     que pueda fallar del otro lado. */
  let imagenParaVision: Record<string, unknown> = { url: imageUrl, detail: "high" };
  try {
    const bin = await fetch(imageUrl);
    if (bin.ok) {
      const buf = new Uint8Array(await bin.arrayBuffer());
      let s = "";
      for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192));
      const tipo = bin.headers.get("content-type") || "image/jpeg";
      imagenParaVision = { url: `data:${tipo};base64,${btoa(s)}`, detail: "high" };
      console.log(`[comprobante] imagen incrustada (${Math.round(buf.length / 1024)} KB)`);
    } else {
      console.error("[comprobante] no se pudo bajar la imagen:", bin.status, "— se manda el enlace");
    }
  } catch (err) {
    console.error("[comprobante] falló al bajar la imagen, se manda el enlace:", String(err).slice(0, 200));
  }

  /* Dos intentos: un tropiezo pasajero de OpenAI no puede costarle al cliente
     tener que volver a mandar el comprobante. */
  for (let intento = 0; intento < 2; intento++) {
    try {
      if (intento > 0) await new Promise(r => setTimeout(r, 1200));
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
              { type: "image_url", image_url: imagenParaVision },
            ],
          }],
        }),
      });
      if (!res.ok) { console.error(`Vision error (intento ${intento + 1}):`, await res.text()); continue; }
      const data = await res.json() as Record<string, unknown>;
      const raw   = (((data.choices as Array<Record<string,unknown>>)?.[0]?.message as Record<string,unknown>)?.content as string || "").trim();
      const clean = raw.replace(/```json|```/g, "").trim();
      return JSON.parse(clean) as ComprobanteData;
    } catch (err) {
      console.error(`extractComprobante error (intento ${intento + 1}):`, err);
    }
  }
  return empty();
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
  /* El identificador del correo del banco que respalda este pago. Es lo UNICO
     de toda la verificacion que el cliente no puede fabricar: la referencia y
     el monto salen de una imagen, y una imagen se edita. */
  mailId?: string;
}

/* ¿Este correo del banco ya pagó otro pedido?

   Regla de Sergio: "el correo del banco es lo unico que no se puede falsificar,
   entonces ese correo si o si debe quedar enlazado con ese pedido; asi, cuando
   una persona mande otro comprobante, ese correo ya no se puede reutilizar y el
   comprobante falso se queda sin correo con que compararse".

   El anti-replay por referencia no basta: la referencia se lee de la imagen, y
   basta editarla para que parezca otro pago. El correo no. */
async function correoYaUsado(branchId: string, mailId: string): Promise<boolean> {
  if (!mailId) return false;
  try {
    const usado = await sbGet(
      `/rest/v1/pos_orders?branch_id=eq.${branchId}&notes=ilike.*Mail:${mailId}*&select=id&limit=1`
    ) as Array<Record<string, unknown>> | null;
    return !!(usado && usado.length > 0);
  } catch (err) {
    /* Si no se puede comprobar, NO se da por bueno: mejor que lo mire un
       humano a dejar pasar un cobro dos veces. */
    console.error("[correo-usado] no se pudo comprobar, se trata como usado:", String(err).slice(0, 200));
    return true;
  }
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
  /* Para poder descartar los correos que ya pagaron un pedido. */
  branchId:    string = "",
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
        /* UN CORREO, UN PEDIDO. Si este ya respaldó otro, no sirve: se sigue
           buscando. Si todos los que coinciden ya están gastados, la
           verificación falla y el pedido pasa a manos de un humano — que es
           exactamente lo que tiene que pasar con un comprobante reenviado o
           con uno editado, porque no va a tener correo libre que lo respalde. */
        if (branchId && await correoYaUsado(branchId, gmailMsg.id)) {
          console.log(`Correo ${gmailMsg.id} ya usado en otro pedido — se descarta`);
          continue;
        }
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
          return { found: true, detail: `Remitente: ${from} | Asunto: ${subject}`, mailId: gmailMsg.id };
        }

        // Si la llave no coincide en el email pero todo lo demás sí, devolver found=true
        // (algunos emails no muestran la llave completa)
        if (isBankEmail && fechaOk) {
          return { found: true, detail: `Remitente: ${from} | Asunto: ${subject} (llave no verificada en email)`, mailId: gmailMsg.id };
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
  /* Lo que el cliente paga en total: comida + empaque + domicilio. */
  total: number;
  domiPrecio: number;
  /* El empaque, aparte. Los puntos se calculan sobre comida + empaque, y el
     domicilio no puede entrar ahí. */
  empaque: number;
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
  const vacio: PedidoResuelto = { total: 0, domiPrecio: 0, empaque: 0, nombreCliente: "Cliente WhatsApp", itemsRows: [] };
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
    /* EL BARRIO VA EN SU PROPIA CASILLA desde que el lector aprendió a separar
       "carrera 9 b # 63 n 58, en bellavista" en dirección y barrio. Aquí se
       seguía buscando la zona SOLO dentro de la dirección, así que ya nunca
       encontraba ninguna y el domicilio quedaba en $0. */
    const direccion  = [String(pendingData.direccion || ""), String(pendingData.barrio || "")]
      .filter(Boolean).join(" ");
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

    /* LO QUE EL CLIENTE VIO MANDA.

       El resumen guarda el total que le mostró (productos + empaque +
       domicilio). Ese es el que va a transferir, y ese es el que hay que
       esperar. Este cálculo de aquí queda solo de respaldo, por si el pedido
       viene de una versión vieja y no trae el dato.

       Sin esto pasaba: el resumen decía $40.000 (34.000 del plato + 1.000 de
       empaque + 5.000 de domicilio) y el verificador esperaba $34.000, porque
       no sumaba el empaque y no encontraba la zona del domicilio. El cliente
       pagaba bien y le salía "el monto no coincide". */
    const totalMostrado = Number(pendingData.total_mostrado);
    if (Number.isFinite(totalMostrado) && totalMostrado > 0) {
      const domiMostrado = Number(pendingData.domi_mostrado);
      const empaqueMostrado = Number(pendingData.empaque_mostrado);
      return {
        total: totalMostrado,
        domiPrecio: Number.isFinite(domiMostrado) ? domiMostrado : domiPrecio,
        empaque: Number.isFinite(empaqueMostrado) ? empaqueMostrado : 0,
        nombreCliente, itemsRows,
      };
    }

    return { total: total + domiPrecio, domiPrecio, empaque: 0, nombreCliente, itemsRows };
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
  /* El correo del banco que respalda este pago. Queda enlazado aquí para que
     no pueda respaldar ningún otro pedido nunca más. */
  mailId:         string = "",
): Promise<string | null> {
  // Resolver el pedido con el ESTADO ACTUAL (v119+): precios reales del catálogo,
  // nombre del cliente del pedido, ítems con desglose. (Antes leía el formato viejo
  // → total $0, "Cliente WhatsApp" y sin productos.)
  const pedido = await resolverPedido(pendingData, branchId, cfg, tenantId);

  /* LAS DOS MARCAS DEL ANTI-REPLAY:
       Ref:  la del comprobante — sale de una imagen, y una imagen se edita
       Mail: la del correo del banco — esa no se puede fabricar
     La segunda es la que de verdad cierra la puerta. */
  const notasPedido = [
    String(pendingData.direccion || ""),
    referencia ? `Ref:${referencia}` : "",
    mailId ? `Mail:${mailId}` : "",
  ].filter(Boolean).join(" · ");

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
    /* CADA PESO EN SU CASILLA. Antes iba TODO junto en total/subtotal/total_final
       —comida, empaque y domicilio— y sin delivery_fee ni packaging_fee. Dos
       reglas de Sergio se rompían a la vez:
         · el domicilio entraba a las ventas
         · los puntos se daban tambien sobre el domicilio, porque el trigger
           los calcula sobre subtotal + packaging_fee

       La convención del sistema está escrita en el propio Cobra
       (chat-ia.js): "las ventas son las ventas: total_final es SOLO comida +
       empaque, el domicilio va aparte en delivery_fee y nunca suma a la venta". */
    total:          pedido.total,                          // lo que el cliente paga, todo incluido
    subtotal:       Math.max(0, pedido.total - pedido.domiPrecio - pedido.empaque),   // solo comida
    packaging_fee:  pedido.empaque,
    delivery_fee:   pedido.domiPrecio,
    total_final:    Math.max(0, pedido.total - pedido.domiPrecio),                    // LA VENTA
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
