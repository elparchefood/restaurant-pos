const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

async function sbGet(path: string) {
  const r = await fetch(SUPABASE_URL + path, {
    headers: {
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "apikey": SUPABASE_KEY,
    },
  });
  return r.ok ? r.json() : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { branchId, imageUrl, contentType } = await req.json();
    if (!branchId || !imageUrl) {
      return new Response(JSON.stringify({ error: "branchId and imageUrl required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Read WhatsApp channel config from DB
    const channels = await sbGet(
      `/rest/v1/chat_channels?channel=eq.whatsapp&branch_id=eq.${branchId}&select=meta&limit=1`
    ) as Array<{ meta: unknown }> | null;

    const channel = channels?.[0];
    if (!channel) {
      return new Response(JSON.stringify({ error: "Canal WhatsApp no encontrado para esta sucursal" }), {
        status: 404, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const meta = typeof channel.meta === "string" ? JSON.parse(channel.meta) : channel.meta as Record<string, string>;
    const accessToken = meta.access_token;
    const wabaId     = meta.waba_id;
    const phoneId    = meta.phone_id;

    if (!accessToken || !wabaId || !phoneId) {
      return new Response(JSON.stringify({ error: "Credenciales de WhatsApp incompletas en canal" }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // 1. Fetch the image from Supabase Storage (use service role key to bypass RLS)
    const imgRes = await fetch(imageUrl, {
      headers: { "Authorization": `Bearer ${SUPABASE_KEY}`, "apikey": SUPABASE_KEY },
    });
    if (!imgRes.ok) {
      return new Response(JSON.stringify({ error: "No se pudo descargar la imagen del Storage", status: imgRes.status }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const imageBuffer = await imgRes.arrayBuffer();
    const fileSize   = imageBuffer.byteLength;
    const mimeType   = contentType || imgRes.headers.get("content-type") || "image/jpeg";

    // 2. Resolve App ID from token (needed for Resumable Upload API)
    const appRes  = await fetch(`https://graph.facebook.com/v22.0/app?access_token=${accessToken}`);
    const appData = await appRes.json() as { id?: string; error?: { message: string } };
    if (!appData.id) {
      return new Response(JSON.stringify({ error: "No se pudo obtener App ID de Meta", detail: appData }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const appId = appData.id;

    // 3. Create upload session with Meta (Resumable Upload API)
    const sessionUrl = `https://graph.facebook.com/v22.0/${appId}/uploads` +
      `?file_name=avatar.jpg&file_length=${fileSize}&file_type=${encodeURIComponent(mimeType)}&access_token=${accessToken}`;
    const sessionRes  = await fetch(sessionUrl, { method: "POST" });
    const sessionData = await sessionRes.json();

    if (!sessionRes.ok || !sessionData.id) {
      return new Response(JSON.stringify({ error: "No se pudo crear sesión de upload en Meta", detail: sessionData }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const sessionId = sessionData.id;

    // 3. Upload the image binary to Meta
    const uploadRes  = await fetch(`https://graph.facebook.com/v22.0/${sessionId}`, {
      method: "POST",
      headers: {
        "Authorization": `OAuth ${accessToken}`,
        "file_offset": "0",
      },
      body: imageBuffer,
    });
    const uploadData = await uploadRes.json();

    if (!uploadRes.ok || !uploadData.h) {
      return new Response(JSON.stringify({ error: "Falló el upload de imagen a Meta", detail: uploadData }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const handle = uploadData.h;

    // 4. Update WhatsApp Business profile picture
    const profileRes = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/whatsapp_business_profile`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        profile_picture_handle: handle,
      }),
    });
    const profileData = await profileRes.json();

    if (!profileRes.ok) {
      return new Response(JSON.stringify({ error: "No se pudo actualizar el perfil de WhatsApp", detail: profileData }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
