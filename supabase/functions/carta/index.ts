// ═══════════════════════════════════════════════════════════════════════════
//  carta — la carta que abre el cliente desde WhatsApp
//
//  Sirve dos cosas y nada más:
//
//    abrir   → con un token, devuelve la carta de ESE restaurante, sus medios
//              de pago, lo que se le puede ofrecer, y —si es él— su saldo y
//              sus puntos.
//    guardar → escribe lo que escogió en el `pedido_borrador` de su
//              conversación, que es el mismo que Paco ya entiende.
//
//  ── LO QUE NO HACE, Y ES A PROPÓSITO ───────────────────────────────────────
//  No cobra. No descuenta saldo. No gasta puntos. No crea el pedido.
//
//  Regla de Sergio (8-sep): *"si ya se va al chat, ya se queda en el chat"*.
//  La página recoge la intención y se cierra; todo lo que toca dinero pasa
//  después, con Paco, donde la persona ya está. Así esta función queda de
//  SOLO LECTURA frente al dinero: aunque alguien la manipule, no puede gastar
//  nada de nadie.
//
//  ── EL TOKEN ES LA IDENTIDAD ───────────────────────────────────────────────
//  Quien abre esto no tiene cuenta ni sesión. El token dice de qué
//  conversación es, y de ahí salen el restaurante y el teléfono. Por eso el
//  cuerpo NUNCA manda tenant ni teléfono: si se creyera lo que manda la
//  pantalla, cualquiera podría pedir a nombre de otro número — y ese pedido
//  entra a la cocina.
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/*  La abre gente sin sesión, desde el navegador de WhatsApp. Sin esto el
    preflight se responde con 405 y la pantalla dice "Failed to fetch" sin
    explicar nada — ya nos pasó con el cobro.                              */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (c: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: c, headers: { ...CORS, "Content-Type": "application/json" } });

async function db(ruta: string, opts: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, {
    ...opts,
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json", ...(opts.headers || {}),
    },
  });
  const t = await r.text();
  let d: unknown = null;
  try { d = t ? JSON.parse(t) : null; } catch { /* no era JSON */ }
  return { ok: r.ok, status: r.status, text: t, data: d };
}

type Fila = Record<string, unknown>;
const filas = (x: unknown) => Array.isArray(x) ? x as Fila[] : [];

/*  ══ EL EMPAQUE ═══════════════════════════════════════════════════════════
    Sergio: *"los clientes se enredan y dicen 'no costaba 52.000'... toca
    explicarle que es por el empaque"*. Así que el precio sale ya sumado.

    La cascada es la MISMA que usa la caja (`posEmpaqueCalc`): general → lo
    pisa la categoría → lo pisa el producto → lo pisa la presentación. Si aquí
    se calculara distinto, la página diría un precio y el tiquete otro, que es
    exactamente el problema que se quería quitar.                          */
function empaqueDe(cfg: Fila, prodId: string, catId: string, presId: string, precio: number): number {
  if (!cfg || !cfg.empaquesActivo) return 0;
  const packs = new Map<string, number>();
  for (const p of filas(cfg.empaquePacks)) packs.set(String(p.id), Number(p.monto) || 0);
  const general = Number(cfg.empaqueMonto) || 0;

  if (cfg.empaqueModo !== "especifico") {
    //  Modo unificado: fijo por unidad, o un porcentaje del precio.
    if (cfg.empaqueTipo === "porcentaje") {
      return Math.round(precio * (Number(cfg.empaquePct) || 0) / 100);
    }
    return cfg.empaqueBase === "pedido" ? 0 : general;   // por pedido no es por unidad
  }

  let fee = general;
  const cc = (cfg.empaqueCatCfg as Record<string, Fila> | undefined)?.[catId];
  if (cc) {
    if (cc.on === false) fee = 0;
    else if (cc.packId) fee = packs.get(String(cc.packId)) || 0;
  }
  const pc = (cfg.empaqueProdCfg as Record<string, string> | undefined)?.[prodId];
  if (pc !== undefined && pc !== null && pc !== "") {
    fee = pc === "none" ? 0 : pc === "general" ? general : (packs.get(pc) || 0);
  }
  const sc = (cfg.empaquePresCfg as Record<string, string> | undefined)?.[`${prodId}::${presId}`];
  if (sc !== undefined && sc !== null && sc !== "") {
    fee = sc === "none" ? 0 : sc === "general" ? general : (packs.get(sc) || 0);
  }
  return fee;
}

