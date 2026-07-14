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
  }

  return new Response("OK", { status: 200 });
});

async function processConversation(convId: string): Promise<void> {
  // 1. Leer la entrada de la cola
  const queueRes = await sbGet(`/rest/v1/chat_ai_queue?conversation_id=eq.${convId}&processed=eq.false&limit=1`);
  const entry = queueRes?.[0] as Record<string, unknown> | undefined;
  if (!entry) return; // ya procesado o no existe

  const fireAt = new Date(entry.fire_at as string).getTime();

  // 2. Esperar hasta fire_at (con chequeo por si se extendió)
  let attempts = 0;
  while (attempts < 10) {
    const now = Date.now();
    const remaining = fireAt - now;
    if (remaining > 0) {
      await sleep(Math.min(remaining + 200, 30_000)); // +200ms de margen
    }
    // Re-leer para ver si fire_at se extendió mientras dormíamos
    const freshRes = await sbGet(`/rest/v1/chat_ai_queue?conversation_id=eq.${convId}&processed=eq.false&limit=1`);
    const fresh = freshRes?.[0] as Record<string, unknown> | undefined;
    if (!fresh) return; // ya procesado por otra instancia
    const newFireAt = new Date(fresh.fire_at as string).getTime();
    if (newFireAt <= Date.now()) break; // es el momento
    // fire_at se extendió, volvemos a dormir
    attempts++;
  }

  // 3. Marcar como procesado (evitar doble ejecución)
  await sbPatch(`/rest/v1/chat_ai_queue?conversation_id=eq.${convId}&processed=eq.false`, { processed: true });

  // 4. Leer los mensajes del batch (desde batch_start)
  const batchStart = entry.batch_start as string;
  const branchId   = entry.branch_id as string;
  const tenantId   = entry.tenant_id as string;
  const fromPhone  = entry.from_phone as string;
  const phoneId    = entry.phone_id as string;
  const accessToken = entry.access_token as string;

  const msgsRes = await sbGet(
    `/rest/v1/chat_messages?conversation_id=eq.${convId}&direction=eq.in` +
    `&sent_at=gte.${encodeURIComponent(batchStart)}&order=sent_at.asc&select=id,body,external_id`
  );
  const batchMsgs = (msgsRes || []) as Array<{ id: string; body: string; external_id: string }>;

  if (!batchMsgs.length) {
    await setTyping(convId, false);
    return;
  }

  // 5. Leer config del asistente
  const cfgRes = await sbGet(`/rest/v1/ia_config?branch_id=eq.${branchId}&limit=1`);
  const cfg = cfgRes?.[0] as Record<string, unknown> | undefined;
  if (!cfg || !cfg.activo) {
    await setTyping(convId, false);
    return;
  }

  // 6. Historial previo (antes del batch)
  const histRes = await sbGet(
    `/rest/v1/chat_messages?conversation_id=eq.${convId}&sent_at=lt.${encodeURIComponent(batchStart)}` +
    `&order=sent_at.desc&limit=8&select=direction,body`
  );
  const history = ((histRes || []) as Array<{ direction: string; body: string }>).reverse();

  // 7. Cargar menú y horarios
  const menuText     = await buildMenuText(branchId);
  const horariosText = buildHorariosText(cfg.horarios as Record<string, unknown> | null | undefined);

  // 8. Nombre del remitente
  const convRes = await sbGet(`/rest/v1/chat_conversations?id=eq.${convId}&select=contact_name&limit=1`);
  const senderName = (convRes?.[0] as Record<string, string> | undefined)?.contact_name || fromPhone;

  // 9. Construir system prompt con instrucciones de agrupación
  const pagosText     = buildPagosText(cfg.pagos as Record<string, unknown> | null | undefined);
  const domiciliosText = buildDomiciliosText(cfg.domicilios as Record<string, unknown> | null | undefined);
  const systemPrompt  = buildSystemPrompt(cfg, senderName, menuText, horariosText, pagosText, domiciliosText, batchMsgs.length);

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
    // Múltiples mensajes: numerados con su external_id para que OpenAI pueda citarlos
    const combined = batchMsgs.map((m, i) => `[${i + 1}] id:${m.external_id} | ${m.body}`).join("\n");
    messages.push({ role: "user", content: combined });
  }

  // 11. Llamar a OpenAI — pedir JSON cuando hay múltiples mensajes
  const responseFormat = batchMsgs.length > 1
    ? { type: "json_object" }
    : undefined;

  const oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 600,
      temperature: 0.7,
      ...(responseFormat ? { response_format: responseFormat } : {}),
    }),
  });

  if (!oaiRes.ok) {
    console.error("OpenAI error:", await oaiRes.text());
    await setTyping(convId, false);
    return;
  }

  const oaiData = await oaiRes.json() as Record<string, unknown>;
  const rawReply = (((oaiData.choices as Array<Record<string,unknown>>)?.[0]
    ?.message as Record<string,unknown>)?.content as string || "").trim();

  if (!rawReply) {
    await setTyping(convId, false);
    return;
  }

  // 12. Detectar marcador [PAGO_QR] — enviar imagen QR antes de parsear
  const pagoQrConfig = cfg.pagos as Record<string, unknown> | null | undefined;
  const qrImageUrl   = (pagoQrConfig?.qr_imagen_url as string) || "";
  const qrTexto      = (pagoQrConfig?.qr_texto      as string) || "";
  const hasPagoQr    = rawReply.includes("[PAGO_QR]") && qrImageUrl;

  // Limpiar marcador del texto que se enviará al cliente
  const cleanReply = rawReply.replace(/\[PAGO_QR\]/g, "").trim();

  if (hasPagoQr) {
    // Marcar conversación como pago pendiente
    await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { pago_pendiente: true });
    // Enviar imagen QR con el texto configurado como caption
    const waImgBody = {
      messaging_product: "whatsapp",
      to: fromPhone,
      recipient_type: "individual",
      type: "image",
      image: { link: qrImageUrl, caption: qrTexto || undefined },
    };
    const waImgRes = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(waImgBody),
    });
    if (waImgRes.ok) {
      const waSentImg = await waImgRes.json() as Record<string, unknown>;
      const sentImgId = ((waSentImg.messages as Array<Record<string,unknown>>)?.[0]?.id as string) || "";
      await sbPost(`/rest/v1/chat_messages`, {
        conversation_id: convId, tenant_id: tenantId,
        direction: "out", body: qrTexto || "[Imagen QR de pago]",
        media_url: qrImageUrl, media_type: "image",
        delivery_status: "sent", external_id: sentImgId || null,
        sent_at: new Date().toISOString(),
      });
    } else {
      console.error("QR image send error:", await waImgRes.text());
    }
    await sleep(400);
  }

  // 13. Parsear respuesta
  type RespItem = { quote_id?: string; text: string };
  let responses: RespItem[] = [];

  if (batchMsgs.length > 1) {
    try {
      const parsed = JSON.parse(cleanReply) as { type?: string; responses?: RespItem[] };
      if (parsed.responses && Array.isArray(parsed.responses)) {
        responses = parsed.responses;
      } else {
        responses = [{ text: cleanReply }];
      }
    } catch {
      responses = [{ text: cleanReply }];
    }
  } else {
    responses = [{ text: cleanReply }];
  }

  // 13. Enviar respuesta(s) por WhatsApp y guardar en DB
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

    // Citar el mensaje original si aplica
    if (resp.quote_id) {
      waBody.context = { message_id: resp.quote_id };
    }

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

    // Pequeña pausa entre mensajes múltiples para que lleguen en orden
    if (responses.length > 1) await sleep(400);
  }

  // 14. Actualizar conversación y apagar typing
  const lastText = responses[responses.length - 1]?.text || "";
  await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
    last_message: lastText,
    last_message_at: new Date().toISOString(),
    last_sender: "agent",
    last_read: false,
    ai_typing: false,
  });
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
    `&select=name,price,description,price_mode,presentations,category_id(name)&order=sort_order`
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
      const validPres = pres.filter(p => p.price > 0);
      let priceStr: string;
      if (validPres.length > 1) priceStr = validPres.map(p => `${p.name} ${fmtPrice(p.price)}`).join(" / ");
      else if (validPres.length === 1) priceStr = fmtPrice(validPres[0].price);
      else priceStr = fmtPrice(Number(item.price) || 0);
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
  const nowCol = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const todayIdx = nowCol.getUTCDay();
  const colDayKey = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"][todayIdx];
  const colHHMM = nowCol.getUTCHours().toString().padStart(2,"0") + ":" + nowCol.getUTCMinutes().toString().padStart(2,"0");
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
  if (pagos.efectivo)   metodos.push("Efectivo");
  if (pagos.nequi)      metodos.push("Nequi");
  if (pagos.daviplata)  metodos.push("Daviplata");
  if (pagos.tarjeta)    metodos.push("Tarjeta");
  if (!metodos.length)  return "";
  const lines: string[] = ["MÉTODOS DE PAGO:"];
  lines.push(`- Aceptamos: ${metodos.join(", ")}`);
  if ((pagos.nequi || pagos.daviplata) && pagos.llave) {
    lines.push(`- Llave/número de pago digital: ${pagos.llave}`);
    if (pagos.titular) lines.push(`- Titular: ${pagos.titular}`);
  }
  if (pagos.esperar_comprobante) {
    if (pagos.qr_imagen_url) {
      lines.push("- Para pagos por Nequi/transferencia: cuando el cliente confirme su pedido y elija pagar digital, incluye exactamente [PAGO_QR] al FINAL de tu respuesta. El sistema enviará automáticamente la imagen de pago. No expliques al cliente que existe ese código.");
    } else {
      lines.push("- Para pagos digitales, pedimos el comprobante de transferencia.");
    }
  }
  if (pagos.nota) lines.push(`- ${pagos.nota}`);
  return lines.join("\n");
}

