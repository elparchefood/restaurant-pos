const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_API_BASE = "https://graph.facebook.com/v22.0";
const STORAGE_BUCKET = "chat-media";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: {
    conversation_id?: string;
    text?: string;
    message_id?: string;
    media_url?: string;
    media_type?: string;
    filename?: string;
    reaction_emoji?: string;
    react_to_external_id?: string;
    reply_to_external_id?: string;
    location?: { latitude: number; longitude: number; name?: string; address?: string };
  };
  try { body = await req.json(); }
  catch { return json({ error: "Invalid JSON" }, 400); }

  const { conversation_id, text, message_id, media_url, media_type, filename,
          reaction_emoji, react_to_external_id, reply_to_external_id, location, botones } = body;
  if (!conversation_id || (!text && !media_url && !reaction_emoji && !location)) {
    return json({ error: "conversation_id and text, media_url, location or reaction_emoji required" }, 400);
  }

  try {
    // 1. Get conversation -> contact phone + channel_id
    const convRows = await sbGet(
      `/rest/v1/chat_conversations?id=eq.${conversation_id}&select=contact_handle,channel_id,tenant_id,channel&limit=1`
    );
    if (!convRows?.length) return json({ error: "Conversation not found" }, 404);
    const { contact_handle: toPhone, channel_id } = convRows[0];
    const canal = String(convRows[0].channel || "whatsapp");

    // 2. Get channel -> meta (access_token + phone_number_id)
    /* CONVERSACION SIN CANAL (22-ago-2026, urgencia real de las 9pm).
       31 conversaciones viejas tenian channel_id NULO y este 404 dejaba a
       Sergio sin poder escribirle a un cliente con el pedido enfriandose.
       El canal se puede deducir siempre: es el del RESTAURANTE de la
       conversacion, del mismo tipo (whatsapp con whatsapp). Se resuelve, se
       envia, y de paso se deja la conversacion enlazada para la proxima. */
    let chRows = channel_id
      ? await sbGet(`/rest/v1/chat_channels?id=eq.${channel_id}&select=meta&limit=1`)
      : null;
    if (!chRows?.length) {
      const porTipo = await sbGet(
        `/rest/v1/chat_channels?tenant_id=eq.${convRows[0].tenant_id}&channel=eq.${encodeURIComponent(canal)}&select=id,meta&limit=1`
      );
      if (porTipo?.length) {
        chRows = porTipo;
        try {
          await sbPatch(`/rest/v1/chat_conversations?id=eq.${conversation_id}`, { channel_id: porTipo[0].id });
        } catch { /* el envio importa mas que dejarla enlazada */ }
      }
    }
    if (!chRows?.length) return json({ error: "Channel not found" }, 404);

    let meta: Record<string, string> = {};
    const rawMeta = chRows[0].meta;
    if (typeof rawMeta === "string") { try { meta = JSON.parse(rawMeta); } catch { /* */ } }
    else if (rawMeta && typeof rawMeta === "object") { meta = rawMeta as Record<string, string>; }

    const accessToken  = meta.access_token;
    const phoneNumberId = meta.phone_id;
    if (!accessToken)   return json({ error: "No access_token in channel meta" }, 400);

    /* ══ MESSENGER E INSTAGRAM ═══════════════════════════════════════════
       Otra API, mas simple que la de WhatsApp: {recipient, message} contra el
       id de la pagina (o de la cuenta de IG), con el token de la PAGINA.
       Va ANTES de todo lo de WhatsApp porque no comparte nada con ello. */
    if (canal === "instagram" || canal === "facebook") {
      const pageToken = String(meta.page_token || meta.access_token || "");
      /* SIEMPRE el id de la PAGINA, tambien para Instagram. Comprobado
         mandando de verdad: al id de la cuenta de Instagram, Meta responde
         '(#3) Application does not have the capability to make this API call';
         al de la pagina, sale. Instagram va montado sobre la pagina y la
         pagina es la que habla — el mensaje de error apuntaba a un permiso
         que el token SI tenia (se verifico en /me/permissions), asi que
         perseguirlo habria sido perder el dia. */
      const emisorId  = String(meta.page_id || "");
      if (!pageToken) return json({ error: "Falta el token de la pagina. Vuelve a conectar el canal." }, 400);
      if (!emisorId)  return json({ error: "Falta el id de la cuenta. Vuelve a conectar el canal." }, 400);

      /* Lo que estos canales NO tienen. Se avisa en vez de fallar callado:
         antes el mensaje se quedaba sin salir y nadie sabia por que. */
      if (reaction_emoji) return json({ error: "Las reacciones solo funcionan en WhatsApp." }, 400);
      if (location)       return json({ error: "La tarjeta de ubicacion solo funciona en WhatsApp." }, 400);

      const cuerpo: Record<string, unknown> = media_url
        ? { attachment: { type: (media_type === "document" ? "file" : (media_type || "image")),
                          payload: { url: media_url, is_reusable: true } } }
        : { text: String(text || "") };

      const envio = await fetch(`${META_API_BASE}/${emisorId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${pageToken}` },
        body: JSON.stringify({
          recipient: { id: toPhone },
          message: cuerpo,
          messaging_type: "RESPONSE",
        }),
      });
      const datos = await envio.json() as Record<string, unknown>;

      if (!envio.ok || datos.error) {
        const msg = (datos.error as Record<string, string>)?.message || JSON.stringify(datos);
        console.error(`${canal} send error:`, msg);
        if (message_id) await sbPatch(`/rest/v1/chat_messages?id=eq.${message_id}`, { delivery_status: "failed" });
        return json({ error: msg }, 400);
      }

      /* Si habia media Y texto, el texto va aparte: esta API manda una cosa
         por mensaje. */
      if (media_url && text) {
        try {
          await fetch(`${META_API_BASE}/${emisorId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${pageToken}` },
            body: JSON.stringify({ recipient: { id: toPhone }, message: { text: String(text) }, messaging_type: "RESPONSE" }),
          });
        } catch { /* la foto ya salio; el pie es un extra */ }
      }

      const idMensaje = String(datos.message_id || "");
      if (message_id) {
        await sbPatch(`/rest/v1/chat_messages?id=eq.${message_id}`, {
          delivery_status: "sent", external_id: idMensaje || null,
        });
      }
      return json({ ok: true, wa_message_id: idMensaje });
    }

    if (!phoneNumberId) return json({ error: "No phone_id in channel meta" }, 400);

    // 3. Build WhatsApp message payload
    let waPayload: Record<string, unknown>;
    // ── BOTONES (mensajes interactivos de WhatsApp) ─────────────────────
    // botones = { tipo:'botones'|'lista'|'url', pie?, opciones:[...], ... }
    //   botones → hasta 3 de respuesta rápida (el texto llega como mensaje)
    //   lista   → hasta 10 opciones en un desplegable
    //   url     → un botón que abre un enlace
    // Solo WhatsApp: Instagram/Facebook no los soportan igual.
    const btn = botones as Record<string, unknown> | undefined;
    if (btn && btn.tipo && text) {
      const tipo = String(btn.tipo);
      const pie  = btn.pie ? String(btn.pie).slice(0, 60) : "";
      const base: Record<string, unknown> = {
        messaging_product: "whatsapp", recipient_type: "individual",
        to: toPhone, type: "interactive",
      };
      const cuerpo: Record<string, unknown> = { text: String(text).slice(0, 1024) };

      if (tipo === "url") {
        base.interactive = {
          type: "cta_url", body: cuerpo,
          ...(pie ? { footer: { text: pie } } : {}),
          action: { name: "cta_url", parameters: {
            display_text: String(btn.texto_boton || "Abrir").slice(0, 20),
            url: String(btn.url || ""),
          } },
        };
      } else if (tipo === "lista") {
        const filas = ((btn.opciones as Array<Record<string, unknown>>) || []).slice(0, 10)
          .map((o, i) => ({
            id: String(o.id || ("op_" + i)).slice(0, 200),
            title: String(o.titulo || o.texto || "").slice(0, 24),
            ...(o.desc ? { description: String(o.desc).slice(0, 72) } : {}),
          })).filter(r => r.title);
        if (!filas.length) return json({ error: "La lista no tiene opciones" }, 400);
        base.interactive = {
          type: "list", body: cuerpo,
          ...(pie ? { footer: { text: pie } } : {}),
          action: {
            button: String(btn.texto_boton || "Ver opciones").slice(0, 20),
            sections: [{ title: String(btn.titulo_seccion || "Opciones").slice(0, 24), rows: filas }],
          },
        };
      } else {
        const bs = ((btn.opciones as Array<Record<string, unknown>>) || []).slice(0, 3)
          .map((o, i) => ({
            type: "reply",
            reply: { id: String(o.id || ("btn_" + i)).slice(0, 256), title: String(o.titulo || o.texto || "").slice(0, 20) },
          })).filter(x => x.reply.title);
        if (!bs.length) return json({ error: "No hay botones para enviar" }, 400);
        base.interactive = {
          type: "button", body: cuerpo,
          ...(pie ? { footer: { text: pie } } : {}),
          action: { buttons: bs },
        };
      }
      if (reply_to_external_id) base.context = { message_id: reply_to_external_id };
      waPayload = base;
    } else if (reaction_emoji && react_to_external_id) {
      waPayload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toPhone,
        type: "reaction",
        reaction: { message_id: react_to_external_id, emoji: reaction_emoji },
      };
    } else if (location && typeof location.latitude === "number" && typeof location.longitude === "number") {
      // Tarjeta de ubicacion (mapa nativo de WhatsApp)
      waPayload = {
        messaging_product: "whatsapp",
        to: toPhone,
        type: "location",
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          name: location.name || "",
          address: location.address || "",
        },
      };
      if (reply_to_external_id) waPayload.context = { message_id: reply_to_external_id };
    } else if (media_url && media_type) {
      waPayload = buildMediaPayload(toPhone as string, media_type, media_url, text, filename);
      if (reply_to_external_id) (waPayload as Record<string, unknown>).context = { message_id: reply_to_external_id };
    } else {
      waPayload = {
        messaging_product: "whatsapp",
        to: toPhone,
        type: "text",
        text: { body: text },
      };
      if (reply_to_external_id) waPayload.context = { message_id: reply_to_external_id };
    }

    // 4. Send via WhatsApp Cloud API
    const waRes = await fetch(`${META_API_BASE}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify(waPayload),
    });
    const waData = await waRes.json() as Record<string, unknown>;

    if (!waRes.ok || waData.error) {
      const errMsg = (waData.error as Record<string,string>)?.message || JSON.stringify(waData);
      console.error("WhatsApp API error:", errMsg);
      if (message_id) await sbPatch(`/rest/v1/chat_messages?id=eq.${message_id}`, { delivery_status: "failed" });
      return json({ error: errMsg }, 400);
    }

    // 5. Mark message as sent
    const waMessageId = (waData.messages as Array<Record<string,string>>)?.[0]?.id;
    if (message_id) {
      await sbPatch(`/rest/v1/chat_messages?id=eq.${message_id}`, {
        delivery_status: "sent",
        external_id: waMessageId || null,
      });
    }

    return json({ ok: true, wa_message_id: waMessageId });

  } catch (err) {
    console.error("meta-send error:", err);
    return json({ error: String(err) }, 500);
  }
});

function buildMediaPayload(
  to: string,
  mediaType: string,
  mediaUrl: string,
  caption?: string,
  filename?: string
): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", to, type: mediaType };
  if (mediaType === "sticker") {
    return { ...base, sticker: { link: mediaUrl } };
  }
  if (mediaType === "image") {
    return { ...base, image: { link: mediaUrl, caption: caption || "" } };
  }
  if (mediaType === "video") {
    return { ...base, video: { link: mediaUrl, caption: caption || "" } };
  }
  if (mediaType === "audio") {
    return { ...base, audio: { link: mediaUrl } };
  }
  if (mediaType === "document") {
    return { ...base, document: { link: mediaUrl, filename: filename || "archivo", caption: caption || "" } };
  }
  return { ...base, [mediaType]: { link: mediaUrl } };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function sbGet(path: string): Promise<Array<Record<string, unknown>> | null> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) return null;
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
