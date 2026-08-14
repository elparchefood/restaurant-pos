// El entorno de despliegue ya no permite imports remotos ("--no-remote"),
// asi que se usa el servidor nativo en vez del modulo de deno.land.
const serve = Deno.serve;

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
    const { conversation_id, domi_precio, tipo, nombre } = await req.json() as {
      conversation_id: string;
      domi_precio: number;
      /* "barrio" pide la direccion completa; "conjunto" pide solo torre y
         apartamento. Lo escoge el dueño en la franja. */
      tipo?: string;
      /* El sitio a guardar. Si no viene, se usa el barrio que entendio Paco. */
      nombre?: string;
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

    /* ── 3. EL SITIO QUEDA APRENDIDO ──────────────────────────────────────

       Regla de Sergio: "cuando yo coloque el precio del domicilio,
       automaticamente queda guardado ese nuevo barrio o conjunto". Sin esto
       llegaria la misma notificacion por el mismo barrio para siempre; con
       esto el sistema aprende la ciudad sola, con los pedidos reales.

       Va a la zona QUE YA TIENE ESE PRECIO: asi no se llena de zonas de una
       sola entrada. Si ninguna lo tiene, se crea. */
    const sitio = String(nombre || pendingOrder.barrio || "").trim();
    const esConjunto = String(tipo || "barrio").toLowerCase() === "conjunto";
    let aprendido = "";
    if (sitio) {
      try {
        const icRows = await sbGet(
          `/rest/v1/ia_config?branch_id=eq.${branchId}&select=domicilios&limit=1`
        ) as Array<Record<string, unknown>> | null;
        const dom = (icRows?.[0]?.domicilios as Record<string, unknown>) || {};
        const zonas = Array.isArray(dom.zonas)
          ? (dom.zonas as Array<Record<string, unknown>>).map(z => ({ ...z })) : [];
        const norm = (x: string) => x.toLowerCase().normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
        const campo = esConjunto ? "conjuntos" : "barrios";
        const yaEsta = zonas.some(z =>
          ["barrios", "conjuntos"].some(c =>
            (Array.isArray(z[c]) ? z[c] as string[] : []).some(b => norm(String(b)) === norm(sitio))));
        if (!yaEsta) {
          let zona = zonas.find(z => Number(z.precio) === Number(domi_precio));
          if (!zona) {
            zona = { nombre: `Domicilio ${fmtCOP(domi_precio)}`, precio: Number(domi_precio), barrios: [], conjuntos: [] };
            zonas.push(zona);
          }
          const lista = Array.isArray(zona[campo]) ? zona[campo] as string[] : [];
          lista.push(sitio);
          zona[campo] = lista;
          await sbPatch(`/rest/v1/ia_config?branch_id=eq.${branchId}`, {
            domicilios: { ...dom, zonas },
          });
          aprendido = sitio;
          console.log(`[domi] aprendido: "${sitio}" como ${campo} a ${fmtCOP(domi_precio)}`);
        } else {
          console.log(`[domi] "${sitio}" ya estaba en las zonas — no se duplica`);
        }
      } catch (err) {
        /* Que no se pueda aprender NO puede frenar el pedido de este cliente. */
        console.error("[domi] no se pudo guardar la zona:", err);
      }
    }

    /* ── 4. PACO RETOMA, no se cierra el pedido ────────────────────────────

       Antes aqui se creaba el pedido de una. Servia si la conversacion ya iba
       terminada, pero si la direccion llego temprano faltaban el nombre y el
       pago, y el pedido salia a medias.

       Ahora se apagan las banderas y se le despierta por el MISMO camino que
       un mensaje del cliente —una entrada en la cola y una llamada a
       delay-reply—, para que siga exactamente por donde iba, ya con el precio
       del domicilio resuelto en las zonas. */
    await sbPatch(`/rest/v1/chat_conversations?id=eq.${conversation_id}`, {
      domi_precio_pendiente: false,
      human_takeover:        false,
      handoff_motivo:        null,
      handoff_at:            null,
    });

    let retomo = false;
    try {
      await sbPost(`/rest/v1/chat_ai_queue`, {
        conversation_id, branch_id: branchId, tenant_id: tenantId || null,
        from_phone: fromPhone, phone_id: phoneId, access_token: accessToken,
        batch_start: new Date().toISOString(),
        fire_at:     new Date().toISOString(),
        processed:   false,
      });
      const r = await fetch(`${SUPABASE_URL}/functions/v1/delay-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ convId: conversation_id }),
      });
      retomo = r.ok;
      console.log("[domi] Paco retoma la conversación:", r.status);
    } catch (err) {
      console.error("[domi] no se pudo despertar a Paco:", err);
    }

    return new Response(
      JSON.stringify({ ok: true, aprendido: aprendido || null, retomo }),
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
