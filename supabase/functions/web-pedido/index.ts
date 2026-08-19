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
/* ── EL BARRIO SE COMPARA IGUAL QUE EN EL CHAT ────────────────────────────
   Hasta hoy esta funcion comparaba el barrio LETRA POR LETRA: "bellavista"
   no era "Bella Vista", "el recuerdo" no era "Recuerdo", y el pedido entraba
   con domicilio en CERO aunque el barrio estuviera en la tabla desde siempre.
   Dos verdades para lo mismo — Paco tolerante y la pagina exacta — y la que
   cobra mal es la de la pagina. Este bloque es el MISMO de web-acceso (que a
   su vez viene de delay-reply). Si cambia la regla, cambia en los tres.
   ─────────────────────────────────────────────────────────────────────── */
function normalizarTexto(s: string): string {
  return s.toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* Copia de delay-reply tambien: `fuzzyBarrioMatch` la usa para tolerar
   una letra de diferencia. Sin ella la funcion reventaba en tiempo de
   ejecucion (500) — el copiar-pegar se llevo la que llama, no la llamada. */
function levenshtein(a: string, b: string): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? prevDiag : 1 + Math.min(prev[j], prev[j - 1], prevDiag);
      prevDiag = tmp;
    }
  }
  return prev[b.length];
}

