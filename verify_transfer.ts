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

  const { conversation_id } = await req.json() as { conversation_id: string };
  if (!conversation_id) return new Response("Missing conversation_id", { status: 400 });

  try {
    await verifyTransfer(conversation_id);
  } catch (err) {
    console.error("verify-transfer error:", err);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

async function verifyTransfer(conversationId: string): Promise<void> {
  // 1. Cargar conversación
  const convRows = await sbGet(
    `/rest/v1/chat_conversations?id=eq.${conversationId}&select=*&limit=1`
  ) as Array<Record<string, unknown>> | null;
  const conv = convRows?.[0];
  if (!conv) { console.error("conversation not found:", conversationId); return; }

  const fromPhone       = String(conv.from_phone   || conv.contact_handle || "");
  const branchId        = String(conv.branch_id    || "");
  const tenantId        = String(conv.tenant_id    || "");
  const pendingData     = conv.pending_order_data as Record<string, unknown> | null;

  // 2. Canal WhatsApp
  const channels = await sbGet(
    `/rest/v1/chat_channels?branch_id=eq.${branchId}&type=eq.whatsapp&limit=1`
  ) as Array<Record<string, unknown>> | null;
  let channel = channels?.[0];
  // Fallback: buscar por channel = 'whatsapp'
  if (!channel) {
    const ch2 = await sbGet(
      `/rest/v1/chat_channels?branch_id=eq.${branchId}&channel=eq.whatsapp&limit=1`
    ) as Array<Record<string, unknown>> | null;
    channel = ch2?.[0];
  }
  const phoneId     = String(channel?.phone_number_id || channel?.meta && (channel.meta as Record<string,string>).phone_number_id || "");
  const accessToken = String(channel?.access_token    || channel?.meta && (channel.meta as Record<string,string>).access_token    || "");

  // 3. Imagen más reciente del chat (comprobante)
  const imgMsgs = await sbGet(
    `/rest/v1/chat_messages?conversation_id=eq.${conversationId}&direction=eq.in&media_type=eq.image&order=sent_at.desc&limit=1`
  ) as Array<Record<string, unknown>> | null;
  const imageUrl = imgMsgs?.[0]?.media_url as string | null;
  if (!imageUrl) {
    console.error("No image found for conversation:", conversationId);
    await sendWhatsApp(fromPhone, phoneId, accessToken,
      "No encontramos el comprobante. Por favor envíalo de nuevo como imagen.");
    return;
  }

  // 4. Config de la sucursal (tokens Gmail)
  const cfgRows = await sbGet(
    `/rest/v1/ia_config?branch_id=eq.${branchId}&select=gmail_refresh_token,gmail_email,pagos,frases&limit=1`
  ) as Array<Record<string, unknown>> | null;
  const cfg = cfgRows?.[0];
  const refreshToken = cfg?.gmail_refresh_token as string | null;

  // 5. GPT-4o Vision: extraer datos del comprobante
  const visionResult = await extractComprobante(imageUrl);
  console.log("Vision result:", JSON.stringify(visionResult));

  let confirmed = false;
  let verifyDetail = "";

  if (refreshToken && visionResult.monto) {
    // 6. Refrescar token Gmail
    const accessTokenGmail = await refreshGmailToken(refreshToken);
    if (accessTokenGmail) {
      // 7. Buscar en Gmail correos bancarios recientes con ese monto
      const gmailMatch = await searchGmailForAmount(accessTokenGmail, visionResult.monto, visionResult.fecha);
      confirmed = gmailMatch.found;
      verifyDetail = gmailMatch.detail;
      console.log("Gmail match:", confirmed, verifyDetail);
    } else {
      console.error("No se pudo refrescar el token Gmail");
    }
  } else if (!refreshToken) {
    // Sin Gmail configurado: verificar solo por Vision (confiar en la imagen)
    confirmed = visionResult.parece_valido;
    verifyDetail = "Verificación solo por imagen (Gmail no configurado)";
  }

  const frases = (cfg?.frases as Record<string, string>) || {};

  if (confirmed) {
    // 8a. Crear el pedido y confirmar
    let orderId: string | null = null;
    if (pendingData) {
      orderId = await crearPedido(conversationId, branchId, tenantId, fromPhone, pendingData);
    }

    await sbPatch(`/rest/v1/chat_conversations?id=eq.${conversationId}`, {
      pago_pendiente:     false,
      pending_order_data: null,
      human_takeover:     false,
    });

    const montoStr = visionResult.monto ? ` de $${visionResult.monto}` : "";
    const cierreFrase = frases.cierre_pedido || "¡Con muchísimo gusto! En un momento preparamos tu pedido.";
    const msg = `✅ ¡Pago verificado${montoStr}! ${cierreFrase}`;
    await sendWhatsApp(fromPhone, phoneId, accessToken, msg);

    // Guardar mensaje saliente
    await saveOutMessage(conversationId, tenantId, msg, fromPhone, phoneId, accessToken);

  } else {
    // 8b. No se pudo verificar → human takeover
    await sbPatch(`/rest/v1/chat_conversations?id=eq.${conversationId}`, {
      human_takeover: true,
    });

    const msg = "⚠️ Recibimos tu comprobante pero no pudimos verificarlo automáticamente. Un agente lo revisará en breve y te confirmamos.";
    await sendWhatsApp(fromPhone, phoneId, accessToken, msg);
    await saveOutMessage(conversationId, tenantId, msg, fromPhone, phoneId, accessToken);
  }
}

// ── GPT-4o Vision: extraer datos del comprobante ─────────────────────────────

interface ComprobanteData {
  monto: string;        // ej. "45000"
  fecha: string;        // ej. "2026-07-14"
  banco: string;
  referencia: string;
  parece_valido: boolean;
}

async function extractComprobante(imageUrl: string): Promise<ComprobanteData> {
  const prompt = `Eres un asistente que analiza comprobantes de transferencia bancaria colombianos.
Analiza la imagen y extrae en JSON:
{
  "monto": "solo el número sin puntos ni símbolos, ej: 45000",
  "fecha": "YYYY-MM-DD o string vacío si no se ve",
  "banco": "nombre del banco o app de pago",
  "referencia": "número de referencia o transacción",
  "parece_valido": true/false (false si parece editado, borroso o no es un comprobante real)
}
Responde SOLO el JSON, sin explicación.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
          ],
        }],
      }),
    });
    if (!res.ok) { console.error("Vision error:", await res.text()); return empty(); }
    const data = await res.json() as Record<string, unknown>;
    const raw = (((data.choices as Array<Record<string,unknown>>)?.[0]?.message as Record<string,unknown>)?.content as string || "").trim();
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as ComprobanteData;
  } catch (err) {
    console.error("extractComprobante error:", err);
    return empty();
  }
}

function empty(): ComprobanteData {
  return { monto: "", fecha: "", banco: "", referencia: "", parece_valido: false };
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
  found: boolean;
  detail: string;
}

async function searchGmailForAmount(
  accessToken: string,
  monto: string,
  fecha: string,
): Promise<GmailMatch> {
  try {
    // Buscar en los últimos 3 días correos que contengan el monto
    const montoFmt = monto.replace(/\D/g, ""); // solo dígitos
    if (!montoFmt) return { found: false, detail: "monto vacío" };

    // Formateos que usan los bancos colombianos: 45.000, 45,000, 45000, 45.000,00
    const q = `newer_than:3d "${montoFmt}"`;
    const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=10`;
    const searchRes = await fetch(searchUrl, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });
    if (!searchRes.ok) { console.error("Gmail search error:", await searchRes.text()); return { found: false, detail: "error al buscar en Gmail" }; }
    const searchData = await searchRes.json() as Record<string, unknown>;
    const messages = searchData.messages as Array<{ id: string }> | undefined;

    if (!messages?.length) return { found: false, detail: `Sin correos con monto ${montoFmt} en últimos 3 días` };

    // Leer el primer mensaje para verificar que es una notificación bancaria real
    const msgId = messages[0].id;
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
      { headers: { "Authorization": `Bearer ${accessToken}` } }
    );
    if (!msgRes.ok) return { found: true, detail: "correo encontrado (no se pudo leer detalle)" };
    const msgData = await msgRes.json() as Record<string, unknown>;
    const headers = ((msgData.payload as Record<string, unknown>)?.headers as Array<{name:string;value:string}>) || [];
    const from    = headers.find(h => h.name === "From")?.value    || "";
    const subject = headers.find(h => h.name === "Subject")?.value || "";

    // Validar que el remitente suena a banco
    const isBankEmail = /bancolombia|nequi|daviplat|davivienda|bbva|occidente|bogota|popular|itau|wompi|bold|adyen|paypal|nu\.com\.co|nubank/i.test(from + subject);

    return {
      found: isBankEmail,
      detail: `Remitente: ${from} | Asunto: ${subject}`,
    };
  } catch (err) {
    console.error("searchGmailForAmount error:", err);
    return { found: false, detail: String(err) };
  }
}

