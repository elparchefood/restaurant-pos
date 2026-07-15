const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY   = Deno.env.get("OPENAI_API_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new Response("OK", { status: 200 }); }

  const convId = body.convId as string;
  if (!convId) return new Response("missing convId", { status: 400 });

  try {
    await processConversation(convId);
  } catch (err) {
    console.error("delay-reply error:", err);
    // Siempre resetear ai_typing para no dejar la conversación bloqueada
    try { await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { ai_typing: false }); } catch {}
  }

  return new Response("OK", { status: 200 });
});

async function processConversation(convId: string): Promise<void> {
  // 1. Leer la entrada de la cola
  const queueRes = await sbGet(`/rest/v1/chat_ai_queue?conversation_id=eq.${convId}&processed=eq.false&limit=1`);
  const entry = queueRes?.[0] as Record<string, unknown> | undefined;
  if (!entry) return;

  const fireAt = new Date(entry.fire_at as string).getTime();

  // 2. Esperar hasta fire_at
  let attempts = 0;
  while (attempts < 10) {
    const now = Date.now();
    const remaining = fireAt - now;
    if (remaining > 0) {
      await sleep(Math.min(remaining + 200, 30_000));
    }
    const freshRes = await sbGet(`/rest/v1/chat_ai_queue?conversation_id=eq.${convId}&processed=eq.false&limit=1`);
    const fresh = freshRes?.[0] as Record<string, unknown> | undefined;
    if (!fresh) return;
    const newFireAt = new Date(fresh.fire_at as string).getTime();
    if (newFireAt <= Date.now()) break;
    attempts++;
  }

  // 3. Marcar como procesado
  await sbPatch(`/rest/v1/chat_ai_queue?conversation_id=eq.${convId}&processed=eq.false`, { processed: true });

  // 4. Leer datos del batch
  const batchStart  = entry.batch_start as string;
  const branchId    = entry.branch_id as string;
  const tenantId    = entry.tenant_id as string;
  const fromPhone   = entry.from_phone as string;
  const phoneId     = entry.phone_id as string;
  const accessToken = entry.access_token as string;

  const msgsRes = await sbGet(
    `/rest/v1/chat_messages?conversation_id=eq.${convId}&direction=eq.in` +
    `&sent_at=gte.${encodeURIComponent(batchStart)}&order=sent_at.asc&select=id,body,external_id`
  );
  let batchMsgs = (msgsRes || []) as Array<{ id: string; body: string; external_id: string }>;
  console.log("[DBG] batchMsgs:", batchMsgs.length, batchMsgs.map(m => m.body?.slice(0,30)));

  if (!batchMsgs.length) {
    // WhatsApp timestamps have second precision; batch_start has millisecond precision.
    // If batch_start=22:25:34.456 but message sent_at=22:25:34.000, the gte filter misses it.
    // Retry with a 5-second lookback to catch this timing mismatch.
    const batchStartEarly = new Date(new Date(batchStart).getTime() - 5000).toISOString();
    const retryRes = await sbGet(
      `/rest/v1/chat_messages?conversation_id=eq.${convId}&direction=eq.in` +
      `&sent_at=gte.${encodeURIComponent(batchStartEarly)}&order=sent_at.asc&select=id,body,external_id`
    );
    batchMsgs = (retryRes || []) as Array<{ id: string; body: string; external_id: string }>;
    if (!batchMsgs.length) {
      await setTyping(convId, false);
      return;
    }
  }

  // 5. Leer config del asistente
  const cfgRes = await sbGet(`/rest/v1/ia_config?branch_id=eq.${branchId}&limit=1`);
  const cfg = cfgRes?.[0] as Record<string, unknown> | undefined;
  if (!cfg || !cfg.activo) {
    await setTyping(convId, false);
    return;
  }

  // 5b. Hora Colombia (UTC-5)
  const nowUtc = new Date();
  const colombiaMs = nowUtc.getTime() - (5 * 60 * 60 * 1000);
  const colDate = new Date(colombiaMs);
  const colHourNum = colDate.getUTCHours();
  const colMinNum  = colDate.getUTCMinutes();
  const colMin     = String(colMinNum).padStart(2, "0");
  const colAmPm    = colHourNum >= 12 ? "pm" : "am";
  const colH12     = colHourNum % 12 || 12;
  const colTimeStr = `${colH12}:${colMin}${colAmPm}`;
  const colDays    = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  const colDayStr  = colDays[colDate.getUTCDay()];
  const colDayKey  = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"][colDate.getUTCDay()];
  const colHHMM    = String(colHourNum).padStart(2,"0") + ":" + colMin;

  // Derivar isOpen desde cfg.horarios (no hardcodeado)
  const horariosCfg = cfg.horarios as Record<string, Record<string,unknown>> | null | undefined;
  let isOpen = false;
  let isBeforeOpen = false;
  if (horariosCfg) {
    const hoy = horariosCfg[colDayKey];
    if (hoy && hoy.activo) {
      const abre   = (hoy.abre   as string) || "00:00";
      const cierra = (hoy.cierra as string) || "23:59";
      isOpen       = colHHMM >= abre && colHHMM < cierra;
      isBeforeOpen = colHHMM < abre;
    }
  } else {
    // Fallback a horario por defecto si no hay config
    const totalMinutes = colHourNum * 60 + colMinNum;
    isBeforeOpen = totalMinutes < (18 * 60 + 30);
    const isAfterClose = totalMinutes >= (22 * 60 + 30);
    isOpen = !isBeforeOpen && !isAfterClose;
  }

  // 6. Historial previo
  const histRes = await sbGet(
    `/rest/v1/chat_messages?conversation_id=eq.${convId}&sent_at=lt.${encodeURIComponent(batchStart)}` +
    `&order=sent_at.desc&limit=25&select=direction,body`
  );
  const history = ((histRes || []) as Array<{ direction: string; body: string }>).reverse();

  // 6b-pre: Detectar si el upsell ya fue ofrecido Y rechazado en este hilo
  const upsellKwBot = ["adicionar", "super queso", "salchicha ranchera", "salsas especiales", "adiciones"];
  const rechazoKw   = ["no gracias", "no quiero", "así está bien", "no, gracias", "no quiero nada", "solo eso", "sin adicional"];
  let upsellYaOfrecido = false;
  let upsellRechazado  = false;
  for (let _i = 0; _i < history.length; _i++) {
    const _m = history[_i];
    const _bl = (_m.body || "").toLowerCase();
    if (_m.direction === "out" && upsellKwBot.some(kw => _bl.includes(kw))) {
      upsellYaOfrecido = true;
    }
    if (upsellYaOfrecido && _m.direction === "in") {
      const _bt = _bl.trim();
      if (rechazoKw.some(kw => _bt.includes(kw)) || _bt === "no" || _bt === "no." || _bt === "noo" || _bt === "no,") {
        upsellRechazado = true;
      }
    }
  }

  // 6b. Detectar si el cliente pide la carta → enviar imágenes y salir
  const menuImagenes = (cfg.menu_imagenes as string[]) || [];
  if (menuImagenes.length > 0) {
    const combinedLower = batchMsgs.map(m => m.body.toLowerCase().trim()).join(" ");
    const menuKw = ["la carta","el menú","el menu","dame la carta","ver la carta","su carta","ver el menú","ver el menu","qué tienen de menú","muestrame la carta","muéstrame la carta","carta del restaurante","que tienen de menu","envía la carta","envia la carta","que tienes","qué tienes","que tienen","qué tienen","que hay","qué hay","tienen de","qué te","que te"];
    const isExact = ["carta","menú","menu","el menú","el menu"].includes(combinedLower);
    const wantsMenu = isExact || menuKw.some(kw => combinedLower.includes(kw));
    if (wantsMenu) {
      for (const imgUrl of menuImagenes) {
        await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", to: fromPhone, recipient_type: "individual", type: "image", image: { link: imgUrl } }),
        });
        await sleep(600);
      }
      const fraObj = (cfg.frases as Record<string,string>) || {};
      const menuFraseCfg = (cfg.menu_frase as Record<string,string>) || {};
      const followUp = menuFraseCfg.tipo === "variable"
        ? (fraObj.apertura || "¿Qué se te antoja? 🍟☺️")
        : (menuFraseCfg.texto || "¿Qué se te antoja? 🍟☺️");
      const waText = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: fromPhone, recipient_type: "individual", type: "text", text: { body: followUp } }),
      });
      const waSentData = await waText.json() as Record<string, unknown>;
      const sentId = ((waSentData.messages as Array<Record<string,unknown>>)?.[0]?.id as string) || "";
      await sbPost(`/rest/v1/chat_messages`, { conversation_id: convId, tenant_id: tenantId, direction: "out", body: followUp, delivery_status: "sent", external_id: sentId || null, sent_at: new Date().toISOString() });
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { last_message: followUp, last_message_at: new Date().toISOString(), last_sender: "agent", last_read: false, ai_typing: false });
      return;
    }
  }

  // 7. Cargar menú y horarios
  const menuText       = await buildMenuText(branchId);
  const horariosText   = buildHorariosText(cfg.horarios as Record<string, unknown> | null | undefined);

  // 8. Nombre del remitente + check human_takeover / pago_pendiente
  const convRes    = await sbGet(`/rest/v1/chat_conversations?id=eq.${convId}&select=contact_name,human_takeover,pago_pendiente,sin_nomenclatura&limit=1`);
  const convRow    = convRes?.[0] as Record<string, unknown> | undefined;
  const senderName = (convRow?.contact_name as string) || fromPhone;
  const sinNomenclaturaCliente = !!(convRow?.sin_nomenclatura);
  if (convRow?.human_takeover) {
    console.log("human_takeover activo para conv", convId, "— bot silenciado");
    await setTyping(convId, false);
    return;
  }

  // 9. System prompt
  const pagosText      = buildPagosText(cfg.pagos as Record<string, unknown> | null | undefined);
  const domiciliosText = buildDomiciliosText(cfg.domicilios as Record<string, unknown> | null | undefined);
  const pedidosProg    = !!(cfg.pedidos_programados);
  const domiciliosCfgSP = cfg.domicilios as Record<string, unknown> | null | undefined;
  const rechazarLugPubl = domiciliosCfgSP?.rechazar_lugares_publicos !== false;
  const pagoAdelanLugPubl = domiciliosCfgSP?.pago_adelantado_lugares_publicos !== false;
  const systemPrompt   = buildSystemPrompt(
    cfg, senderName, menuText, horariosText, pagosText, domiciliosText,
    batchMsgs.length, colTimeStr, colDayStr, isOpen, isBeforeOpen, pedidosProg,
    sinNomenclaturaCliente, rechazarLugPubl, pagoAdelanLugPubl, upsellRechazado
  );

  // 10. Armar mensajes para OpenAI
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt },
  ];
  for (const h of history) {
    if (h.body) messages.push({ role: h.direction === "in" ? "user" : "assistant", content: h.body });
  }
  if (batchMsgs.length === 1) {
    messages.push({ role: "user", content: batchMsgs[0].body });
  } else {
    const combined = batchMsgs.map((m, i) => `[${i + 1}] id:${m.external_id} | ${m.body}`).join("\n");
    messages.push({ role: "user", content: combined });
  }

  // 11. Llamar a OpenAI
  // Cuando se puede tomar pedidos: usar function calling en lugar de response_format
  // Cuando NO: usar response_format json_object para multi-mensajes
  const puedeTomarPedidos = isOpen || pedidosProg;
  const useTools = puedeTomarPedidos;
  const responseFormat = (!useTools && batchMsgs.length > 1) ? { type: "json_object" } : undefined;

  const CREAR_PEDIDO_TOOL = {
    type: "function",
    function: {
      name: "crear_pedido",
      description: "Crea el pedido en el sistema Cobra POS. Llamar SOLO cuando el cliente haya confirmado explícitamente (dijo sí, correcto, dale, confirmo, etc.) al resumen del pedido. Requiere tener los 4 datos completos.",
      parameters: {
        type: "object",
        properties: {
          cliente:    { type: "string",  description: "Nombre del cliente" },
          direccion:  { type: "string",  description: "Dirección de entrega o 'para llevar'" },
          pago:       { type: "string",  description: "Método de pago: efectivo, nequi, daviplata, etc." },
          mensaje:    { type: "string",  description: "Mensaje de confirmación para enviarle al cliente" },
          productos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nombre:   { type: "string",  description: "Nombre del producto" },
                tamano:   { type: "string",  description: "Personal, Familiar, Unico, Litro o 1.5 Litros" },
                tipo:     { type: "string",  description: "Mixta, Carne o Pollo — solo para Premium y Maicitos Especial" },
                cantidad: { type: "integer", description: "Cantidad" },
              },
              required: ["nombre", "tamano", "cantidad"],
            },
          },
        },
        required: ["cliente", "productos", "direccion", "pago", "mensaje"],
      },
    },
  };

  const oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 1000,
      temperature: 0.7,
      ...(useTools ? { tools: [CREAR_PEDIDO_TOOL], tool_choice: "auto" } : {}),
      ...(responseFormat ? { response_format: responseFormat } : {}),
    }),
  });

  if (!oaiRes.ok) {
    const oaiErr = await oaiRes.text();
    console.error("OpenAI error:", oaiErr);
    await setTyping(convId, false);
    return;
  }

  const oaiData   = await oaiRes.json() as Record<string, unknown>;
  const choice    = (oaiData.choices as Array<Record<string,unknown>>)?.[0];
  const message   = choice?.message as Record<string,unknown> | undefined;
  const toolCalls = message?.tool_calls as Array<Record<string,unknown>> | undefined;
  const rawReplyDbg = (message?.content as string || "").trim();
  console.log("[DBG] toolCalls:", toolCalls?.length, "rawReply len:", rawReplyDbg.length, "first50:", rawReplyDbg.slice(0,50));

  // 12. Parsear respuesta
  type RespItem = { quote_id?: string; text: string };
  let responses: RespItem[] = [];
  let pendingOrder: Record<string, unknown> | null = null;

  // 12a. Verificar si GPT llamó a crear_pedido()
  if (toolCalls?.length) {
    const tc = toolCalls.find(t => (t.function as Record<string,unknown>)?.name === "crear_pedido");
    if (tc) {
      try {
        const args = JSON.parse((tc.function as Record<string,unknown>).arguments as string) as Record<string,unknown>;
        pendingOrder = args;
        // El mensaje de confirmación viene en el argumento "mensaje"
        const confirmMsg = (args.mensaje as string) || "¡Pedido creado! 🍟 En un momento lo preparamos.";
        responses = [{ text: confirmMsg }];
      } catch {
        console.error("Error parseando args de crear_pedido");
      }
    }
  }

  // 12b. Si no hubo tool call, parsear el texto normal
  if (!responses.length) {
    const rawReply = (message?.content as string || "").trim();
    if (!rawReply) {
      // GPT devolvió tool_call sin texto o respuesta vacía — fallback genérico
      console.warn("GPT devolvió rawReply vacío. toolCalls:", JSON.stringify(toolCalls?.map(t => (t.function as Record<string,unknown>)?.name)));
      responses = [{ text: "Disculpa, no entendí. ¿Puedes repetirme?" }];
    } else {
      if (!useTools && batchMsgs.length > 1) {
        // Modo multi-mensaje con JSON
        try {
          const parsed = JSON.parse(rawReply) as { type?: string; responses?: RespItem[] };
          responses = Array.isArray(parsed.responses) ? parsed.responses : [{ text: rawReply }];
        } catch {
          responses = [{ text: rawReply }];
        }
      } else {
        responses = [{ text: rawReply }];
      }
    }
  }

  // 12b1.5. Si GPT devolvió un resumen de pedido (🍟 + 📍 + 💳), construirlo
  // con datos estructurados extraídos de la conversación y template configurable.
  if (!pendingOrder && puedeTomarPedidos && responses.length === 1 && responses[0].text) {
    const draft = responses[0].text;
    const isResumen = draft.includes("🍟") && draft.includes("📍") && draft.includes("💳");
    if (isResumen) {
      try {
        const frasesObj      = (cfg.frases as Record<string,string>) || {};
        const confirmFrase   = frasesObj.resumen_confirmacion      || "¿Lo confirmamos o hay algo que cambiar?";
        const totalDescFrase = frasesObj.resumen_total_desconocido || "ya te confirmamos el total ☺️🍟";
        const plantilla      = (cfg.resumen_plantilla as string)   ||
          "Listo! Tu pedido quedaría así:\n🍟 {{cantidad}}x {{producto}} {{tamano}}{{adiciones}}\n📍 {{direccion}}\n💳 {{pago}}\n{{linea_total}}\n{{confirmacion}}";

        const domRaw = cfg.domicilios as Record<string,unknown> | null | undefined;
        const zonas  = (domRaw?.zonas as Array<{ nombre: string; precio: number }>) || [];

        // Extracción estructurada: GPT devuelve JSON con los datos del pedido
        const extractRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `Extrae los datos del pedido de esta conversación y devuelve SOLO un JSON con estos campos exactos:
{
  "producto": "nombre del producto sin tamaño (ej: Salchipapa Premium Mixta)",
  "tamano": "tamaño del producto (ej: Personal, Familiar)",
  "cantidad": 1,
  "adiciones": " + nombre_adicion" (con espacio al inicio; cadena vacía "" si el cliente NO pidió adiciones explícitamente — NUNCA pongas adiciones que el bot ofreció pero el cliente NO aceptó),
  "direccion": "dirección completa de entrega",
  "barrio": "solo el nombre del barrio (sin calle ni número) para buscar en la tabla de precios",
  "pago": "método de pago (ej: Efectivo, Nequi)",
  "nombre_pedido": "nombre para recibir el pedido — SOLO si el cliente lo dijo explícitamente en la conversación; si no lo dijo, deja cadena vacía",
  "precio_producto_num": 28000
}

precio_producto_num = precio numérico del producto × cantidad según el menú. Si no encuentras el precio exacto, pon 0.
nombre_pedido = nombre que el cliente dijo para el domicilio. Si NO lo mencionó, pon cadena vacía "".

MENÚ:
${menuText}`,
              },
              ...messages.slice(1),
            ],
            max_tokens: 300,
            response_format: { type: "json_object" },
          }),
        });

        let extracted: Record<string, unknown> = {};
        try {
          const extractData = await extractRes.json() as Record<string, unknown>;
          extracted = JSON.parse(
            String(((extractData.choices as Array<Record<string,unknown>>)?.[0]
              ?.message as Record<string,unknown>)?.content || "{}")
          ) as Record<string, unknown>;
        } catch (extractErr) {
          console.error("Error en extracción de resumen:", extractErr);
          extracted = {};
        }

        // Buscar barrio en tabla de zonas
        const barrioRaw = String(extracted.barrio || "").toLowerCase().trim();
        const zona = zonas.find(z =>
          barrioRaw.includes(z.nombre.toLowerCase()) || z.nombre.toLowerCase().includes(barrioRaw)
        );

        // Formatear pesos colombianos
        const fmtPeso = (n: number) => "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

        const precioProductoNum  = Number(extracted.precio_producto_num) || 0;
        const precioDomicilioNum = zona ? zona.precio : 0;
        const precioTotalNum     = precioProductoNum + precioDomicilioNum;

        // Construir {{linea_total}}
        let lineaTotal: string;
        if (zona && precioProductoNum > 0) {
          lineaTotal = `Total: ${fmtPeso(precioProductoNum)} + ${fmtPeso(precioDomicilioNum)} del domicilio = ${fmtPeso(precioTotalNum)} :)`;
        } else {
          lineaTotal = totalDescFrase;
        }

        // Si falta el nombre, preguntar antes de mostrar el resumen
        const nombrePedido = String(extracted.nombre_pedido || "").trim();
        if (!nombrePedido) {
          const nombreFrase = frasesObj.nombre_recibir || "¿A nombre de quién se recibe el pedido? 🍟";
          responses = [{ text: nombreFrase }];
          console.log("Resumen bloqueado: falta nombre_pedido — preguntando nombre");
        } else {
          // Rellenar template con variables
          const result = plantilla
            .replace(/\{\{cantidad\}\}/g,         String(extracted.cantidad    || 1))
            .replace(/\{\{producto\}\}/g,          String(extracted.producto    || ""))
            .replace(/\{\{tamano\}\}/g,            String(extracted.tamano      || ""))
            .replace(/\{\{adiciones\}\}/g,         String(extracted.adiciones   || ""))
            .replace(/\{\{direccion\}\}/g,         String(extracted.direccion   || ""))
            .replace(/\{\{pago\}\}/g,              String(extracted.pago        || ""))
            .replace(/\{\{precio_producto\}\}/g,   precioProductoNum  > 0 ? fmtPeso(precioProductoNum)  : "")
            .replace(/\{\{precio_domicilio\}\}/g,  zona               ? fmtPeso(precioDomicilioNum) : "")
            .replace(/\{\{precio_total\}\}/g,      (zona && precioProductoNum > 0) ? fmtPeso(precioTotalNum) : "")
            .replace(/\{\{nombre\}\}/g,            nombrePedido)
            .replace(/\{\{linea_total\}\}/g,       lineaTotal)
            .replace(/\{\{confirmacion\}\}/g,      confirmFrase);

          responses = [{ text: result }];
          console.log("Resumen construido desde template configurable");
        }
      } catch (resumenErr) {
        console.error("ERROR en bloque isResumen:", resumenErr);
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pending_order_data: { _dbg: "RESUMEN_THROW", err: String(resumenErr) } });
        // Fallback: usar el draft directamente sin template
        responses = [{ text: responses[0]?.text || "Disculpa, hubo un error al procesar el resumen." }];
      }
    }
  }

  // 12b2. Si GPT no llamó crear_pedido() pero el cliente acaba de confirmar:
  // detectamos el patrón [resumen anterior → confirmación del cliente] y
  // forzamos una segunda llamada con tool_choice required para extraer el pedido.
  if (!pendingOrder && puedeTomarPedidos) {
    const latestUserText = batchMsgs[batchMsgs.length - 1]?.body?.toLowerCase?.() || "";
    // Solo palabras que son ÚNICAMENTE confirmaciones, nunca parte de un pedido inicial
    const CONFIRM_WORDS  = ["sí","si","correcto","dale","perfecto","claro",
                             "de acuerdo","afirmativo","está bien","confirmo","exacto","así es"];
    const isConfirmMsg   = CONFIRM_WORDS.some(w => latestUserText === w || latestUserText.startsWith(w + " ") || latestUserText.endsWith(" " + w) || latestUserText.includes(" " + w + " "));

    // Revisar SOLO el último mensaje del bot (no todo el historial)
    const allBotMessages = messages.filter((m: Record<string,unknown>) => m.role === "assistant");
    const lastBotMsg = allBotMessages.length > 0
      ? String(allBotMessages[allBotMessages.length - 1].content || "")
      : "";
    const hasSummary = lastBotMsg.includes("¿Lo confirmamos") ||
                       lastBotMsg.includes("¿Todo correcto?") ||
                       lastBotMsg.includes("Confirmemos") ||
                       lastBotMsg.includes("correcto?") ||
                       (lastBotMsg.includes("total") && lastBotMsg.includes("$") && (lastBotMsg.includes("confirmamos") || lastBotMsg.includes("correcto")));

    // Guardia adicional: no disparar si el mensaje del cliente es largo (pedido inicial)
    const isLongMessage = latestUserText.length > 80;

    if (isConfirmMsg && hasSummary && !isLongMessage) {
      console.log("Confirmación detectada — forzando extracción de pedido con tool_choice required");
      const extractRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "El cliente acaba de confirmar su pedido. Extrae TODOS los datos del pedido de la conversación (nombre del cliente, productos con tamaño, dirección, método de pago) y llama a la función crear_pedido() ahora mismo. El campo 'mensaje' debe ser un mensaje de confirmación breve y amigable.",
            },
            ...messages.slice(1), // historial sin el system prompt original
          ],
          max_tokens: 500,
          tools: [CREAR_PEDIDO_TOOL],
          tool_choice: { type: "function", function: { name: "crear_pedido" } },
        }),
      });

      if (extractRes.ok) {
        const extractData  = await extractRes.json() as Record<string, unknown>;
        const extractMsg   = (extractData.choices as Array<Record<string,unknown>>)?.[0]
                               ?.message as Record<string,unknown> | undefined;
        const extractTc    = (extractMsg?.tool_calls as Array<Record<string,unknown>>)?.[0];
        if (extractTc && (extractTc.function as Record<string,unknown>)?.name === "crear_pedido") {
          try {
            const args = JSON.parse(
              (extractTc.function as Record<string,unknown>).arguments as string
            ) as Record<string,unknown>;
            pendingOrder = args;
            console.log("Pedido extraído (2ª llamada):", JSON.stringify(args));
          } catch {
            console.error("Error parseando args de la 2ª llamada");
          }
        } else {
          console.warn("2ª llamada no retornó tool_call de crear_pedido");
        }
      } else {
        console.error("Error en 2ª llamada OpenAI:", await extractRes.text());
      }
    }
  }

  // 12c. Crear pedido en Cobra POS (con lógica de verificación de transferencia)
  let shouldSendQr = false;
  let qrImageUrl   = "";
  let qrTexto      = "";
  if (pendingOrder) {
    try {
      const pagoMetodo = String(pendingOrder.pago || "").toLowerCase();
      const esTransferencia = pagoMetodo.includes("transfer") || pagoMetodo.includes("nequi") || pagoMetodo.includes("daviplata");

      if (esTransferencia) {
        // Guardar pedido pendiente — esperar comprobante o confirmación humana
        await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
          pago_pendiente:     true,
          pending_order_data: pendingOrder,
        });
        // El bot ya habrá dicho "envíanos el comprobante" por instrucciones.
        // Si no hay respuesta en el hilo sobre comprobante, solo marcamos pendiente.
        console.log("Pedido guardado como pendiente de pago por transferencia");
        // Preparar envío de QR si está configurado
        const pagosCfg = cfg.pagos as Record<string, unknown> | null | undefined;
        qrImageUrl   = (pagosCfg?.qr_imagen_url as string) || "";
        qrTexto      = (pagosCfg?.qr_texto      as string) || "";
        shouldSendQr = !!qrImageUrl;
      } else {
        // Efectivo u otro: clasificar dirección primero
        const domiciliosCfg = cfg.domicilios as Record<string, unknown> | null | undefined;
        const clasif = clasificarDireccion(String(pendingOrder.direccion || ""), domiciliosCfg, sinNomenclaturaCliente);

        if (clasif.tipo === "rechazado") {
          responses = [{ text: "Lo sentimos, no podemos hacer domicilios a ese lugar 😊 Si querés podés pasar a recoger tu pedido (para llevar)." }];
          pendingOrder = null;

        } else if (clasif.tipo === "incompleta") {
          responses = [{ text: "¿Me das el número completo de la dirección? Por ejemplo: Carrera 5 # 23-45 ☺️" }];
          pendingOrder = null;

        } else if (clasif.tipo === "publico" && clasif.requierePagoAdelantado) {
          const pagoMet = String(pendingOrder.pago || "").toLowerCase();
          const esEfectivo = !pagoMet.includes("nequi") && !pagoMet.includes("daviplata") && !pagoMet.includes("transfer");
          if (esEfectivo) {
            responses = [{ text: "Para domicilios a establecimientos o lugares públicos, el pago debe ser por adelantado (Nequi o Daviplata) 😊 ¿Cómo nos lo harías llegar?" }];
            pendingOrder = null;
          } else {
            // Pago digital OK → continuar con creación normal
            const domiPrecio = lookupDomiPrice(String(pendingOrder.direccion || ""), domiciliosCfg);
            if (domiPrecio === null) {
              await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
                domi_precio_pendiente: true, human_takeover: true,
                pending_order_data: { ...pendingOrder, domi_precio_pendiente: true },
              });
            } else {
              const orderId = await createWhatsappOrder({ ...pendingOrder, domi_precio: domiPrecio }, branchId, tenantId, fromPhone);
              console.log("Pedido lugar público creado:", orderId);
            }
          }

        } else {
          // Residencial normal (o para_llevar)
          const esParaLlevar = clasif.tipo === "para_llevar";
          const domiPrecio = esParaLlevar ? 0 : lookupDomiPrice(String(pendingOrder.direccion || ""), domiciliosCfg);
          if (!esParaLlevar && domiPrecio === null) {
            await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
              domi_precio_pendiente: true, human_takeover: true,
              pending_order_data: { ...pendingOrder, domi_precio_pendiente: true },
            });
            console.log("Precio domi desconocido — esperando confirmación humana");
          } else {
            const orderId = await createWhatsappOrder({ ...pendingOrder, domi_precio: domiPrecio }, branchId, tenantId, fromPhone);
            console.log("Pedido WhatsApp creado:", orderId);
          }
        }
      }
    } catch (err) {
      console.error("Error procesando pedido WhatsApp:", err);
    }
  }

  // 12d. Verificar comprobante de transferencia si hay imagen y pago_pendiente
  const convPagoPendiente = convRow?.pago_pendiente as boolean | undefined;
  const latestMsg = batchMsgs[batchMsgs.length - 1];
  const hasImage  = latestMsg?.body?.startsWith("[imagen]") || latestMsg?.body?.startsWith("[image]") || latestMsg?.media_type === "image";

  if (convPagoPendiente && hasImage) {
    try {
      // Delegar a verify-transfer EF — tiene GPT Vision, Gmail multi-formato, llave, monto, crea pedido
      await fetch(`${SUPABASE_URL}/functions/v1/verify-transfer`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: convId }),
      });
      // verify-transfer ya envió el mensaje WA y actualizó la DB — no enviar nada adicional
      responses = [];
    } catch (err) {
      console.error("Error llamando verify-transfer:", err);
      responses = [{ text: "Recibimos tu comprobante, en un momento lo verificamos y confirmamos tu pedido 🙏" }];
    }
  }

  // 13. Enviar respuesta(s) por WhatsApp y guardar en DB
  console.log("[DBG] responses.length:", responses.length, "pendingOrder:", !!pendingOrder);
  for (const resp of responses) {
    const text = resp.text?.trim();
    if (!text) continue;

    const waBody: Record<string, unknown> = {
      messaging_product: "whatsapp",
      to: fromPhone,
      recipient_type: "individual",
      type: "text",
      text: { body: text },
    };
    if (resp.quote_id) waBody.context = { message_id: resp.quote_id };

    const waRes = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(waBody),
    });

    if (!waRes.ok) { console.error("WA send error:", await waRes.text()); continue; }
    const waSent = await waRes.json() as Record<string, unknown>;
    const sentId = ((waSent.messages as Array<Record<string,unknown>>)?.[0]?.id as string) || "";

    await sbPost(`/rest/v1/chat_messages`, {
      conversation_id: convId,
      tenant_id: tenantId,
      direction: "out",
      body: text,
      delivery_status: "sent",
      external_id: sentId || null,
      sent_at: new Date().toISOString(),
    });

    if (responses.length > 1) await sleep(400);
  }

  // 13b. Si el bot dijo "ya te confirmamos el total" → marcar domi pendiente.
  // Solo activar human_takeover si NO es un resumen que pide confirmación al cliente.
  // (Si el resumen incluye "¿Lo confirmamos" o "correcto?", el bot debe seguir activo
  //  para recibir el "sí" del cliente y crear el pedido.)
  const botDijoDomiPendiente = responses.some(r =>
    (r.text || "").includes("ya te confirmamos el total")
  );
  const esResumenPidiendo = responses.some(r => {
    const t = r.text || "";
    return t.includes("¿Lo confirmamos") || t.includes("¿Todo correcto?") || t.includes("correcto?") || t.includes("Confirmemos");
  });
  if (botDijoDomiPendiente) {
    await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
      domi_precio_pendiente: true,
      ...(esResumenPidiendo ? {} : { human_takeover: true }),
    });
  }

  // 13c. Enviar imagen QR si el pago es por transferencia y está configurado
  if (shouldSendQr) {
    await sleep(600);
    const waQrBody = {
      messaging_product: "whatsapp",
      to: fromPhone,
      recipient_type: "individual",
      type: "image",
      image: { link: qrImageUrl, caption: qrTexto || undefined },
    };
    const qrRes = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(waQrBody),
    });
    if (qrRes.ok) {
      const qrSent = await qrRes.json() as Record<string, unknown>;
      const qrMsgId = ((qrSent.messages as Array<Record<string,unknown>>)?.[0]?.id as string) || "";
      await sbPost(`/rest/v1/chat_messages`, {
        conversation_id: convId,
        tenant_id: tenantId,
        direction: "out",
        body: `[imagen] ${qrImageUrl}`,
        delivery_status: "sent",
        external_id: qrMsgId || null,
        sent_at: new Date().toISOString(),
      });
    } else {
      console.error("QR send error:", await qrRes.text());
    }
  }

  // 14. Actualizar conversación
  const lastText = responses[responses.length - 1]?.text || "";
  await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
    last_message: lastText,
    last_message_at: new Date().toISOString(),
    last_sender: "agent",
    last_read: false,
    ai_typing: false,
  });
}

