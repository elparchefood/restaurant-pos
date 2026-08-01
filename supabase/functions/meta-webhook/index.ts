const VERIFY_TOKEN = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY   = Deno.env.get("OPENAI_API_KEY")!;
const STORAGE_BUCKET = "chat-media";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // ── GET: Meta webhook verification or diagnostics ────────────────────────────
  if (req.method === "GET") {
    const url   = new URL(req.url);
    const mode  = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200 });
    }
    // (endpoint de diagnóstico ?debug=1 ELIMINADO — exponía config sin autenticación)
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return new Response("OK", { status: 200 }); }

  try {
    const object = body.object as string;

    if (object === "whatsapp_business_account") {
      const entries = (body.entry as Array<Record<string, unknown>>) || [];

      for (const entry of entries) {
        const wabaId  = entry.id as string;
        const changes = (entry.changes as Array<Record<string, unknown>>) || [];

        for (const change of changes) {
          if (change.field !== "messages") continue;
          const value    = change.value as Record<string, unknown>;
          const messages = (value.messages as Array<Record<string, unknown>>) || [];
          const contacts = (value.contacts as Array<Record<string, unknown>>) || [];

          // phone_number_id viene en el payload de Meta (no hay que buscarlo en DB)
          const phoneMeta  = (value.metadata as Record<string, string>) || {};
          const phoneId    = phoneMeta.phone_number_id || "";

          if (!messages.length) continue;

          // Buscar canal por waba_id
          const chRes = await sbGet(`/rest/v1/chat_channels?channel=eq.whatsapp&select=id,tenant_id,branch_id,meta&limit=100`);
          const channels: Array<Record<string, unknown>> = chRes || [];
          const channel = channels.find((c) => {
            let m = c.meta as Record<string, unknown> | string || {};
            if (typeof m === "string") { try { m = JSON.parse(m); } catch { m = {}; } }
            return (m as Record<string, unknown>).waba_id === wabaId;
          });
          if (!channel) continue;

          let channelMeta: Record<string, string> = {};
          const rawMeta = channel.meta;
          if (typeof rawMeta === "string") { try { channelMeta = JSON.parse(rawMeta); } catch { /* */ } }
          else if (rawMeta && typeof rawMeta === "object") { channelMeta = rawMeta as Record<string, string>; }
          const accessToken = channelMeta.access_token || "";

          const { tenant_id, branch_id, id: channel_id } = channel;

          // Números de gerente (rama admin de inventario por WhatsApp).
          let gerentes: string[] = [];
          try {
            const cfgG = await sbGet(`/rest/v1/ia_config?branch_id=eq.${branch_id}&select=numeros_gerentes&limit=1`);
            const arr = cfgG?.[0]?.numeros_gerentes;
            if (Array.isArray(arr)) gerentes = (arr as unknown[]).map((x) => String(x).replace(/\D/g, "")).filter(Boolean);
          } catch { /* sin config, sin gerentes */ }

          for (const msg of messages) {
            const fromPhone  = msg.from as string;
            const externalId = msg.id as string;
            const msgType    = msg.type as string;

            let bodyText = "";
            let mediaUrl: string | null = null;
            let mediaType: string | null = null;

            if (msgType === "text") {
              bodyText = ((msg.text as Record<string, unknown>)?.body as string) || "";

            } else if (["sticker", "image", "video", "audio", "document"].includes(msgType)) {
              const mediaObj = (msg[msgType] as Record<string, unknown>) || {};
              const mediaId  = mediaObj.id as string;
              const caption  = (mediaObj.caption as string) || "";
              const filename = (mediaObj.filename as string) || "";
              bodyText = caption || (filename ? `[${filename}]` : `[${msgType}]`);
              mediaType = msgType;
              if (mediaId && accessToken) {
                mediaUrl = await downloadAndStoreMedia(mediaId, accessToken, externalId, msgType);
              }
            } else {
              bodyText = `[${msgType}]`;
            }

            // ── REACCIONES ──────────────────────────────────────────────
            // Una reacción NO es un mensaje: es un emoji que se pega al mensaje
            // al que reaccionaron. Antes caía en el else de arriba y se guardaba
            // como "[reaction]" (se perdía el emoji y a qué mensaje apuntaba).
            // Ahora se escribe en la columna 'reaction' del mensaje objetivo.
            // Quitar la reacción en WhatsApp llega con emoji vacío → null.
            if (msgType === "reaction") {
              const rx       = (msg.reaction as Record<string, unknown>) || {};
              const targetId = String(rx.message_id || "");
              const emoji    = String(rx.emoji || "");
              if (targetId) {
                await sbPatch(
                  `/rest/v1/chat_messages?external_id=eq.${encodeURIComponent(targetId)}`,
                  { reaction: emoji || null },
                );
              }
              continue;  // no crea mensaje, no marca no-leído y no dispara el bot
            }

            // ── RAMA DE GERENTE: inventario por WhatsApp (NO es cliente) ──
            const fromDigits = String(fromPhone).replace(/\D/g, "");
            const esGerente = gerentes.some((g) => g && fromDigits && (g === fromDigits || g.slice(-10) === fromDigits.slice(-10)));
            if (esGerente) {
              // Dedup ANTES de procesar (evita doble suma si Meta reenvía el webhook)
              const dupG = await sbGet(`/rest/v1/pos_gerente_procesados?external_id=eq.${encodeURIComponent(externalId)}&limit=1`);
              if (dupG?.length) continue;
              await sbPost(`/rest/v1/pos_gerente_procesados`, { external_id: externalId });

              let reply = "";
              // ── FOTO DE FACTURA: la lee y propone reponer el inventario ──
              if (msgType === "image" && mediaUrl) {
                try {
                  const fr = await fetch(`${SUPABASE_URL}/functions/v1/factura-inventario`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_KEY}` },
                    body: JSON.stringify({ branch_id, phone: fromPhone, media_url: mediaUrl }),
                  });
                  const fd = await fr.json();
                  reply = fd.reply || "No pude leer esa factura 🤔.";
                } catch (e) { console.error("factura-inventario:", e); reply = "Hubo un error leyendo la factura."; }
              } else if (msgType === "text" && bodyText) {
                // Si hay una factura esperando confirmación, el texto es para ella
                // (un "sí" o un "la manguera es salchicha"), no para el inventario
                // por texto. La función avisa con sin_factura si no hay ninguna.
                try {
                  const fr = await fetch(`${SUPABASE_URL}/functions/v1/factura-inventario`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_KEY}` },
                    body: JSON.stringify({ branch_id, phone: fromPhone, message: bodyText }),
                  });
                  const fd = await fr.json();
                  if (fd.reply) reply = fd.reply;
                } catch (_e) { /* si falla, sigue el flujo normal de texto */ }
              }
              if (!reply && msgType === "text" && bodyText) {
                try {
                  const gr = await fetch(`${SUPABASE_URL}/functions/v1/gerente-inventario`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_KEY}` },
                    body: JSON.stringify({ branch_id, message: bodyText, phone: fromPhone }),
                  });
                  const gd = await gr.json();
                  reply = gd.reply || "No pude procesar eso 🤔.";
                } catch (e) { console.error("gerente-inventario:", e); reply = "Hubo un error procesando el inventario."; }
              } else {
                reply = "👋 Hola. Por ahora solo entiendo *texto* para el inventario. Ej: “hay 3 kilos de carne” o “compré 2 pacas de gaseosa a 30 mil”.";
              }
              if (phoneId && accessToken) {
                try {
                  await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ messaging_product: "whatsapp", to: fromPhone, type: "text", text: { body: reply } }),
                  });
                } catch (e) { console.error("WA send gerente:", e); }
              }
              continue; // no crear conversación de cliente ni disparar el bot
            }

            const contact    = contacts.find((c) => c.wa_id === fromPhone);
            const senderName = ((contact?.profile as Record<string,unknown>)?.name as string) || ("+" + fromPhone);

            // Upsert conversación
            const convRes = await sbGet(
              `/rest/v1/chat_conversations?branch_id=eq.${branch_id}&contact_handle=eq.${encodeURIComponent(fromPhone)}&channel=eq.whatsapp&select=id,unread_count&limit=1`
            );
            let convId: string;
            let unread = 0;

            if (convRes?.length) {
              convId = convRes[0].id as string;
              unread = (convRes[0].unread_count as number) || 0;
            } else {
              const avatarTint = Math.floor(Math.random() * 8) + 1;
              const newConvRes = await sbPost(`/rest/v1/chat_conversations`, {
                tenant_id, branch_id, channel: "whatsapp", channel_id,
                contact_name: senderName, contact_handle: fromPhone,
                contact_avatar_tint: avatarTint, status: "open", unread_count: 0,
                last_message: bodyText, last_message_at: new Date().toISOString(),
                last_sender: "contact", last_read: false,
              }, "return=representation");
              convId = newConvRes?.[0]?.id as string;
            }
            if (!convId) continue;

            // Dedup
            const dupCheck = await sbGet(`/rest/v1/chat_messages?external_id=eq.${encodeURIComponent(externalId)}&limit=1`);
            if (dupCheck?.length) continue;

            // Guardar mensaje entrante
            await sbPost(`/rest/v1/chat_messages`, {
              conversation_id: convId, tenant_id,
              direction: "in", origen: "cliente", body: bodyText,
              media_url: mediaUrl, media_type: mediaType,
              delivery_status: "delivered", external_id: externalId,
              sent_at: new Date(parseInt(msg.timestamp as string) * 1000).toISOString(),
            });

            await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
              last_message: bodyText, last_message_at: new Date().toISOString(),
              last_sender: "contact", last_read: false,
              unread_count: unread + 1, contact_name: senderName,
            });

            // ── Encolar respuesta IA (texto o AUDIO — el bot transcribe las notas
            // de voz con Whisper en delay-reply) o verificar transferencia (imagen) ──
            if (((msgType === "text" && bodyText) || msgType === "audio") && phoneId && accessToken) {
              const msgSentAt = new Date(parseInt(msg.timestamp as string) * 1000).toISOString();
              await queueAiReply({
                branchId: branch_id as string,
                tenantId: tenant_id as string,
                convId,
                fromPhone,
                phoneId,
                accessToken,
                msgSentAt,
              });
            } else if (msgType === "image" && mediaUrl) {
              // Si hay pago pendiente y llega imagen, es el comprobante → verificar
              const convDetail = await sbGet(`/rest/v1/chat_conversations?id=eq.${convId}&select=pago_pendiente&limit=1`);
              const pagoPendiente = convDetail?.[0]?.pago_pendiente as boolean | undefined;
              if (pagoPendiente) {
                const VERIFY_URL = `${SUPABASE_URL}/functions/v1/verify-transfer`;
                fetch(VERIFY_URL, {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${SUPABASE_KEY}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ conversation_id: convId }),
                }).catch((e) => console.error("verify-transfer launch error:", e));
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("meta-webhook error:", err);
  }

  return new Response("OK", { status: 200 });
});

// ── Cola de respuesta IA ──────────────────────────────────────────────────────

const DELAY_REPLY_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/delay-reply`;

interface QueueOpts {
  branchId: string; tenantId: string; convId: string;
  fromPhone: string; phoneId: string; accessToken: string;
  msgSentAt: string;
}

async function queueAiReply(opts: QueueOpts): Promise<void> {
  const { branchId, tenantId, convId, fromPhone, phoneId, accessToken, msgSentAt } = opts;
  try {
    // Leer delay configurado (default 5 seg)
    const cfgRes = await sbGet(`/rest/v1/ia_config?branch_id=eq.${branchId}&select=activo,delay_segundos&limit=1`);
    const cfg = cfgRes?.[0] as Record<string, unknown> | undefined;
    if (!cfg || !cfg.activo) return;
    const delaySec = Math.max(1, Math.min(30, Number(cfg.delay_segundos) || 5));
    const fireAt = new Date(Date.now() + delaySec * 1000).toISOString();

    // Upsert en la cola — si ya existe, solo actualiza fire_at (extiende el timer)
    const existRes = await sbGet(`/rest/v1/chat_ai_queue?conversation_id=eq.${convId}&processed=eq.false&limit=1`);
    const isNew = !existRes?.length;

    if (isNew) {
      // Eliminar filas ya procesadas (la restricción UNIQUE bloquea nuevas inserciones)
      await sbDelete(`/rest/v1/chat_ai_queue?conversation_id=eq.${convId}&processed=eq.true`);
      await sbPost(`/rest/v1/chat_ai_queue`, {
        conversation_id: convId, branch_id: branchId, tenant_id: tenantId,
        from_phone: fromPhone, phone_id: phoneId, access_token: accessToken,
        batch_start: msgSentAt, fire_at: fireAt, processed: false,
      }, "return=minimal");
    } else {
      // Extender fire_at para incluir este nuevo mensaje en el batch
      await sbPatch(`/rest/v1/chat_ai_queue?conversation_id=eq.${convId}&processed=eq.false`, { fire_at: fireAt });
    }

    // Mostrar indicador de escritura en Cobra
    await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, { ai_typing: true });

    // Lanzar delay-reply en segundo plano solo si es el primer mensaje del batch
    if (isNew) {
      fetch(DELAY_REPLY_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ convId }),
      }).catch((e) => console.error("delay-reply launch error:", e));
    }
  } catch (err) {
    console.error("queueAiReply error:", err);
  }
}

// ── Auto-respuesta con OpenAI ──────────────────────────────────────────────────

interface AiReplyOpts {
  branchId: string;
  tenantId: string;
  convId: string;
  fromPhone: string;
  userText: string;
  senderName: string;
  phoneId: string;
  accessToken: string;
}

async function tryAiReply(opts: AiReplyOpts): Promise<void> {
  const { branchId, tenantId, convId, fromPhone, userText, senderName, phoneId, accessToken } = opts;

  try {
    // 1. Leer config del bot para este branch
    const cfgRes = await sbGet(`/rest/v1/ia_config?branch_id=eq.${branchId}&limit=1`);
    const cfg = cfgRes?.[0] as Record<string, unknown> | undefined;
    if (!cfg || !cfg.activo) return;   // bot apagado globalmente → no responder

    // 2. Últimos 10 mensajes de la conversación (contexto)
    const histRes = await sbGet(
      `/rest/v1/chat_messages?conversation_id=eq.${convId}&order=sent_at.desc&limit=10&select=direction,body`
    );
    const history = (histRes || []).reverse() as Array<{ direction: string; body: string }>;

    // 3. Cargar menu del restaurante, horarios y construir system prompt
    const menuText     = await buildMenuText(branchId);
    const horariosText = buildHorariosText(cfg.horarios as Record<string, unknown> | null | undefined);
    const systemPrompt = buildSystemPrompt(cfg, senderName, menuText, horariosText);

    // 4. Armar mensajes para OpenAI
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
    ];
    for (const h of history.slice(0, -1)) {  // excluir el mensaje actual (ya está en userText)
      if (h.body) {
        messages.push({ role: h.direction === "in" ? "user" : "assistant", content: h.body });
      }
    }
    messages.push({ role: "user", content: userText });

    // 5. Llamar a OpenAI
    const oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_KEY}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 350,
        temperature: 0.7,
      }),
    });
    if (!oaiRes.ok) {
      console.error("OpenAI error:", await oaiRes.text());
      return;
    }
    const oaiData = await oaiRes.json() as Record<string, unknown>;
    const reply = (((oaiData.choices as Array<Record<string,unknown>>)?.[0]
      ?.message as Record<string,unknown>)?.content as string || "").trim();

    if (!reply) return;

    // 6. Enviar respuesta por WhatsApp
    const waRes2 = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: fromPhone,
        recipient_type: "individual",
        type: "text",
        text: { body: reply },
      }),
    });
    if (!waRes2.ok) { console.error("WhatsApp send error:", await waRes2.text()); return; }
    const waSent = await waRes2.json() as Record<string, unknown>;
    const sentId = ((waSent.messages as Array<Record<string,unknown>>)?.[0]?.id as string) || "";

    // 7. Guardar mensaje saliente en DB
    await sbPost(`/rest/v1/chat_messages`, {
      conversation_id: convId,
      tenant_id: tenantId,
      direction: "out", origen: "bot",
      body: reply,
      delivery_status: "sent",
      external_id: sentId || null,
      sent_at: new Date().toISOString(),
    });

    await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
      last_message: reply,
      last_message_at: new Date().toISOString(),
      last_sender: "agent",
      last_read: false,
    });

  } catch (err) {
    console.error("tryAiReply error:", err);
  }
}