// ── Crear pedido ──────────────────────────────────────────────────────────────

async function crearPedido(
  conversationId: string,
  branchId: string,
  tenantId: string,
  fromPhone: string,
  pendingData: Record<string, unknown>,
): Promise<string | null> {
  const orderRecord: Record<string, unknown> = {
    branch_id:      branchId,
    tenant_id:      tenantId || null,
    channel:        "domicilio",
    customer_name:  String(pendingData.cliente || "Cliente WhatsApp"),
    notes:          String(pendingData.direccion || "") || null,
    payment_method: String(pendingData.pago || "") || null,
    status:         "open",
    total:          Number(pendingData.total || 0),
    subtotal:       Number(pendingData.total || 0),
    total_final:    Number(pendingData.total || 0),
    waiter_name:    "Asistente IA",
    visible_cocina: true,
    opened_at:      new Date().toISOString(),
  };

  // Cliente
  if (fromPhone) {
    const telefonoClean = fromPhone.replace(/\D/g, "");
    const nombre    = String(pendingData.cliente  || "");
    const direccion = String(pendingData.direccion || "");
    const existing  = await sbGet(
      `/rest/v1/pos_clientes?telefono=eq.${encodeURIComponent(telefonoClean)}&tenant_id=eq.${tenantId}&limit=1`
    ) as Array<Record<string, unknown>> | null;

    if (existing && existing.length > 0) {
      orderRecord.cliente_id = String(existing[0].id);
    } else {
      const newCliente = await sbPostRep(`/rest/v1/pos_clientes`, {
        tenant_id: tenantId || null, branch_id: branchId,
        nombre, telefono: telefonoClean, direccion: direccion || null,
      });
      if (newCliente?.[0]?.id) orderRecord.cliente_id = String(newCliente[0].id);
    }
  }

  const created = await sbPostRep(`/rest/v1/pos_orders`, orderRecord) as Array<Record<string, unknown>> | null;
  const orderId = String(created?.[0]?.id || "");

  const items = (pendingData.items as Array<Record<string, unknown>>) || [];
  for (const item of items) {
    await sbPost(`/rest/v1/pos_order_items`, { ...item, order_id: orderId });
  }

  return orderId || null;
}

// ── WhatsApp helpers ──────────────────────────────────────────────────────────

async function sendWhatsApp(fromPhone: string, phoneId: string, accessToken: string, text: string): Promise<void> {
  if (!phoneId || !accessToken || !fromPhone) return;
  await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: fromPhone,
      type: "text",
      text: { body: text },
    }),
  });
}

async function saveOutMessage(
  conversationId: string,
  tenantId: string,
  body: string,
  fromPhone: string,
  phoneId: string,
  accessToken: string,
): Promise<void> {
  await sbPost(`/rest/v1/chat_messages`, {
    conversation_id: conversationId,
    tenant_id: tenantId,
    direction: "out",
    body,
    delivery_status: "sent",
    sent_at: new Date().toISOString(),
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