// ── Crear pedido WhatsApp en Cobra POS ───────────────────────────────────────

async function createWhatsappOrder(
  data: Record<string, unknown>,
  branchId: string,
  tenantId: string,
  fromPhone: string
): Promise<string | null> {
  const cliente     = String(data.cliente     || "Cliente WhatsApp");
  const productos   = (data.productos as Array<Record<string, unknown>>) || [];
  const direccion   = String(data.direccion   || "");
  const pago        = String(data.pago        || "");

  // Traer todos los productos disponibles de la sucursal
  const allProducts = await sbGet(
    `/rest/v1/pos_products?branch_id=eq.${branchId}&available=eq.true` +
    `&select=id,name,price,price_mode,presentations,variables`
  ) as Array<Record<string, unknown>> | null;

  if (!allProducts) {
    console.error("No se pudo cargar pos_products para crear el pedido");
    return null;
  }

  // Resolver cada ítem del pedido
  type OrderItem = {
    order_id?: string;
    product_id: string | null;
    product_name: string;
    product_price: number;
    unit_price: number;
    total: number;
    quantity: number;
    selections: Record<string, unknown>;
    branch_id: string;
    tenant_id: string | null;
    notes: string | null;
  };

  const items: OrderItem[] = [];
  let orderTotal = 0;

  for (const prod of productos) {
    const nombreGPT = String(prod.nombre  || "").trim();
    const tamanoGPT = String(prod.tamano  || "").trim();
    const tipoGPT   = String(prod.tipo    || "").trim();
    const cantidad  = Math.max(1, Number(prod.cantidad) || 1);

    // Buscar producto por nombre (coincidencia parcial, sin importar mayúsculas)
    const nombreLow = nombreGPT.toLowerCase();
    const matched = allProducts.find(p => {
      const pname = String(p.name || "").toLowerCase();
      return pname === nombreLow ||
             pname.includes(nombreLow) ||
             nombreLow.includes(pname.replace(/\s.*/,""));
    });

    if (!matched) {
      // Fallback: ítems sin product_id, precio 0 para que el staff lo corrija
      const fallbackName = [nombreGPT, tamanoGPT, tipoGPT].filter(Boolean).join(" · ");
      console.warn("Producto no encontrado en BD:", nombreGPT);
      items.push({
        product_id: null,
        product_name: fallbackName || "Producto WhatsApp",
        product_price: 0,
        unit_price: 0,
        total: 0,
        quantity: cantidad,
        selections: { mods: {}, pres: tamanoGPT, vars: {} },
        branch_id: branchId,
        tenant_id: tenantId || null,
        notes: null,
      });
      continue;
    }

    const presentations = (matched.presentations as Array<{ id: string; name: string; price: number }>) || [];
    const variables = (matched.variables as Array<{
      id: string;
      name: string;
      isPricing?: boolean;
      options: Array<{ id: string; name: string; price: number; prices?: number[] }>;
    }>) || [];
    const priceMode = String(matched.price_mode || "simple");

    // Encontrar presentación
    const tamLow   = tamanoGPT.toLowerCase();
    let presMatch  = presentations.find(p => p.name.toLowerCase() === tamLow);
    if (!presMatch && presentations.length > 0) presMatch = presentations[0];
    const presName = presMatch?.name || tamanoGPT;
    const presIdx  = presMatch ? presentations.indexOf(presMatch) : 0;

    let price      = Number(presMatch?.price) || Number(matched.price) || 0;
    const varsMap: Record<string, { id: string; name: string; price: number }> = {};

    // Para productos matrix (Premium, Maicitos Especial) resolver variable → precio
    if (priceMode === "matrix" && tipoGPT && variables.length > 0) {
      const varGroup = variables[0];
      const tipoLow  = tipoGPT.toLowerCase();
      const varOpt   = varGroup.options.find(o => o.name.toLowerCase() === tipoLow);
      if (varOpt) {
        // prices[presIdx]: 0=Familiar, 1=Personal
        if (Array.isArray(varOpt.prices) && presIdx >= 0 && presIdx < varOpt.prices.length) {
          price = varOpt.prices[presIdx];
        } else if (varOpt.price > 0) {
          price = varOpt.price;
        }
        varsMap[varGroup.id] = { id: varOpt.id, name: varOpt.name, price };
      }
    }

    const itemTotal   = price * cantidad;
    const displayName = [String(matched.name), presName, tipoGPT].filter(Boolean).join(" · ");

    items.push({
      product_id:    String(matched.id),
      product_name:  displayName,
      product_price: price,
      unit_price:    price,
      total:         itemTotal,
      quantity:      cantidad,
      selections:    { mods: {}, pres: presName, vars: varsMap },
      branch_id:     branchId,
      tenant_id:     tenantId || null,
      notes:         null,
    });

    orderTotal += itemTotal;
  }

  // Buscar o crear cliente en pos_clientes
  let clienteId: string | null = null;
  try {
    const telefonoClean = fromPhone.replace(/\D/g, "");
    // Buscar exacto: mismo teléfono + nombre + dirección
    const existing = await sbGet(
      `/rest/v1/pos_clientes?telefono=eq.${encodeURIComponent(telefonoClean)}&nombre=eq.${encodeURIComponent(cliente)}&direccion=eq.${encodeURIComponent(direccion)}&tenant_id=eq.${tenantId}&limit=1`
    ) as Array<Record<string, unknown>> | null;

    if (existing && existing.length > 0) {
      clienteId = String(existing[0].id);
      console.log("Cliente existente reutilizado:", clienteId);
    } else {
      // Crear nuevo cliente
      const newCliente = await fetch(`${SUPABASE_URL}/rest/v1/pos_clientes`, {
        method: "POST",
        headers: {
          "apikey":        SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Content-Type":  "application/json",
          "Prefer":        "return=representation",
        },
        body: JSON.stringify({
          tenant_id: tenantId || null,
          branch_id: branchId,
          nombre:    cliente,
          telefono:  telefonoClean,
          direccion: direccion || null,
        }),
      });
      if (newCliente.ok) {
        const newRow = await newCliente.json() as Array<Record<string, unknown>>;
        clienteId = String(newRow?.[0]?.id || "");
        console.log("Nuevo cliente creado:", clienteId);
      } else {
        console.error("Error creando cliente:", await newCliente.text());
      }
    }
  } catch (err) {
    console.error("Error en lookup/creación de cliente:", err);
  }

  // Insertar en pos_orders
  const orderRecord: Record<string, unknown> = {
    branch_id:      branchId,
    tenant_id:      tenantId || null,
    channel:        "domicilio",
    customer_name:  cliente,
    notes:          direccion || null,
    payment_method: pago || null,
    status:         "open",
    total:          orderTotal,
    subtotal:       orderTotal,
    total_final:    orderTotal,
    waiter_name:    "Asistente IA",
    visible_cocina: true,
    opened_at:      new Date().toISOString(),
  };
  if (clienteId) orderRecord.cliente_id = clienteId;

  const createRes = await fetch(`${SUPABASE_URL}/rest/v1/pos_orders`, {
    method: "POST",
    headers: {
      "apikey":        SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type":  "application/json",
      "Prefer":        "return=representation",
    },
    body: JSON.stringify(orderRecord),
  });

  if (!createRes.ok) {
    console.error("Error creando pos_orders:", await createRes.text());
    return null;
  }

  const created  = await createRes.json() as Array<Record<string, unknown>>;
  const orderId  = created?.[0]?.id as string | undefined;
  if (!orderId) { console.error("No se recibió id del pedido creado"); return null; }

  // Insertar ítems
  for (const item of items) {
    await sbPost(`/rest/v1/pos_order_items`, { ...item, order_id: orderId });
  }

  return orderId;
}

