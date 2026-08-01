const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sbGet(path: string) {
  const r = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  return r.ok ? r.json() : null;
}
async function sbPatch(path: string, body: unknown) {
  await fetch(`${SUPABASE_URL}${path}`, {
    method: "PATCH",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
}
async function sbPost(path: string, body: unknown) {
  const r = await fetch(`${SUPABASE_URL}${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  return r.ok ? r.json() : null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const { conversation_id } = await req.json() as { conversation_id: string };
  if (!conversation_id) return new Response("Missing conversation_id", { status: 400 });

  // 1. Cargar conversación
  const convRows = await sbGet(`/rest/v1/chat_conversations?id=eq.${conversation_id}&select=*&limit=1`) as Array<Record<string, unknown>> | null;
  const conv = convRows?.[0];
  if (!conv) return new Response("Conversation not found", { status: 404 });

  const fromPhone   = String(conv.from_phone   || "");
  const branchId    = String(conv.branch_id    || "");
  const tenantId    = String(conv.tenant_id    || "");
  const pendingData = conv.pending_order_data as Record<string, unknown> | null;

  // 2. Cargar canal WhatsApp
  const channels = await sbGet(`/rest/v1/chat_channels?branch_id=eq.${branchId}&type=eq.whatsapp&limit=1`) as Array<Record<string, unknown>> | null;
  const channel  = channels?.[0];
  const phoneId     = String(channel?.phone_number_id || "");
  const accessToken = String(channel?.access_token    || "");

  // 3. Crear pedido si hay datos pendientes
  let orderId: string | null = null;
  if (pendingData) {
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

    // Lookup/crear cliente
    if (fromPhone) {
      const telefonoClean = fromPhone.replace(/\D/g, "");
      const nombre   = String(pendingData.cliente || "");
      const direccion = String(pendingData.direccion || "");
      const existing = await sbGet(
        `/rest/v1/pos_clientes?telefono=eq.${encodeURIComponent(telefonoClean)}&nombre=eq.${encodeURIComponent(nombre)}&direccion=eq.${encodeURIComponent(direccion)}&tenant_id=eq.${tenantId}&limit=1`
      ) as Array<Record<string, unknown>> | null;

      if (existing && existing.length > 0) {
        orderRecord.cliente_id = String(existing[0].id);
      } else {
        const newCliente = await sbPost(`/rest/v1/pos_clientes`, {
          tenant_id: tenantId || null, branch_id: branchId,
          nombre, telefono: telefonoClean, direccion: direccion || null,
        });
        if (newCliente?.[0]?.id) orderRecord.cliente_id = String(newCliente[0].id);
      }
    }

    const created = await sbPost(`/rest/v1/pos_orders`, orderRecord) as Array<Record<string, unknown>> | null;
    orderId = String(created?.[0]?.id || "");

    // Insertar ítems si vienen
    const items = (pendingData.items as Array<Record<string, unknown>>) || [];
    for (const item of items) {
      await sbPost(`/rest/v1/pos_order_items`, { ...item, order_id: orderId });
    }
  }

  // 4. Marcar conversación: pago_pendiente = false, limpiar pending_order_data
  await sbPatch(`/rest/v1/chat_conversations?id=eq.${conversation_id}`, {
    pago_pendiente:     false,
    pending_order_data: null,
    human_takeover:     false,
  });

  // 5. Enviar mensaje de confirmación por WhatsApp
  const cfg = await sbGet(`/rest/v1/ia_config?branch_id=eq.${branchId}&select=frases&limit=1`) as Array<Record<string, unknown>> | null;
  const frases = (cfg?.[0]?.frases as Record<string, string>) || {};
  const cierreFrase = frases.cierre_pedido || "En un momento enviamos tu pedido 🍟 ¡Con muchísimo gusto!";
  const confirmMsg  = `✅ ¡Tu pago fue recibido! ${cierreFrase}`;

  if (phoneId && accessToken && fromPhone) {
    await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: fromPhone,
        type: "text",
        text: { body: confirmMsg },
      }),
    });

    // Guardar mensaje saliente en DB
    await sbPost(`/rest/v1/chat_messages`, {
      conversation_id,
      tenant_id: tenantId,
      direction: "out", origen: "sistema",
      body: confirmMsg,
      delivery_status: "sent",
      sent_at: new Date().toISOString(),
    });

    // Actualizar última actividad de la conversación
    await sbPatch(`/rest/v1/chat_conversations?id=eq.${conversation_id}`, {
      last_message: confirmMsg,
      last_message_at: new Date().toISOString(),
      last_sender: "agent",
    });
  }

  return new Response(JSON.stringify({ ok: true, order_id: orderId }), {
    headers: { "Content-Type": "application/json" },
  });
});
