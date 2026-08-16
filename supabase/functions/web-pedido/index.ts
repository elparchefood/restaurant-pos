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

/* El empaque, con la MISMA logica que pos-core.js. No se reinventa: si un dia
   cambia la regla, tiene que cambiar en los dos sitios a la vez o el total de
   la pagina dejara de coincidir con el del POS, y eso es justo lo que rompe la
   confianza en la caja.

   Modo "especifico": tarifa por unidad en cascada, de lo mas concreto a lo mas
   general — presentacion, producto, categoria, tarifa general.
   Modo "unificado": fijo o porcentaje, por unidad o por pedido. */
function calcEmpaque(
  items: Array<{ productId: string; catId: string; presId: string; qty: number; unitPrice: number }>,
  cfg: Record<string, unknown>,
  esDomicilio: boolean,
) {
  try {
    if (!cfg || cfg.empaquesActivo !== true || !items.length) return 0;
    let prod = 0, units = 0;
    for (const i of items) { prod += (Number(i.unitPrice) || 0) * (Number(i.qty) || 0); units += Number(i.qty) || 0; }
    if (prod <= 0) return 0;

    const general = Number(cfg.empaqueMonto) || 0;

    if (cfg.empaqueModo === "especifico") {
      const packs = (Array.isArray(cfg.empaquePacks) ? cfg.empaquePacks : []) as Array<Record<string, unknown>>;
      const packMonto = (id: unknown) => {
        const p = packs.find((k) => String(k.id) === String(id));
        return p ? Number(p.monto) || 0 : 0;
      };
      const catCfg  = (cfg.empaqueCatCfg  || {}) as Record<string, Record<string, unknown>>;
      const prodCfg = (cfg.empaqueProdCfg || {}) as Record<string, unknown>;
      const presCfg = (cfg.empaquePresCfg || {}) as Record<string, unknown>;

      let total = 0;
      for (const i of items) {
        let fee = general;
        const cc = catCfg[i.catId];
        if (cc) { if (cc.on === false) fee = 0; else if (cc.packId) fee = packMonto(cc.packId); }
        const pc = prodCfg[i.productId];
        if (pc !== undefined && pc !== null && pc !== "") {
          fee = pc === "none" ? 0 : pc === "general" ? general : packMonto(pc);
        }
        const sc = i.presId ? presCfg[i.productId + "::" + i.presId] : undefined;
        if (sc !== undefined && sc !== null && sc !== "") {
          fee = sc === "none" ? 0 : sc === "general" ? general : packMonto(sc);
        }
        total += fee * (Number(i.qty) || 0);
      }
      return Math.round(total);
    }

    const usaDomi = cfg.empaqueCanal === "distinto" && esDomicilio;
    const esPct = cfg.empaqueTipo === "porcentaje";
    const rate = esPct
      ? Number(usaDomi ? cfg.empaquePctDomicilio : cfg.empaquePct) || 0
      : Number(usaDomi ? cfg.empaqueMontoDomicilio : cfg.empaqueMonto) || 0;
    if (cfg.empaqueBase === "pedido") return esPct ? Math.round(prod * rate / 100) : Math.round(rate);
    return esPct ? Math.round(prod * rate / 100) : Math.round(rate * units);
  } catch (e) { console.error("[empaque]", String(e).slice(0, 200)); return 0; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

  try {
    const b = await req.json().catch(() => ({})) as Record<string, unknown>;

    /* CUENTA PREVIA (16-ago). El carrito mostraba solo la suma de los productos:
       el cliente veia $42.000, confirmaba, y el pedido se creaba con el empaque
       sumado — ver un total y que le cobren otro es justo lo que rompe la
       confianza. Con `previo:true` esta misma funcion hace TODAS sus cuentas y
       devuelve el desglose SIN crear nada. No es una copia de la formula: es la
       misma linea de codigo que cobra, por eso no se pueden desincronizar. */
    const previo = b.previo === true;

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
    /* La cuenta previa se calcula aunque esten cerrados: el cliente arma su
       pedido mirando el total mucho antes de poder enviarlo. */
    if (!abierto && !permite && !previo) {
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
      /* `variables` y `category_id` NO son opcionales aunque el codigo de abajo
         parezca no necesitarlos (16-ago):
           · sin `variables` no se aplica el precio de la variante y una Premium
             Mixta Personal se cobraba $28.000 en vez de $34.000 — el negocio
             perdiendo $6.000 en cada pedido;
           · sin `category_id` el empaque no reconocia las categorias exentas y
             le cobraba empaque hasta a las bebidas.
         El codigo los leia (p.variables, p.category_id) y aqui nunca llegaban. */
      `/pos_products?id=in.(${ids.join(",")})&tenant_id=eq.${tenantId}&select=id,name,price,presentations,variables,category_id,available`
    ) as Array<Record<string, unknown>> | null;
    const porId: Record<string, Record<string, unknown>> = {};
    (prods || []).forEach((p) => { porId[String(p.id)] = p; });

    const paraEmpaque: Array<{ productId: string; catId: string; presId: string; qty: number; unitPrice: number }> = [];
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
      let presIdx = -1;
      if (presN) {
        const lista = Array.isArray(p.presentations) ? p.presentations : [];
        presIdx = lista.findIndex((x: Record<string, unknown>) => norm(x.name) === norm(presN));
        const pres = presIdx >= 0 ? lista[presIdx] : null;
        if (!pres) return json({ ok: false, razon: "presentacion", mensaje: "Esa presentación ya no existe." });
        precio = Number((pres as Record<string, unknown>).price) || precio;
        nombre += " · " + String((pres as Record<string, unknown>).name);
      }

      /* LA VARIANTE MANDA SOBRE EL PRECIO. Una Premium Mixta personal cuesta lo
         suyo, no lo que cuesta la Premium "a secas". Cada opcion trae un precio
         por presentacion, en el mismo orden que los tamaños.

         Y se busca AQUI, en el catalogo, no en lo que manda el navegador: si se
         confiara en el precio que llega de la pagina, cualquiera pediria una
         Premium por mil pesos. */
      const varsPed = Array.isArray(it.variantes) ? it.variantes as unknown[] : [];
      if (varsPed.length) {
        const grupos = Array.isArray(p.variables) ? p.variables as Array<Record<string, unknown>> : [];
        for (const nomVar of varsPed) {
          for (const g of grupos) {
            const ops = Array.isArray(g.options) ? g.options as Array<Record<string, unknown>> : [];
            const op = ops.find((o) => norm(o.name) === norm(nomVar));
            if (!op) continue;
            const pr = Array.isArray(op.prices) ? op.prices as unknown[] : [];
            const v = (presIdx >= 0 && pr.length > presIdx) ? Number(pr[presIdx]) : Number(op.price);
            if (v > 0) precio = v;
            nombre += " · " + String(op.name);
            break;
          }
        }
      }
      subtotal += precio * cant;
      /* Lo que el motor de empaques necesita saber de cada linea. Se recoge
         aqui, donde ya se conoce el producto y su presentacion. */
      paraEmpaque.push({
        productId: String(p.id), catId: String(p.category_id || ""),
        presId: presIdx >= 0 ? String((((Array.isArray(p.presentations) ? p.presentations : [])[presIdx] || {}) as Record<string, unknown>).id || "") : "",
        qty: cant, unitPrice: precio,
      });
      lineas.push({
        product_id: p.id, name: nombre, quantity: cant, unit_price: precio,
        notes: String(it.nota || "").slice(0, 120) || null,
        branch_id: branchId, tenant_id: tenantId,
      });
    }

    // ── 4. Domicilio: el precio sale de la tabla de zonas del restaurante ──
    /* El empaque sale de la configuracion del restaurante, igual que el precio
       del domicilio: nunca de lo que mande el navegador. */
    /* Nombre propio: `brRows` ya existe arriba (la sucursal). Con el mismo
       nombre el modulo NO ARRANCA — "Identifier has already been declared" —
       y la pagina entera deja de tomar pedidos. */
    const brOper = await sbGet(`/branches?id=eq.${branchId}&select=operacion_config&limit=1`) as Array<Record<string, unknown>> | null;
    const opCfg = (brOper?.[0]?.operacion_config || {}) as Record<string, unknown>;

    const tipo = String(b.tipo || "recoger") === "domicilio" ? "domicilio" : "recoger";
    const direccion = String(b.direccion || "").trim().slice(0, 160);
    const barrio    = String(b.barrio || "").trim().slice(0, 60);
    let domi = 0, barrioConocido = false;

    if (tipo === "domicilio") {
      // En la cuenta previa la dirección puede no estar escrita todavía: el
      // domicilio queda en cero y se muestra cuando el barrio ya se conozca.
      if (!direccion && !previo) return json({ ok: false, razon: "direccion", mensaje: "Escribe tu dirección." });
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

    const empaque = calcEmpaque(paraEmpaque, opCfg, tipo === "domicilio");

    /* EL TOTAL NO INCLUYE EL DOMICILIO. Es la convencion del POS: `total` es
       la comida mas el empaque, y el domicilio viaja en `delivery_fee`. La
       pagina lo estaba metiendo dentro, y eso habria descuadrado la caja en
       cuanto entrara el primer pedido web — justo lo que acabamos de arreglar.

       Lo que el cliente PAGA sigue siendo la suma de los dos; eso se le muestra
       y es lo que cobra web-pagar. */
    const total = subtotal + empaque;
    const aPagar = total + domi;

    // Solo la cuenta: aquí termina, sin crear pedido ni tocar nada.
    if (previo) {
      return json({
        ok: true, previo: true, subtotal, empaque, domicilio: domi,
        pedido: total, total: aPagar, barrio_conocido: barrioConocido,
      });
    }

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
      delivery_fee: domi, packaging_fee: empaque,
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
      ok: true, order_id: orderId, total: aPagar, pedido: total, empaque, domicilio: domi, subtotal,
      barrio_conocido: barrioConocido,
      programado: !abierto,
      pago: { llave: pagos.llave || "", titular: pagos.titular || "", banco: pagos.banco || "" },
    });
  } catch (e) {
    console.error("[web-pedido]", String(e).slice(0, 400));
    return json({ ok: false, razon: "error", mensaje: "Algo falló. Intenta de nuevo." }, 500);
  }
});