// ── Verificación de comprobante de transferencia ─────────────────────────────

async function verifyTransferComprobante(
  convId: string,
  branchId: string,
  msg: { id: string; body: string; external_id: string },
  cfg: Record<string, unknown>
): Promise<"confirmed" | "pending"> {
  const OPENAI_KEY   = Deno.env.get("OPENAI_API_KEY") || "";
  const gmailToken   = cfg.gmail_refresh_token as string | undefined;
  const gmailVerify  = cfg.gmail_verificar as boolean | undefined;
  const gmailClientId     = Deno.env.get("GMAIL_CLIENT_ID") || "";
  const gmailClientSecret = Deno.env.get("GMAIL_CLIENT_SECRET") || "";

  // Si no hay Gmail configurado → pendiente para humano
  if (!gmailVerify || !gmailToken) return "pending";

  // 1. Obtener URL de la imagen desde WhatsApp
  const msgExtId = msg.external_id;
  if (!msgExtId) return "pending";

  // El body viene como "[imagen] <media_id>" — extraer media_id
  const mediaId = msg.body.replace(/\[imagen\]\s*/i, "").replace(/\[image\]\s*/i, "").trim();
  if (!mediaId) return "pending";

  // Obtener canal para accessToken
  const channels = await sbGet(`/rest/v1/chat_channels?branch_id=eq.${branchId}&type=eq.whatsapp&limit=1`) as Array<Record<string,unknown>> | null;
  const accessToken = String(channels?.[0]?.access_token || "");
  if (!accessToken) return "pending";

  // Descargar metadata de la imagen
  const mediaRes = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!mediaRes.ok) return "pending";
  const mediaMeta = await mediaRes.json() as { url?: string };
  const imgUrl = mediaMeta.url;
  if (!imgUrl) return "pending";

  // 2. GPT-4o Vision: extraer datos del comprobante
  const visionRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{
        role: "user",
        content: [
          { type: "text", text: 'Extrae del comprobante: {"monto": número sin puntos ni comas (ej 36000), "fecha": "DD/MM/YYYY", "hora": "HH:MM", "llave": "número de llave o cuenta destino"}. Solo JSON.' },
          { type: "image_url", image_url: { url: imgUrl, detail: "low" } },
        ],
      }],
    }),
  });
  if (!visionRes.ok) return "pending";
  const visionData = await visionRes.json() as Record<string,unknown>;
  let extracted: Record<string,string> = {};
  try {
    extracted = JSON.parse((visionData.choices as Array<Record<string,unknown>>)?.[0]?.message?.content as string || "{}");
  } catch { return "pending"; }

  const montoImg = Number(extracted.monto || 0);
  const fechaImg = String(extracted.fecha || "");
  const llaveImg = String(extracted.llave || "");
  if (!montoImg || !fechaImg) return "pending";

  // 3. Obtener access_token de Gmail con refresh_token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: gmailToken,
      client_id: gmailClientId,
      client_secret: gmailClientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!tokenRes.ok) return "pending";
  const tokenData = await tokenRes.json() as { access_token?: string };
  const gmailAccessToken = tokenData.access_token;
  if (!gmailAccessToken) return "pending";

  // 4. Buscar en Gmail un correo que coincida con monto + fecha
  const montoStr = montoImg.toFixed(2);
  const query    = `from:alertasynotificaciones@an.notificacionesbancolombia.com recibiste ${montoStr} newer_than:2d`;
  const gmailRes = await fetch(
    `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=5`,
    { headers: { Authorization: `Bearer ${gmailAccessToken}` } }
  );
  if (!gmailRes.ok) return "pending";
  const gmailData = await gmailRes.json() as { messages?: Array<{ snippet?: string }> };
  const messages  = gmailData.messages || [];
  if (!messages.length) { console.log("Gmail: no se encontró correo para monto", montoStr); return "pending"; }

  // 5. Verificar que la fecha y llave coincidan en algún mensaje
  const llaveCfg = String((cfg.pagos as Record<string,string>)?.llave || "0089912015");
  for (const gmailMsg of messages) {
    const snippet = String(gmailMsg.snippet || "");
    const fechaOk = snippet.includes(fechaImg.split("/").reverse().join("/")) || snippet.includes(fechaImg);
    const llaveOk = !llaveImg || snippet.includes(llaveImg) || snippet.includes(llaveCfg);
    if (fechaOk && llaveOk) {
      console.log("Gmail: verificación OK — monto, fecha y llave coinciden");
      return "confirmed";
    }
  }

  console.log("Gmail: correo encontrado pero fecha/llave no coinciden");
  return "pending";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function setTyping(convId: string, typing: boolean): Promise<void> {
  await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { ai_typing: typing });
}

