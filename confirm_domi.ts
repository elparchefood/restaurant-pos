import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// ── Supabase helpers ────────────────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  return `$${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

function fmtPrice(n: number): string {
  return "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// ── createWhatsappOrder (copiado de delay-reply) ────────────────────────────

async function createWhatsappOrder(
  data: Record<string, unknown>,
  branchId: string,
  tenantId: string,
  fromPhone: string
): Promise<string | null> {
  const cliente   = String(data.cliente   || "Cliente WhatsApp");
  const productos = (data.productos as Array<Record<string, unknown>>) || [];
  const direccion = String(data.direccion || "");
  const pago      = String(data.pago      || "");
  const domiPrecio = Number(data.domi_precio ?? 0);

  const allProducts = await sbGet(
    `/rest/v1/pos_products?branch_id=eq.${branchId}&available=eq.true` +
    `&select=id,name,price,price_mode,presentations,variables`
  ) as Array<Record<string, unknown>> | null;

  if (!allProducts) {
    console.error("No se pudo cargar pos_products");
    return null;
  }

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
    const nombreGPT = String(prod.nombre || "").trim();
    const tamanoGPT = String(prod.tamano || "").trim();
    const tipoGPT   = String(prod.tipo   || "").trim();
    const cantidad  = Math.max(1, Number(prod.cantidad) || 1);

    const nombreLow = nombreGPT.toLowerCase();
    const matched = allProducts.find(p => {
      const pname = String(p.name || "").toLowerCase();
      return pname === nombreLow ||
             pname.includes(nombreLow) ||
             nombreLow.includes(pname.replace(/\s.*/,""));
    });

    if (!matched) {
      const fallbackName = [nombreGPT, tamanoGPT, tipoGPT].filter(Boolean).join(" · ");
      items.push({
        product_id: null,
        product_name: fallbackName || "Producto WhatsApp",
        product_price: 0, unit_price: 0, total: 0,
        quantity: cantidad,
        selections: { mods: {}, pres: tamanoGPT, vars: {} },
        branch_id: branchId, tenant_id: tenantId || null, notes: null,
      });
      continue;
    }

    const presentations = (matched.presentations as Array<{ id: string; name: string; price: number }>) || [];
    const variables = (matched.variables as Array<{
      id: string; name: string; isPricing?: boolean;
      options: Array<{ id: string; name: string; price: number; prices?: number[] }>;
    }>) || [];
    const priceMode = String(matched.price_mode || "simple");

    const tamLow  = tamanoGPT.toLowerCase();
    let presMatch = presentations.find(p => p.name.toLowerCase() === tamLow);
    if (!presMatch && presentations.length > 0) presMatch = presentations[0];
    const presName = presMatch?.name || tamanoGPT;
    const presIdx  = presMatch ? presentations.indexOf(presMatch) : 0;

    let price = Number(presMatch?.price) || Number(matched.price) || 0;
    const varsMap: Record<string, { id: string; name: string; price: number }> = {};

    if (priceMode === "matrix" && tipoGPT && variables.length > 0) {
      const varGroup = variables[0];
      const tipoLow  = tipoGPT.toLowerCase();
      const varOpt   = varGroup.options.find(o => o.name.toLowerCase() === tipoLow);
      if (varOpt) {
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
      product_price: price, unit_price: price, total: itemTotal,
      quantity:      cantidad,
      selections:    { mods: {}, pres: presName, vars: varsMap },
      branch_id:     branchId, tenant_id: tenantId || null, notes: null,
    });

    orderTotal += itemTotal;
  }

  // Buscar o crear cliente
  let clienteId: string | null = null;
  try {
    const telefonoClean = fromPhone.replace(/\D/g, "");
    const existing = await sbGet(
      `/rest/v1/pos_clientes?telefono=eq.${encodeURIComponent(telefonoClean)}&nombre=eq.${encodeURIComponent(cliente)}&direccion=eq.${encodeURIComponent(direccion)}&tenant_id=eq.${tenantId}&limit=1`
    ) as Array<Record<string, unknown>> | null;
    if (existing && existing.length > 0) {
      clienteId = String(existing[0].id);
    } else {
      const newCliente = await fetch(`${SUPABASE_URL}/rest/v1/pos_clientes`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json", "Prefer": "return=representation",
        },
        body: JSON.stringify({
          tenant_id: tenantId || null, branch_id: branchId,
          nombre: cliente, telefono: telefonoClean, direccion: direccion || null,
        }),
      });
      if (newCliente.ok) {
        const newRow = await newCliente.json() as Array<Record<string, unknown>>;
        clienteId = String(newRow?.[0]?.id || "");
      }
    }
  } catch (err) {
    console.error("Error cliente:", err);
  }

  // Insertar pedido
  const totalConDomi = orderTotal + domiPrecio;
  const orderRecord: Record<string, unknown> = {
    branch_id:      branchId,
    tenant_id:      tenantId || null,
    channel:        "domicilio",
    customer_name:  cliente,
    notes:          direccion || null,
    payment_method: pago || null,
    status:         "open",
    total:          totalConDomi,
    subtotal:       orderTotal,
    total_final:    totalConDomi,
    waiter_name:    "Asistente IA",
    visible_cocina: true,
    opened_at:      new Date().toISOString(),
  };
  if (clienteId) orderRecord.cliente_id = clienteId;

  const createRes = await fetch(`${SUPABASE_URL}/rest/v1/pos_orders`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json", "Prefer": "return=representation",
    },
    body: JSON.stringify(orderRecord),
  });

  if (!createRes.ok) {
    console.error("Error pos_orders:", await createRes.text());
    return null;
  }

  const created = await createRes.json() as Array<Record<string, unknown>>;
  const orderId = created?.[0]?.id as string | undefined;
  if (!orderId) return null;

  for (const item of items) {
    await sbPost(`/rest/v1/pos_order_items`, { ...item, order_id: orderId });
  }

  return orderId;
}