function fuzzyBarrioMatch(direccion: string, barrio: string): boolean {
  const dirNorm = normalizarTexto(direccion);
  const barNorm = normalizarTexto(barrio);
  if (!dirNorm || !barNorm) return false;

  // 1) El nombre aparece tal cual. Este camino nunca fallo y se conserva.
  if (dirNorm.includes(barNorm)) return true;
  const dirSinEsp = dirNorm.replace(/[ ]/g, "");
  const barSinEsp = barNorm.replace(/[ ]/g, "");
  if (dirSinEsp.includes(barSinEsp)) return true;

  // 2) Palabras de relleno de una direccion: aparecen en casi todas y no
  //    pueden ser las que hagan coincidir un barrio. Sin esto, "Catay"
  //    coincidia con el "casa" de "Monteluna casa 45".
  const RELLENO: Record<string, boolean> = {
    calle: true, carrera: true, cra: true, kra: true, cr: true, kr: true,
    avenida: true, av: true, transversal: true, diagonal: true, via: true,
    casa: true, apto: true, apartamento: true, torre: true, bloque: true,
    manzana: true, mz: true, lote: true, piso: true, interior: true,
    barrio: true, conjunto: true, edificio: true, urbanizacion: true,
    norte: true, sur: true, este: true, oeste: true, numero: true, no: true,
  };

  const dirWords = dirNorm.split(" ").filter(w => w && !RELLENO[w] && !/^[0-9#-]+$/.test(w));
  const barWords = barNorm.split(" ").filter(Boolean);
  if (!dirWords.length || !barWords.length) return false;

  // 3) Un barrio de UNA palabra corta exige coincidencia exacta: con "Catay"
  //    o "Toez" cualquier tolerancia produce falsos.
  if (barWords.length === 1 && barSinEsp.length <= 6) {
    return dirWords.includes(barNorm);
  }

  // 4) Tolerancia estricta: 1 letra en palabras cortas, 2 solo en largas.
  //    Antes una palabra de 5 letras admitia 2 cambios (40% de la palabra) y
  //    por eso "calle" pasaba por "bella".
  const cerca = (a: string, b: string): boolean => {
    if (a === b) return true;
    const maxDist = b.length >= 8 ? 2 : 1;
    return levenshtein(a, b) <= maxDist;
  };

  // Cada palabra del barrio debe encontrar SU propia palabra en la direccion:
  // dos palabras del barrio no pueden apoyarse en la misma.
  const usadas: Record<number, boolean> = {};
  const todasCoinciden = barWords.every(bw => {
    if (bw.length <= 2) {
      const i = dirWords.findIndex((dw, k) => !usadas[k] && dw === bw);
      if (i < 0) return false;
      usadas[i] = true;
      return true;
    }
    const i = dirWords.findIndex((dw, k) => !usadas[k] && cerca(dw, bw));
    if (i < 0) return false;
    usadas[i] = true;
    return true;
  });
  if (todasCoinciden) return true;

  // 5) Nombre largo escrito de corrido o con erratas ("bellohorizonte").
  //    Se mantiene, pero mas estricto: 1 error cada 10 letras.
  if (barSinEsp.length >= 10) {
    const L = barSinEsp.length;
    const maxDist = Math.floor(L / 10);
    for (let i = 0; i <= dirSinEsp.length - L; i++) {
      if (levenshtein(dirSinEsp.slice(i, i + L), barSinEsp) <= maxDist) return true;
    }
  }
  return false;
}

/* Busca el barrio de la tabla que mejor case con lo que escribio el cliente.
   Se queda con el nombre MAS LARGO — "Bella Vista" antes que "Bella" — para no
   cobrar la zona equivocada. Misma regla que usa Paco. */
function zonaDeTexto(domicilios: Record<string, unknown> | null, texto: string) {
  if (!domicilios || !texto) return null;
  const zonas = (domicilios.zonas as Array<Record<string, unknown>>) || [];
  let mejor: { barrio: string; precio: number } | null = null;
  for (const z of zonas) {
    const lista = ((Array.isArray(z.barrios) ? z.barrios : []) as string[])
      .concat((Array.isArray(z.conjuntos) ? z.conjuntos : []) as string[]);
    for (const b of lista) {
      if (!b) continue;
      if (fuzzyBarrioMatch(texto, b) && (!mejor || b.length > mejor.barrio.length)) {
        mejor = { barrio: b, precio: Number(z.precio) || 0 };
      }
    }
  }
  return mejor;
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

    /* ── LOS COMBOS (17-ago) ──────────────────────────────────────────────
       Un combo NO es un producto: no esta en pos_products. Si llegara aqui
       como uno mas, el `porId` no lo encontraria y el pedido ENTERO se
       rechazaria con "uno de los productos ya no esta disponible".

       Se sigue la MISMA convencion que ya usan las tres pantallas de venta
       (pos-combos.js): el id viaja como "combo:<uuid>", en la linea del pedido
       `product_id` queda vacio y lo que llevaba se anota en `selections`, para
       que la comanda y el inventario lo lean aunque maNana cambie el combo. */
    const PREF = "combo:";
    const esCombo = (id: string) => id.startsWith(PREF);

    const ids = [...new Set(items.map((i) => String(i.producto_id || "")))]
      .filter((x) => x && !esCombo(x));
    const idsCombo = [...new Set(items.map((i) => String(i.producto_id || ""))
      .filter(esCombo).map((x) => x.slice(PREF.length)))].filter(Boolean);

    const combos: Record<string, Record<string, unknown>> = {};
    if (idsCombo.length) {
      const cs = await sbGet(
        `/pos_combos?id=in.(${idsCombo.join(",")})&tenant_id=eq.${tenantId}&select=id,name,price,items,active`
      ) as Array<Record<string, unknown>> | null;
      (cs || []).forEach((c) => { combos[String(c.id)] = c; });
    }
    /* Los productos de ADENTRO de cada combo: se necesitan para el empaque,
       que se cobra por lo que de verdad se empaca (tres cosas, tres empaques),
       igual que el inventario descuenta lo de adentro y no el combo. */
    const idsDentro = [...new Set(Object.values(combos).flatMap((c) =>
      (Array.isArray(c.items) ? c.items as Array<Record<string, unknown>> : [])
        .map((x) => String(x.product_id || ""))))].filter(Boolean);
    const catDe: Record<string, string> = {};
    if (idsDentro.length) {
      const ps = await sbGet(
        `/pos_products?id=in.(${idsDentro.join(",")})&tenant_id=eq.${tenantId}&select=id,category_id`
      ) as Array<Record<string, unknown>> | null;
      (ps || []).forEach((p) => { catDe[String(p.id)] = String(p.category_id || ""); });
    }

    const prods = ids.length ? await sbGet(
      /* `variables` y `category_id` NO son opcionales aunque el codigo de abajo
         parezca no necesitarlos (16-ago):
           · sin `variables` no se aplica el precio de la variante y una Premium
             Mixta Personal se cobraba $28.000 en vez de $34.000 — el negocio
             perdiendo $6.000 en cada pedido;
           · sin `category_id` el empaque no reconocia las categorias exentas y
             le cobraba empaque hasta a las bebidas.
         El codigo los leia (p.variables, p.category_id) y aqui nunca llegaban. */
      `/pos_products?id=in.(${ids.join(",")})&tenant_id=eq.${tenantId}&select=id,name,price,presentations,variables,category_id,mod_group_ids,mod_group_pres,available,agotado`
    ) as Array<Record<string, unknown>> | null : [];
    const porId: Record<string, Record<string, unknown>> = {};
    (prods || []).forEach((p) => { porId[String(p.id)] = p; });

    /* EL NOMBRE EN COMANDA DE LA CATEGORIA (19-ago). Un producto puede
       llamarse solo "SENCILLA": la palabra "Hamburguesa" vive en la categoria,
       y el POS manual la antepone siempre (tomar-pedido.js). Aqui no se traia,
       asi que a la cocina le llegaba "SENCILLA" a secas y nadie sabia de que
       plato hablaba. Se trae UNA vez para todo el pedido. */
    const catNombre: Record<string, string> = {};
    {
      const cids = [...new Set((prods || []).map((p) => String(p.category_id || "")))].filter(Boolean);
      if (cids.length) {
        const cs = await sbGet(
          `/pos_categories?id=in.(${cids.join(",")})&tenant_id=eq.${tenantId}&select=id,name,comanda_alias`
        ) as Array<Record<string, unknown>> | null;
        (cs || []).forEach((c) => {
          catNombre[String(c.id)] = String(c.comanda_alias || "").trim() || String(c.name || "").trim();
        });
      }
    }

    /* Los grupos de modificadores (las adiciones) viven en su propia tabla: se
       traen UNA vez para todo el pedido, no uno por línea. */
    const gruposMod: Record<string, Record<string, unknown>> = {};
    {
      const gids = [...new Set((prods || []).flatMap((p) =>
        (Array.isArray(p.mod_group_ids) ? p.mod_group_ids : []).map(String)))].filter(Boolean);
      if (gids.length) {
        const gs = await sbGet(
          `/pos_modifier_groups?id=in.(${gids.join(",")})&tenant_id=eq.${tenantId}&select=id,name,options`
        ) as Array<Record<string, unknown>> | null;
        (gs || []).forEach((g) => { gruposMod[String(g.id)] = g; });
      }
    }

    const paraEmpaque: Array<{ productId: string; catId: string; presId: string; qty: number; unitPrice: number }> = [];
    const lineas: Array<Record<string, unknown>> = [];
    let subtotal = 0;
    for (const it of items) {
      const idPedido = String(it.producto_id || "");

      /* Un combo se resuelve aparte y se sale: no tiene tamaNo, ni variante,
         ni adiciones — todo eso quedo decidido cuando el dueNo lo armo. */
      if (esCombo(idPedido)) {
        const c = combos[idPedido.slice(PREF.length)];
        if (!c || c.active === false) {
          return json({ ok: false, razon: "agotado", mensaje: "Uno de los combos ya no está disponible. Revisa tu pedido." });
        }
        const cant = Math.max(1, Math.min(20, Number(it.cantidad) || 1));
        // El precio sale del CATALOGO, nunca de lo que manda el navegador.
        const precio = Number(c.price) || 0;
        const dentro = (Array.isArray(c.items) ? c.items as Array<Record<string, unknown>> : [])
          .map((x) => ({
            product_id: String(x.product_id || ""), pres_id: x.pres_id || null,
            variantes: x.variantes || {}, cantidad: Number(x.cantidad) || 1,
            nombre: String(x.nombre || ""),
          }));

        subtotal += precio * cant;

        /* EL EMPAQUE, POR LO DE ADENTRO: un combo de tres cosas son tres
           empaques, igual que el inventario descuenta lo de adentro y no el
           combo.
           El precio de cada linea NO puede ir en cero: cuando el empaque se
           cobra por PORCENTAJE, ese precio es la base del calculo, y un pedido
           de puro combo habria pagado cero empaque. Se reparte el precio del
           combo entre sus productos, en proporcion a lo que vale cada uno
           suelto — asi la suma da exactamente el precio del combo. */
        const crudos = (Array.isArray(c.items) ? c.items as Array<Record<string, unknown>> : []);
        const suelto = crudos.reduce((a, x) =>
          a + (Number(x.precio) || 0) * (Number(x.cantidad) || 1), 0);
        dentro.forEach((d, k) => {
          const val = Number(crudos[k]?.precio) || 0;
          const parte = suelto > 0 ? precio * (val / suelto) : precio / (dentro.length || 1);
          paraEmpaque.push({
            productId: d.product_id, catId: catDe[d.product_id] || "",
            presId: String(d.pres_id || ""), qty: d.cantidad * cant, unitPrice: parte,
          });
        });
        lineas.push({
          product_id: null,                      // un combo no es un producto
          name: String(c.name || "Combo"), product_name: String(c.name || "Combo"),
          product_price: precio, unit_price: precio,
          total: precio * cant,
          quantity: cant,
          selections: { combo_id: String(c.id), combo_nombre: String(c.name || ""), combo_items: dentro },
          notes: String(it.nota || "").slice(0, 120) || null,
          branch_id: branchId, tenant_id: tenantId,
        });
        continue;
      }

      const p = porId[idPedido];
      if (!p || p.available === false) {
        return json({ ok: false, razon: "agotado", mensaje: "Uno de los productos ya no está disponible. Revisa tu pedido." });
      }
      /* AGOTADO TAMBIEN SE FRENA AQUI (17-ago). La pagina ya lo pinta en gris y
         no deja tocarlo, pero eso no basta: el cliente pudo dejarlo en el
         carrito ANTES de que se acabara, o tener la pagina abierta de hace
         rato. Si solo se frenara en la pantalla, el pedido entraria igual y
         alguien tendria que llamarlo a decirle que no hay. */
      if (p.agotado === true) {
        return json({ ok: false, razon: "agotado",
          mensaje: `Se acabó ${String(p.name || "un producto")} por hoy. Quítalo de tu pedido para continuar.` });
      }
      const cant = Math.max(1, Math.min(20, Number(it.cantidad) || 1));
      // El precio sale de la presentación si la hay; si no, del producto.
      let precio = Number(p.price) || 0;
      const presN = String(it.presentacion || "");
      let presIdx = -1;
      if (presN) {
        const lista = Array.isArray(p.presentations) ? p.presentations : [];
        presIdx = lista.findIndex((x: Record<string, unknown>) => norm(x.name) === norm(presN));
        const pres = presIdx >= 0 ? lista[presIdx] : null;
        if (!pres) return json({ ok: false, razon: "presentacion", mensaje: "Esa presentación ya no existe." });
        precio = Number((pres as Record<string, unknown>).price) || precio;
      }
      /* EL NOMBRE SE ARMA COMO EN EL POS MANUAL (19-ago): primero el tamaNo, y
         si no tiene, el nombre en comanda de la categoria; despues el producto;
         despues las variantes. Antes iba al reves y sin categoria, asi que el
         mismo plato se llamaba "Hamburguesa · SENCILLA" pedido a mano y
         "SENCILLA" pedido por la pagina — y "CARNE" a secas puede ser un
         sandwich, una hamburguesa o un perro. Un solo nombre para los dos
         caminos, o son dos verdades. */
      const etiqueta = presIdx >= 0
        ? String(((Array.isArray(p.presentations) ? p.presentations : [])[presIdx] as Record<string, unknown>).name || "")
        : (catNombre[String(p.category_id || "")] || "");
      let nombre = [etiqueta, String(p.name || "")].filter(Boolean).join(" · ");

      /* LA VARIANTE MANDA SOBRE EL PRECIO. Una Premium Mixta personal cuesta lo
         suyo, no lo que cuesta la Premium "a secas". Cada opcion trae un precio
         por presentacion, en el mismo orden que los tamaños.

         Y se busca AQUI, en el catalogo, no en lo que manda el navegador: si se
         confiara en el precio que llega de la pagina, cualquiera pediria una
         Premium por mil pesos. */
      const varsSel: Record<string, unknown> = {};
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
            varsSel[String(g.id || g.name || "grupo")] = {
              id: String(op.id || ""), name: String(op.name), group: String(g.name || ""), price: v || 0,
            };
            break;
          }
        }
      }
      /* LAS ADICIONES SE COBRAN Y VIAJAN A LA COCINA (16-ago). Antes ni se
         miraban: el cliente escogía salsa cheddar o ranchera, las veía en su
         carrito, y el pedido se creaba sin ellas — cobradas de menos y sin que
         la cocina se enterara de que iban.

         El precio sale de los grupos de modificadores del CATÁLOGO, nunca del
         navegador. Y solo valen las del grupo que corresponde al tamaño
         elegido (`mod_group_pres`): una adición familiar no se cobra en una
         personal. */
      const adisPed = Array.isArray(it.adiciones) ? it.adiciones as unknown[] : [];
      const adisPuestas: string[] = [];
      /* `mods` y `vars` se guardan como OBJETO por grupo, que es el formato que
         usa todo el sistema (el POS y Paco guardan {grupo: {...}}). Se intentó
         guardarlos como lista y el pedido no se podía marcar pagado: un trigger
         de inventario hace jsonb_each sobre ellos y con una lista revienta
         ("cannot call jsonb_each on a non-object") — el pago descontaba el
         saldo y el pedido se quedaba en "pendiente de pago". */
      const modsSel: Record<string, unknown> = {};
      if (adisPed.length) {
        const idsGrupo = (Array.isArray(p.mod_group_ids) ? p.mod_group_ids : []) as unknown[];
        const mapaPres = (p.mod_group_pres || {}) as Record<string, unknown>;
        const presIdActual = presIdx >= 0
          ? String((((Array.isArray(p.presentations) ? p.presentations : [])[presIdx] || {}) as Record<string, unknown>).id || "")
          : "";
        for (const nomAdi of adisPed) {
          for (const gid of idsGrupo) {
            const g = gruposMod[String(gid)];
            if (!g) continue;
            // ¿Este grupo es de otro tamaño? Entonces no.
            const suyas = Array.isArray(mapaPres[String(gid)]) ? mapaPres[String(gid)] as unknown[] : [];
            if (suyas.length && presIdActual && !suyas.map(String).includes(presIdActual)) continue;
            const ops = Array.isArray(g.options) ? g.options as Array<Record<string, unknown>> : [];
            const op = ops.find((o) => norm(o.name) === norm(nomAdi));
            if (!op) continue;
            precio += Number(op.price) || 0;
            adisPuestas.push(String(op.name));
            const clave = String(gid);
            const yaVan = Array.isArray(modsSel[clave]) ? modsSel[clave] as unknown[] : [];
            yaVan.push({ id: String(op.id || ""), name: String(op.name), price: Number(op.price) || 0 });
            modsSel[clave] = yaVan;
            break;
          }
        }
        if (adisPuestas.length) nombre += " + " + adisPuestas.join(", ");
      }

      subtotal += precio * cant;
      /* Lo que el motor de empaques necesita saber de cada linea. Se recoge
         aqui, donde ya se conoce el producto y su presentacion. */
      paraEmpaque.push({
        productId: String(p.id), catId: String(p.category_id || ""),
        presId: presIdx >= 0 ? String((((Array.isArray(p.presentations) ? p.presentations : [])[presIdx] || {}) as Record<string, unknown>).id || "") : "",
        qty: cant, unitPrice: precio,
      });
      /* `product_name` y `product_price` son OBLIGATORIOS en pos_order_items
         (16-ago): sin ellos el insert falla y el pedido queda creado pero
         VACÍO — a la cocina le llega un ticket en blanco y al cliente le
         cobran algo que nadie sabe qué es. Pasó en el primer ensayo real.
         `total` va explícito porque su valor por defecto es 0 y la comanda
         mostraría cada línea en cero. */
      lineas.push({
        product_id: p.id,
        name: nombre, product_name: nombre,
        product_price: precio, unit_price: precio,
        total: precio * cant,
        quantity: cant,
        /* Lo elegido, para la comanda y para el recibo: el tamaño, la variante
           y las adiciones que de verdad se cobraron. */
        /* `pres` guarda la ETIQUETA, no lo que mando el navegador: es lo que
           lee la comanda, y el POS manual guarda ahi lo mismo. */
        selections: { pres: etiqueta || "", vars: varsSel, mods: modsSel },
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
      const domiCfg = (cfg?.[0]?.domicilios || {}) as Record<string, unknown>;
      /* Se busca primero por lo que el cliente escribio como BARRIO y, si de
         ahi no sale, dentro de la DIRECCION completa: mucha gente escribe el
         barrio dentro de la direccion y deja la casilla vacia. */
      const zona = zonaDeTexto(domiCfg, barrio) || zonaDeTexto(domiCfg, direccion);
      if (zona) { domi = zona.precio; barrioConocido = true; }
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
      /* EL DOMICILIO QUEDA POR COBRAR (19-ago, regla de Sergio). Si el barrio
         no esta en la tabla, el cliente paga solo su comida y NO se queda
         esperando a que le confirmen el precio: el domicilio se lo cobra el
         domiciliario al entregar.
         Va en las notas porque de ahi sale la COMANDA, que es el papel que
         lleva quien entrega: es el unico sitio donde ese aviso llega a quien
         tiene que cobrar. */
      (tipo === "domicilio" && !barrioConocido) ? "[DOMICILIO POR COBRAR]" : "",
      `[tel:${String(s.telefono || "")}]`,
      "[web]",
      String(b.notas || "").trim() ? "— " + String(b.notas).trim().slice(0, 200) : "",
    ].filter(Boolean).join(" ");

    const cli = await sbGet(`/pos_clientes?id=eq.${clienteId}&select=nombre&limit=1`) as Array<Record<string, unknown>> | null;

    const creado = await sbPost(`/pos_orders`, {
      tenant_id: tenantId, branch_id: branchId, cliente_id: clienteId,
      channel: tipo === "domicilio" ? "domicilio" : "rapido",
      /* POR DONDE entro (16-ago). `channel` dice como se entrega y es igual que
         un pedido de la caja; sin esto no habia forma de saber cuales pedidos
         llegaron por la pagina, que es justo lo que mide la pantalla del dueño. */
      origen: "web",
      status: "pendiente_pago",
      customer_name: cli?.[0]?.nombre || null,
      subtotal, total, total_final: total,
      delivery_fee: domi, packaging_fee: empaque,
      notes: notas, visible_cocina: false,
      estado: tipo === "domicilio" ? "en_preparacion" : null,
    }, true) as Array<Record<string, unknown>> | null;

    const orderId = creado?.[0]?.id ? String(creado[0].id) : "";
    if (!orderId) return json({ ok: false, razon: "no_se_creo", mensaje: "No pudimos crear tu pedido. Intenta de nuevo." });

    /* UN PEDIDO A MEDIAS NO SIRVE. Si una línea no entra, el pedido se anula y
       se le dice al cliente — antes esto era un `await` suelto cuyo resultado
       nadie miraba, y por eso nació un pedido sin productos sin que se
       enterara nadie. */
    let lineasOk = true;
    for (const l of lineas) {
      const ok = await sbPost(`/pos_order_items`, { ...l, order_id: orderId });
      if (!ok) { lineasOk = false; break; }
    }
    if (!lineasOk) {
      await fetch(`${SUPABASE_URL}/rest/v1/pos_order_items?order_id=eq.${orderId}`, { method: "DELETE", headers: H });
      await fetch(`${SUPABASE_URL}/rest/v1/pos_orders?id=eq.${orderId}`, { method: "DELETE", headers: H });
      return json({ ok: false, razon: "items", mensaje: "No pudimos tomar tu pedido. Intenta de nuevo." });
    }

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