function fmtPrice(n: number): string {
  return "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

async function buildMenuText(branchId: string): Promise<string> {
  const rows = await sbGet(
    `/rest/v1/pos_products?branch_id=eq.${branchId}&available=eq.true` +
    `&select=name,price,description,price_mode,presentations,variables,category_id(name)&order=sort_order`
  ) as Array<Record<string, unknown>> | null;
  if (!rows || !rows.length) return "";
  const byCategory: Record<string, Array<Record<string, unknown>>> = {};
  for (const p of rows) {
    const cat = ((p.category_id as Record<string,string>)?.name) || "General";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(p);
  }
  const lines: string[] = ["CARTA DEL RESTAURANTE (productos disponibles):"];
  for (const [cat, items] of Object.entries(byCategory)) {
    lines.push(`\n[${cat.toUpperCase()}]`);
    for (const item of items) {
      const pres = (item.presentations as Array<{name:string;price:number}>) || [];
      const vars = (item.variables as Array<{id:string;name:string;isPricing?:boolean;options:Array<{id:string;name:string;prices?:number[]}>}>) || [];
      const priceMode = String(item.price_mode || "simple");
      let priceStr: string;
      if (priceMode === "matrix" && vars.length > 0) {
        // Mostrar precios de la variable × presentaciones
        const varGroup = vars[0];
        const varLines: string[] = [];
        for (const opt of varGroup.options) {
          if (Array.isArray(opt.prices) && pres.length > 0) {
            const optPrices = pres.map((p2, i) => `${p2.name} ${fmtPrice(opt.prices![i] ?? 0)}`).join(" / ");
            varLines.push(`  ${opt.name}: ${optPrices}`);
          }
        }
        priceStr = "\n" + varLines.join("\n");
      } else {
        const validPres = pres.filter(p => p.price > 0);
        if (validPres.length > 1) priceStr = validPres.map(p => `${p.name} ${fmtPrice(p.price)}`).join(" / ");
        else if (validPres.length === 1) priceStr = fmtPrice(validPres[0].price);
        else priceStr = fmtPrice(Number(item.price) || 0);
      }
      let line = `- ${item.name}: ${priceStr}`;
      if (item.description) line += ` — ${item.description}`;
      lines.push(line);
    }
  }
  return lines.join("\n");
}

function buildHorariosText(horarios: Record<string, unknown> | null | undefined): string {
  if (!horarios) return "";
  const DAYS: Array<[string, string]> = [
    ["lunes","Lunes"],["martes","Martes"],["miercoles","Miércoles"],
    ["jueves","Jueves"],["viernes","Viernes"],["sabado","Sábado"],["domingo","Domingo"],
  ];
  const nowCol    = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const todayIdx  = nowCol.getUTCDay();
  const colDayKey = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"][todayIdx];
  const colHHMM   = nowCol.getUTCHours().toString().padStart(2,"0") + ":" + nowCol.getUTCMinutes().toString().padStart(2,"0");
  const lines: string[] = ["HORARIOS DE ATENCIÓN:"];
  let abierto = false;
  for (const [key, label] of DAYS) {
    const d = horarios[key] as Record<string,unknown> | undefined;
    if (!d || !d.activo) { lines.push(`- ${label}: Cerrado`); }
    else {
      const abre = (d.abre as string) || "00:00";
      const cierra = (d.cierra as string) || "23:59";
      lines.push(`- ${label}: ${abre} – ${cierra}`);
      if (key === colDayKey && colHHMM >= abre && colHHMM <= cierra) abierto = true;
    }
  }
  lines.push("");
  if (abierto) {
    lines.push(`ESTADO ACTUAL: Abierto (${colHHMM} hora Colombia).`);
  } else {
    const d = horarios[colDayKey] as Record<string,unknown> | undefined;
    if (!d || !d.activo) lines.push(`ESTADO ACTUAL: Cerrado hoy (${DAYS[todayIdx][1]}). No atiende este día.`);
    else if (colHHMM < (d.abre as string)) lines.push(`ESTADO ACTUAL: Aún no ha abierto. Abre a las ${d.abre}.`);
    else lines.push(`ESTADO ACTUAL: Ya cerró por hoy. Cerró a las ${d.cierra}.`);
  }
  return lines.join("\n");
}

function buildPagosText(pagos: Record<string, unknown> | null | undefined): string {
  if (!pagos) return "";
  const metodos: string[] = [];
  if (pagos.efectivo)  metodos.push("Efectivo");
  if (pagos.nequi)     metodos.push("Nequi");
  if (pagos.daviplata) metodos.push("Daviplata");
  if (pagos.tarjeta)   metodos.push("Tarjeta");
  if (!metodos.length) return "";
  const lines: string[] = ["MÉTODOS DE PAGO:"];
  lines.push(`- Aceptamos: ${metodos.join(", ")}`);
  if ((pagos.nequi || pagos.daviplata) && pagos.llave) {
    lines.push(`- Llave/número de pago digital: ${pagos.llave}`);
    if (pagos.titular) lines.push(`- Titular: ${pagos.titular}`);
  }
  if (pagos.esperar_comprobante) lines.push("- Para pagos digitales, pedimos el comprobante de transferencia.");
  if (pagos.nota) lines.push(`- ${pagos.nota}`);
  return lines.join("\n");
}

function fmtCOP(n: number): string {
  return `$${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

function buildDomiciliosText(domicilios: Record<string, unknown> | null | undefined): string {
  if (!domicilios) return "";
  const lines: string[] = [];
  const activo = domicilios.activo !== false;
  if (!activo) {
    lines.push("DOMICILIOS: Por el momento no manejamos servicio a domicilio.");
    if (domicilios.para_llevar !== false) lines.push("Sin embargo, puedes pasar a recoger tu pedido (para llevar).");
    return lines.join("\n");
  }
  lines.push("DOMICILIOS Y COBERTURA:");
  if (domicilios.tiempo_estimado) lines.push(`- Tiempo estimado de entrega: ${domicilios.tiempo_estimado}`);
  if (domicilios.para_llevar !== false) lines.push("- También manejamos pedidos para recoger (para llevar).");
  const zonas = (domicilios.zonas as Array<{ nombre?: string; barrios?: string[]; precio: number }>) || [];
  if (zonas.length) {
    lines.push("- Precios de domicilio por barrio (usa estos precios EXACTOS para calcular el total):");
    for (const z of zonas) {
      const precio = z.precio ? fmtCOP(z.precio) : "Gratis";
      const lista = z.barrios ? z.barrios.join(", ") : (z.nombre || "");
      lines.push(`  • ${precio}: ${lista}`);
    }
    lines.push("- REGLA CRÍTICA: Si el barrio del cliente NO aparece en esta lista, escribe exactamente la frase: 'ya te confirmamos el total ☺️🍟' y NO inventes ningún precio.");
  }
  return lines.join("\n");
}

const LUGARES_RECHAZADOS = [
  "parque","andén","anden","semáforo","semaforo","esquina",
  "glorieta","rotonda","vía pública","via publica","zona verde",
  "cancha","estadio","kiosco","kiosko","andenes","la calle",
  "en el parque","en la esquina","en la glorieta",
];
const LUGARES_PUBLICOS = [
  "hospital","clínica","clinica","centro comercial","aeropuerto",
  "universidad","colegio","banco","supermercado","hotel",
  "oficina","empresa","negocio","consultorio","farmacia",
  "droguería","drogueria","éxito","exito","alkosto","jumbo",
  "d1 ","ara ","edificio","torre empresarial","local comercial",
  "bodega","fábrica","fabrica","clínica","consultorio",
  "instituto","corporación","corporacion",
];

type TipoDireccion = "residencial" | "publico" | "rechazado" | "incompleta" | "para_llevar";

function checkBarrioSinNomenclatura(
  direccion: string,
  domicilios: Record<string, unknown> | null | undefined
): boolean {
  if (!domicilios) return false;
  const zonas = (domicilios.zonas as Array<{ barrios?: string[]; nombre?: string; sin_nomenclatura?: boolean }>) || [];
  const dir = direccion.toLowerCase();
  for (const z of zonas) {
    if (!z.sin_nomenclatura) continue;
    const barrios = z.barrios ?? (z.nombre ? z.nombre.split(",").map((b: string) => b.trim()) : []);
    for (const b of barrios) {
      if (dir.includes(b.toLowerCase())) return true;
    }
  }
  return false;
}

function clasificarDireccion(
  direccion: string,
  domicilios: Record<string, unknown> | null | undefined,
  sinNomenclaturaCliente: boolean
): { tipo: TipoDireccion; requierePagoAdelantado: boolean } {
  const dir = direccion.toLowerCase().trim();

  if (dir.includes("llevar") || dir.includes("recoger")) {
    return { tipo: "para_llevar", requierePagoAdelantado: false };
  }

  if (domicilios?.rechazar_lugares_publicos !== false) {
    if (LUGARES_RECHAZADOS.some(kw => dir.includes(kw))) {
      return { tipo: "rechazado", requierePagoAdelantado: false };
    }
  }

  if (LUGARES_PUBLICOS.some(kw => dir.includes(kw))) {
    const requiere = domicilios?.pago_adelantado_lugares_publicos !== false;
    return { tipo: "publico", requierePagoAdelantado: requiere };
  }

  if (!sinNomenclaturaCliente && !checkBarrioSinNomenclatura(dir, domicilios)) {
    const tieneVia = /\b(calle|carrera|cra|cl|diagonal|transversal|tv|dg|avenida|av)\s*\d+/i.test(dir);
    const tieneNumero = /#|no\.\s*\d|nro\.\s*\d|número\s*\d|numero\s*\d/.test(dir);
    if (tieneVia && !tieneNumero) return { tipo: "incompleta", requierePagoAdelantado: false };
  }

  return { tipo: "residencial", requierePagoAdelantado: false };
}

// ── Normalización y fuzzy matching para barrios ───────────────────────────────

function normalizarTexto(s: string): string {
  return s.toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // quitar tildes: á→a, é→e, ñ→n…
    .replace(/[^a-z0-9\s]/g, " ")      // quitar símbolos
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = a[i - 1] === b[j - 1]
        ? prevDiag
        : 1 + Math.min(prev[j], prev[j - 1], prevDiag);
      prevDiag = tmp;
    }
  }
  return prev[b.length];
}

function fuzzyBarrioMatch(direccion: string, barrio: string): boolean {
  const dirNorm  = normalizarTexto(direccion);
  const barNorm  = normalizarTexto(barrio);

  // 1. Exacto tras normalizar tildes/mayúsculas
  if (dirNorm.includes(barNorm)) return true;

  // 2. Sin espacios: "bella vista" coincide con "bellavista"
  const dirSinEsp = dirNorm.replace(/\s/g, "");
  const barSinEsp = barNorm.replace(/\s/g, "");
  if (dirSinEsp.includes(barSinEsp)) return true;

  // 3. Fuzzy por palabras: cada token del barrio aparece en la dirección con tolerancia
  const dirWords = dirNorm.split(" ");
  const barWords = barNorm.split(" ");
  const todasCoinciden = barWords.every(bw => {
    if (bw.length <= 2) return dirWords.includes(bw);        // palabras cortas: exacto
    const maxDist = Math.floor(bw.length / 5) + 1;           // ~1 error c/4-5 letras
    return dirWords.some(dw => levenshtein(dw, bw) <= maxDist);
  });
  if (todasCoinciden) return true;

  // 4. Ventana deslizante sin espacios: "bellabista" → "bellavista"
  if (barSinEsp.length >= 5) {
    const L = barSinEsp.length;
    const maxDist = Math.floor(L / 5) + 1;
    for (let i = 0; i <= dirSinEsp.length - L; i++) {
      if (levenshtein(dirSinEsp.slice(i, i + L), barSinEsp) <= maxDist) return true;
    }
  }

  return false;
}

function lookupDomiPrice(direccion: string, domicilios: Record<string, unknown> | null | undefined): number | null {
  if (!domicilios) return null;
  const zonas = (domicilios.zonas as Array<{ nombre?: string; barrios?: string[]; precio: number }>) || [];
  for (const z of zonas) {
    const barrios = z.barrios ?? (z.nombre ? z.nombre.split(",").map((b: string) => b.trim()) : []);
    for (const b of barrios) {
      if (fuzzyBarrioMatch(direccion, b)) return z.precio;
    }
  }
  return null;
}

function buildSystemPrompt(
  cfg: Record<string, unknown>,
  senderName: string,
  menuText: string,
  horariosText: string,
  pagosText: string,
  domiciliosText: string,
  batchSize: number,
  currentTime: string,
  currentDay: string,
  isOpen: boolean,
  isBeforeOpen: boolean,
  pedidosProg: boolean,
  sinNomenclaturaCliente: boolean = false,
  rechazarLugaresPublicos: boolean = true,
  pagoAdelanLugaresPublicos: boolean = true,
  upsellRechazado: boolean = false
): string {
  const perfil = (cfg.perfil as Record<string,string>) || {};
  const vocab  = (cfg.vocabulario as Record<string,unknown>) || {};
  const faqs   = (cfg.faq as Array<Record<string,string>>) || [];
  const tono   = (cfg.tono as string) || "cercano";
  const tonoDesc: Record<string, string> = {
    cercano: "Usa un tono amigable y cercano, como si hablaras con un amigo. Puedes usar emojis con moderación.",
    neutral: "Responde de forma clara y directa. Sin emojis.",
    formal:  "Mantén un tono formal y profesional. Evita los emojis.",
  };
  const botName = perfil.nombre || "Asistente";
  const lines: string[] = [
    ...(upsellRechazado ? [
      "⚠️ INSTRUCCIÓN PRIORITARIA — OVERRIDE ABSOLUTO: El cliente YA rechazó el upsell en esta conversación. ESTÁ PROHIBIDO ofrecer adiciones, bebidas o extras de cualquier tipo. Si ya tienes todos los datos del pedido (producto, dirección, pago, nombre), muestra el RESUMEN en formato de texto (🍟 producto, 📍 dirección, 💳 pago) y pregunta si está correcto. NUNCA llames a crear_pedido() sin que el cliente confirme explícitamente. No preguntes nada más sobre adiciones.",
      "",
    ] : []),
    `Eres ${botName}, el asistente virtual de este restaurante.`,
    `IMPORTANTE: No llames al cliente por ningún nombre al saludar. El nombre de WhatsApp puede ser un apodo o nickname que no es apropiado usar (ej: "cariñosito6754"). Saluda siempre de forma genérica. El nombre para el pedido se pregunta en el flujo normal y puede ser diferente al de WhatsApp.`,
    "",
    "=== REGLAS CRÍTICAS — NUNCA IGNORAR ===",
    "",
    "1. UPSELL OBLIGATORIO: En TODA conversación de pedido, ofrece adiciones UNA SOLA VEZ (bebidas, salchicha ranchera, super queso, salsas especiales). Hazlo aunque el cliente ya haya dado el producto, dirección y todos los datos. La ÚNICA excepción: el cliente ya mencionó explícitamente que quiere adiciones. Si el cliente RECHAZA el upsell ('no', 'no gracias', 'así está bien', 'no quiero', etc.), NO vuelvas a ofrecerlo NUNCA en la misma conversación, y NO incluyas ningún producto adicional en el resumen ni en el pedido. Un rechazo al upsell = el pedido va sin adiciones, punto.",
    "",
    "2. RESUMEN CON PRECIO OBLIGATORIO: Cuando ya tengas todos los datos (producto, dirección, pago, nombre), envía UN SOLO MENSAJE con el resumen completo + el precio total, terminando con '¿Lo confirmamos o hay algo que cambiar?' Formato: 🍟 producto x cantidad, 📍 dirección, 💳 pago, 👤 nombre, Total: $X + $Y del domicilio = $Z. Si el barrio NO aparece en la tabla de precios de domicilio, escribe exactamente: 'ya te confirmamos el total ☺️🍟' en lugar del precio. El nombre SIEMPRE se pregunta ANTES de mostrar el resumen, nunca dentro del mismo mensaje.",
    "",
    "3. DIRECCIÓN EN VARIOS MENSAJES: Si el cliente envía la dirección repartida en 2 o más mensajes consecutivos (ej: 'Carrera 9 #3-20' y luego 'Bellavista'), son PARTES DE UNA SOLA DIRECCIÓN. Únelas en una sola dirección completa, sin comentarle al cliente lo que hiciste. NUNCA preguntes cuál de las dos es la correcta.",
    "",
    "4. PAGO POR TRANSFERENCIA — NUNCA DIGAS 'EN UN MOMENTO ENVIAMOS': Si el método de pago es transferencia, Nequi, Daviplata o similar, después de que el cliente confirme el resumen di: 'Perfecto, queda pendiente del comprobante. ¡En cuanto lo recibamos pasamos tu pedido a cocina! 🍟' NUNCA digas 'En un momento enviamos tu pedido' cuando el pago sea digital.",
    "",
    "5. 'EN UN MOMENTO ENVIAMOS' SOLO DESPUÉS DEL RESUMEN (pago en efectivo): Solo di 'En un momento enviamos tu pedido' cuando el cliente haya CONFIRMADO el resumen ('sí', 'correcto', 'dale', etc.) Y el pago sea en efectivo. NUNCA lo digas sin confirmación ni en pagos digitales.",
    "",
    "6. 'GRACIAS' EN EL PRIMER MENSAJE NO ES CONFIRMACIÓN: Si el cliente incluye 'gracias' o 'muchas gracias' en su primer mensaje con el pedido, NO es un cierre ni confirmación. Continúa el flujo: upsell → resumen con precio → confirmación del cliente → cierre.",
    "",
    "7. DIRECCIÓN INCOMPLETA — PEDIR NÚMERO COMPLETO: Si el cliente menciona una vía (Calle, Carrera, Diagonal, Transversal) con número pero SIN el cruce (#XX-XX), pide el número completo ANTES de continuar. Ejemplo: '¿Me das el número completo de la dirección? Por ejemplo: Carrera 5 # 23-45 ☺️'" +
      (sinNomenclaturaCliente ? " EXCEPCIÓN ACTIVA: Este cliente está marcado como 'sin nomenclatura', acepta cualquier referencia de dirección sin exigir el #." : ""),
    "",
    ...(rechazarLugaresPublicos ? [
      "8. LUGAR NO ACEPTADO — NO HACER DOMICILIO: Si el cliente dice que está en un parque, andén, esquina, glorieta, zona verde, cancha, estadio, vía pública o cualquier lugar donde no hay una puerta de casa o negocio, responde amablemente que no puedes hacer el domicilio ahí y ofrece la opción de pedir para llevar.",
      "",
    ] : []),
    ...(pagoAdelanLugaresPublicos ? [
      "9. LUGAR PÚBLICO — PAGO ADELANTADO OBLIGATORIO: Si la dirección es un hospital, clínica, centro comercial, aeropuerto, universidad, colegio, edificio, oficina, negocio, local, farmacia, banco o cualquier establecimiento comercial, el pago DEBE ser por adelantado (Nequi o Daviplata). Antes de mostrar el resumen, informa al cliente que para ese tipo de lugar se necesita pago digital anticipado.",
      "",
    ] : []),
    "=== FIN REGLAS CRÍTICAS ===",
    "",
  ];

  // Contexto de horario
  if (!isOpen) {
    const fraObj2 = (cfg.frases as Record<string,string>) || {};
    const horaCierre = "10:30pm", horaApertura = "6:30pm";
    if (pedidosProg) {
      lines.push(`HORARIO: Son las ${currentTime} del ${currentDay}. El restaurante está CERRADO (atiende de ${horaApertura} a ${horaCierre}). Puedes conversar con naturalidad, responder preguntas, compartir el menú y los precios. PUEDES recibir pedidos programados aclarando que serán preparados cuando abramos a las ${horaApertura}. Varía el lenguaje en cada respuesta, no repitas frases exactas.`);
    } else {
      lines.push(`HORARIO: Son las ${currentTime} del ${currentDay}. El restaurante está CERRADO (atiende de ${horaApertura} a ${horaCierre}). Puedes conversar con naturalidad, responder preguntas, compartir el menú y los precios, indicar cuándo abrimos. NO puedes aceptar pedidos hasta que abramos. Cuando el cliente insista con un pedido, usa variaciones de: "${fraObj2.antes_horario || 'Recuerda que nuestro servicio es a partir de las 6:30pm ☺️🍟'}". Varía el lenguaje, no repitas siempre lo mismo.`);
    }
    lines.push("");
  }

  lines.push(`TONO: ${tonoDesc[tono] || tonoDesc.cercano}`);
  lines.push("");
  if (cfg.instrucciones) { lines.push("INSTRUCCIONES:"); lines.push(cfg.instrucciones as string); lines.push(""); }
  if (cfg.negocio)       { lines.push("INFORMACIÓN DEL NEGOCIO:"); lines.push(cfg.negocio as string); lines.push(""); }
  if (Array.isArray(vocab.usar) && (vocab.usar as string[]).length)
    lines.push(`VOCABULARIO PREFERIDO: ${(vocab.usar as string[]).join(", ")}`);
  if (vocab.evitar) lines.push(`PALABRAS A EVITAR: ${vocab.evitar}`);
  if (faqs.length) {
    lines.push(""); lines.push("PREGUNTAS FRECUENTES:");
    faqs.forEach(f => { lines.push(`P: ${f.pregunta}`); lines.push(`R: ${f.respuesta}`); });
  }
  if (horariosText)   { lines.push(""); lines.push(horariosText); }
  if (pagosText)      { lines.push(""); lines.push(pagosText); }
  if (domiciliosText) { lines.push(""); lines.push(domiciliosText); }
  if (menuText)       { lines.push(""); lines.push(menuText); lines.push("IMPORTANTE: No inventes productos ni precios."); }

  const frases = cfg.frases as Record<string, string> | null | undefined;
  if (frases && Object.keys(frases).length) {
    const FRASE_LABELS: Record<string, string> = {
      apertura: "Saludo estándar", apertura_conocido: "Saludo cliente conocido",
      preguntar_tamano: "Preguntar tamaño", preguntar_destino: "Preguntar dirección",
      upsell: "Upsell / adiciones", confirmar_pago: "Confirmar método de pago",
      datos_nequi: "Datos Nequi", esperar_comprobante: "Esperar comprobante",
      aviso_despacho: "Aviso de despacho", pedido_listo_recoger: "Pedido listo para recoger",
      nombre_recibir: "Preguntar nombre", cierre: "Cierre", disculpa: "Disculpa",
      sin_cambios: "Sin cambios posibles", saturacion: "Saturación de pedidos",
      fuera_horario: "Fuera de horario", antes_horario: "Antes de abrir",
    };
    lines.push("");
    lines.push("FRASES EXACTAS A USAR (úsalas lo más fielmente posible):");
    for (const [key, text] of Object.entries(frases)) {
      if (text) lines.push(`- ${FRASE_LABELS[key] || key}: "${text}"`);
    }
  }

  const situaciones = cfg.situaciones as Record<string, string> | null | undefined;
  if (situaciones && Object.keys(situaciones).length) {
    lines.push("");
    lines.push("INSTRUCCIONES PARA SITUACIONES ESPECIALES:");
    const SIT_LABELS: Record<string, string> = {
      producto_agotado: "Producto agotado", saturacion_pedidos: "Saturación",
      cambio_pedido_confirmado: "Cambio de pedido ya confirmado", error_precio_propio: "Error de precio propio",
      nota_personal_pedido: "Nota personal en pedido", pago_mixto: "Pago mixto",
      lluvia: "Servicio con lluvia", rastreo_domiciliario: "Rastreo del domiciliario",
      tiempo_entrega: "Tiempo de entrega", productos_no_disponibles: "Productos no disponibles",
    };
    for (const [key, text] of Object.entries(situaciones)) {
      if (text) lines.push(`- ${SIT_LABELS[key] || key}: ${text}`);
    }
  }

  // Prohibiciones
  const prohibiciones = (cfg.prohibiciones as string[]) || [];
  lines.push("");
  lines.push("PROHIBICIONES ABSOLUTAS (nunca violar):");
  lines.push("- JAMÁS escribas el menú completo en texto. Si el cliente pide 'la carta' o 'el menú', el sistema ya envía las imágenes automáticamente — tú solo responde lo que el cliente preguntó.");
  lines.push("- NUNCA envíes respuestas extremadamente largas. Máximo 3-4 oraciones cortas por mensaje.");
  lines.push("- Responde EXACTAMENTE lo que el cliente preguntó, sin agregar información extra que no pidió.");
  for (const p of prohibiciones) {
    if (p) lines.push(`- ${p}`);
  }

  // ── TOMA DE PEDIDOS (solo cuando el restaurante puede recibir pedidos) ──
  const puedeTomarPedidos = isOpen || pedidosProg;
  if (puedeTomarPedidos) {
    lines.push("");
    lines.push("TOMA DE PEDIDOS — CREA EL PEDIDO EN EL SISTEMA:");
    lines.push("Para registrar un pedido en Cobra POS necesitas recopilar OBLIGATORIAMENTE estos 4 datos:");
    lines.push("  1. PRODUCTOS: nombre exacto + tamaño (Personal/Familiar/Unico/Litro/1.5 Litros) + tipo si aplica");
    lines.push("     → Tipo solo para: Premium y Maicitos Especial (opciones: Mixta, Carne, Pollo)");
    lines.push("  2. DESTINO: dirección exacta de domicilio (barrio + dirección) o 'para llevar'");
    lines.push("  3. PAGO: método de pago (efectivo, nequi, daviplata, etc.)");
    lines.push("  4. NOMBRE: nombre del cliente");
    lines.push("");
    lines.push("Flujo OBLIGATORIO:");
    lines.push("  a) Recoge los 4 datos a través de la conversación, preguntando lo que falte.");
    lines.push("     IMPORTANTE: pregunta primero QUÉ quiere pedir el cliente. Solo DESPUÉS de saber el producto, pregunta el tamaño si aplica. NUNCA preguntes el tamaño sin saber el producto.");
    lines.push("  b) Cuando los tengas todos, muestra un resumen y pide confirmación.");
    lines.push("     Ej: '¡Listo! Confirmemos tu pedido:\\n🍟 Premium Personal Mixta x1\\n📍 Calle 5 #3-20, Barrio El Parque\\n💳 Efectivo\\n👤 Juan\\n¿Todo correcto?'");
    lines.push("  c) Cuando el cliente confirme (sí, dale, correcto, confirmo, etc.), llama a la función");
    lines.push("     crear_pedido() con todos los datos. El campo 'mensaje' es lo que el cliente verá.");
    lines.push("");
    lines.push("  REGLAS de crear_pedido:");
    lines.push("  - Llámala SOLO cuando el cliente haya CONFIRMADO explícitamente (sí, correcto, dale, etc.).");
    lines.push("  - Nunca la llames si faltan datos o el cliente no ha confirmado.");
    lines.push("  - 'tamano' debe ser exactamente: Personal, Familiar, Unico, Litro, o 1.5 Litros.");
    lines.push("  - 'tipo' solo en Premium y Maicitos Especial (Mixta, Carne o Pollo). Omite para los demás.");
    lines.push("  - Si hay múltiples productos, inclúyelos todos en el array 'productos'.");
    lines.push("  - El campo 'mensaje' debe ser el texto de confirmación que le envías al cliente.");
  }

  lines.push("");
  lines.push("REGLAS:");
  lines.push("- Responde SOLO en español.");
  lines.push("- Sé conciso: máximo 3-4 oraciones por respuesta.");
  lines.push("- No inventes precios, horarios ni disponibilidad.");
  lines.push("- No menciones que eres una IA a menos que te lo pregunten.");

  // Instrucciones para múltiples mensajes simultáneos
  // Solo en modo sin tools (json_object); con tools activos el modelo responde en texto libre
  if (batchSize > 1 && !puedeTomarPedidos) {
    lines.push("");
    lines.push("MENSAJES MÚLTIPLES: El cliente envió varios mensajes seguidos. Cada uno tiene formato: [N] id:WAMID | texto");
    lines.push("Decide si responder con UN SOLO mensaje o con mensajes separados:");
    lines.push("");
    lines.push("USA UN SOLO MENSAJE cuando los mensajes juntos forman una idea continua:");
    lines.push("  → JSON: { \"type\": \"single\", \"responses\": [{ \"text\": \"tu respuesta\" }] }");
    lines.push("");
    lines.push("USA MENSAJES SEPARADOS solo cuando hay preguntas claramente distintas:");
    lines.push("  → JSON: { \"type\": \"multiple\", \"responses\": [{ \"quote_id\": \"WAMID_EXACTO\", \"text\": \"respuesta\" }, ...] }");
    lines.push("  Donde quote_id es el valor exacto después de 'id:' y antes de ' | ' en cada mensaje.");
    lines.push("");
    lines.push("IMPORTANTE: Devuelve ÚNICAMENTE el JSON, sin texto adicional. En caso de duda, agrupa en un solo mensaje.");
  } else if (batchSize > 1 && puedeTomarPedidos) {
    lines.push("");
    lines.push("MENSAJES MÚLTIPLES: El cliente envió varios mensajes seguidos. Responde a todos en un solo texto natural.");
  }

  return lines.join("\n");
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function sbGet(path: string): Promise<Array<Record<string, unknown>> | null> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) return null;
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