// ── Handler principal ────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return new Response("Method Not Allowed", { status: 405 });

  try {
    const { conversation_id, domi_precio } = await req.json() as {
      conversation_id: string;
      domi_precio: number;
    };

    if (!conversation_id || domi_precio === undefined || domi_precio === null) {
      return new Response(
        JSON.stringify({ error: "conversation_id y domi_precio son requeridos" }),
        { status: 400, headers: CORS }
      );
    }

    // 1. Leer conversación
    const convRows = await sbGet(
      `/rest/v1/chat_conversations?id=eq.${conversation_id}&select=*&limit=1`
    ) as Array<Record<string, unknown>> | null;
    const conv = convRows?.[0];
    if (!conv) {
      return new Response(JSON.stringify({ error: "Conversación no encontrada" }), { status: 404, headers: CORS });
    }

    const pendingOrder = conv.pending_order_data as Record<string, unknown> | null;
    if (!pendingOrder) {
      return new Response(JSON.stringify({ error: "No hay pedido pendiente en esta conversación" }), { status: 400, headers: CORS });
    }

    const branchId  = String(conv.branch_id  || "");
    const tenantId  = String(conv.tenant_id  || "");
    const fromPhone = String(conv.contact_handle || "");

    // 2. Obtener credenciales de WhatsApp desde chat_channels
    // (esquema real: columna filtro es "channel" y las credenciales viven en
    // el JSON "meta" — igual que verify-transfer y meta-webhook)
    const channelRows = await sbGet(
      `/rest/v1/chat_channels?branch_id=eq.${branchId}&channel=eq.whatsapp&limit=1`
    ) as Array<Record<string, unknown>> | null;
    const channelRow = channelRows?.[0];
    let channelMeta: Record<string, string> = {};
    const rawMeta = channelRow?.meta;
    if (typeof rawMeta === "string") { try { channelMeta = JSON.parse(rawMeta); } catch { /* */ } }
    else if (rawMeta && typeof rawMeta === "object") { channelMeta = rawMeta as Record<string, string>; }
    const phoneId     = String(channelMeta.phone_id || "");
    const accessToken = String(channelMeta.access_token || "");

    // 3. Crear el pedido en Cobra POS
    const pedidoConDomi = { ...pendingOrder, domi_precio };
    const orderId = await createWhatsappOrder(pedidoConDomi, branchId, tenantId, fromPhone);
    if (!orderId) {
      console.error("confirm-domi: fallo al crear pedido");
    }

    // 4. Calcular totales y construir mensaje para el cliente
    const productosPrecio = Number(pendingOrder.total_productos ?? 0);
    const totalConDomi = productosPrecio > 0
      ? productosPrecio + domi_precio
      : 0;

    let mensaje: string;
    if (productosPrecio > 0 && domi_precio > 0) {
      mensaje = `Con gusto, serían ${fmtCOP(productosPrecio)} + ${fmtCOP(domi_precio)} del domicilio = ${fmtCOP(totalConDomi)} 😊 ¡En un momento enviamos tu pedido! 🍟`;
    } else if (domi_precio > 0) {
      mensaje = `El domicilio tiene un costo de ${fmtCOP(domi_precio)} 😊 ¡En un momento enviamos tu pedido! 🍟`;
    } else {
      mensaje = `¡En un momento enviamos tu pedido! 🍟`;
    }

    // 5. Enviar mensaje de WhatsApp al cliente
    if (phoneId && accessToken && fromPhone) {
      const waRes = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: fromPhone,
          recipient_type: "individual",
          type: "text",
          text: { body: mensaje },
        }),
      });

      if (waRes.ok) {
        const waSent  = await waRes.json() as Record<string, unknown>;
        const sentId  = ((waSent.messages as Array<Record<string,unknown>>)?.[0]?.id as string) || "";
        await sbPost(`/rest/v1/chat_messages`, {
          conversation_id,
          tenant_id: tenantId || null,
          direction: "out",
          body: mensaje,
          delivery_status: "sent",
          external_id: sentId || null,
          sent_at: new Date().toISOString(),
        });
      } else {
        console.error("WA send error:", await waRes.text());
      }
    } else {
      console.warn("confirm-domi: sin credenciales WA — mensaje no enviado");
    }

    // 6. Limpiar flags de la conversación
    await sbPatch(`/rest/v1/chat_conversations?id=eq.${conversation_id}`, {
      domi_precio_pendiente: false,
      human_takeover: false,
      pending_order_data: null,
      last_message: mensaje,
      last_message_at: new Date().toISOString(),
      last_sender: "agent",
    });

    return new Response(
      JSON.stringify({ ok: true, orderId: orderId || null, mensaje }),
      { headers: CORS }
    );

  } catch (e) {
    console.error("confirm-domi error:", e);
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: CORS }
    );
  }
});