// -- Menu del restaurante -------------------------------------------------

function fmtPrice(n: number): string {
  return "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

async function buildMenuText(branchId: string): Promise<string> {
  const rows = await sbGet(
    `/rest/v1/pos_products?branch_id=eq.${branchId}&available=eq.true` +
    `&select=name,price,description,price_mode,presentations,category_id(name)` +
    `&order=sort_order`
  ) as Array<Record<string, unknown>> | null;

  if (!rows || !rows.length) return "";

  // Group by category
  const byCategory: Record<string, Array<Record<string, unknown>>> = {};
  for (const p of rows) {
    const cat = ((p.category_id as Record<string,string>)?.name) || "General";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(p);
  }

  const lines: string[] = ["CARTA DEL RESTAURANTE (productos disponibles con precios actuales):"];
  for (const [cat, items] of Object.entries(byCategory)) {
    lines.push(`
[${cat.toUpperCase()}]`);
    for (const item of items) {
      const pres = (item.presentations as Array<{name:string;price:number}>) || [];
      const validPres = pres.filter(p => p.price > 0);
      let priceStr: string;
      if (validPres.length > 1) {
        priceStr = validPres.map(p => `${p.name} ${fmtPrice(p.price)}`).join(" / ");
      } else if (validPres.length === 1) {
        priceStr = fmtPrice(validPres[0].price);
      } else {
        priceStr = fmtPrice(Number(item.price) || 0);
      }
      let line = `- ${item.name}: ${priceStr}`;
      if (item.description) line += ` — ${item.description}`;
      lines.push(line);
    }
  }
  return lines.join("\n");
}

// ── Construcción del system prompt ────────────────────────────────────────────

function buildHorariosText(horarios: Record<string, unknown> | null | undefined): string {
  if (!horarios) return "";

  const DAYS: Array<[string, string]> = [
    ["lunes","Lunes"], ["martes","Martes"], ["miercoles","Miércoles"],
    ["jueves","Jueves"], ["viernes","Viernes"], ["sabado","Sábado"], ["domingo","Domingo"],
  ];

  // Hora actual en Colombia (UTC-5)
  const nowCol = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const todayIdx = nowCol.getUTCDay(); // 0=Dom,1=Lun,...,6=Sab
  const colDayKey = ["domingo","lunes","martes","miercoles","jueves","viernes","sabado"][todayIdx];
  const colHHMM = nowCol.getUTCHours().toString().padStart(2,"0") + ":" +
                  nowCol.getUTCMinutes().toString().padStart(2,"0");

  const lines: string[] = ["HORARIOS DE ATENCIÓN:"];
  let estaAbiertoAhora = false;

  for (const [key, label] of DAYS) {
    const d = horarios[key] as Record<string,unknown> | undefined;
    if (!d || !d.activo) {
      lines.push(`- ${label}: Cerrado`);
    } else {
      const abre   = (d.abre   as string) || "00:00";
      const cierra = (d.cierra as string) || "23:59";
      lines.push(`- ${label}: ${abre} – ${cierra}`);
      if (key === colDayKey && colHHMM >= abre && colHHMM <= cierra) {
        estaAbiertoAhora = true;
      }
    }
  }

  lines.push("");
  if (estaAbiertoAhora) {
    lines.push(`ESTADO ACTUAL: El restaurante está ABIERTO ahora mismo (${colHHMM} hora Colombia).`);
  } else {
    const todayData = horarios[colDayKey] as Record<string,unknown> | undefined;
    if (!todayData || !todayData.activo) {
      lines.push(`ESTADO ACTUAL: El restaurante está CERRADO hoy (${DAYS[todayIdx][1]}). No atiende este día.`);
    } else {
      const abre   = (todayData.abre   as string) || "";
      const cierra = (todayData.cierra as string) || "";
      if (colHHMM < abre) {
        lines.push(`ESTADO ACTUAL: El restaurante aún no ha abierto hoy. Abre a las ${abre}.`);
      } else {
        lines.push(`ESTADO ACTUAL: El restaurante ya cerró por hoy. Cerró a las ${cierra}.`);
      }
    }
  }

  return lines.join("\n");
}

function buildSystemPrompt(cfg: Record<string, unknown>, senderName: string, menuText = "", horariosText = ""): string {
  const perfil  = (cfg.perfil  as Record<string,string>) || {};
  const vocab   = (cfg.vocabulario as Record<string,unknown>) || {};
  const faqs    = (cfg.faq as Array<Record<string,string>>) || [];
  const tono    = (cfg.tono as string) || "cercano";

  const tonoDesc: Record<string, string> = {
    cercano: "Usa un tono amigable y cercano, como si hablaras con un amigo. Puedes usar emojis con moderación.",
    neutral: "Responde de forma clara y directa. Sin emojis.",
    formal:  "Mantén un tono formal y profesional en todo momento. Evita los emojis.",
  };

  const botName = perfil.nombre || "Asistente";
  const lines: string[] = [
    `Eres ${botName}, el asistente virtual de este restaurante. El cliente se llama ${senderName}.`,
    "",
    `TONO: ${tonoDesc[tono] || tonoDesc.cercano}`,
    "",
  ];

  if (cfg.instrucciones) {
    lines.push("INSTRUCCIONES ESPECÍFICAS:");
    lines.push(cfg.instrucciones as string);
    lines.push("");
  }

  if (cfg.negocio) {
    lines.push("INFORMACIÓN DEL NEGOCIO (fuente de verdad — úsala para responder):");
    lines.push(cfg.negocio as string);
    lines.push("");
  }

  if (Array.isArray(vocab.usar) && (vocab.usar as string[]).length) {
    lines.push(`VOCABULARIO PREFERIDO: ${(vocab.usar as string[]).join(", ")}`);
  }
  if (vocab.evitar) {
    lines.push(`PALABRAS A EVITAR: ${vocab.evitar}`);
  }

  if (faqs.length) {
    lines.push("");
    lines.push("PREGUNTAS FRECUENTES (responde así cuando aplique):");
    faqs.forEach((f) => {
      lines.push(`P: ${f.pregunta}`);
      lines.push(`R: ${f.respuesta}`);
    });
  }

  if (horariosText) {
    lines.push("");
    lines.push(horariosText);
    lines.push("IMPORTANTE: Usa esta información para responder cualquier pregunta sobre horarios o si el restaurante está abierto.");
  }

  if (menuText) {
    lines.push("");
    lines.push(menuText);
    lines.push("IMPORTANTE: Los productos y precios anteriores son los únicos disponibles. No inventes productos ni precios que no estén en esa lista.");
  }

  lines.push("");
  lines.push("REGLAS:");
  lines.push("- Responde SOLO en español.");
  lines.push("- Sé conciso: máximo 3-4 oraciones por respuesta.");
  lines.push("- Si no sabes algo con certeza, di que lo verificarás.");
  lines.push("- No inventes precios, horarios ni disponibilidad de productos.");
  lines.push("- No menciones que eres una IA a menos que te lo pregunten directamente.");

  return lines.join("\n");
}

// ── Media: descarga de Meta, sube a Supabase Storage ─────────────────────────

async function downloadAndStoreMedia(
  mediaId: string,
  accessToken: string,
  externalId: string,
  mediaType: string
): Promise<string | null> {
  try {
    const metaRes = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });
    if (!metaRes.ok) { console.error("meta media info error", await metaRes.text()); return null; }
    const metaData = await metaRes.json() as Record<string, string>;
    const downloadUrl = metaData.url;
    const mimeType    = metaData.mime_type || "application/octet-stream";

    const fileRes = await fetch(downloadUrl, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });
    if (!fileRes.ok) { console.error("meta media download error", await fileRes.text()); return null; }
    const fileBytes = await fileRes.arrayBuffer();

    const ext = extFromMime(mimeType) || extFromType(mediaType);
    const storagePath = `${mediaType}/${externalId}.${ext}`;

    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${storagePath}`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "apikey":        SUPABASE_KEY,
          "Content-Type":  mimeType,
          "x-upsert":      "true",
        },
        body: fileBytes,
      }
    );
    if (!uploadRes.ok) { console.error("storage upload error", await uploadRes.text()); return null; }

    return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`;
  } catch (err) {
    console.error("downloadAndStoreMedia error:", err);
    return null;
  }
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif",
    "image/webp": "webp", "video/mp4": "mp4", "video/3gpp": "3gp",
    "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/aac": "aac",
    "application/pdf": "pdf", "application/zip": "zip",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  };
  return map[mime] || "";
}

function extFromType(type: string): string {
  const map: Record<string, string> = {
    sticker: "webp", image: "jpg", video: "mp4", audio: "ogg", document: "pdf",
  };
  return map[type] || "bin";
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function sbGet(path: string): Promise<Array<Record<string, unknown>> | null> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) return null;
  return res.json();
}

async function sbPost(
  path: string, data: Record<string, unknown>, prefer = "return=minimal"
): Promise<Array<Record<string, unknown>> | null> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json", "Prefer": prefer,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) { console.error("sbPost error", path, await res.text()); return null; }
  if (prefer === "return=representation") return res.json();
  return null;
}

async function sbDelete(path: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: "DELETE",
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) console.error("sbDelete error", path, await res.text());
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