/*  El enlace: existe, no ha caducado y no se ha usado. Las tres cosas, o no
    se abre. Un enlace usado que siguiera abriendo dejaría pedir dos veces.  */
async function abrirLink(token: string) {
  if (!token || token.length < 20) return { error: "enlace no válido" };
  const r = await db(`pos_carta_links?token=eq.${encodeURIComponent(token)}&select=*&limit=1`);
  const l = filas(r.data)[0];
  if (!l) return { error: "Este enlace no existe. Pídele la carta otra vez por el chat." };
  if (l.usado_at) return { error: "Este enlace ya se usó. Pídele la carta otra vez por el chat." };
  if (new Date(String(l.expira_at)).getTime() < Date.now()) {
    return { error: "Este enlace se venció. Pídele la carta otra vez por el chat." };
  }
  return { link: l };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let body: Fila = {};
  try { body = await req.json(); } catch { return json(400, { error: "cuerpo inválido" }); }
  const action = String(body.action || "");
  const token  = String(body.token || "");

  try {
    // ── ABRIR ─────────────────────────────────────────────────────────────
    if (action === "abrir") {
      const v = await abrirLink(token);
      if (v.error) return json(404, { error: v.error });
      const link = v.link as Fila;
      const tenant = String(link.tenant_id);
      const branch = String(link.branch_id || "");

      //  el restaurante
      const [mRes, bRes, cRes, pRes, iaRes] = await Promise.all([
        db(`brands?tenant_id=eq.${tenant}&select=name,logo_url&limit=1`),
        branch ? db(`branches?id=eq.${branch}&select=name,operacion_config&limit=1`)
               : db(`branches?tenant_id=eq.${tenant}&select=name,operacion_config&limit=1`),
        db(`pos_categories?tenant_id=eq.${tenant}&oculta_carta=is.false&select=id,name,sort_order,active&order=sort_order.nullsfirst`),
        db(`pos_products?tenant_id=eq.${tenant}&available=is.true&select=id,name,description,price,photo_url,image_url,presentations,variables,price_mode,mod_group_ids,mod_group_pres,category_id,agotado,sort_order&order=sort_order.nullsfirst`),
        db(`ia_config?tenant_id=eq.${tenant}&select=pagos,flujo_pasos&limit=1`),
      ]);
      if (!cRes.ok || !pRes.ok) {
        console.error("[carta] no se pudo leer la carta:", cRes.status, pRes.status);
        return json(502, { error: "no se pudo leer la carta" });
      }

      const marca = filas(mRes.data)[0] || {};
      const sede  = filas(bRes.data)[0] || {};
      const cfg   = (sede.operacion_config as Fila) || {};

      //  los grupos de adiciones que configuró el dueño
      const gRes = await db(`pos_modifier_groups?tenant_id=eq.${tenant}&select=id,name,options`);
      const grupos = new Map<string, Fila>();
      for (const g of filas(gRes.data)) grupos.set(String(g.id), g);

      const cats = filas(cRes.data).filter((c) => c.active !== false);
      const catNom = new Map<string, string>();
      for (const c of cats) catNom.set(String(c.id), String(c.name));

      const prods: Fila[] = [];
      for (const p of filas(pRes.data)) {
        if (p.agotado === true) continue;                       // lo agotado no aparece
        const catId = String(p.category_id || "");
        if (!catNom.has(catId)) continue;                       // categoría escondida o apagada
        const pres = filas(p.presentations);
        if (!pres.length) continue;

        const emp: Record<string, number> = {};
        for (const x of pres) {
          emp[String(x.id)] = empaqueDe(cfg, String(p.id), catId, String(x.id), Number(x.price) || 0);
        }

        //  qué adiciones aplican a cada presentación (Personales / Familiares)
        const adic: Record<string, Fila> = {};
        const mgp = (p.mod_group_pres as Record<string, string[]> | null) || {};
        for (const [gid, presIds] of Object.entries(mgp)) {
          const g = grupos.get(gid);
          if (!g) continue;
          for (const pid of (presIds || [])) adic[pid] = { n: g.name, ops: filas(g.options).map((o) => ({ n: o.name, p: Number(o.price) || 0 })) };
        }
        if (!Object.keys(adic).length) {
          for (const gid of filas(p.mod_group_ids).map(String)) {
            const g = grupos.get(gid);
            if (g) { adic[String(pres[0].id)] = { n: g.name, ops: filas(g.options).map((o) => ({ n: o.name, p: Number(o.price) || 0 })) }; break; }
          }
        }

        prods.push({
          id: p.id, cat: catNom.get(catId), catId,
          n: String(p.name || "").trim(),
          d: String(p.description || "").slice(0, 120),
          f: p.photo_url || p.image_url || "",
          pres: pres.map((x) => ({ id: x.id, n: x.name || "", p: Number(x.price) || 0 })),
          emp,
          vg: filas(p.variables).map((g) => ({
            id: g.id, n: g.name, precia: g.isPricing === true,
            ops: filas(g.options).map((o) => ({
              id: o.id, n: o.name, p: Number(o.price) || 0,
              prs: filas(o.prices).map((y) => Number(y) || 0),
            })),
          })),
          adic,
        });
      }

      //  los medios de pago activos, en su orden
      const ia = filas(iaRes.data)[0] || {};
      const pagos = filas((ia.pagos as Fila | undefined)?.metodos)
        .filter((m) => m.activo !== false)
        .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0))
        .map((m) => ({ id: m.id, n: m.nombre, tipo: m.tipo, banco: m.banco || "" }));

      /*  Lo que se ofrece al agregar sale del paso `upsell` del flujo de Paco.
          Si se escribiera otra lista aquí, el día que el dueño cambie la suya
          tendríamos a Paco ofreciendo una cosa y a la página otra.        */
      const pasoUp = filas(ia.flujo_pasos).find((x) => x.campo === "upsell");
      const upsell = filas(pasoUp?.upsell_items).map((x) => ({
        tipo: x.tipo, nombre: x.nombre,
        cat: x.cat_id ? catNom.get(String(x.cat_id)) || "" : "",
      })).filter((x) => x.tipo !== "categoria" || x.cat);

      //  su saldo y sus puntos — SOLO para enseñarlos, nunca para gastarlos
      const tel = String(link.telefono || "").replace(/\D/g, "");
      const tel10 = tel.slice(-10);
      const [ptRes, clRes] = await Promise.all([
        db(`pos_puntos?tenant_id=eq.${tenant}&telefono=eq.${encodeURIComponent(tel10)}&select=puntos&limit=1`),
        db(`pos_clientes?tenant_id=eq.${tenant}&telefono=eq.${encodeURIComponent(tel10)}&select=id,nombre&limit=1`),
      ]);
      const cliente = filas(clRes.data)[0];
      let saldo = 0;
      if (cliente) {
        const sRes = await db(`pos_saldo?tenant_id=eq.${tenant}&cliente_id=eq.${cliente.id}&select=saldo&limit=1`);
        saldo = Number(filas(sRes.data)[0]?.saldo) || 0;
      }
      const puntos = Number(filas(ptRes.data)[0]?.puntos) || 0;

      //  el catálogo de premios, para poder decirle qué alcanza
      const prRes = await db(`pos_puntos_catalogo?tenant_id=eq.${tenant}&select=product_id,pres_nombre,puntos,dinero,activo&order=puntos.asc`);
      /*  Los nombres de los premios salen de `pos_products` directamente, NO de
          la lista que se envía a la pantalla. Muchos premios son adiciones, y
          esa categoría suele estar escondida de la carta pública: buscándolos
          ahí, la "Adición Salsa · Rosada" salía llamándose "Combo · Rosada".  */
      const npRes = await db(`pos_products?tenant_id=eq.${tenant}&select=id,name`);
      const nomProd = new Map<string, string>();
      for (const p of filas(npRes.data)) nomProd.set(String(p.id), String(p.name || "").trim());
      const premios = filas(prRes.data)
        .filter((x) => x.activo !== false)
        .map((x) => {
          const base = nomProd.get(String(x.product_id)) || "Combo";
          const pn = String(x.pres_nombre || "").trim();
          return { n: pn ? `${base} · ${pn}` : base, pts: Number(x.puntos) || 0, dinero: Number(x.dinero) || 0 };
        });

      /*  ══ EL BOTÓN DE VOLVER AL CHAT ════════════════════════════════════
          Sergio preguntó si la página se puede cerrar sola al terminar. No:
          `window.close()` solo cierra ventanas que abrió el propio código, y
          esta la abre WhatsApp — en su navegador interno no hace nada.

          Lo que sí se puede, y es mejor, es devolverla A LA CONVERSACIÓN. Y
          tiene que ser a la SUYA: alguien puede estar escribiendo por
          Instagram o por Facebook, y mandarlo a WhatsApp sería dejarlo en un
          chat que no es el suyo, con su pedido esperando en otro.
          ⚠️ De `meta` solo se saca lo público. Ahí viven los tokens.      */
      let volver = "";
      const chRes = await db(`chat_conversations?id=eq.${link.conv_id}&select=channel,channel_id&limit=1`);
      const conv = filas(chRes.data)[0] || {};
      if (conv.channel_id) {
        const caRes = await db(`chat_channels?id=eq.${conv.channel_id}&select=channel,handle,meta&limit=1`);
        const ca = filas(caRes.data)[0];
        if (ca) {
          const meta = (ca.meta as Fila) || {};
          const canal = String(ca.channel || conv.channel || "");
          if (canal === "whatsapp") {
            const num = String(ca.handle || "").replace(/\D/g, "");
            if (num) volver = "https://wa.me/" + num;
          } else if (canal === "instagram") {
            const u = String(meta.username || ca.handle || "").replace(/^@/, "");
            if (u) volver = "https://ig.me/m/" + u;
          } else if (canal === "facebook") {
            const pid = String(meta.page_id || "");
            if (pid) volver = "https://m.me/" + pid;
          }
        }
      }

      //  si vuelve a corregir, su pedido tal como quedó
      let borrador: unknown = null;
      if (link.motivo === "correccion") {
        const cvRes = await db(`chat_conversations?id=eq.${link.conv_id}&select=pedido_borrador&limit=1`);
        borrador = filas(cvRes.data)[0]?.pedido_borrador || null;
      }

      return json(200, {
        ok: true,
        motivo: link.motivo,
        restaurante: { nombre: marca.name || "", logo: marca.logo_url || "", sede: sede.name || "" },
        telefono: tel10,
        cats: cats.map((c) => String(c.name)),
        prods,
        pagos,
        upsell,
        premios,
        cliente: { saldo, puntos, nombre: cliente?.nombre || "" },
        empaque_activo: cfg.empaquesActivo === true,
        volver,
        borrador,
      });
    }

    // ── GUARDAR ───────────────────────────────────────────────────────────
    if (action === "guardar") {
      const v = await abrirLink(token);
      if (v.error) return json(404, { error: v.error });
      const link = v.link as Fila;
      const tenant = String(link.tenant_id);

      const items = filas(body.productos);
      if (!items.length) return json(400, { error: "el pedido está vacío" });
      if (items.length > 40) return json(400, { error: "demasiados productos" });

      /*  ══ LOS PRECIOS SE RECALCULAN AQUÍ, SIEMPRE ═══════════════════════
          La pantalla manda QUÉ escogió, nunca CUÁNTO vale. Si se creyera el
          precio que manda el navegador, cualquiera podría pedirse una
          Premium familiar por mil pesos — es exactamente el agujero que ya
          hubo con el monto del registro, donde la pantalla decía $1.000 y se
          cobraban $249.000 solo porque el servidor lo recalculaba.

          Aquí igual: del cuerpo se leen ids y cantidades; los precios salen
          de la base.                                                      */
      const ids = [...new Set(items.map((x) => String(x.product_id || "")))].filter(Boolean);
      const pRes = await db(`pos_products?tenant_id=eq.${tenant}&id=in.(${ids.join(",")})` +
        `&select=id,name,category_id,presentations,variables,mod_group_ids,mod_group_pres,available,agotado`);
      const porId = new Map<string, Fila>();
      for (const p of filas(pRes.data)) porId.set(String(p.id), p);

      const bRes = await db(link.branch_id
        ? `branches?id=eq.${link.branch_id}&select=id,operacion_config&limit=1`
        : `branches?tenant_id=eq.${tenant}&select=id,operacion_config&limit=1`);
      const sede = filas(bRes.data)[0] || {};
      const cfg = (sede.operacion_config as Fila) || {};

      const gRes = await db(`pos_modifier_groups?tenant_id=eq.${tenant}&select=id,name,options`);
      const grupos = new Map<string, Fila>();
      for (const g of filas(gRes.data)) grupos.set(String(g.id), g);

      const cRes = await db(`pos_categories?tenant_id=eq.${tenant}&select=id,name,comanda_alias`);
      const cats = new Map<string, Fila>();
      for (const c of filas(cRes.data)) cats.set(String(c.id), c);

      const productos: Fila[] = [];
      let subtotal = 0, empaque = 0;

      for (const it of items) {
        const p = porId.get(String(it.product_id || ""));
        if (!p) return json(400, { error: "un producto de tu pedido ya no está disponible" });
        if (p.available === false || p.agotado === true) {
          return json(409, { error: `Se acabó ${p.name}. Quita ese producto y vuelve a intentar.` });
        }
        const pres = filas(p.presentations);
        const presId = String(it.pres_id || "");
        const pr = pres.find((x) => String(x.id) === presId);
        if (!pr) return json(400, { error: "falta escoger el tamaño de un producto" });

        const cant = Math.max(1, Math.min(20, Number(it.cantidad) || 1));
        const vars = (it.variantes as Record<string, string> | undefined) || {};

        //  el precio base: por matriz si algún grupo fija el precio
        const vgs = filas(p.variables);
        const precia = vgs.find((g) => g.isPricing === true);
        let unit = Number(pr.price) || 0;
        const varsObj: Fila = {};
        const partes: string[] = [];

        for (const g of vgs) {
          const escogida = String(vars[String(g.id)] || "");
          const o = filas(g.options).find((x) => String(x.id) === escogida);
          if (!o) return json(400, { error: `falta escoger ${g.name} en ${p.name}` });
          varsObj[String(g.id)] = { id: o.id, name: o.name, price: Number(o.price) || 0, group: g.name };
          partes.push(String(o.name));
          if (g === precia) {
            const i = pres.findIndex((x) => String(x.id) === presId);
            const prs = filas(o.prices).map((y) => Number(y) || 0);
            unit = prs[i] != null ? prs[i] : (prs[0] != null ? prs[0] : Number(o.price) || 0);
          } else {
            unit += Number(o.price) || 0;
          }
        }

        //  las adiciones, con el precio del grupo QUE LE TOCA a esa presentación
        const mgp = (p.mod_group_pres as Record<string, string[]> | null) || {};
        let grupoAdic: Fila | null = null;
        for (const [gid, presIds] of Object.entries(mgp)) {
          if ((presIds || []).includes(presId)) { grupoAdic = grupos.get(gid) || null; break; }
        }
        if (!grupoAdic) {
          const uno = filas(p.mod_group_ids).map(String)[0];
          grupoAdic = uno ? (grupos.get(uno) || null) : null;
        }
        const adiciones: Fila[] = [];
        for (const nombre of filas(it.adiciones).map((x) => String((x as Fila).name ?? x))) {
          const o = grupoAdic ? filas(grupoAdic.options).find((x) => String(x.name) === nombre) : null;
          if (!o) return json(400, { error: `esa adición ya no está disponible en ${p.name}` });
          adiciones.push({ id: o.id, name: o.name, price: Number(o.price) || 0 });
          unit += Number(o.price) || 0;
        }

        const catId = String(p.category_id || "");
        const cat = cats.get(catId) || {};
        const emp = empaqueDe(cfg, String(p.id), catId, presId, Number(pr.price) || 0);

        //  el nombre, igual que en la comanda: presentación · producto · variantes
        const etiqueta = String(pr.name || "") || String(cat.comanda_alias || cat.name || "");
        productos.push({
          product_id: p.id, cat: catId,
          product_name: [etiqueta, p.name].concat(partes).filter(Boolean).join(" · "),
          unit_price: unit, cantidad: cant,
          tamano: pr.name || "", pres_id: presId,
          variantes: varsObj, adiciones,
          notas: String(it.notas || "").slice(0, 200),
          matched: true,
          /*  De dónde salió. El día que un pedido llegue raro, esto dice si lo
              escribió alguien o lo tocó en la carta.                       */
          origen: "carta",
        });
        subtotal += unit * cant;
        empaque  += emp * cant;
      }

      /*  El medio de pago tiene que ser uno de los que el restaurante tiene
          activos. Si no, alguien podría mandar "pago: gratis".            */
      const iaRes = await db(`ia_config?tenant_id=eq.${tenant}&select=pagos&limit=1`);
      const metodos = filas((filas(iaRes.data)[0]?.pagos as Fila | undefined)?.metodos)
        .filter((m) => m.activo !== false);
      const pedido = String(body.pago || "");
      const m = metodos.find((x) => String(x.id) === pedido || String(x.nombre) === pedido);
      if (!m) return json(400, { error: "ese medio de pago no existe" });

      const total = subtotal + empaque;
      const borrador = {
        productos, subtotal, empaque, total,
        telefono: String(link.telefono || "").replace(/\D/g, "").slice(-10),
        pago: m.nombre, pago_id: m.id,
        branch_id: sede.id || link.branch_id || null,
        tipo: "", direccion: "", barrio: "", cliente: "", notas: "",
        /*  Lo que la persona DIJO que quiere hacer con su saldo. Es una
            intención, no un cobro: aquí no se descuenta nada. Paco lo
            confirma en el chat y ahí sí se toca el dinero.               */
        saldo_intencion: Number(body.saldo_usar) || 0,
        desde_carta: true,
        carta_at: new Date().toISOString(),
      };

      const up = await db(`chat_conversations?id=eq.${link.conv_id}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ pedido_borrador: borrador }),
      });
      if (!up.ok) {
        console.error("[carta] no se pudo guardar el borrador:", up.status, up.text.slice(0, 200));
        return json(502, { error: "no se pudo guardar tu pedido. Inténtalo otra vez." });
      }

      /*  El enlace se quema. Recargar la pantalla no puede mandar el pedido
          dos veces — y si quiere corregir, Paco le manda uno nuevo.       */
      await db(`pos_carta_links?token=eq.${encodeURIComponent(token)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ usado_at: new Date().toISOString() }),
      });

      console.log(`[carta] pedido de ${borrador.telefono}: ${productos.length} productos, ${total}`);
      return json(200, { ok: true, total, subtotal, empaque, pago: m.nombre });
    }

    return json(400, { error: "acción desconocida" });
  } catch (e) {
    console.error("[carta]", String(e).slice(0, 300));
    return json(500, { error: String(e).slice(0, 200) });
  }
});
