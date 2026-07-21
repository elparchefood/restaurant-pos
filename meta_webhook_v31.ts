const VERIFY_TOKEN = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STORAGE_BUCKET = "chat-media";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // â”€â”€ GET: Meta webhook verification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (req.method === "GET") {
    const url   = new URL(req.url);
    const mode  = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200 });
    }
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

          if (!messages.length) continue;

          // Find channel by waba_id
          const chRes = await sbGet(`/rest/v1/chat_channels?channel=eq.whatsapp&select=id,tenant_id,branch_id,meta&limit=100`);
          const channels: Array<Record<string, unknown>> = chRes || [];
          const channel = channels.find((c) => {
            let m = c.meta as Record<string, unknown> | string || {};
            if (typeof m === "string") { try { m = JSON.parse(m); } catch { m = {}; } }
            return (m as Record<string, unknown>).waba_id === wabaId;
          });
          if (!channel) continue;

          // Get access_token from channel meta for media downloads
          let channelMeta: Record<string, string> = {};
          const rawMeta = channel.meta;
          if (typeof rawMeta === "string") { try { channelMeta = JSON.parse(rawMeta); } catch { /* */ } }
          else if (rawMeta && typeof rawMeta === "object") { channelMeta = rawMeta as Record<string, string>; }
          const accessToken = channelMeta.access_token || "";

          const { tenant_id, branch_id, id: channel_id } = channel;

          for (const msg of messages) {
            const fromPhone  = msg.from as string;
            const externalId = msg.id as string;
            const msgType    = msg.type as string;

            // â”€â”€ Text â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            let bodyText = "";
            let mediaUrl: string | null = null;
            let mediaType: string | null = null;

            if (msgType === "text") {
              bodyText = ((msg.text as Record<string, unknown>)?.body as string) || "";

            // â”€â”€ Sticker / Image / Video / Audio / Document â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

            } else if (msgType === "location") {
              const loc = (msg.location as Record<string, unknown>) || {};
              bodyText  = JSON.stringify({ lat: loc.latitude, lng: loc.longitude, name: loc.name || "", addr: loc.address || "" });
              mediaType = "location";

            } else {
              bodyText = `[${msgType}]`;
            }

            // Display text for conversation last_message
            const displayText = mediaType === "location" ? "📍 Ubicación" : bodyText;

            // Reply context (when sender replied to a previous message)
            const ctx = (msg.context as Record<string, unknown>) || null;
            const replyToExtId = ctx ? (ctx.id as string) || null : null;
            let replyToBody: string | null = null;
            if (replyToExtId) {
              const quoted = await sbGet(`/rest/v1/chat_messages?external_id=eq.${encodeURIComponent(replyToExtId)}&select=body,media_type&limit=1`);
              if (quoted?.length) {
                const qm = quoted[0] as Record<string, unknown>;
                const qBody = (qm.body as string) || "";
                const qType = (qm.media_type as string) || "";
                replyToBody = qType === "location" ? "📍 Ubicación" : qType === "sticker" ? "[Sticker]" : qType === "image" ? "[Imagen]" : qType === "audio" ? "[Audio]" : qType === "video" ? "[Video]" : qBody || `[${qType || "Medio"}]`;
              }
            }

            // Sender name
            const contact    = contacts.find((c) => c.wa_id === fromPhone);
            const senderName = ((contact?.profile as Record<string,unknown>)?.name as string) || ("+" + fromPhone);

            // Upsert conversation
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

            // Dedup check
            const dupCheck = await sbGet(`/rest/v1/chat_messages?external_id=eq.${encodeURIComponent(externalId)}&limit=1`);
            if (dupCheck?.length) continue;

            // Insert message
            await sbPost(`/rest/v1/chat_messages`, {
              conversation_id: convId, tenant_id,
              direction: "in", body: bodyText,
              media_url: mediaUrl, media_type: mediaType,
              delivery_status: "delivered", external_id: externalId,
              sent_at: new Date(parseInt(msg.timestamp as string) * 1000).toISOString(),
              reply_to_external_id: replyToExtId,
              reply_to_body: replyToBody,
            });

            // Update conversation
            await sbPatch(`/rest/v1/chat_conversations?id=eq.${convId}`, {
              last_message: displayText, last_message_at: new Date().toISOString(),
              last_sender: "contact", last_read: false,
              unread_count: unread + 1, contact_name: senderName,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("meta-webhook error:", err);
  }

  return new Response("OK", { status: 200 });
});

// â”€â”€ Media: download from Meta, upload to Supabase Storage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function downloadAndStoreMedia(
  mediaId: string,
  accessToken: string,
  externalId: string,
  mediaType: string
): Promise<string | null> {
  try {
    // 1. Get media URL from Meta
    const metaRes = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });
    if (!metaRes.ok) { console.error("meta media info error", await metaRes.text()); return null; }
    const metaData = await metaRes.json() as Record<string, string>;
    const downloadUrl = metaData.url;
    const mimeType    = metaData.mime_type || "application/octet-stream";

    // 2. Download the file
    const fileRes = await fetch(downloadUrl, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });
    if (!fileRes.ok) { console.error("meta media download error", await fileRes.text()); return null; }
    const fileBytes = await fileRes.arrayBuffer();

    // 3. Determine extension
    const ext = extFromMime(mimeType) || extFromType(mediaType);
    const storagePath = `${mediaType}/${externalId}.${ext}`;

    // 4. Upload to Supabase Storage
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

    // 5. Return public URL
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

// â”€â”€ Supabase helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