function buildDomiciliosText(domicilios: Record<string, unknown> | null | undefined): string {
  if (!domicilios) return "";
  const lines: string[] = [];
  const activo = domicilios.activo !== false;
  if (!activo) {
    lines.push("DOMICILIOS: Por el momento no manejamos servicio a domicilio.");
    if (domicilios.para_llevar !== false) {
      lines.push("Sin embargo, puedes pasar a recoger tu pedido (para llevar).");
    }
    return lines.join("\n");
  }
  lines.push("DOMICILIOS Y COBERTURA:");
  if (domicilios.tiempo_estimado) lines.push(`- Tiempo estimado de entrega: ${domicilios.tiempo_estimado}`);
  if (domicilios.para_llevar !== false) lines.push("- También manejamos pedidos para recoger (para llevar).");
  const zonas = (domicilios.zonas as Array<{ nombre: string; precio: number }>) || [];
  if (zonas.length) {
    lines.push("- Zonas de cobertura y costo de domicilio:");
    for (const z of zonas) {
      const precio = z.precio ? `$${Math.round(z.precio).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}` : "Gratis";
      lines.push(`  • ${z.nombre}: ${precio}`);
    }
  }
  return lines.join("\n");
}

function formatHora12(hora24: string): string {
  const parts = hora24.split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || "0", 10);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`;
}

function resolveFaqVars(text: string, horarios: Record<string, unknown> | null | undefined): string {
  if (!horarios || !text) return text;
  const diasEs = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"];
  const hoy = diasEs[new Date().getDay()];
  const hoyH = horarios[hoy] as Record<string, string> | undefined;
  // Get the most common open/close (first non-null entry)
  const entry = Object.values(horarios).find((v) => v && (v as Record<string,string>).abre) as Record<string,string> | undefined;
  const abreGen  = entry?.abre  || "";
  const cierraGen = entry?.cierra || "";
  const horarioHoy = hoyH?.abre
    ? `${formatHora12(hoyH.abre)} a ${formatHora12(hoyH.cierra)}`
    : "cerrado hoy";
  return text
    .replace(/\{hora_apertura\}/g, abreGen ? formatHora12(abreGen) : "")
    .replace(/\{hora_cierre\}/g,   cierraGen ? formatHora12(cierraGen) : "")
    .replace(/\{horario_hoy\}/g,   horarioHoy)
    .replace(/\{dia_hoy\}/g,       hoy);
}

function buildSystemPrompt(
  cfg: Record<string, unknown>,
  senderName: string,
  menuText: string,
  horariosText: string,
  pagosText: string,
  domiciliosText: string,
  batchSize: number
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
    `Eres ${botName}, el asistente virtual de este restaurante. El cliente se llama ${senderName}.`,
    "",
    `TONO: ${tonoDesc[tono] || tonoDesc.cercano}`,
    "",
  ];
  if (cfg.instrucciones) { lines.push("INSTRUCCIONES:"); lines.push(cfg.instrucciones as string); lines.push(""); }
  if (cfg.negocio)       { lines.push("INFORMACIÓN DEL NEGOCIO:"); lines.push(cfg.negocio as string); lines.push(""); }
  if (Array.isArray(vocab.usar) && (vocab.usar as string[]).length)
    lines.push(`VOCABULARIO PREFERIDO: ${(vocab.usar as string[]).join(", ")}`);
  if (vocab.evitar) lines.push(`PALABRAS A EVITAR: ${vocab.evitar}`);
  const horarios = cfg.horarios as Record<string, unknown> | null | undefined;
  if (faqs.length) {
    lines.push(""); lines.push("PREGUNTAS FRECUENTES:");
    faqs.forEach(f => {
      lines.push(`P: ${f.pregunta}`);
      lines.push(`R: ${resolveFaqVars(f.respuesta, horarios)}`);
    });
  }
  if (horariosText)    { lines.push(""); lines.push(horariosText); }
  if (pagosText)       { lines.push(""); lines.push(pagosText); }
  if (domiciliosText)  { lines.push(""); lines.push(domiciliosText); }
  if (menuText)        { lines.push(""); lines.push(menuText); lines.push("IMPORTANTE: No inventes productos ni precios."); }

  const frases = cfg.frases as Record<string, string> | null | undefined;
  if (frases && Object.keys(frases).length) {
    const FRASE_LABELS: Record<string, string> = {
      apertura: "Saludo estándar",
      apertura_conocido: "Saludo cliente conocido",
      preguntar_tamano: "Preguntar tamaño",
      preguntar_destino: "Preguntar dirección",
      upsell: "Upsell / adiciones",
      confirmar_pago: "Confirmar método de pago",
      datos_nequi: "Datos Nequi",
      esperar_comprobante: "Esperar comprobante",
      aviso_despacho: "Aviso de despacho",
      pedido_listo_recoger: "Pedido listo para recoger",
      nombre_recibir: "Preguntar nombre",
      cierre: "Cierre",
      disculpa: "Disculpa",
      sin_cambios: "Sin cambios posibles",
      saturacion: "Saturación de pedidos",
      fuera_horario: "Fuera de horario",
      antes_horario: "Antes de abrir",
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
      producto_agotado: "Producto agotado",
      saturacion_pedidos: "Saturación",
      cambio_pedido_confirmado: "Cambio de pedido ya confirmado",
      error_precio_propio: "Error de precio propio",
      nota_personal_pedido: "Nota personal en pedido",
      pago_mixto: "Pago mixto",
      lluvia: "Servicio con lluvia",
      rastreo_domiciliario: "Rastreo del domiciliario",
      tiempo_entrega: "Tiempo de entrega",
      productos_no_disponibles: "Productos no disponibles",
    };
    for (const [key, text] of Object.entries(situaciones)) {
      if (text) lines.push(`- ${SIT_LABELS[key] || key}: ${text}`);
    }
  }

  lines.push("");
  lines.push("REGLAS:");
  lines.push("- Responde SOLO en español.");
  lines.push("- Sé conciso: máximo 3-4 oraciones por respuesta.");
  lines.push("- No inventes precios, horarios ni disponibilidad.");
  lines.push("- No menciones que eres una IA a menos que te lo pregunten.");

  // Instrucciones de agrupación para múltiples mensajes
  if (batchSize > 1) {
    lines.push("");
    lines.push("MENSAJES MÚLTIPLES: El cliente envió varios mensajes seguidos. Cada uno tiene formato: [N] id:WAMID | texto");
    lines.push("Decide si responder con UN SOLO mensaje o con mensajes separados:");
    lines.push("");
    lines.push("USA UN SOLO MENSAJE cuando los mensajes juntos forman una idea continua o una misma conversación:");
    lines.push("  Ej: 'Muchas gracias' + 'mañana' + 'pedire a esa hora' → una sola idea, responde una vez.");
    lines.push("  Ej: 'Hola' + 'quería saber' + 'si tienen pizza' → una pregunta dividida, responde una vez.");
    lines.push("  Ej: 'Gracias' + 'hasta luego' → despedida, responde una vez.");
    lines.push("  → JSON: { \"type\": \"single\", \"responses\": [{ \"text\": \"tu respuesta\" }] }");
    lines.push("");
    lines.push("USA MENSAJES SEPARADOS solo cuando hay preguntas claramente distintas que necesitan respuestas independientes:");
    lines.push("  Ej: '¿Tienen pizza?' + '¿Cuál es el horario?' → dos preguntas distintas, responde cada una.");
    lines.push("  Ej: '¿Cuánto vale la hamburguesa?' + '¿Tienen domicilio?' → dos consultas distintas.");
    lines.push("  → JSON: { \"type\": \"multiple\", \"responses\": [{ \"quote_id\": \"WAMID_EXACTO\", \"text\": \"respuesta\" }, ...] }");
    lines.push("  Donde quote_id es el valor exacto después de 'id:' y antes de ' | ' en cada mensaje.");
    lines.push("");
    lines.push("IMPORTANTE: Devuelve ÚNICAMENTE el JSON, sin texto adicional. En caso de duda, agrupa en un solo mensaje.");
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
