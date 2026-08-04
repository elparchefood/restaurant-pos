// web-pedido — el cliente manda su pedido desde la página.
//
// LOS PRECIOS NO VIENEN DEL NAVEGADOR. Se reciben ids y cantidades; el precio de
// cada plato y el del domicilio se leen aquí, del catálogo y de la tabla de
// zonas del restaurante. Si se confiara en lo que manda el navegador, cualquiera
// pediría una hamburguesa de $28.000 mandando que vale $1. En el chat esto no
// hacía falta porque quien manda el pedido es el cajero; en una página pública sí.
//
// Y el pedido entra como PENDIENTE DE PAGO, nunca directo a cocina: primero paga.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sbGet(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { headers: H });
  return r.ok ? await r.json() : null;
}
async function sbPost(path: string, data: unknown, devolver = false) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: "POST",
    headers: { ...H, "Prefer": devolver ? "return=representation" : "return=minimal" },
    body: JSON.stringify(data),
  });
  if (!r.ok) { console.error("sbPost", path, (await r.text()).slice(0, 300)); return null; }
  return devolver ? await r.json() : true;
}
async function sha256(t: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const norm = (s: unknown) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

  try {
    const b = await req.json().catch(() => ({})) as Record<string, unknown>;

    // ── 1. ¿Quién es? La sesión manda; el navegador no dice quién es. ──
    const ses = await sbGet(
      `/pos_web_sesiones?token_hash=eq.${encodeURIComponent(await sha256(String(b.token || "")))}&select=*&limit=1`
    ) as Array<Record<string, unknown>> | null;
    const s = ses?.[0];
    if (!s || new Date(String(s.expira_at)).getTime() < Date.now()) {
      return json({ ok: false, razon: "sesion", mensaje: "Tu sesión se venció. Vuelve a entrar." });
    }
    const tenantId  = String(s.tenant_id);
    const clienteId = String(s.cliente_id);

    // ── 2. El restaurante y su estado ──
    const tRows = await sbGet(`/tenants?id=eq.${tenantId}&select=id,web_activa,status&limit=1`) as Array<Record<string, unknown>> | null;
    const t = tRows?.[0];
    if (!t || !t.web_activa || t.status !== "active") {
      return json({ ok: false, razon: "cerrada", mensaje: "Esta página no está recibiendo pedidos." });
    }

    const est = await sbGet(`/rpc/fn_web_estado?p_tenant=${tenantId}`) as Array<Record<string, unknown>> | null;
    const abierto = !!est?.[0]?.abierto;
    const permite = !!est?.[0]?.permite_programar;
    /* Cerrado: solo se acepta si el restaurante deja programar. Es la decisión de
       Sergio — cerrado no apaga la página, pero pedir sí depende del dueño. */
    if (!abierto && !permite) {
      return json({ ok: false, razon: "cerrado", mensaje: String(est?.[0]?.detalle || "Ahora está cerrado.") });
    }

    const brRows = await sbGet(`/branches?tenant_id=eq.${tenantId}&select=id&order=created_at&limit=1`) as Array<Record<string, unknown>> | null;
    const branchId = brRows?.[0]?.id ? String(brRows[0].id) : "";
    if (!branchId) return json({ ok: false, razon: "sucursal", mensaje: "No pudimos tomar el pedido." });

    // ── 3. El pedido, con precios DEL CATÁLOGO ──
    const items = Array.isArray(b.items) ? b.items as Array<Record<string, unknown>> : [];
    if (!items.length) return json({ ok: false, razon: "vacio", mensaje: "Tu pedido está vacío." });
    if (items.length > 40) return json({ ok: false, razon: "muchos", mensaje: "Demasiados productos." });

    const ids = [...new Set(items.map((i) => String(i.producto_id || "")))].filter(Boolean);
    const prods = await sbGet(
      `/pos_products?id=in.(${ids.join(",")})&tenant_id=eq.${tenantId}&select=id,name,price,presentations,available`
    ) as Array<Record<string, unknown>> | null;
    const porId: Record<string, Record<string, unknown>> = {};
    (prods || []).forEach((p) => { porId[String(p.id)] = p; });

    const lineas: Array<Record<string, unknown>> = [];
    let subtotal = 0;
    for (const it of items) {
      const p = porId[String(it.producto_id || "")];
      if (!p || p.available === false) {
        return json({ ok: false, razon: "agotado", mensaje: "Uno de los productos ya no está disponible. Revisa tu pedido." });
      }
      const cant = Math.max(1, Math.min(20, Number(it.cantidad) || 1));
      // El precio sale de la presentación si la hay; si no, del producto.
      let precio = Number(p.price) || 0;
      let nombre = String(p.name || "");
      const presN = String(it.presentacion || "");
      if (presN) {
        const pres = (Array.isArray(p.presentations) ? p.presentations : [])
          .find((x: Record<string, unknown>) => norm(x.name) === norm(presN));
        if (!pres) return json({ ok: false, razon: "presentacion", mensaje: "Esa presentación ya no existe." });
        precio = Number((pres as Record<string, unknown>).price) || precio;
        nombre += " · " + String((pres as Record<string, unknown>).name);
      }
      subtotal += precio * cant;
      lineas.push({
        product_id: p.id, name: nombre, quantity: cant, unit_price: precio,
        notes: String(it.nota || "").slice(0, 120) || null,
        branch_id: branchId, tenant_id: tenantId,
      });
    }

    // ── 4. Domicilio: el precio sale de la tabla de zonas del restaurante ──
    const tipo = String(b.tipo || "recoger") === "domicilio" ? "domicilio" : "recoger";
    const direccion = String(b.direccion || "").trim().slice(0, 160);
    const barrio    = String(b.barrio || "").trim().slice(0, 60);
    let domi = 0, barrioConocido = false;

    if (tipo === "domicilio") {
      if (!direccion) return json({ ok: false, razon: "direccion", mensaje: "Escribe tu dirección." });
      const cfg = await sbGet(`/ia_config?branch_id=eq.${branchId}&select=domicilios&limit=1`) as Array<Record<string, unknown>> | null;
      const zonas = ((cfg?.[0]?.domicilios || {}) as Record<string, unknown>).zonas;
      if (Array.isArray(zonas)) {
        for (const z of zonas as Array<Record<string, unknown>>) {
          const bs = Array.isArray(z.barrios) ? z.barrios : [];
          if (bs.some((x: unknown) => norm(x) === norm(barrio)) && norm(barrio)) {
            domi = Number(z.precio) || 0; barrioConocido = true; break;
          }
        }
      }
      /* Barrio que la tabla no conoce: el pedido entra igual con domicilio en
         cero y MARCADO, para que el restaurante le ponga el valor. Rechazarlo
         sería perder la venta por un barrio mal escrito. */
    }

    const total = subtotal + domi;

    // ── 5. El pedido. PENDIENTE DE PAGO: primero paga, después cocina. ──
    const notas = [
      tipo === "domicilio" ? direccion : "",
      barrio ? `[barrio:${barrio.toUpperCase()}]` : "",
      `[tel:${String(s.telefono || "")}]`,
      "[web]",
      String(b.notas || "").trim() ? "— " + String(b.notas).trim().slice(0, 200) : "",
    ].filter(Boolean).join(" ");

    const cli = await sbGet(`/pos_clientes?id=eq.${clienteId}&select=nombre&limit=1`) as Array<Record<string, unknown>> | null;

    const creado = await sbPost(`/pos_orders`, {
      tenant_id: tenantId, branch_id: branchId, cliente_id: clienteId,
      channel: tipo === "domicilio" ? "domicilio" : "rapido",
      status: "pendiente_pago",
      customer_name: cli?.[0]?.nombre || null,
      subtotal, total, total_final: total,
      delivery_fee: domi, packaging_fee: 0,
      notes: notas, visible_cocina: false,
      estado: tipo === "domicilio" ? "en_preparacion" : null,
    }, true) as Array<Record<string, unknown>> | null;

    const orderId = creado?.[0]?.id ? String(creado[0].id) : "";
    if (!orderId) return json({ ok: false, razon: "no_se_creo", mensaje: "No pudimos crear tu pedido. Intenta de nuevo." });

    for (const l of lineas) await sbPost(`/pos_order_items`, { ...l, order_id: orderId });

    // Los datos de pago, para que el cliente transfiera.
    const cfgP = await sbGet(`/ia_config?branch_id=eq.${branchId}&select=pagos&limit=1`) as Array<Record<string, unknown>> | null;
    const pagos = (cfgP?.[0]?.pagos || {}) as Record<string, unknown>;

    return json({
      ok: true, order_id: orderId, total, domicilio: domi, subtotal,
      barrio_conocido: barrioConocido,
      programado: !abierto,
      pago: { llave: pagos.llave || "", titular: pagos.titular || "", banco: pagos.banco || "" },
    });
  } catch (e) {
    console.error("[web-pedido]", String(e).slice(0, 400));
    return json({ ok: false, razon: "error", mensaje: "Algo falló. Intenta de nuevo." }, 500);
  }
});
