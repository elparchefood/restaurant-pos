const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

async function sbGet(path: string): Promise<Array<Record<string, unknown>> | null> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) return null;
  return res.json();
}
async function sbPost(path: string, data: Record<string, unknown>, rep = false): Promise<Array<Record<string, unknown>> | null> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json", "Prefer": rep ? "return=representation" : "return=minimal",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) { console.error("sbPost error", path, await res.text()); return null; }
  return rep ? res.json() : null;
}
async function sbPatch(path: string, data: Record<string, unknown>): Promise<void> {
  await fetch(`${SUPABASE_URL}${path}`, {
    method: "PATCH",
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

const CHANNEL_BY_TIPO: Record<string, string> = { domicilio: "domicilio", recoger: "rapido", mesa: "salon" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return new Response("Method Not Allowed", { status: 405, headers: CORS });

  try {
    const b = await req.json();
    const conversation_id = b.conversation_id as string | undefined;
    const branchId = String(b.branch_id || "");
    const tenantId = String(b.tenant_id || "");
    const cliente  = String(b.cliente || "Cliente WhatsApp");
    let telefono = String(b.telefono || "").replace(/\D/g, "");
    if (telefono.length === 12 && telefono.startsWith("57")) telefono = telefono.slice(2); // sin indicativo
    const direccion = String(b.direccion || "");
    const barrio    = String(b.barrio || "");
    const tipo     = String(b.tipo || "domicilio");
    const pago     = String(b.pago || "");
    const notas    = String(b.notas || "");
    /* La etiqueta de venta rapida (Espera / Avisar / A carro...). Antes solo
       existia en la pantalla de venta rapida; desde el chat no habia donde
       escogerla, justo en los pedidos para recoger, que es donde mas sirve. */
    const etiqueta = String(b.etiqueta || "").trim();
    const domiPrecio = Number(b.domi_precio || 0);
    const productos = (b.productos as Array<Record<string, unknown>>) || [];

    if (!branchId) return json({ error: "branch_id requerido" }, 400);
    if (!productos.length) return json({ error: "El pedido no tiene productos" }, 400);

    // La CAJA debe estar abierta: si no, el pedido quedaría huérfano y descuadraría el turno.
    const sess = await sbGet(`/rest/v1/pos_sessions?branch_id=eq.${branchId}&status=eq.open&order=opened_at.desc&limit=1`) as Array<Record<string, unknown>> | null;
    const openSession = sess?.[0];
    if (!openSession) return json({ error: "La caja está cerrada. Ábrela primero para poder crear el pedido." }, 400);

    const channel = CHANNEL_BY_TIPO[tipo] || "domicilio";

    // 1. Cliente (buscar/crear)
    let clienteId: string | null = null;
    try {
      if (telefono) {
        // EL TELÉFONO ES LA IDENTIDAD del cliente. Antes se exigía que
        // coincidieran teléfono + nombre + dirección, así que el mismo cliente
        // pidiendo a otra dirección (o con el nombre escrito distinto) creaba
        // un cliente NUEVO cada vez y se perdía su historial.
        // Ahora: mismo teléfono = misma persona. Se le actualizan nombre y
        // dirección con lo último que dio (la gente se muda y pide a la casa,
        // a la oficina, etc.), y todos sus pedidos quedan bajo el mismo cliente.
        const tel10 = telefono.slice(-10);
        const cands = await sbGet(`/rest/v1/pos_clientes?tenant_id=eq.${tenantId}&telefono=like.*${encodeURIComponent(tel10)}&select=id,nombre,direccion,direcciones,barrio`) as Array<Record<string, unknown>> | null || [];
        const existente = cands[0];
        if (existente) {
          clienteId = String(existente.id);
          const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
          // El nombre se mejora, no se pisa: si ya tiene uno real no lo
          // reemplaza por el genérico de WhatsApp.
          if (cliente && cliente !== "Cliente WhatsApp") patch.nombre = cliente;
          // Las direcciones se ACUMULAN. Si pide a un lugar nuevo se suma a su
          // lista; la última usada queda como la principal.
          if (direccion) {
            const nn = (x: unknown) => String(x || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
            // Cada direccion guarda SU barrio: sin el no se puede cobrar el
            // domicilio de esa direccion. Las viejas eran texto suelto, asi que
            // se normalizan al vuelo.
            type Dir = { dir: string; barrio: string };
            const aDir = (x: unknown): Dir => (x && typeof x === "object")
              ? { dir: String((x as Dir).dir || ""), barrio: String((x as Dir).barrio || "") }
              : { dir: String(x || ""), barrio: "" };
            const previas = Array.isArray(existente.direcciones) ? (existente.direcciones as unknown[]).map(aDir) : [];
            const todas = previas.filter((d) => d.dir.trim());
            if (existente.direccion && !todas.some((d) => nn(d.dir) === nn(existente.direccion))) {
              todas.push({ dir: String(existente.direccion), barrio: String(existente.barrio || "") });
            }
            const ya = todas.find((d) => nn(d.dir) === nn(direccion));
            if (ya) { if (barrio) ya.barrio = barrio; }   // ya la conociamos: solo se refresca el barrio
            else todas.push({ dir: direccion, barrio });
            patch.direcciones = todas;
            patch.direccion = direccion;
            if (barrio) patch.barrio = barrio;
          }
          await sbPatch(`/rest/v1/pos_clientes?id=eq.${existente.id}`, patch);
        } else {
          const nc = await sbPost(`/rest/v1/pos_clientes`, { tenant_id: tenantId || null, branch_id: branchId, nombre: cliente, telefono, direccion: direccion || null, barrio: barrio || null, direcciones: direccion ? [{ dir: direccion, barrio }] : [], updated_at: new Date().toISOString() }, true);
          clienteId = nc?.[0]?.id ? String(nc[0].id) : null;
        }
      }
    } catch (e) { console.error("cliente:", e); }

    // 2. Items + totales
    const items = productos.map(p => {
      const qty   = Math.max(1, Number(p.cantidad) || 1);
      const base  = Number(p.unit_price) || 0;
      const adiciones = Array.isArray(p.adiciones) ? p.adiciones as Array<Record<string, unknown>> : [];
      const adicSum = adiciones.reduce((s, a) => s + (Number(a.price) || 0), 0);
      const unit = base + adicSum;               // precio unitario = base + adiciones
      const mods: Record<string, unknown> = {};  // formato pos: { op_id: {qty,name,price} }
      adiciones.forEach(a => { const key = String(a.id || a.name); mods[key] = { qty: 1, name: String(a.name || ""), price: Number(a.price) || 0 }; });
      const nota = p.notas ? String(p.notas) : "";
      const pname = String(p.product_name || p.nombre || "Producto");
      return {
        product_id:   p.product_id ? String(p.product_id) : null,
        name: pname, product_name: pname,
        product_price: unit, unit_price: unit, total: unit * qty, quantity: qty,
        status: "pending",
        selections: { pres: p.tamano || "", vars: (p.variantes && typeof p.variantes === "object") ? p.variantes : {}, mods },
        notes: nota || null, branch_id: branchId, tenant_id: tenantId || null,
      };
    });
    const subtotal = items.reduce((s, i) => s + i.total, 0);
    const empaque = Math.max(0, Number(b.empaque) || 0);
    const domi = channel === "domicilio" ? domiPrecio : 0;
    const foodTotal = subtotal + empaque;   // comida + empaque = la VENTA (sin domicilio)
    const total = foodTotal + domi;         // lo que paga el cliente

    // Notas del pedido: dirección + [barrio:X] (comanda) + [tel:X] (recibo) + notas — mismo formato que domicilios.js
    const barrioTag = barrio ? ` [barrio:${barrio.toUpperCase()}]` : "";
    const telTag    = telefono ? ` [tel:${telefono}]` : "";
    /* Va junto a [barrio:] y [tel:], NO dentro del texto libre de notas: es el
       mismo formato que ya escribe venta-rapida.js y que pos-print.js sabe
       sacar de la linea de la direccion. */
    const etqTag    = etiqueta ? ` [etq:${etiqueta.toUpperCase()}]` : "";
    const orderNotes = ((direccion || "") + barrioTag + telTag + etqTag + (notas ? " — " + notas : "")).trim() || null;

    // 3. Pedido
    const orderRecord: Record<string, unknown> = {
      branch_id: branchId, tenant_id: tenantId || null,
      session_id: String(openSession.id),        // enlazado al turno actual → cuenta en la caja
      channel, customer_name: cliente,
      notes: orderNotes, payment_method: pago || null,
      status: "open", subtotal, total, total_final: foodTotal,
      delivery_fee: domi || null, packaging_fee: empaque || null,
      delivery_status: channel === "domicilio" ? "preparacion" : null,
      waiter_name: "Chat IA", visible_cocina: true, estado: "en_preparacion",
      opened_at: new Date().toISOString(),
    };
    if (clienteId) orderRecord.cliente_id = clienteId;

    const created = await sbPost(`/rest/v1/pos_orders`, orderRecord, true);
    const orderId = created?.[0]?.id ? String(created[0].id) : null;
    if (!orderId) return json({ error: "No se pudo crear el pedido" }, 500);

    for (const it of items) await sbPost(`/rest/v1/pos_order_items`, { ...it, order_id: orderId });

    // 4. Enlazar el pedido a la conversación y limpiar lo pendiente
    if (conversation_id) {
      await sbPatch(`/rest/v1/chat_conversations?id=eq.${conversation_id}`, { order_id: orderId, pending_order_data: null });

      // 4b. Disparar los efectos del estado inicial "en preparación": poner la
      // etiqueta configurada y avisarle al cliente. Reutilizamos 'cambiar-estado'
      // (misma logica que cuando el operador cambia el estado a mano) en vez de
      // duplicarla. Va DESPUES del enlace porque esa funcion busca la conversacion
      // por order_id. Best-effort: si falla, el pedido ya quedo creado igual.
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/cambiar-estado`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_KEY}` },
          body: JSON.stringify({ order_id: orderId, estado: "en_preparacion" }),
        });
      } catch (_e) { /* la etiqueta/aviso nunca bloquea la creacion del pedido */ }
    }

    // ── LISTA NEGRA (cascada AUTO): si el teléfono está bloqueado, agrega esta
    //    dirección a la misma persona (telaraña). Best-effort, nunca bloquea el pedido.
    try {
      if (telefono || direccion) {
        const dnorm = direccion ? direccion.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim() : "";
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/lista_negra_cascada`, {
          method: "POST",
          headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ p_tenant: tenantId, p_tel: telefono || null, p_dir: direccion || null, p_dir_norm: dnorm || null }),
        });
      }
    } catch (_e) { /* la cascada nunca bloquea la creación del pedido */ }

    return json({ ok: true, orderId, total, subtotal, domi });

  } catch (e) {
    console.error("crear-pedido-chat error:", e);
    return json({ error: String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
