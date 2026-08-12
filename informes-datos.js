/* LA SEDE ES OBLIGATORIA EN LOS INFORMES.
   Antes cada consulta decia "si sé la sucursal, filtro; si no, traigo todo el
   restaurante". Con una sola marca daba igual. Con dos, un informe sumaria las
   ventas de las DOS y el numero se veria perfectamente normal — que es la peor
   clase de error: nadie lo revisa porque nada parece roto.
   Ahora, sin sede, el filtro apunta a una sucursal que no existe: el informe
   sale en cero, y un cero raro se nota. */
/* ═══════════════ INFORMES · DATOS REALES ═══════════════
   Cada cargador devuelve {kpis, blocks} con EXACTAMENTE la misma forma que el
   registro de informes-data.js, así que el renderer no cambia nunca.

   REGLA DURA: aquí solo viven los informes que se calculan con datos de verdad.
   Los que no están conectados NO se inventan ni muestran los datos de ejemplo
   del diseño: la app les pinta un aviso claro de que faltan por conectar.

   "LAS VENTAS SON LAS VENTAS": el domicilio nunca suma a la venta. Se cobra al
   cliente pero va aparte, en delivery_fee. Todos los informes usan total_final
   (= comida + empaque), normalizado abajo por si algún pedido viejo trae el
   domicilio metido dentro.                                                    */
(function () {
  'use strict';

  var sb = function () { return window._pos && window._pos.sb; };
  var CTX = { tenantId: null, branchId: null };
  /* Una sucursal que no existe: sirve para que una consulta sin sede devuelva
     cero filas en vez de las ventas de todas las marcas juntas. */
  var SIN_SEDE = '00000000-0000-0000-0000-000000000000';

  /* De que marca es la sede que se esta mirando. Se guarda porque lo pregunta
     mas de un informe y no cambia mientras no se cambie de sede. */
  var _marcaCache = { branch: null, brand: null };
  async function marcaDeLaSede() {
    if (!CTX.branchId) return null;
    if (_marcaCache.branch === CTX.branchId) return _marcaCache.brand;
    try {
      var r = await sb().from('branches').select('brand_id').eq('id', CTX.branchId).maybeSingle();
      _marcaCache = { branch: CTX.branchId, brand: (r.data && r.data.brand_id) || null };
    } catch (e) { _marcaCache = { branch: CTX.branchId, brand: null }; }
    return _marcaCache.brand;
  }

  var COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  var NUM = new Intl.NumberFormat('es-CO');
  function $ (n) { return COP.format(Math.round(Number(n) || 0)); }
  function n0(n) { return NUM.format(Math.round(Number(n) || 0)); }
  function pct(n) { return (Math.round((Number(n) || 0) * 10) / 10).toString().replace('.', ',') + '%'; }

  // ── Rango de fechas de los presets del diseño ──────────────────────────
  function rango(preset) {
    var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    var d = new Date(hoy), h = new Date(hoy);
    if (preset === 'ayer')        { d.setDate(d.getDate() - 1); }
    else if (preset === 'semana') { d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1)); h = new Date(hoy); }
    else if (preset === 'mes')    { d = new Date(hoy.getFullYear(), hoy.getMonth(), 1); }
    var fin = new Date(preset === 'ayer' ? d : h); fin.setDate(fin.getDate() + 1);
    return { from: d.toISOString(), to: fin.toISOString() };
  }

  // ── Pedidos del rango (una sola lectura, la reusan todos) ──────────────
  /* ── LOS FILTROS ──────────────────────────────────────────────────────
     Antes eran adorno: los chips mostraban valores inventados ("Chapinero",
     "Luis Pardo") y no tocaban la consulta. Un filtro que dice "Todas" y no
     filtra es peor que no tener filtro, porque el numero se lee como si
     estuviera filtrado.

     Los seis tienen dato real detras: sucursal, caja (session_id), turno,
     canal, empleado (waiter) y estado.

     La sucursal se filtra en el SERVIDOR (cambia que se trae); los demas se
     filtran aqui sobre lo ya traido, para que las OPCIONES salgan de lo que
     de verdad paso en el periodo y no de una lista inventada. */
  var FILTROS = { sucursal: null, caja: null, turno: null, canal: null, empleado: null, estado: null };

  var _cache = { key: null, datos: null };
  async function pedidos(preset) {
    var key = preset + '|' + (FILTROS.sucursal || CTX.branchId) + '|' + (FILTROS.estado || 'paid');
    if (_cache.key === key) return _cache.datos;
    var s = sb(); if (!s) throw new Error('sin conexión');
    var r = rango(preset);

    var q = s.from('pos_orders').select(
        'id,status,channel,total,total_final,delivery_fee,tip_amount,discount_amount,' +
        'guests,waiter_name,payment_method,closed_at,opened_at,cliente_id,notes,' +
        'tax_total,tax_base,tax_detail,' +
        'pos_order_items(id,product_id,product_name,name,quantity,unit_price,total,selections)')
      .gte('closed_at', r.from).lt('closed_at', r.to)
      .order('closed_at', { ascending: true });
    /* Por defecto solo lo COBRADO: un informe de ventas no cuenta lo anulado.
       Si se elige un estado a mano, manda ese. */
    q = q.eq('status', FILTROS.estado || 'paid');
    q = q.eq('branch_id', (FILTROS.sucursal || CTX.branchId || SIN_SEDE));
    if (CTX.tenantId) q = q.eq('tenant_id', CTX.tenantId);
    var res = await q;
    if (res.error) throw res.error;

    var lista = (res.data || []).map(function (o) {
      var dom = parseFloat(o.delivery_fee) || 0, tot = parseFloat(o.total);
      if (dom > 0 && !isNaN(tot)) o.total_final = tot - dom;   // el domi nunca es venta
      return o;
    });

    // Pagos reales: los cobros 'multiple' se reparten en sus métodos de verdad
    // en vez de aparecer como un bloque opaco.
    var pagos = [];
    try {
      var ids = lista.map(function (o) { return o.id; });
      if (ids.length) {
        if (window.posMetodos) await posMetodos.cargar(s, (window._pos && window._pos.state && window._pos.state.branchId) || null);
        var rp = await s.from('pos_payments').select('order_id,method,amount').in('order_id', ids);
        pagos = rp.data || [];
      }
    } catch (e) { console.warn('[Informes] pagos:', e); }

    /* `todos` = sin los filtros de esta pantalla. De ahi salen las OPCIONES,
       para que la lista no se vacie a medida que uno filtra. */
    _cache = { key: key, datos: { lista: filtrar(lista), todos: lista, pagos: pagos, rango: r } };
    return _cache.datos;
  }

  /* Los filtros que no cambian la consulta: se aplican sobre lo traido. */
  function filtrar(lista) {
    return (lista || []).filter(function (o) {
      if (FILTROS.caja     && String(o.session_id || '') !== FILTROS.caja) return false;
      if (FILTROS.turno    && String(o.turno || '')      !== FILTROS.turno) return false;
      if (FILTROS.canal    && String(o.channel || '')    !== FILTROS.canal) return false;
      if (FILTROS.empleado && String(o.waiter_name || '')!== FILTROS.empleado) return false;
      return true;
    });
  }

  /* Las opciones de cada filtro salen de lo que DE VERDAD paso en el periodo.
     Una lista fija mostraria canales que este negocio no usa y meseros que ya
     no trabajan ahi. */
  async function opcionesFiltro(preset) {
    var d = await pedidos(preset);
    var todos = d.todos || [];
    function unicos(campo) {
      var vistos = {}, out = [];
      todos.forEach(function (o) {
        var v = o[campo];
        if (v === null || v === undefined || v === '') return;
        if (vistos[v]) return;
        vistos[v] = 1; out.push(String(v));
      });
      return out.sort();
    }
    return {
      canal:    unicos('channel'),
      empleado: unicos('waiter_name'),
      turno:    unicos('turno'),
      caja:     unicos('session_id'),
      estado:   ['paid', 'cancelled'],
    };
  }
  function limpiarCache() { _cache = { key: null, datos: null }; }

  // ── Costo de receta, POR PRESENTACIÓN ─────────────────────────────────
  // Cada línea de receta guarda la cantidad de CADA presentación en
  // `cantidades` ({presId:{q}}). El campo suelto `cantidad` es el formato
  // viejo y solo vale cuando `cantidades` está vacío. Usar `cantidad` para
  // todo cobraría lo mismo a una Personal que a una Familiar: es el mismo
  // error que ya nos costó el descuento cruzado de inventario.
  var _rec = null;
  async function motorCostos() {
    if (_rec) return _rec;
    var s = sb();
    var unit = {}, lineas = [], presDe = {}, porDefecto = {};
    try {
      /* Los insumos y las recetas son de la MARCA, no de la sede: filtrarlos
         por sucursal dejaba el costeo de una sede nueva SIN recetas — y un
         costeo sin recetas no da error, da margen del 100%. */
      var marca = await marcaDeLaSede();
      var qi = s.from('iv_insumos').select('id,precio,conversion');
      var qr = s.from('iv_recetas').select('product_id,insumo_id,cantidad,cantidades,variant_option_id,mod_option_id,merma');
      var qp = s.from('pos_products').select('id,presentations,variables');
      var qm = s.from('iv_params').select('merma_enabled');
      qi = marca ? qi.eq('brand_id', marca) : qi.eq('branch_id', SIN_SEDE);
      qr = marca ? qr.eq('brand_id', marca) : qr.eq('branch_id', SIN_SEDE);
      qm = qm.eq('branch_id', (CTX.branchId || SIN_SEDE));
      if (CTX.tenantId) qp = qp.eq('tenant_id', CTX.tenantId);
      var res = await Promise.all([qi, qr, qp, qm]);
      var mermaOn = !(res[3].data && res[3].data[0] && res[3].data[0].merma_enabled === false);

      (res[0].data || []).forEach(function (x) {
        var conv = parseFloat(x.conversion) || 1;
        unit[x.id] = (parseFloat(x.precio) || 0) / (conv > 0 ? conv : 1);
      });
      (res[2].data || []).forEach(function (pr) {
        var mapa = {};
        (pr.presentations || []).forEach(function (ps) { if (ps && ps.name) mapa[String(ps.name).trim().toLowerCase()] = ps.id; });
        presDe[pr.id] = { mapa: mapa, primera: (pr.presentations || [])[0] && pr.presentations[0].id };
        var set = {};
        (pr.variables || []).forEach(function (g) { var o = (g.options || [])[0]; if (o && o.id) set[o.id] = 1; });
        porDefecto[pr.id] = set;
      });
      (res[1].data || []).forEach(function (l) {
        l._merma = mermaOn ? (1 + (parseFloat(l.merma) || 0) / 100) : 1;
        lineas.push(l);
      });
    } catch (e) { console.warn('[Informes] costos:', e); }

    var porProd = {};
    lineas.forEach(function (l) { (porProd[l.product_id] = porProd[l.product_id] || []).push(l); });

    function cantidadDe(l, presId) {
      var cs = l.cantidades;
      var tieneCs = cs && typeof cs === 'object' && Object.keys(cs).length;
      if (!tieneCs) return parseFloat(l.cantidad) || 0;          // receta vieja
      if (presId && cs[presId]) return parseFloat(cs[presId].q) || 0;
      // La receta es por presentación y esta no está listada: no lleva ese
      // insumo. Devolver `cantidad` aquí inventaría un costo que no existe.
      return 0;
    }

    _rec = {
      /* Costo de un ítem vendido: su presentación, su variante y sus adiciones. */
      costo: function (productId, presNombre, mods) {
        var ls = porProd[productId];
        if (!ls) return { costo: 0, tiene: false };
        var info = presDe[productId] || { mapa: {}, primera: null };
        var presId = info.mapa[String(presNombre || '').trim().toLowerCase()] || info.primera || null;
        var total = 0;
        ls.forEach(function (l) {
          // Adiciones: solo cuentan si el ítem la lleva de verdad.
          if (l.mod_option_id) { if (!mods || !mods[l.mod_option_id]) return; }
          // Variantes: solo la combinación por defecto (si no, un producto con
          // 5 sabores sumaría el costo de los 5).
          else if (l.variant_option_id && !(porDefecto[productId] && porDefecto[productId][l.variant_option_id])) return;
          var cu = unit[l.insumo_id]; if (cu == null) return;
          total += cantidadDe(l, presId) * cu * l._merma;
        });
        return { costo: total, tiene: true };
      },
      /* Igual que costo(), pero devuelve cuánto lleva de CADA insumo.
         Lo usa el paloteo para comparar contra lo que salió del inventario. */
      detalle: function (productId, presNombre, mods) {
        var ls = porProd[productId]; if (!ls) return [];
        var info = presDe[productId] || { mapa: {}, primera: null };
        var presId = info.mapa[String(presNombre || '').trim().toLowerCase()] || info.primera || null;
        var out = [];
        ls.forEach(function (l) {
          if (l.mod_option_id) { if (!mods || !mods[l.mod_option_id]) return; }
          else if (l.variant_option_id && !(porDefecto[productId] && porDefecto[productId][l.variant_option_id])) return;
          var cant = cantidadDe(l, presId) * l._merma;
          if (cant > 0) out.push({ insumo_id: l.insumo_id, cant: cant });
        });
        return out;
      },
      productosConReceta: function () { return Object.keys(porProd); },
    };
    return _rec;
  }

  // Costo de un ítem del pedido tal como se vendió.
  function costoItem(motor, it) {
    var mods = {};
    var m = (it.selections && it.selections.mods) || {};
    Object.keys(m).forEach(function (k) { mods[k] = 1; });
    var pres = (it.selections && it.selections.pres) || '';
    return motor.costo(it.product_id, pres, mods);
  }

  // ── UNIDADES (leer antes de tocar cualquier cálculo de inventario) ──
  //   iv_insumos.precio      → costo de UNA unidad de COMPRA (un bulto, una caja)
  //   iv_insumos.conversion  → cuántas unidades de USO trae una de compra
  //   iv_insumos.stock       → en unidad de COMPRA
  //   iv_movimientos.delta   → en unidad de COMPRA
  //   iv_recetas.cantidad(es)→ en unidad de USO (gramos, mililitros…)
  // Mezclarlas da valores errados: stock(compra) × costo-por-uso subvalúa el
  // inventario tantas veces como diga la conversión.
  function costoCompra(i) { return parseFloat(i.precio) || 0; }                    // $ por unidad de compra
  function costoUso(i) { var c = parseFloat(i.conversion) || 1; return (parseFloat(i.precio) || 0) / (c > 0 ? c : 1); }
  function aUso(qtyCompra, i) { return (parseFloat(qtyCompra) || 0) * (parseFloat(i.conversion) || 1); }
  function nDec(v) { var r = Math.round((Number(v) || 0) * 100) / 100; return NUM.format(r); }

  // ── Agrupadores ────────────────────────────────────────────────────────
  function items(lista, fn) {
    lista.forEach(function (o) { (o.pos_order_items || []).forEach(function (it) { fn(it, o); }); });
  }
  function ventaDe(o) { return parseFloat(o.total_final) || 0; }
  function revDe(it) {
    return (it.total != null ? parseFloat(it.total) : parseFloat(it.unit_price || 0) * (parseInt(it.quantity) || 1)) || 0;
  }
  function ordenar(obj, campo) {
    return Object.keys(obj).map(function (k) { var v = obj[k]; v._k = k; return v; })
      .sort(function (a, b) { return (b[campo] || 0) - (a[campo] || 0); });
  }
  function vacio() { return { vacio: true }; }

  // ═══════════════════ LOS INFORMES ═══════════════════
  var R = {};

  /* Todas las ventas */
  R['sal-todas'] = async function (p) {
    var d = await pedidos(p); var L = d.lista;
    if (!L.length) return vacio();
    var venta = L.reduce(function (a, o) { return a + ventaDe(o); }, 0);
    var domi  = L.reduce(function (a, o) { return a + (parseFloat(o.delivery_fee) || 0); }, 0);
    var desc  = L.reduce(function (a, o) { return a + (parseFloat(o.discount_amount) || 0); }, 0);
    var rows = L.slice().reverse().slice(0, 200).map(function (o) {
      var f = new Date(o.closed_at || o.opened_at);
      return {
        h: f.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
        c: { _main: o.customer_name || '—' },
        ch: o.channel || '—',
        m: o.payment_method || '—',
        v: $(ventaDe(o)),
        dm: (parseFloat(o.delivery_fee) || 0) ? $(o.delivery_fee) : '—',
      };
    });
    return {
      kpis: [
        { lbl: 'Ventas', val: $(venta), tone: 'accent', big: 1 },
        { lbl: '# Ventas', val: n0(L.length) },
        { lbl: 'Ticket promedio', val: $(L.length ? venta / L.length : 0) },
        { lbl: 'Domicilios cobrados', val: $(domi), sub: 'No suma a las ventas' },
        { lbl: 'Descuentos', val: $(desc) },
      ],
      blocks: [{ t: 'card', title: 'Detalle de ventas', sub: L.length > 200 ? 'Mostrando las 200 más recientes' : '', body: {
        t: 'table', min: 720,
        cols: [{ k: 'h', label: 'Fecha' }, { k: 'c', label: 'Cliente' }, { k: 'ch', label: 'Canal' },
               { k: 'm', label: 'Pago' }, { k: 'v', label: 'Venta', num: 1 }, { k: 'dm', label: 'Domicilio', num: 1 }],
        rows: rows, total: { h: 'Total', c: '', ch: '', m: '', v: $(venta), dm: $(domi) } } }],
    };
  };

  /* Ventas por producto */
  R['sal-producto'] = async function (p) {
    var d = await pedidos(p); if (!d.lista.length) return vacio();
    var acc = {};
    items(d.lista, function (it) {
      var k = it.product_name || it.name || 'Producto';
      if (!acc[k]) acc[k] = { qty: 0, rev: 0 };
      acc[k].qty += parseInt(it.quantity) || 1;
      acc[k].rev += revDe(it);
    });
    var arr = ordenar(acc, 'rev');
    var tot = arr.reduce(function (a, x) { return a + x.rev; }, 0);
    var max = arr.length ? arr[0].rev : 1;
    return {
      kpis: [
        { lbl: 'Productos distintos', val: n0(arr.length), tone: 'accent' },
        { lbl: 'Unidades vendidas', val: n0(arr.reduce(function (a, x) { return a + x.qty; }, 0)) },
        { lbl: 'Más vendido', val: arr.length ? arr[0]._k : '—', sub: arr.length ? n0(arr[0].qty) + ' unidades' : '' },
      ],
      blocks: [
        { t: 'card', title: 'Los 10 que más venden', body: { t: 'hbars', items: arr.slice(0, 10).map(function (x) {
          return { lbl: x._k, w: max ? Math.round(x.rev / max * 100) : 0, val: $(x.rev) }; }) } },
        { t: 'card', title: 'Todos los productos', body: { t: 'table', min: 560,
          cols: [{ k: 'p', label: 'Producto' }, { k: 'q', label: 'Unidades', num: 1 },
                 { k: 'v', label: 'Venta', num: 1 }, { k: 'pc', label: '% del total', num: 1 }],
          rows: arr.map(function (x) { return { p: { _main: x._k }, q: n0(x.qty), v: $(x.rev), pc: pct(tot ? x.rev / tot * 100 : 0) }; }),
          total: { p: 'Total', q: '', v: $(tot), pc: '100%' } } },
      ],
    };
  };

  /* Ventas por hora */
  R['sal-hora'] = async function (p) {
    var d = await pedidos(p); if (!d.lista.length) return vacio();
    var horas = {}; for (var i = 0; i < 24; i++) horas[i] = { v: 0, n: 0 };
    d.lista.forEach(function (o) {
      var h = new Date(o.closed_at || o.opened_at).getHours();
      horas[h].v += ventaDe(o); horas[h].n++;
    });
    var conVenta = Object.keys(horas).filter(function (h) { return horas[h].n > 0; }).map(Number);
    if (!conVenta.length) return vacio();
    var ini = Math.min.apply(null, conVenta), fin = Math.max.apply(null, conVenta);
    var barras = [], pico = { h: ini, v: -1 };
    for (var h = ini; h <= fin; h++) {
      barras.push({ x: (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? 'a' : 'p'), w: horas[h].v, val: $(horas[h].v) });
      if (horas[h].v > pico.v) pico = { h: h, v: horas[h].v };
    }
    var mx = Math.max.apply(null, barras.map(function (b) { return b.w; })) || 1;
    barras.forEach(function (b) { b.w = Math.round(b.w / mx * 100); });
    return {
      kpis: [
        { lbl: 'Hora pico', val: (pico.h % 12 === 0 ? 12 : pico.h % 12) + (pico.h < 12 ? ' a.m.' : ' p.m.'), tone: 'accent', big: 1 },
        { lbl: 'Vendido en la hora pico', val: $(pico.v) },
        { lbl: 'Horas con venta', val: n0(conVenta.length) },
      ],
      blocks: [{ t: 'card', title: 'Ventas por hora', sub: 'Sirve para decidir a qué hora reforzar el turno', body: {
        t: 'vbars', autopeak: 1, items: barras } }],
    };
  };

  /* Ventas por día del mes */
  R['sal-dia'] = async function (p) {
    var d = await pedidos(p); if (!d.lista.length) return vacio();
    var dias = {};
    d.lista.forEach(function (o) {
      var f = new Date(o.closed_at || o.opened_at);
      var k = f.toISOString().slice(0, 10);
      if (!dias[k]) dias[k] = { v: 0, n: 0, f: f };
      dias[k].v += ventaDe(o); dias[k].n++;
    });
    var ks = Object.keys(dias).sort();
    var mx = Math.max.apply(null, ks.map(function (k) { return dias[k].v; })) || 1;
    var tot = ks.reduce(function (a, k) { return a + dias[k].v; }, 0);
    return {
      kpis: [
        { lbl: 'Días con venta', val: n0(ks.length), tone: 'accent' },
        { lbl: 'Promedio por día', val: $(ks.length ? tot / ks.length : 0) },
        { lbl: 'Mejor día', val: $(mx) },
      ],
      blocks: [
        { t: 'card', title: 'Ventas por día', body: { t: 'vbars', autopeak: 1, items: ks.map(function (k) {
          return { x: String(dias[k].f.getDate()), w: Math.round(dias[k].v / mx * 100), val: $(dias[k].v) }; }) } },
        { t: 'card', title: 'Detalle', body: { t: 'table', min: 460,
          cols: [{ k: 'd', label: 'Día' }, { k: 'n', label: '# Ventas', num: 1 }, { k: 'v', label: 'Venta', num: 1 }, { k: 'tk', label: 'Ticket', num: 1 }],
          rows: ks.map(function (k) { return {
            d: { _main: dias[k].f.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }) },
            n: n0(dias[k].n), v: $(dias[k].v), tk: $(dias[k].v / dias[k].n) }; }),
          total: { d: 'Total', n: n0(d.lista.length), v: $(tot), tk: $(tot / d.lista.length) } } },
      ],
    };
  };

  /* Ventas por forma de pago */
  R['sal-pago'] = async function (p) {
    var d = await pedidos(p); if (!d.lista.length) return vacio();
    var acc = {};
    if (d.pagos.length) {
      d.pagos.forEach(function (x) {
        /* El nombre del metodo CONFIGURADO, no lo que este guardado: antes
           salia una columna llamada "Pm_x719c1pqb". */
        var k = window.posMetodos ? posMetodos.nombre(x.method)
              : ((x.method || 'Otro').charAt(0).toUpperCase() + (x.method || 'Otro').slice(1));
        acc[k] = (acc[k] || 0) + (parseFloat(x.amount) || 0);
      });
    } else {
      d.lista.forEach(function (o) {
        var k = window.posMetodos ? posMetodos.nombre(o.payment_method)
              : ((o.payment_method || 'Otro').charAt(0).toUpperCase() + (o.payment_method || 'Otro').slice(1));
        acc[k] = (acc[k] || 0) + ventaDe(o);
      });
    }
    var arr = Object.keys(acc).map(function (k) { return { k: k, v: acc[k] }; }).sort(function (a, b) { return b.v - a.v; });
    var tot = arr.reduce(function (a, x) { return a + x.v; }, 0);
    var COLS = ['#5B6BFF', '#16A34A', '#F59E0B', '#8B5CF6', '#0EA5E9', '#F43F5E'];
    var segs = arr.map(function (x, i) {
      return { name: x.k, val: $(x.v), pct: tot ? Math.round(x.v / tot * 100) : 0, color: COLS[i % COLS.length] };
    });
    // La dona exige que sumen 100: el redondeo se ajusta en el segmento mayor.
    var suma = segs.reduce(function (a, s) { return a + s.pct; }, 0);
    if (segs.length && suma !== 100) segs[0].pct += (100 - suma);
    return {
      kpis: [
        { lbl: 'Total cobrado', val: $(tot), tone: 'accent', big: 1 },
        { lbl: 'Formas de pago usadas', val: n0(arr.length) },
        { lbl: 'La más usada', val: arr.length ? arr[0].k : '—', sub: arr.length ? $(arr[0].v) : '' },
      ],
      blocks: [{ t: 'card', title: 'Cómo te pagaron', sub: d.pagos.length ? 'Los cobros mixtos se reparten en su método real' : '', body: {
        t: 'donut', centerBig: n0(arr.length), centerLbl: 'formas', segs: segs } }],
    };
  };

  /* Ventas por modificador / adición */
  R['sal-modif'] = async function (p) {
    var d = await pedidos(p); if (!d.lista.length) return vacio();
    var acc = {};
    items(d.lista, function (it) {
      var mods = (it.selections && it.selections.mods) || {};
      Object.keys(mods).forEach(function (id) {
        var m = mods[id] || {}; var k = m.name || 'Adición';
        if (!acc[k]) acc[k] = { qty: 0, rev: 0 };
        var q = (parseInt(m.qty) || 1) * (parseInt(it.quantity) || 1);
        acc[k].qty += q; acc[k].rev += (parseFloat(m.price) || 0) * q;
      });
    });
    var arr = ordenar(acc, 'rev');
    if (!arr.length) return vacio();
    var tot = arr.reduce(function (a, x) { return a + x.rev; }, 0);
    var mx = arr[0].rev || 1;
    return {
      kpis: [
        { lbl: 'Vendido en adiciones', val: $(tot), tone: 'accent', big: 1 },
        { lbl: 'Adiciones distintas', val: n0(arr.length) },
        { lbl: 'La más pedida', val: arr[0]._k, sub: n0(arr[0].qty) + ' veces' },
      ],
      blocks: [
        { t: 'card', title: 'Las que más venden', body: { t: 'hbars', items: arr.slice(0, 10).map(function (x) {
          return { lbl: x._k, w: Math.round(x.rev / mx * 100), val: $(x.rev) }; }) } },
        { t: 'card', title: 'Todas las adiciones', body: { t: 'table', min: 480,
          cols: [{ k: 'a', label: 'Adición' }, { k: 'q', label: 'Veces', num: 1 }, { k: 'v', label: 'Venta', num: 1 }],
          rows: arr.map(function (x) { return { a: { _main: x._k }, q: n0(x.qty), v: $(x.rev) }; }),
          total: { a: 'Total', q: '', v: $(tot) } } },
      ],
    };
  };

  /* Ventas por empleado */
  R['caj-empleado'] = async function (p) {
    var d = await pedidos(p); if (!d.lista.length) return vacio();
    var acc = {};
    d.lista.forEach(function (o) {
      var k = o.waiter_name || 'Sin asignar';
      if (!acc[k]) acc[k] = { rev: 0, n: 0, prop: 0 };
      acc[k].rev += ventaDe(o); acc[k].n++; acc[k].prop += parseFloat(o.tip_amount) || 0;
    });
    var arr = ordenar(acc, 'rev');
    var tot = arr.reduce(function (a, x) { return a + x.rev; }, 0);
    var mx = arr.length ? arr[0].rev : 1;
    return {
      kpis: [
        { lbl: 'Quien más vendió', val: arr.length ? arr[0]._k : '—', tone: 'accent', sub: arr.length ? $(arr[0].rev) : '' },
        { lbl: 'Personas con venta', val: n0(arr.length) },
        { lbl: 'Ticket promedio general', val: $(d.lista.length ? tot / d.lista.length : 0) },
      ],
      blocks: [
        { t: 'card', title: 'Ranking', body: { t: 'hbars', items: arr.map(function (x) {
          return { lbl: x._k, w: Math.round(x.rev / mx * 100), val: $(x.rev) }; }) } },
        { t: 'card', title: 'Detalle', body: { t: 'table', min: 520,
          cols: [{ k: 'e', label: 'Empleado' }, { k: 'n', label: '# Ventas', num: 1 },
                 { k: 'v', label: 'Venta', num: 1 }, { k: 'tk', label: 'Ticket', num: 1 }],
          rows: arr.map(function (x) { return { e: { _main: x._k }, n: n0(x.n), v: $(x.rev), tk: $(x.rev / x.n) }; }),
          total: { e: 'Total', n: n0(d.lista.length), v: $(tot), tk: $(tot / d.lista.length) } } },
      ],
    };
  };

  /* Domicilios */
  R['can-domicilios'] = async function (p) {
    var d = await pedidos(p);
    var L = d.lista.filter(function (o) { return o.channel === 'domicilio'; });
    if (!L.length) return vacio();
    var venta = L.reduce(function (a, o) { return a + ventaDe(o); }, 0);
    var domi  = L.reduce(function (a, o) { return a + (parseFloat(o.delivery_fee) || 0); }, 0);
    var barrios = {};
    L.forEach(function (o) {
      var m = /\[barrio:([^\]]+)\]/i.exec(o.notes || '');
      var k = m ? m[1].trim().toLowerCase().replace(/(^|\s)\S/g, function (t) { return t.toUpperCase(); }) : 'Sin barrio';
      if (!barrios[k]) barrios[k] = { n: 0, rev: 0, domi: 0 };
      barrios[k].n++; barrios[k].rev += ventaDe(o); barrios[k].domi += parseFloat(o.delivery_fee) || 0;
    });
    var arr = ordenar(barrios, 'rev');
    var mx = arr.length ? arr[0].rev : 1;
    var totVentas = d.lista.reduce(function (a, o) { return a + ventaDe(o); }, 0);
    return {
      kpis: [
        { lbl: 'Ventas por domicilio', val: $(venta), tone: 'accent', big: 1 },
        { lbl: '# Domicilios', val: n0(L.length) },
        { lbl: 'Ticket promedio', val: $(venta / L.length) },
        { lbl: 'Cobrado en domicilios', val: $(domi), sub: 'Va aparte, no es venta' },
        { lbl: '% del total del negocio', val: pct(totVentas ? venta / totVentas * 100 : 0) },
      ],
      blocks: [
        { t: 'card', title: 'Barrios que más piden', body: { t: 'hbars', items: arr.slice(0, 12).map(function (x) {
          return { lbl: x._k, w: Math.round(x.rev / mx * 100), val: $(x.rev) }; }) } },
        { t: 'card', title: 'Detalle por barrio', body: { t: 'table', min: 560,
          cols: [{ k: 'b', label: 'Barrio' }, { k: 'n', label: 'Pedidos', num: 1 },
                 { k: 'v', label: 'Venta', num: 1 }, { k: 'dm', label: 'Domicilios cobrados', num: 1 }],
          rows: arr.map(function (x) { return { b: { _main: x._k }, n: n0(x.n), v: $(x.rev), dm: $(x.domi) }; }),
          total: { b: 'Total', n: n0(L.length), v: $(venta), dm: $(domi) } } },
      ],
    };
  };

  /* Margen por producto — la rentabilidad */
  R['inv-margen'] = async function (p) {
    var d = await pedidos(p); if (!d.lista.length) return vacio();
    var motor = await motorCostos();
    var acc = {}, gRev = 0, gCost = 0, gConReceta = 0;
    items(d.lista, function (it) {
      var k = it.product_name || it.name || 'Producto';
      var q = parseInt(it.quantity) || 1, rev = revDe(it);
      var cst = costoItem(motor, it), tiene = cst.tiene;
      if (!acc[k]) acc[k] = { qty: 0, rev: 0, cost: 0, tiene: tiene };
      acc[k].qty += q; acc[k].rev += rev; acc[k].cost += cst.costo * q;
      gRev += rev; gCost += cst.costo * q;
      if (tiene) gConReceta += rev;
    });
    var arr = Object.keys(acc).map(function (k) {
      var x = acc[k]; x._k = k; x.margen = x.rev - x.cost;
      x.pct = x.rev > 0 ? x.margen / x.rev * 100 : 0; return x;
    }).sort(function (a, b) { return b.margen - a.margen; });
    var cob = gRev > 0 ? gConReceta / gRev * 100 : 0;
    var gMargen = gRev - gCost;
    return {
      kpis: [
        { lbl: 'Venta', val: $(gRev), big: 1 },
        { lbl: 'Costo de recetas', val: $(gCost) },
        { lbl: 'Margen', val: $(gMargen), tone: 'accent', big: 1 },
        { lbl: 'Margen %', val: pct(gRev ? gMargen / gRev * 100 : 0),
          tone: (gRev && gMargen / gRev * 100 >= 60) ? 'good' : (gRev && gMargen / gRev * 100 >= 40) ? 'warn' : 'bad' },
      ],
      blocks: [{ t: 'card', title: 'Margen por producto',
        sub: cob >= 99 ? 'Todos los productos vendidos tienen receta cargada'
                       : 'Ojo: solo el ' + Math.round(cob) + '% de las ventas tiene receta. El resto cuenta como costo $0, así que el margen real es MENOR que el que se ve aquí.',
        body: { t: 'table', min: 660,
          cols: [{ k: 'p', label: 'Producto' }, { k: 'q', label: 'Unid.', num: 1 }, { k: 'v', label: 'Venta', num: 1 },
                 { k: 'c', label: 'Costo', num: 1 }, { k: 'm', label: 'Margen', num: 1 }, { k: 'pc', label: '%', num: 1 }],
          rows: arr.map(function (x) { return {
            p: { _main: x._k }, q: n0(x.qty), v: $(x.rev),
            c: x.tiene ? $(x.cost) : { _pill: ['neu', 'sin receta'] },
            m: x.margen < 0 ? { _neg: $(x.margen) } : $(x.margen),
            pc: { _pill: [x.pct >= 60 ? 'ok' : x.pct >= 40 ? 'warn' : 'bad', pct(x.pct)] } }; }),
          total: { p: 'Total', q: '', v: $(gRev), c: $(gCost), m: $(gMargen), pc: pct(gRev ? gMargen / gRev * 100 : 0) } } }],
    };
  };

  /* Food Cost */
  R['inv-foodcost'] = async function (p) {
    var d = await pedidos(p); if (!d.lista.length) return vacio();
    var motor = await motorCostos();
    var gRev = 0, gCost = 0, gConReceta = 0;
    items(d.lista, function (it) {
      var q = parseInt(it.quantity) || 1, rev = revDe(it);
      var cst = costoItem(motor, it);
      gRev += rev; gCost += cst.costo * q;
      if (cst.tiene) gConReceta += rev;
    });
    var fc = gRev > 0 ? gCost / gRev * 100 : 0;
    var OBJ = 30;   // objetivo por defecto del sector
    var tono = fc <= OBJ ? 'good' : fc <= OBJ + 3 ? 'warn' : 'bad';
    var cob = gRev > 0 ? gConReceta / gRev * 100 : 0;
    return {
      kpis: [
        { lbl: 'Food Cost', val: pct(fc), tone: tono, big: 1, sub: 'Objetivo ' + OBJ + '%' },
        { lbl: 'Venta', val: $(gRev) },
        { lbl: 'Costo de la comida', val: $(gCost) },
        { lbl: 'Queda para el negocio', val: $(gRev - gCost), tone: 'accent' },
      ],
      blocks: [{ t: 'card', title: 'Cómo se lee', body: { t: 'table', min: 420,
        cols: [{ k: 'a', label: 'Concepto' }, { k: 'b', label: 'Valor', num: 1 }],
        rows: [
          { a: { _main: 'Venta del período' }, b: $(gRev) },
          { a: 'Costo de las recetas vendidas', b: $(gCost) },
          { a: 'Food Cost', b: pct(fc) },
          { a: 'Objetivo', b: pct(OBJ) },
          { a: 'Ventas con receta cargada', b: pct(cob) },
        ],
        total: { a: 'Margen bruto', b: $(gRev - gCost) } } }],
    };
  };

  /* Ventas por cliente */
  R['cli-ventas'] = async function (p) {
    var d = await pedidos(p); if (!d.lista.length) return vacio();
    var conCli = d.lista.filter(function (o) { return o.cliente_id; });
    if (!conCli.length) return vacio();
    var nombres = {};
    try {
      var ids = conCli.map(function (o) { return o.cliente_id; });
      var uniq = ids.filter(function (v, i) { return ids.indexOf(v) === i; });
      var rc = await sb().from('pos_clientes').select('id,nombre,barrio').in('id', uniq);
      (rc.data || []).forEach(function (c) { nombres[c.id] = c; });
    } catch (e) { console.warn('[Informes] clientes:', e); }
    var acc = {};
    conCli.forEach(function (o) {
      var c = nombres[o.cliente_id] || {};
      var k = c.nombre || 'Cliente';
      if (!acc[k]) acc[k] = { n: 0, rev: 0, barrio: c.barrio || '' };
      acc[k].n++; acc[k].rev += ventaDe(o);
    });
    var arr = ordenar(acc, 'rev');
    var tot = arr.reduce(function (a, x) { return a + x.rev; }, 0);
    var repiten = arr.filter(function (x) { return x.n > 1; }).length;
    return {
      kpis: [
        { lbl: 'Clientes con compra', val: n0(arr.length), tone: 'accent' },
        { lbl: 'Repitieron', val: n0(repiten), sub: pct(arr.length ? repiten / arr.length * 100 : 0) + ' de los clientes' },
        { lbl: 'Ticket promedio', val: $(conCli.length ? tot / conCli.length : 0) },
        { lbl: 'Ventas identificadas', val: $(tot) },
      ],
      blocks: [{ t: 'card', title: 'Quiénes compran más', body: { t: 'table', min: 620,
        cols: [{ k: 'c', label: 'Cliente' }, { k: 'b', label: 'Barrio' }, { k: 'n', label: 'Pedidos', num: 1 },
               { k: 'v', label: 'Gastado', num: 1 }, { k: 'tk', label: 'Ticket', num: 1 }],
        rows: arr.map(function (x) { return { c: { _main: x._k }, b: x.barrio || '—', n: n0(x.n), v: $(x.rev), tk: $(x.rev / x.n) }; }),
        total: { c: 'Total', b: '', n: n0(conCli.length), v: $(tot), tk: $(tot / conCli.length) } } }],
    };
  };

  /* Resumen del negocio */
  R['ger-resumen'] = async function (p) {
    var d = await pedidos(p); if (!d.lista.length) return vacio();
    var motor = await motorCostos();
    var venta = d.lista.reduce(function (a, o) { return a + ventaDe(o); }, 0);
    var domi  = d.lista.reduce(function (a, o) { return a + (parseFloat(o.delivery_fee) || 0); }, 0);
    var gCost = 0;
    items(d.lista, function (it) { gCost += costoItem(motor, it).costo * (parseInt(it.quantity) || 1); });
    var canales = {};
    d.lista.forEach(function (o) {
      var k = o.channel || 'otro';
      if (!canales[k]) canales[k] = { n: 0, rev: 0 };
      canales[k].n++; canales[k].rev += ventaDe(o);
    });
    var NOM = { salon: 'Salón', domicilio: 'Domicilio', rapido: 'Venta rápida', mostrador: 'Mostrador' };
    var COLS = { salon: '#5B6BFF', domicilio: '#8B5CF6', rapido: '#16A34A', mostrador: '#F59E0B' };
    var arr = ordenar(canales, 'rev');
    var segs = arr.map(function (x) {
      return { name: NOM[x._k] || x._k, val: $(x.rev), pct: venta ? Math.round(x.rev / venta * 100) : 0, color: COLS[x._k] || '#64748B' };
    });
    var suma = segs.reduce(function (a, s) { return a + s.pct; }, 0);
    if (segs.length && suma !== 100) segs[0].pct += (100 - suma);
    return {
      kpis: [
        { lbl: 'Ventas', val: $(venta), tone: 'accent', big: 1 },
        { lbl: '# Ventas', val: n0(d.lista.length) },
        { lbl: 'Ticket promedio', val: $(venta / d.lista.length) },
        { lbl: 'Margen sobre recetas', val: $(venta - gCost), sub: pct(venta ? (venta - gCost) / venta * 100 : 0) },
        { lbl: 'Domicilios cobrados', val: $(domi), sub: 'Aparte de las ventas' },
      ],
      blocks: [{ t: 'grid2', children: [
        { t: 'card', title: 'De dónde vienen las ventas', body: {
          t: 'donut', centerBig: n0(d.lista.length), centerLbl: 'ventas', segs: segs } },
        { t: 'card', title: 'Por canal', body: { t: 'table', min: 320,
          cols: [{ k: 'c', label: 'Canal' }, { k: 'n', label: '#', num: 1 }, { k: 'v', label: 'Venta', num: 1 }],
          rows: arr.map(function (x) { return { c: { _main: NOM[x._k] || x._k }, n: n0(x.n), v: $(x.rev) }; }),
          total: { c: 'Total', n: n0(d.lista.length), v: $(venta) } } },
      ] }],
    };
  };

  /* ═══════════ PROPINAS ═══════════
     Sin este informe las propinas se reparten "a ojo", que es de donde salen
     los conflictos. El dato ya se guarda en cada pedido (tip_amount). */
  R['caj-propinas'] = async function (p) {
    var d = await pedidos(p); if (!d.lista.length) return vacio();
    var conProp = d.lista.filter(function (o) { return (parseFloat(o.tip_amount) || 0) > 0; });
    if (!conProp.length) return vacio();
    var total = conProp.reduce(function (a, o) { return a + (parseFloat(o.tip_amount) || 0); }, 0);
    var venta = d.lista.reduce(function (a, o) { return a + ventaDe(o); }, 0);
    var acc = {};
    conProp.forEach(function (o) {
      var k = o.waiter_name || 'Sin asignar';
      if (!acc[k]) acc[k] = { prop: 0, n: 0, venta: 0 };
      acc[k].prop += parseFloat(o.tip_amount) || 0;
      acc[k].n++; acc[k].venta += ventaDe(o);
    });
    var arr = ordenar(acc, 'prop');
    var mx = arr.length ? arr[0].prop : 1;
    return {
      kpis: [
        { lbl: 'Propinas del período', val: $(total), tone: 'accent', big: 1 },
        { lbl: 'Pedidos con propina', val: n0(conProp.length), sub: pct(d.lista.length ? conProp.length / d.lista.length * 100 : 0) + ' de las ventas' },
        { lbl: 'Propina promedio', val: $(total / conProp.length) },
        { lbl: '% sobre la venta', val: pct(venta ? total / venta * 100 : 0) },
      ],
      blocks: [
        { t: 'card', title: 'Cuánto le corresponde a cada uno', body: { t: 'hbars', items: arr.map(function (x) {
          return { lbl: x._k, w: Math.round(x.prop / mx * 100), val: $(x.prop) }; }) } },
        { t: 'card', title: 'Detalle', sub: 'Para repartir con un dato, no a ojo', body: { t: 'table', min: 560,
          cols: [{ k: 'e', label: 'Empleado' }, { k: 'n', label: 'Pedidos', num: 1 },
                 { k: 'v', label: 'Vendió', num: 1 }, { k: 'p', label: 'Propina', num: 1 }, { k: 'pc', label: '% s/venta', num: 1 }],
          rows: arr.map(function (x) { return { e: { _main: x._k }, n: n0(x.n), v: $(x.venta), p: $(x.prop),
            pc: pct(x.venta ? x.prop / x.venta * 100 : 0) }; }),
          total: { e: 'Total', n: n0(conProp.length), v: '', p: $(total), pc: '' } } },
      ],
    };
  };

  /* ═══════════ CONVERSIÓN DEL CHAT IA ═══════════
     Dice si el asistente está VENDIENDO o solo conversando. */
  R['can-chatia'] = async function (p) {
    var s = sb(); var r = rango(p);
    var qc = s.from('chat_conversations')
      .select('id,contact_name,contact_handle,order_id,created_at,last_message_at,human_takeover,labels');
    qc = qc.eq('branch_id', (CTX.branchId || SIN_SEDE));
    var rc = await qc; if (rc.error) throw rc.error;
    var convs = (rc.data || []).filter(function (c) {
      var f = c.last_message_at || c.created_at;
      return f && f >= r.from && f < r.to;
    });
    if (!convs.length) return vacio();

    var conPedido = convs.filter(function (c) { return c.order_id; });
    var ids = conPedido.map(function (c) { return c.order_id; });
    var ventas = {}, totalVendido = 0;
    if (ids.length) {
      try {
        var ro = await s.from('pos_orders').select('id,total_final,total,delivery_fee,status').in('id', ids);
        (ro.data || []).forEach(function (o) {
          if (o.status === 'cancelled') return;
          var dom = parseFloat(o.delivery_fee) || 0, tot = parseFloat(o.total) || 0;
          var v = dom > 0 ? tot - dom : (parseFloat(o.total_final) || tot);
          ventas[o.id] = v; totalVendido += v;
        });
      } catch (e) { console.warn('[Informes] chat:', e); }
    }
    var conv = convs.length ? conPedido.length / convs.length * 100 : 0;
    var humano = convs.filter(function (c) { return c.human_takeover; }).length;

    return {
      kpis: [
        { lbl: 'Conversión a pedido', val: pct(conv), tone: conv >= 40 ? 'good' : conv >= 20 ? 'warn' : 'bad', big: 1,
          sub: n0(conPedido.length) + ' de ' + n0(convs.length) + ' conversaciones' },
        { lbl: 'Vendido por el chat', val: $(totalVendido), tone: 'accent' },
        { lbl: 'Ticket promedio', val: $(conPedido.length ? totalVendido / conPedido.length : 0) },
        { lbl: 'Necesitaron a una persona', val: n0(humano),
          sub: pct(convs.length ? humano / convs.length * 100 : 0) + ' de los chats' },
      ],
      blocks: [
        { t: 'grid2', children: [
          { t: 'card', title: 'De cada 100 que escriben', body: { t: 'donut',
            centerBig: Math.round(conv) + '%', centerLbl: 'compran',
            segs: [
              { name: 'Terminaron en pedido', val: n0(conPedido.length), pct: Math.round(conv), color: '#16A34A' },
              { name: 'Solo conversaron', val: n0(convs.length - conPedido.length), pct: 100 - Math.round(conv), color: '#ECEEF2' },
            ] } },
          { t: 'card', title: 'Qué mirar aquí', body: { t: 'table', min: 300,
            cols: [{ k: 'a', label: 'Indicador' }, { k: 'b', label: '', num: 1 }],
            rows: [
              { a: { _main: 'Conversaciones' }, b: n0(convs.length) },
              { a: 'Terminaron en pedido', b: n0(conPedido.length) },
              { a: 'Conversión', b: pct(conv) },
              { a: 'Tuvo que entrar una persona', b: n0(humano) },
            ],
            total: { a: 'Vendido por el chat', b: $(totalVendido) } } },
        ] },
        { t: 'card', title: 'Chats que sí compraron', body: { t: 'table', min: 520,
          cols: [{ k: 'c', label: 'Contacto' }, { k: 't', label: 'Teléfono' }, { k: 'v', label: 'Pedido', num: 1 }],
          rows: conPedido.slice(0, 60).map(function (c) { return {
            c: { _main: c.contact_name || 'Sin nombre' }, t: c.contact_handle || '—',
            v: ventas[c.order_id] != null ? $(ventas[c.order_id]) : { _pill: ['neu', 'anulado'] } }; }),
          total: { c: 'Total', t: '', v: $(totalVendido) } } },
      ],
    };
  };

  /* ═══════════ AUDITORÍA DE VENTAS (anuladas) ═══════════ */
  R['sal-auditoria'] = async function (p) {
    var s = sb(); var r = rango(p);
    var q = s.from('pos_orders')
      .select('id,customer_name,channel,total,total_final,delivery_fee,waiter_name,notes,created_at,opened_at,closed_at,discount_amount,discount_motivo')
      .eq('status', 'cancelled').gte('created_at', r.from).lt('created_at', r.to)
      .order('created_at', { ascending: false });
    q = q.eq('branch_id', (CTX.branchId || SIN_SEDE));
    var ra = await q; if (ra.error) throw ra.error;
    var anul = ra.data || [];

    var d = await pedidos(p);
    var conDesc = d.lista.filter(function (o) { return (parseFloat(o.discount_amount) || 0) > 0; });
    var totalDesc = conDesc.reduce(function (a, o) { return a + (parseFloat(o.discount_amount) || 0); }, 0);
    if (!anul.length && !conDesc.length) return vacio();

    var perdido = anul.reduce(function (a, o) {
      var dom = parseFloat(o.delivery_fee) || 0, t = parseFloat(o.total) || 0;
      return a + (dom > 0 ? t - dom : t);
    }, 0);
    var porQuien = {};
    anul.forEach(function (o) {
      var k = o.waiter_name || 'Sin asignar';
      porQuien[k] = (porQuien[k] || 0) + 1;
    });
    var arrQ = Object.keys(porQuien).map(function (k) { return { k: k, n: porQuien[k] }; })
      .sort(function (a, b) { return b.n - a.n; });

    return {
      kpis: [
        { lbl: 'Pedidos anulados', val: n0(anul.length), tone: anul.length ? 'bad' : 'good', big: 1 },
        { lbl: 'Valor anulado', val: $(perdido), sub: 'Venta que no entró' },
        { lbl: 'Ventas con descuento', val: n0(conDesc.length) },
        { lbl: 'Total descontado', val: $(totalDesc), tone: totalDesc ? 'warn' : '' },
      ],
      blocks: [
        arrQ.length ? { t: 'card', title: 'Quién anula más', sub: 'Muchas anulaciones de una misma persona merecen una conversación',
          body: { t: 'hbars', items: arrQ.map(function (x) {
            return { lbl: x.k, w: Math.round(x.n / arrQ[0].n * 100), val: n0(x.n) + (x.n === 1 ? ' anulación' : ' anulaciones') }; }) } } : null,
        { t: 'card', title: 'Pedidos anulados', body: { t: 'table', min: 640,
          cols: [{ k: 'f', label: 'Fecha' }, { k: 'c', label: 'Cliente' }, { k: 'ch', label: 'Canal' },
                 { k: 'w', label: 'Registró' }, { k: 'v', label: 'Valor', num: 1 }],
          rows: anul.slice(0, 150).map(function (o) {
            var dom = parseFloat(o.delivery_fee) || 0, t = parseFloat(o.total) || 0;
            return {
              f: new Date(o.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
              c: { _main: o.customer_name || '—' }, ch: o.channel || '—', w: o.waiter_name || '—',
              v: { _neg: '– ' + $(dom > 0 ? t - dom : t) } }; }),
          total: { f: 'Total', c: '', ch: '', w: '', v: $(perdido) } } },
        conDesc.length ? { t: 'card', title: 'Ventas con descuento', body: { t: 'table', min: 560,
          cols: [{ k: 'f', label: 'Fecha' }, { k: 'c', label: 'Cliente' }, { k: 'm', label: 'Motivo' }, { k: 'd', label: 'Descuento', num: 1 }],
          rows: conDesc.slice(0, 100).map(function (o) { return {
            f: new Date(o.closed_at || o.opened_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }),
            c: { _main: o.customer_name || '—' }, m: o.discount_motivo || 'Sin motivo',
            d: $(o.discount_amount) }; }),
          total: { f: 'Total', c: '', m: '', d: $(totalDesc) } } } : null,
      ].filter(Boolean),
    };
  };

  /* ═══════════ CIERRES DE CAJA ═══════════
     Lo importante es el DESCUADRE: si el arqueo no cuadra con lo que debería
     haber, hay que revisarlo el mismo día. */
  R['caj-cierres'] = async function (p) {
    var s = sb(); var r = rango(p);
    var q = s.from('pos_sessions')
      .select('id,cashier_name,opened_at,closed_at,opening_cash,closing_cash,total_sales,arqueo_contado,arqueo_diff,status,shift_type')
      .gte('opened_at', r.from).lt('opened_at', r.to).order('opened_at', { ascending: false });
    q = q.eq('branch_id', (CTX.branchId || SIN_SEDE));
    var rs = await q; if (rs.error) throw rs.error;
    var ses = rs.data || []; if (!ses.length) return vacio();

    var descuadres = ses.filter(function (x) { return Math.abs(parseFloat(x.arqueo_diff) || 0) > 0; });
    var sumaDesc = descuadres.reduce(function (a, x) { return a + (parseFloat(x.arqueo_diff) || 0); }, 0);
    var ventas = ses.reduce(function (a, x) { return a + (parseFloat(x.total_sales) || 0); }, 0);
    return {
      kpis: [
        { lbl: 'Cierres', val: n0(ses.length), tone: 'accent' },
        { lbl: 'Ventas de esos turnos', val: $(ventas) },
        { lbl: 'Turnos descuadrados', val: n0(descuadres.length), tone: descuadres.length ? 'bad' : 'good' },
        { lbl: 'Descuadre acumulado', val: (sumaDesc < 0 ? '– ' : '') + $(Math.abs(sumaDesc)),
          tone: sumaDesc ? 'warn' : 'good', sub: sumaDesc < 0 ? 'Faltó dinero' : sumaDesc > 0 ? 'Sobró dinero' : 'Todo cuadró' },
      ],
      blocks: [{ t: 'card', title: 'Histórico de cierres', sub: 'El descuadre es lo primero que hay que mirar', body: {
        t: 'table', min: 760,
        cols: [{ k: 'f', label: 'Abrió' }, { k: 'c', label: 'Cajero' }, { k: 'ap', label: 'Base', num: 1 },
               { k: 'v', label: 'Ventas', num: 1 }, { k: 'ct', label: 'Contado', num: 1 },
               { k: 'df', label: 'Descuadre', num: 1 }, { k: 'e', label: 'Estado' }],
        rows: ses.map(function (x) {
          var df = parseFloat(x.arqueo_diff) || 0;
          return {
            f: new Date(x.opened_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
            c: { _main: x.cashier_name || '—' },
            ap: $(x.opening_cash), v: $(x.total_sales),
            ct: x.arqueo_contado != null ? $(x.arqueo_contado) : '—',
            df: df === 0 ? { _pill: ['ok', 'Cuadró'] } : (df < 0 ? { _neg: '– ' + $(Math.abs(df)) } : { _pill: ['warn', '+ ' + $(df)] }),
            e: { _pill: [x.status === 'closed' ? 'neu' : 'brand', x.status === 'closed' ? 'Cerrada' : 'Abierta'] } }; }),
        total: { f: 'Total', c: '', ap: '', v: $(ventas), ct: '', df: (sumaDesc < 0 ? '– ' : '') + $(Math.abs(sumaDesc)), e: '' } } }],
    };
  };

  /* ═══════════ EGRESOS E INGRESOS EXTRA ═══════════ */
  R['caj-egresos'] = async function (p) {
    var s = sb(); var r = rango(p);
    var q = s.from('pos_cash_moves').select('id,type,amount,concept,medio,created_by,created_at')
      .gte('created_at', r.from).lt('created_at', r.to).order('created_at', { ascending: false });
    q = q.eq('branch_id', (CTX.branchId || SIN_SEDE));
    var rm = await q; if (rm.error) throw rm.error;
    var mov = rm.data || []; if (!mov.length) return vacio();

    var esEgreso = function (m) { return String(m.type || '').toLowerCase().indexOf('egre') === 0 || m.type === 'out'; };
    var egresos = mov.filter(esEgreso), ingresos = mov.filter(function (m) { return !esEgreso(m); });
    var sumE = egresos.reduce(function (a, m) { return a + (parseFloat(m.amount) || 0); }, 0);
    var sumI = ingresos.reduce(function (a, m) { return a + (parseFloat(m.amount) || 0); }, 0);
    var porConcepto = {};
    egresos.forEach(function (m) {
      var k = (m.concept || 'Sin concepto').trim();
      porConcepto[k] = (porConcepto[k] || 0) + (parseFloat(m.amount) || 0);
    });
    var arr = Object.keys(porConcepto).map(function (k) { return { k: k, v: porConcepto[k] }; })
      .sort(function (a, b) { return b.v - a.v; });
    return {
      kpis: [
        { lbl: 'Egresos', val: $(sumE), tone: 'bad', big: 1 },
        { lbl: 'Ingresos extra', val: $(sumI), tone: 'good' },
        { lbl: 'Neto', val: $(sumI - sumE), tone: (sumI - sumE) < 0 ? 'warn' : 'accent' },
        { lbl: 'Movimientos', val: n0(mov.length) },
      ],
      blocks: [
        arr.length ? { t: 'card', title: 'En qué se va la plata', body: { t: 'hbars', items: arr.slice(0, 12).map(function (x) {
          return { lbl: x.k, w: Math.round(x.v / arr[0].v * 100), val: $(x.v), color: '#DC2626' }; }) } } : null,
        { t: 'card', title: 'Todos los movimientos', body: { t: 'table', min: 640,
          cols: [{ k: 'f', label: 'Fecha' }, { k: 't', label: 'Tipo' }, { k: 'c', label: 'Concepto' },
                 { k: 'm', label: 'Medio' }, { k: 'v', label: 'Valor', num: 1 }],
          rows: mov.map(function (m) { return {
            f: new Date(m.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
            t: { _pill: [esEgreso(m) ? 'bad' : 'ok', esEgreso(m) ? 'Egreso' : 'Ingreso'] },
            c: { _main: m.concept || '—' }, m: m.medio || '—',
            v: esEgreso(m) ? { _neg: '– ' + $(m.amount) } : $(m.amount) }; }),
          total: { f: 'Neto', t: '', c: '', m: '', v: $(sumI - sumE) } } },
      ].filter(Boolean),
    };
  };

  /* ═══════════ STOCK VALORIZADO ═══════════
     Cuánta plata tienes parada en la bodega y en la nevera. */
  R['inv-stock'] = async function () {
    var s = sb();
    /* v_iv_insumos_sede: una fila por insumo con el stock de ESTA sede ya
       resuelto (bolsa comun o propia, segun el modo de la marca). */
    var q = s.from('v_iv_insumos_sede')
      .select('id,nombre,categoria,buy_unit,use_unit,precio,conversion,stock,stock_servicio,min_stock,sub_inventario,activo');
    q = q.eq('branch_id', (CTX.branchId || SIN_SEDE));
    var ri = await q; if (ri.error) throw ri.error;
    var ins = (ri.data || []).filter(function (x) { return x.activo !== false; });
    if (!ins.length) return vacio();

    var filas = ins.map(function (x) {
      // El stock está en unidad de COMPRA, así que se valoriza con el precio de
      // compra. Usar el costo por unidad de uso lo subvaluaría.
      var bod = parseFloat(x.stock) || 0;
      var ser = x.sub_inventario ? (parseFloat(x.stock_servicio) || 0) : 0;
      var tot = bod + ser;
      return { nombre: x.nombre, cat: x.categoria || '—',
               compra: x.buy_unit || '', uso: x.use_unit || '',
               bod: bod, ser: ser, tot: tot, unit: costoCompra(x), valor: tot * costoCompra(x),
               enUso: aUso(tot, x), min: parseFloat(x.min_stock) || 0, sub: !!x.sub_inventario };
    }).sort(function (a, b) { return b.valor - a.valor; });

    var valorTotal = filas.reduce(function (a, x) { return a + x.valor; }, 0);
    var bajos = filas.filter(function (x) { return x.min > 0 && x.tot <= x.min; });
    var enCero = filas.filter(function (x) { return x.tot <= 0; });
    return {
      kpis: [
        { lbl: 'Plata parada en inventario', val: $(valorTotal), tone: 'accent', big: 1 },
        { lbl: 'Insumos activos', val: n0(filas.length) },
        { lbl: 'Bajo el mínimo', val: n0(bajos.length), tone: bajos.length ? 'warn' : 'good' },
        { lbl: 'En cero', val: n0(enCero.length), tone: enCero.length ? 'bad' : 'good' },
      ],
      blocks: [
        bajos.length ? { t: 'card', title: 'Hay que surtir', sub: 'Están en el mínimo o por debajo', body: { t: 'table', min: 480,
          cols: [{ k: 'i', label: 'Insumo' }, { k: 'q', label: 'Quedan', num: 1 }, { k: 'm', label: 'Mínimo', num: 1 }],
          rows: bajos.map(function (x) { return { i: { _main: x.nombre }, q: { _pill: [x.tot <= 0 ? 'bad' : 'warn', nDec(x.tot) + ' ' + x.compra] }, m: nDec(x.min) + ' ' + x.compra }; }) } } : null,
        { t: 'card', title: 'Inventario valorizado', body: { t: 'table', min: 720,
          cols: [{ k: 'i', label: 'Insumo' }, { k: 'c', label: 'Categoría' }, { k: 'b', label: 'Bodega', num: 1 },
                 { k: 's', label: 'Servicio', num: 1 }, { k: 'e', label: 'Equivale a', num: 1 },
                 { k: 'u', label: 'Costo unit.', num: 1 }, { k: 'v', label: 'Valor', num: 1 }],
          rows: filas.map(function (x) { return {
            i: { _main: x.nombre }, c: x.cat,
            b: nDec(x.bod) + ' ' + x.compra, s: x.sub ? nDec(x.ser) + ' ' + x.compra : '—',
            e: nDec(x.enUso) + ' ' + x.uso,
            u: $(x.unit) + ' / ' + x.compra, v: $(x.valor) }; }),
          total: { i: 'Total', c: '', b: '', s: '', e: '', u: '', v: $(valorTotal) } } },
      ].filter(Boolean),
    };
  };

  /* ═══════════ KARDEX ═══════════ */
  R['inv-kardex'] = async function (p) {
    var s = sb(); var r = rango(p);
    var q = s.from('iv_movimientos').select('id,insumo_id,delta,campo,motivo,order_id,reversed,created_at')
      .gte('created_at', r.from).lt('created_at', r.to).order('created_at', { ascending: false }).limit(1000);
    q = q.eq('branch_id', (CTX.branchId || SIN_SEDE));
    var rm = await q; if (rm.error) throw rm.error;
    var mov = rm.data || []; if (!mov.length) return vacio();

    var nombres = {};
    try {
      var qi = s.from('iv_insumos').select('id,nombre,use_unit');
      qi = qi.eq('branch_id', (CTX.branchId || SIN_SEDE));
      var ri = await qi;
      (ri.data || []).forEach(function (x) { nombres[x.id] = x; });
    } catch (e) {}

    var entradas = mov.filter(function (m) { return (parseFloat(m.delta) || 0) > 0; });
    var salidas  = mov.filter(function (m) { return (parseFloat(m.delta) || 0) < 0; });
    return {
      kpis: [
        { lbl: 'Movimientos', val: n0(mov.length), tone: 'accent' },
        { lbl: 'Entradas', val: n0(entradas.length), tone: 'good' },
        { lbl: 'Salidas', val: n0(salidas.length) },
        { lbl: 'Reversados', val: n0(mov.filter(function (m) { return m.reversed; }).length),
          sub: 'Por pedidos anulados' },
      ],
      blocks: [{ t: 'card', title: 'Movimientos de stock', sub: mov.length >= 1000 ? 'Mostrando los 1.000 más recientes' : '',
        body: { t: 'table', min: 720,
        cols: [{ k: 'f', label: 'Fecha' }, { k: 'i', label: 'Insumo' }, { k: 'd', label: 'Cambio', num: 1 },
               { k: 'c', label: 'Dónde' }, { k: 'm', label: 'Motivo' }],
        rows: mov.map(function (m) {
          var ins = nombres[m.insumo_id] || {};
          var dl = parseFloat(m.delta) || 0;
          return {
            f: new Date(m.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
            i: { _main: ins.nombre || '—' },
            d: dl < 0 ? { _neg: n0(dl) + ' ' + (ins.use_unit || '') } : { _pill: ['ok', '+' + n0(dl) + ' ' + (ins.use_unit || '')] },
            c: m.campo === 'stock_servicio' ? 'Servicio' : 'Bodega',
            m: (m.reversed ? '↩ ' : '') + (m.motivo || '—') }; }) } }],
    };
  };

  /* ═══════════ COMPRAS POR INSUMO ═══════════ */
  R['inv-compras'] = async function (p) {
    var s = sb(); var r = rango(p);
    var q = s.from('iv_movimientos').select('insumo_id,delta,motivo,created_at')
      .gt('delta', 0).gte('created_at', r.from).lt('created_at', r.to).limit(2000);
    q = q.eq('branch_id', (CTX.branchId || SIN_SEDE));
    var rm = await q; if (rm.error) throw rm.error;
    // Las entradas por devolución de un pedido anulado NO son compras.
    var mov = (rm.data || []).filter(function (m) { return String(m.motivo || '').toLowerCase().indexOf('devol') < 0; });
    if (!mov.length) return vacio();

    var ins = {};
    try {
      var qi = s.from('iv_insumos').select('id,nombre,buy_unit,use_unit,precio,conversion,categoria');
      qi = qi.eq('branch_id', (CTX.branchId || SIN_SEDE));
      var ri = await qi;
      (ri.data || []).forEach(function (x) { ins[x.id] = x; });
    } catch (e) {}

    var acc = {};
    mov.forEach(function (m) {
      var i = ins[m.insumo_id] || {};
      var k = i.nombre || 'Insumo';
      // delta viene en unidad de COMPRA → se valoriza con el precio de compra.
      if (!acc[k]) acc[k] = { qty: 0, val: 0, compra: i.buy_unit || '', cat: i.categoria || '—', veces: 0 };
      acc[k].qty += parseFloat(m.delta) || 0;
      acc[k].val += (parseFloat(m.delta) || 0) * costoCompra(i);
      acc[k].veces++;
    });
    var arr = ordenar(acc, 'val');
    var tot = arr.reduce(function (a, x) { return a + x.val; }, 0);
    return {
      kpis: [
        { lbl: 'Comprado en el período', val: $(tot), tone: 'accent', big: 1 },
        { lbl: 'Insumos distintos', val: n0(arr.length) },
        { lbl: 'El que más te cuesta', val: arr.length ? arr[0]._k : '—', sub: arr.length ? $(arr[0].val) : '' },
      ],
      blocks: [
        { t: 'card', title: 'En qué insumos se va la plata', body: { t: 'hbars', items: arr.slice(0, 12).map(function (x) {
          return { lbl: x._k, w: Math.round(x.val / arr[0].val * 100), val: $(x.val), color: '#B45309' }; }) } },
        { t: 'card', title: 'Detalle de compras', body: { t: 'table', min: 620,
          cols: [{ k: 'i', label: 'Insumo' }, { k: 'c', label: 'Categoría' }, { k: 'q', label: 'Cantidad', num: 1 },
                 { k: 'n', label: 'Veces', num: 1 }, { k: 'v', label: 'Costo', num: 1 }],
          rows: arr.map(function (x) { return { i: { _main: x._k }, c: x.cat,
            q: nDec(x.qty) + ' ' + x.compra, n: n0(x.veces), v: $(x.val) }; }),
          total: { i: 'Total', c: '', q: '', n: '', v: $(tot) } } },
      ],
    };
  };

  /* ═══════════ DETALLE DE CLIENTE ═══════════ */
  R['cli-detalle'] = async function (p) {
    var d = await pedidos(p);
    var conCli = d.lista.filter(function (o) { return o.cliente_id; });
    if (!conCli.length) return vacio();
    var cli = {};
    try {
      var ids = conCli.map(function (o) { return o.cliente_id; });
      var uniq = ids.filter(function (v, i) { return ids.indexOf(v) === i; });
      var rc = await sb().from('pos_clientes').select('id,nombre,telefono,barrio,direccion').in('id', uniq);
      (rc.data || []).forEach(function (c) { cli[c.id] = c; });
    } catch (e) {}

    var acc = {};
    conCli.forEach(function (o) {
      var c = cli[o.cliente_id] || {};
      var k = o.cliente_id;
      if (!acc[k]) acc[k] = { nombre: c.nombre || 'Cliente', tel: c.telefono || '', barrio: c.barrio || '',
                              n: 0, rev: 0, ultimo: null, prods: {} };
      acc[k].n++; acc[k].rev += ventaDe(o);
      var f = o.closed_at || o.opened_at;
      if (!acc[k].ultimo || f > acc[k].ultimo) acc[k].ultimo = f;
      (o.pos_order_items || []).forEach(function (it) {
        var pn = it.product_name || it.name || '';
        if (pn) acc[k].prods[pn] = (acc[k].prods[pn] || 0) + (parseInt(it.quantity) || 1);
      });
    });
    var arr = ordenar(acc, 'rev');
    var tot = arr.reduce(function (a, x) { return a + x.rev; }, 0);
    return {
      kpis: [
        { lbl: 'Clientes identificados', val: n0(arr.length), tone: 'accent' },
        { lbl: 'Gastado por ellos', val: $(tot) },
        { lbl: 'Pedidos por cliente', val: (Math.round(conCli.length / arr.length * 10) / 10).toString().replace('.', ',') },
      ],
      blocks: [{ t: 'card', title: 'Ficha de cada cliente', sub: 'Qué pide, cada cuánto y cuánto deja', body: {
        t: 'table', min: 820,
        cols: [{ k: 'c', label: 'Cliente' }, { k: 't', label: 'Teléfono' }, { k: 'b', label: 'Barrio' },
               { k: 'n', label: 'Pedidos', num: 1 }, { k: 'v', label: 'Gastado', num: 1 },
               { k: 'tk', label: 'Ticket', num: 1 }, { k: 'u', label: 'Último' }, { k: 'p', label: 'Lo que más pide' }],
        rows: arr.map(function (x) {
          var top = Object.keys(x.prods).sort(function (a, b) { return x.prods[b] - x.prods[a]; })[0];
          return { c: { _main: x.nombre }, t: x.tel || '—', b: x.barrio || '—',
            n: n0(x.n), v: $(x.rev), tk: $(x.rev / x.n),
            u: x.ultimo ? new Date(x.ultimo).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) : '—',
            p: top || '—' }; }),
        total: { c: 'Total', t: '', b: '', n: n0(conCli.length), v: $(tot), tk: '', u: '', p: '' } } }],
    };
  };

  /* ═══════════ COMPARATIVO MENSUAL ═══════════
     Compara este mes contra el anterior, con el mismo número de días
     transcurridos: comparar 15 días contra 30 no dice nada. */
  R['ger-comparativo'] = async function () {
    var s = sb();
    var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    var iniEste = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    var iniAnt  = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    var diaDeHoy = hoy.getDate();
    var finAnt = new Date(hoy.getFullYear(), hoy.getMonth() - 1, diaDeHoy);
    finAnt.setDate(finAnt.getDate() + 1);
    var finEste = new Date(hoy); finEste.setDate(finEste.getDate() + 1);

    async function traer(desde, hasta) {
      var q = s.from('pos_orders').select('total,total_final,delivery_fee,channel,tip_amount')
        .eq('status', 'paid').gte('closed_at', desde.toISOString()).lt('closed_at', hasta.toISOString());
      q = q.eq('branch_id', (CTX.branchId || SIN_SEDE));
      var r = await q; if (r.error) throw r.error;
      var L = r.data || [];
      var venta = L.reduce(function (a, o) {
        var dom = parseFloat(o.delivery_fee) || 0, t = parseFloat(o.total) || 0;
        return a + (dom > 0 ? t - dom : (parseFloat(o.total_final) || t));
      }, 0);
      return { n: L.length, venta: venta, ticket: L.length ? venta / L.length : 0 };
    }
    var este = await traer(iniEste, finEste);
    var ant  = await traer(iniAnt, finAnt);
    if (!este.n && !ant.n) return vacio();

    function variacion(a, b) { return b > 0 ? (a - b) / b * 100 : (a > 0 ? 100 : 0); }
    var vVenta = variacion(este.venta, ant.venta);
    var vN = variacion(este.n, ant.n);
    var vT = variacion(este.ticket, ant.ticket);
    var nomEste = iniEste.toLocaleDateString('es-CO', { month: 'long' });
    var nomAnt  = iniAnt.toLocaleDateString('es-CO', { month: 'long' });
    var mx = Math.max(este.venta, ant.venta) || 1;

    function pill(v) { return { _pill: [v >= 0 ? 'ok' : 'bad', (v >= 0 ? '+' : '') + pct(v)] }; }
    return {
      kpis: [
        { lbl: 'Ventas este mes', val: $(este.venta), tone: 'accent', big: 1,
          sub: 'Primeros ' + diaDeHoy + ' días' },
        { lbl: 'Mismo tramo del mes pasado', val: $(ant.venta) },
        { lbl: 'Variación', val: (vVenta >= 0 ? '+' : '') + pct(vVenta), tone: vVenta >= 0 ? 'good' : 'bad', big: 1 },
        { lbl: 'Ticket promedio', val: $(este.ticket), sub: (vT >= 0 ? '+' : '') + pct(vT) + ' vs mes pasado' },
      ],
      blocks: [
        { t: 'card', title: 'Comparación justa', sub: 'Se comparan los mismos ' + diaDeHoy + ' días de cada mes, no un mes completo contra medio mes',
          body: { t: 'hbars', items: [
            { lbl: nomEste.charAt(0).toUpperCase() + nomEste.slice(1), w: Math.round(este.venta / mx * 100), val: $(este.venta) },
            { lbl: nomAnt.charAt(0).toUpperCase() + nomAnt.slice(1), w: Math.round(ant.venta / mx * 100), val: $(ant.venta), color: '#94A3B8' },
          ] } },
        { t: 'card', title: 'Detalle', body: { t: 'table', min: 480,
          cols: [{ k: 'a', label: '' }, { k: 'b', label: nomAnt, num: 1 }, { k: 'c', label: nomEste, num: 1 }, { k: 'd', label: 'Variación', num: 1 }],
          rows: [
            { a: { _main: 'Ventas' }, b: $(ant.venta), c: $(este.venta), d: pill(vVenta) },
            { a: { _main: '# Pedidos' }, b: n0(ant.n), c: n0(este.n), d: pill(vN) },
            { a: { _main: 'Ticket promedio' }, b: $(ant.ticket), c: $(este.ticket), d: pill(vT) },
          ] } },
      ],
    };
  };

  /* ═══════════ VENTAS vs COMPRAS ═══════════ */
  R['ger-ventascompras'] = async function (p) {
    var s = sb(); var r = rango(p);
    var d = await pedidos(p);
    var venta = d.lista.reduce(function (a, o) { return a + ventaDe(o); }, 0);

    // Compras = entradas de inventario valorizadas (sin las devoluciones).
    var compras = 0;
    try {
      var qm = s.from('iv_movimientos').select('insumo_id,delta,motivo')
        .gt('delta', 0).gte('created_at', r.from).lt('created_at', r.to).limit(2000);
      qm = qm.eq('branch_id', (CTX.branchId || SIN_SEDE));
      var qi = s.from('iv_insumos').select('id,precio,conversion');
      qi = qi.eq('branch_id', (CTX.branchId || SIN_SEDE));
      var res = await Promise.all([qm, qi]);
      var precio = {};
      // delta está en unidad de COMPRA, así que se multiplica por el precio de
      // compra, no por el costo por unidad de uso.
      (res[1].data || []).forEach(function (x) { precio[x.id] = parseFloat(x.precio) || 0; });
      (res[0].data || []).forEach(function (m) {
        if (String(m.motivo || '').toLowerCase().indexOf('devol') >= 0) return;
        compras += (parseFloat(m.delta) || 0) * (precio[m.insumo_id] || 0);
      });
    } catch (e) { console.warn('[Informes] compras:', e); }

    // Egresos de caja del mismo rango.
    var egresos = 0;
    try {
      var qe = s.from('pos_cash_moves').select('type,amount')
        .gte('created_at', r.from).lt('created_at', r.to);
      qe = qe.eq('branch_id', (CTX.branchId || SIN_SEDE));
      var re = await qe;
      (re.data || []).forEach(function (m) {
        var esE = String(m.type || '').toLowerCase().indexOf('egre') === 0 || m.type === 'out';
        if (esE) egresos += parseFloat(m.amount) || 0;
      });
    } catch (e) {}

    if (!venta && !compras && !egresos) return vacio();
    var utilidad = venta - compras - egresos;
    var mx = Math.max(venta, compras + egresos) || 1;
    return {
      kpis: [
        { lbl: 'Ventas', val: $(venta), tone: 'accent', big: 1 },
        { lbl: 'Compras de insumos', val: $(compras) },
        { lbl: 'Egresos de caja', val: $(egresos) },
        { lbl: 'Utilidad estimada', val: $(utilidad), tone: utilidad >= 0 ? 'good' : 'bad', big: 1 },
      ],
      blocks: [
        { t: 'card', title: 'Lo que entra contra lo que sale', body: { t: 'hbars', items: [
          { lbl: 'Ventas', w: Math.round(venta / mx * 100), val: $(venta), color: '#16A34A' },
          { lbl: 'Compras', w: Math.round(compras / mx * 100), val: $(compras), color: '#B45309' },
          { lbl: 'Egresos', w: Math.round(egresos / mx * 100), val: $(egresos), color: '#DC2626' },
        ] } },
        { t: 'card', title: 'Cuentas del período', sub: 'Utilidad estimada = ventas − compras − egresos. No incluye nómina ni arriendo si no los registras como egreso.',
          body: { t: 'table', min: 400,
          cols: [{ k: 'a', label: 'Concepto' }, { k: 'b', label: 'Valor', num: 1 }],
          rows: [
            { a: { _main: 'Ventas' }, b: $(venta) },
            { a: 'Compras de insumos', b: { _neg: '– ' + $(compras) } },
            { a: 'Egresos de caja', b: { _neg: '– ' + $(egresos) } },
          ],
          total: { a: 'Utilidad estimada', b: $(utilidad) } } },
      ],
    };
  };

  /* ═══════════ TIEMPO DE DESPACHO ═══════════ */
  R['can-despacho'] = async function (p) {
    var s = sb(); var r = rango(p);
    var q = s.from('pos_orders').select('id,customer_name,notes,opened_at,created_at,delivered_at,closed_at,total,delivery_fee')
      .eq('channel', 'domicilio').eq('status', 'paid')
      .gte('closed_at', r.from).lt('closed_at', r.to);
    q = q.eq('branch_id', (CTX.branchId || SIN_SEDE));
    var ro = await q; if (ro.error) throw ro.error;
    var L = (ro.data || []).filter(function (o) { return o.delivered_at; });
    if (!L.length) return vacio();

    var filas = L.map(function (o) {
      var ini = new Date(o.opened_at || o.created_at).getTime();
      var fin = new Date(o.delivered_at).getTime();
      var min = Math.max(0, Math.round((fin - ini) / 60000));
      var m = /\[barrio:([^\]]+)\]/i.exec(o.notes || '');
      return { cli: o.customer_name || '—', min: min,
               barrio: m ? m[1].trim().toLowerCase().replace(/(^|\s)\S/g, function (t) { return t.toUpperCase(); }) : 'Sin barrio',
               f: o.opened_at || o.created_at };
    }).filter(function (x) { return x.min < 60 * 8; });   // descarta los que quedaron sin cerrar bien
    if (!filas.length) return vacio();

    var prom = filas.reduce(function (a, x) { return a + x.min; }, 0) / filas.length;
    var ordenados = filas.slice().sort(function (a, b) { return a.min - b.min; });
    var mediana = ordenados[Math.floor(ordenados.length / 2)].min;
    var lentos = filas.filter(function (x) { return x.min > 45; });

    var porBarrio = {};
    filas.forEach(function (x) {
      if (!porBarrio[x.barrio]) porBarrio[x.barrio] = { suma: 0, n: 0 };
      porBarrio[x.barrio].suma += x.min; porBarrio[x.barrio].n++;
    });
    var arr = Object.keys(porBarrio).map(function (k) {
      return { k: k, prom: porBarrio[k].suma / porBarrio[k].n, n: porBarrio[k].n };
    }).sort(function (a, b) { return b.prom - a.prom; });
    var mxb = arr.length ? arr[0].prom : 1;

    return {
      kpis: [
        { lbl: 'Tiempo promedio', val: Math.round(prom) + ' min',
          tone: prom <= 30 ? 'good' : prom <= 45 ? 'warn' : 'bad', big: 1 },
        { lbl: 'Mediana', val: mediana + ' min', sub: 'La mitad llega antes de esto' },
        { lbl: 'Domicilios medidos', val: n0(filas.length) },
        { lbl: 'Pasaron de 45 min', val: n0(lentos.length), tone: lentos.length ? 'warn' : 'good' },
      ],
      blocks: [
        { t: 'card', title: 'Barrios donde más se demora', sub: 'Sirve para ajustar el tiempo que le prometes al cliente',
          body: { t: 'hbars', items: arr.slice(0, 12).map(function (x) {
            return { lbl: x.k + ' (' + x.n + ')', w: Math.round(x.prom / mxb * 100), val: Math.round(x.prom) + ' min',
                     color: x.prom > 45 ? '#DC2626' : x.prom > 30 ? '#F59E0B' : '#16A34A' }; }) } },
        { t: 'card', title: 'Los más demorados', body: { t: 'table', min: 520,
          cols: [{ k: 'f', label: 'Fecha' }, { k: 'c', label: 'Cliente' }, { k: 'b', label: 'Barrio' }, { k: 'm', label: 'Tardó', num: 1 }],
          rows: filas.slice().sort(function (a, b) { return b.min - a.min; }).slice(0, 25).map(function (x) { return {
            f: new Date(x.f).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }),
            c: { _main: x.cli }, b: x.barrio,
            m: { _pill: [x.min > 45 ? 'bad' : x.min > 30 ? 'warn' : 'ok', x.min + ' min'] } }; }) } },
      ],
    };
  };

  /* ═══════════ AFLUENCIA ═══════════
     El ticket por PERSONA dice más que el ticket por mesa: una mesa de 6 que
     deja $90.000 no es lo mismo que una pareja que deja $90.000. */
  R['can-afluencia'] = async function (p) {
    var d = await pedidos(p); if (!d.lista.length) return vacio();
    var salon = d.lista.filter(function (o) { return (parseInt(o.guests) || 0) > 0; });
    if (!salon.length) return vacio();
    var personas = salon.reduce(function (a, o) { return a + (parseInt(o.guests) || 0); }, 0);
    var venta = salon.reduce(function (a, o) { return a + ventaDe(o); }, 0);

    // Por franja horaria: para saber cuándo se llena de verdad.
    var horas = {};
    salon.forEach(function (o) {
      var h = new Date(o.closed_at || o.opened_at).getHours();
      if (!horas[h]) horas[h] = { per: 0, n: 0, rev: 0 };
      horas[h].per += parseInt(o.guests) || 0;
      horas[h].n++; horas[h].rev += ventaDe(o);
    });
    var hs = Object.keys(horas).map(Number).sort(function (a, b) { return a - b; });
    var mx = Math.max.apply(null, hs.map(function (h) { return horas[h].per; })) || 1;

    // Tamaño de grupo: cuántas mesas son parejas, familias, etc.
    var tam = { '1': 0, '2': 0, '3-4': 0, '5+': 0 };
    salon.forEach(function (o) {
      var g = parseInt(o.guests) || 0;
      if (g <= 1) tam['1']++; else if (g === 2) tam['2']++;
      else if (g <= 4) tam['3-4']++; else tam['5+']++;
    });
    var COLS = { '1': '#94A3B8', '2': '#5B6BFF', '3-4': '#16A34A', '5+': '#8B5CF6' };
    var NOM = { '1': 'Solos', '2': 'Parejas', '3-4': 'Grupos de 3-4', '5+': 'Grupos de 5 o más' };
    var segs = Object.keys(tam).filter(function (k) { return tam[k]; }).map(function (k) {
      return { name: NOM[k], val: n0(tam[k]), pct: Math.round(tam[k] / salon.length * 100), color: COLS[k] };
    });
    var suma = segs.reduce(function (a, s) { return a + s.pct; }, 0);
    if (segs.length && suma !== 100) segs[0].pct += (100 - suma);

    return {
      kpis: [
        { lbl: 'Personas atendidas', val: n0(personas), tone: 'accent', big: 1 },
        { lbl: 'Ticket por persona', val: $(personas ? venta / personas : 0), big: 1 },
        { lbl: 'Ticket por mesa', val: $(venta / salon.length) },
        { lbl: 'Personas por mesa', val: (Math.round(personas / salon.length * 10) / 10).toString().replace('.', ',') },
      ],
      blocks: [
        { t: 'card', title: 'A qué hora se llena', sub: 'Personas atendidas por franja', body: {
          t: 'vbars', autopeak: 1, items: hs.map(function (h) {
            return { x: (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? 'a' : 'p'),
                     w: Math.round(horas[h].per / mx * 100), val: n0(horas[h].per) + ' pers.' }; }) } },
        { t: 'grid2', children: [
          { t: 'card', title: 'Cómo vienen', body: { t: 'donut',
            centerBig: n0(salon.length), centerLbl: 'mesas', segs: segs } },
          { t: 'card', title: 'Detalle por hora', body: { t: 'table', min: 340,
            cols: [{ k: 'h', label: 'Hora' }, { k: 'm', label: 'Mesas', num: 1 },
                   { k: 'p', label: 'Personas', num: 1 }, { k: 'tp', label: 'Por persona', num: 1 }],
            rows: hs.map(function (h) { return {
              h: { _main: (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? ' a.m.' : ' p.m.') },
              m: n0(horas[h].n), p: n0(horas[h].per),
              tp: $(horas[h].per ? horas[h].rev / horas[h].per : 0) }; }),
            total: { h: 'Total', m: n0(salon.length), p: n0(personas), tp: $(personas ? venta / personas : 0) } } },
        ] },
      ],
    };
  };

  /* ═══════════ CONSUMO TEÓRICO (PALOTEO) ═══════════
     Lo que las recetas dicen que DEBISTE gastar, contra lo que de verdad salió
     del inventario. La diferencia es desperdicio, mal porcionado, o algo que
     se está yendo sin venderse. Es el informe que más plata recupera. */
  R['inv-paloteo'] = async function (p) {
    var d = await pedidos(p); if (!d.lista.length) return vacio();
    var s = sb(); var r = rango(p);

    // 1. TEÓRICO: recetas × unidades vendidas, insumo por insumo.
    var motor = await motorCostos();
    var teorico = {};
    items(d.lista, function (it) {
      var det = motor.detalle(it.product_id, (it.selections && it.selections.pres) || '',
                              (it.selections && it.selections.mods) || {});
      var q = parseInt(it.quantity) || 1;
      det.forEach(function (l) { teorico[l.insumo_id] = (teorico[l.insumo_id] || 0) + l.cant * q; });
    });
    if (!Object.keys(teorico).length) return vacio();

    // 2. REAL: lo que efectivamente salió del inventario en el mismo rango.
    var real = {};
    try {
      var qm = s.from('iv_movimientos').select('insumo_id,delta,motivo')
        .lt('delta', 0).gte('created_at', r.from).lt('created_at', r.to).limit(3000);
      qm = qm.eq('branch_id', (CTX.branchId || SIN_SEDE));
      var rm = await qm;
      (rm.data || []).forEach(function (m) {
        real[m.insumo_id] = (real[m.insumo_id] || 0) + Math.abs(parseFloat(m.delta) || 0);
      });
    } catch (e) { console.warn('[Informes] paloteo:', e); }

    var ins = {};
    try {
      var qi = s.from('iv_insumos').select('id,nombre,use_unit,buy_unit,precio,conversion');
      qi = qi.eq('branch_id', (CTX.branchId || SIN_SEDE));
      var ri = await qi;
      (ri.data || []).forEach(function (x) { ins[x.id] = x; });
    } catch (e) {}

    var todos = {};
    Object.keys(teorico).forEach(function (k) { todos[k] = 1; });
    Object.keys(real).forEach(function (k) { todos[k] = 1; });

    var filas = Object.keys(todos).map(function (k) {
      var i = ins[k] || {};
      var t  = teorico[k] || 0;               // recetas → unidad de USO
      var rl = aUso(real[k] || 0, i);         // movimientos → de COMPRA a USO
      var dif = rl - t;                       // positivo = salió MÁS de lo que debía
      return { nombre: i.nombre || '—', uso: i.use_unit || '', teo: t, real: rl,
               dif: dif, pct: t > 0 ? dif / t * 100 : 0, valor: dif * costoUso(i) };
    }).filter(function (x) { return x.teo > 0 || x.real > 0; })
      .sort(function (a, b) { return b.valor - a.valor; });

    var perdido = filas.filter(function (x) { return x.valor > 0; })
      .reduce(function (a, x) { return a + x.valor; }, 0);
    var desviados = filas.filter(function (x) { return Math.abs(x.pct) > 10 && x.teo > 0; });

    return {
      kpis: [
        { lbl: 'Insumos revisados', val: n0(filas.length), tone: 'accent' },
        { lbl: 'Se fue de más', val: $(perdido), tone: perdido > 0 ? 'bad' : 'good',
          sub: 'Valor del consumo por encima de la receta' },
        { lbl: 'Con desviación > 10%', val: n0(desviados.length), tone: desviados.length ? 'warn' : 'good' },
      ],
      blocks: [{ t: 'card', title: 'Lo que la receta dice vs lo que salió',
        sub: 'Positivo = se gastó MÁS de lo que las recetas justifican. Ahí hay desperdicio, mal porcionado o fuga.',
        body: { t: 'table', min: 700,
        cols: [{ k: 'i', label: 'Insumo' }, { k: 't', label: 'Debió salir', num: 1 },
               { k: 'r', label: 'Salió', num: 1 }, { k: 'd', label: 'Diferencia', num: 1 },
               { k: 'p', label: '%', num: 1 }, { k: 'v', label: 'Costo', num: 1 }],
        rows: filas.map(function (x) { return {
          i: { _main: x.nombre },
          t: nDec(x.teo) + ' ' + x.uso, r: nDec(x.real) + ' ' + x.uso,
          d: x.dif > 0 ? { _neg: '+' + nDec(x.dif) + ' ' + x.uso } : nDec(x.dif) + ' ' + x.uso,
          p: x.teo > 0 ? { _pill: [Math.abs(x.pct) <= 10 ? 'ok' : Math.abs(x.pct) <= 25 ? 'warn' : 'bad',
                                   (x.pct > 0 ? '+' : '') + pct(x.pct)] } : '—',
          v: x.valor > 0 ? { _neg: '– ' + $(x.valor) } : $(Math.abs(x.valor)) }; }),
        total: { i: 'Costo de lo que se fue de más', t: '', r: '', d: '', p: '', v: $(perdido) } } }],
    };
  };

  /* ═══════════ PLANIFICADOR DE COMPRAS ═══════════
     Qué comprar y cuánto, según lo que se está consumiendo de verdad. */
  R['inv-planificador'] = async function (p) {
    var s = sb(); var r = rango(p);
    var qi = s.from('v_iv_insumos_sede')
      .select('id,nombre,categoria,use_unit,buy_unit,precio,conversion,stock,stock_servicio,min_stock,sub_inventario,activo');
    qi = qi.eq('branch_id', (CTX.branchId || SIN_SEDE));
    var ri = await qi; if (ri.error) throw ri.error;
    var ins = (ri.data || []).filter(function (x) { return x.activo !== false; });
    if (!ins.length) return vacio();

    // Consumo real del período, para proyectar cuántos días aguanta el stock.
    var cons = {};
    try {
      var qm = s.from('iv_movimientos').select('insumo_id,delta')
        .lt('delta', 0).gte('created_at', r.from).lt('created_at', r.to).limit(3000);
      qm = qm.eq('branch_id', (CTX.branchId || SIN_SEDE));
      var rm = await qm;
      (rm.data || []).forEach(function (m) {
        cons[m.insumo_id] = (cons[m.insumo_id] || 0) + Math.abs(parseFloat(m.delta) || 0);
      });
    } catch (e) {}
    var dias = Math.max(1, Math.round((new Date(r.to) - new Date(r.from)) / 86400000));

    var filas = ins.map(function (x) {
      var stock = (parseFloat(x.stock) || 0) + (x.sub_inventario ? (parseFloat(x.stock_servicio) || 0) : 0);
      var min = parseFloat(x.min_stock) || 0;
      var porDia = (cons[x.id] || 0) / dias;
      // Objetivo: cubrir el mínimo y además 7 días de consumo al ritmo actual.
      var objetivo = Math.max(min, porDia * 7);
      var falta = Math.max(0, objetivo - stock);
      // Todo en unidad de COMPRA: es lo que de verdad se pide al proveedor.
      return { nombre: x.nombre, cat: x.categoria || '—', compra: x.buy_unit || '',
               stock: stock, min: min, porDia: porDia,
               diasQueAguanta: porDia > 0 ? stock / porDia : null,
               falta: falta, costo: falta * costoCompra(x) };
    }).filter(function (x) { return x.falta > 0; })
      .sort(function (a, b) {
        var da = a.diasQueAguanta == null ? 999 : a.diasQueAguanta;
        var db = b.diasQueAguanta == null ? 999 : b.diasQueAguanta;
        return da - db;
      });

    if (!filas.length) return vacio();
    var costoTotal = filas.reduce(function (a, x) { return a + x.costo; }, 0);
    var urgentes = filas.filter(function (x) { return x.diasQueAguanta != null && x.diasQueAguanta <= 2; });

    return {
      kpis: [
        { lbl: 'Insumos a comprar', val: n0(filas.length), tone: 'accent', big: 1 },
        { lbl: 'Urgentes', val: n0(urgentes.length), tone: urgentes.length ? 'bad' : 'good',
          sub: 'Aguantan 2 días o menos' },
        { lbl: 'Costo del pedido', val: $(costoTotal) },
        { lbl: 'Base del cálculo', val: dias + (dias === 1 ? ' día' : ' días'), sub: 'Consumo del período elegido' },
      ],
      blocks: [{ t: 'card', title: 'Sugerido de compra',
        sub: 'Cubre el stock mínimo más 7 días al ritmo que estás consumiendo. Ordenado por urgencia.',
        body: { t: 'table', min: 760,
        cols: [{ k: 'i', label: 'Insumo' }, { k: 'c', label: 'Categoría' }, { k: 's', label: 'Tienes', num: 1 },
               { k: 'd', label: 'Aguanta', num: 1 }, { k: 'f', label: 'Comprar', num: 1 }, { k: 'v', label: 'Costo', num: 1 }],
        rows: filas.map(function (x) { return {
          i: { _main: x.nombre }, c: x.cat,
          s: nDec(x.stock) + ' ' + x.compra,
          d: x.diasQueAguanta == null ? { _pill: ['neu', 'sin consumo'] }
             : { _pill: [x.diasQueAguanta <= 2 ? 'bad' : x.diasQueAguanta <= 5 ? 'warn' : 'ok',
                         (Math.round(x.diasQueAguanta * 10) / 10).toString().replace('.', ',') + ' días'] },
          f: { _main: nDec(Math.ceil(x.falta * 100) / 100) + ' ' + x.compra },
          v: $(x.costo) }; }),
        total: { i: 'Total del pedido', c: '', s: '', d: '', f: '', v: $(costoTotal) } } }],
    };
  };

  /* ═══════════ MERMA ═══════════
     Lo que se perdió y no se vendió. Solo aparecen los insumos que el dueño
     marcó como "puede tener merma": las bebidas embotelladas no ensucian esto. */
  R['inv-merma'] = async function (p) {
    var s = sb(); var r = rango(p);
    var q = s.from('iv_merma').select('insumo_id,cantidad,campo,motivo,nota,costo,registrado_por,created_at')
      .gte('created_at', r.from).lt('created_at', r.to).order('created_at', { ascending: false });
    q = q.eq('branch_id', (CTX.branchId || SIN_SEDE));
    var rm = await q; if (rm.error) throw rm.error;
    var mer = rm.data || []; if (!mer.length) return vacio();

    var ins = {};
    try {
      var qi = s.from('iv_insumos').select('id,nombre,buy_unit,use_unit,precio,conversion,categoria');
      qi = qi.eq('branch_id', (CTX.branchId || SIN_SEDE));
      var ri = await qi;
      (ri.data || []).forEach(function (x) { ins[x.id] = x; });
    } catch (e) {}

    var MOT = { dano: 'Se dañó', vencimiento: 'Se venció', preparacion: 'Error de preparación',
                derrame: 'Se cayó o derramó', robo: 'Faltante sin explicación', otro: 'Otro' };
    var COL = { dano: '#F59E0B', vencimiento: '#DC2626', preparacion: '#8B5CF6',
                derrame: '#0EA5E9', robo: '#E11D48', otro: '#64748B' };

    var total = mer.reduce(function (a, m) { return a + (parseFloat(m.costo) || 0); }, 0);

    // Por motivo: saber SI se está venciendo o SI se está cayendo cambia qué hacer.
    var porMot = {};
    mer.forEach(function (m) {
      var k = m.motivo || 'otro';
      if (!porMot[k]) porMot[k] = { val: 0, n: 0 };
      porMot[k].val += parseFloat(m.costo) || 0; porMot[k].n++;
    });
    var arrMot = Object.keys(porMot).map(function (k) { return { k: k, val: porMot[k].val, n: porMot[k].n }; })
      .sort(function (a, b) { return b.val - a.val; });
    var segs = arrMot.map(function (x) {
      return { name: MOT[x.k] || x.k, val: $(x.val), pct: total ? Math.round(x.val / total * 100) : 0,
               color: COL[x.k] || '#64748B' };
    });
    var suma = segs.reduce(function (a, x) { return a + x.pct; }, 0);
    if (segs.length && suma !== 100) segs[0].pct += (100 - suma);

    // Por insumo: cuál se está botando más.
    var porIns = {};
    mer.forEach(function (m) {
      var i = ins[m.insumo_id] || {};
      var k = i.nombre || 'Insumo';
      if (!porIns[k]) porIns[k] = { val: 0, qty: 0, n: 0, compra: i.buy_unit || '' };
      porIns[k].val += parseFloat(m.costo) || 0;
      porIns[k].qty += parseFloat(m.cantidad) || 0;
      porIns[k].n++;
    });
    var arrIns = ordenar(porIns, 'val');
    var mx = arrIns.length ? arrIns[0].val : 1;

    // Cuánto pesa la merma sobre la venta del mismo período.
    var venta = 0;
    try {
      var d = await pedidos(p);
      venta = d.lista.reduce(function (a, o) { return a + ventaDe(o); }, 0);
    } catch (e) {}

    return {
      kpis: [
        { lbl: 'Perdido en merma', val: $(total), tone: 'bad', big: 1 },
        { lbl: 'Registros', val: n0(mer.length) },
        { lbl: 'Lo que más se pierde', val: arrIns.length ? arrIns[0]._k : '—',
          sub: arrIns.length ? $(arrIns[0].val) : '' },
        { lbl: '% sobre la venta', val: venta ? pct(total / venta * 100) : '—',
          tone: venta && (total / venta * 100) > 3 ? 'bad' : 'warn',
          sub: 'Más del 3% ya es mucho' },
      ],
      blocks: [
        { t: 'grid2', children: [
          { t: 'card', title: 'Por qué se pierde', sub: 'Saber la causa dice qué corregir', body: {
            t: 'donut', centerBig: n0(mer.length), centerLbl: 'registros', segs: segs } },
          { t: 'card', title: 'Qué se pierde más', body: { t: 'hbars', items: arrIns.slice(0, 8).map(function (x) {
            return { lbl: x._k, w: Math.round(x.val / mx * 100), val: $(x.val), color: '#DC2626' }; }) } },
        ] },
        { t: 'card', title: 'Detalle', body: { t: 'table', min: 720,
          cols: [{ k: 'f', label: 'Fecha' }, { k: 'i', label: 'Insumo' }, { k: 'q', label: 'Cantidad', num: 1 },
                 { k: 'm', label: 'Motivo' }, { k: 'd', label: 'Dónde' },
                 { k: 'w', label: 'Registró' }, { k: 'v', label: 'Costo', num: 1 }],
          rows: mer.map(function (m) {
            var i = ins[m.insumo_id] || {};
            return {
              f: new Date(m.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
              i: { _main: i.nombre || '—' },
              q: nDec(m.cantidad) + ' ' + (i.buy_unit || ''),
              m: { _pill: [m.motivo === 'robo' ? 'bad' : m.motivo === 'vencimiento' ? 'warn' : 'neu', MOT[m.motivo] || m.motivo] },
              d: m.campo === 'stock_servicio' ? 'Servicio' : 'Bodega',
              w: m.registrado_por || '—',
              v: { _neg: '– ' + $(m.costo) } }; }),
          total: { f: 'Total', i: '', q: '', m: '', d: '', w: '', v: $(total) } } },
      ],
    };
  };

  /* ═══════════ VENTAS POR IMPUESTO ═══════════
     Es lo que se lleva a la declaración: cuánto se vendió a cada tarifa y
     cuánto impuesto se recaudó. Lee lo CONGELADO en cada venta, nunca
     recalcula: las ventas ya declaradas no pueden cambiar. */
  R['sal-impuesto'] = async function (p) {
    var d = await pedidos(p); if (!d.lista.length) return vacio();
    var conImp = d.lista.filter(function (o) { return (parseFloat(o.tax_total) || 0) > 0; });
    if (!conImp.length) return vacio();

    var acum = {}, base = 0, imp = 0;
    conImp.forEach(function (o) {
      base += parseFloat(o.tax_base) || 0;
      imp  += parseFloat(o.tax_total) || 0;
      (o.tax_detail || []).forEach(function (t) {
        var k = String(t.pct);
        if (!acum[k]) acum[k] = { pct: Number(t.pct), base: 0, monto: 0 };
        acum[k].base += Number(t.base) || 0;
        acum[k].monto += Number(t.monto) || 0;
      });
    });
    var arr = Object.keys(acum).map(function (k) { return acum[k]; })
      .sort(function (a, b) { return b.pct - a.pct; });
    var venta = d.lista.reduce(function (a, o) { return a + ventaDe(o); }, 0);

    return {
      kpis: [
        { lbl: 'Impuesto recaudado', val: $(imp), tone: 'accent', big: 1 },
        { lbl: 'Base gravable', val: $(base) },
        { lbl: 'Ventas con impuesto', val: n0(conImp.length),
          sub: 'de ' + n0(d.lista.length) + ' ventas' },
        { lbl: 'Ventas del período', val: $(venta) },
      ],
      blocks: [{ t: 'card', title: 'Resumen por tarifa',
        sub: 'Esto es lo que va a la declaración. Sale de lo guardado en cada venta, no de un recálculo.',
        body: { t: 'table', min: 460,
        cols: [{ k: 't', label: 'Tarifa' }, { k: 'b', label: 'Base gravable', num: 1 }, { k: 'i', label: 'Impuesto', num: 1 }],
        rows: arr.map(function (x) { return {
          t: { _main: (Math.round(x.pct * 100) / 100).toString().replace('.', ',') + '%' },
          b: $(x.base), i: $(x.monto) }; }),
        total: { t: 'Total', b: $(base), i: $(imp) } } }],
    };
  };

  /* ═══════════ CRÉDITOS ═══════════
     Cuentas por cobrar: quién debe, cuánto y desde cuándo. El crédito es una
     forma de pago, así que el pedido ya está pagado y la caja cuadró: lo que
     se ve aquí es la deuda de la PERSONA. */
  R['caj-creditos'] = async function (p) {
    var s = sb();
    var q = s.from('v_creditos').select('*');
    q = q.eq('branch_id', (CTX.branchId || SIN_SEDE));
    var rc = await q; if (rc.error) throw rc.error;
    var lista = rc.data || []; if (!lista.length) return vacio();

    var conDeuda = lista.filter(function (c) { return Number(c.saldo) > 0; });
    var total = conDeuda.reduce(function (a, c) { return a + Number(c.saldo); }, 0);
    var cupo  = lista.reduce(function (a, c) { return a + (Number(c.cupo) || 0); }, 0);

    // Movimientos del período, para ver el flujo y no solo la foto.
    var r = rango(p);
    var consumo = 0, abonos = 0;
    try {
      var qm = s.from('pos_credito_movimientos').select('tipo,monto')
        .gte('created_at', r.from).lt('created_at', r.to);
      qm = qm.eq('branch_id', (CTX.branchId || SIN_SEDE));
      var rm = await qm;
      (rm.data || []).forEach(function (m) {
        if (m.tipo === 'abono') abonos += Number(m.monto) || 0;
        else if (m.tipo === 'consumo') consumo += Number(m.monto) || 0;
      });
    } catch (e) {}

    // Antigüedad: una deuda vieja es la que hay que salir a cobrar.
    var hoy = Date.now();
    function dias(c) {
      if (!c.ultimo_mov) return null;
      return Math.floor((hoy - new Date(c.ultimo_mov).getTime()) / 86400000);
    }
    var arr = conDeuda.slice().sort(function (a, b) { return Number(b.saldo) - Number(a.saldo); });
    var viejas = arr.filter(function (c) { var d = dias(c); return d != null && d > 30; });

    return {
      kpis: [
        { lbl: 'Te deben', val: $(total), tone: total > 0 ? 'warn' : 'good', big: 1 },
        { lbl: 'Personas con deuda', val: n0(conDeuda.length), sub: 'de ' + n0(lista.length) + ' con crédito' },
        { lbl: 'Consumido en el período', val: $(consumo) },
        { lbl: 'Abonado en el período', val: $(abonos), tone: 'good' },
        { lbl: 'Sin moverse +30 días', val: n0(viejas.length), tone: viejas.length ? 'bad' : 'good' },
      ],
      blocks: [
        { t: 'card', title: 'Cuentas por cobrar', sub: 'Ordenadas por lo que más deben',
          body: { t: 'table', min: 700,
          cols: [{ k: 'n', label: 'Quién' }, { k: 't', label: 'Tipo' }, { k: 'c', label: 'Cupo', num: 1 },
                 { k: 'd', label: 'Debe', num: 1 }, { k: 'q', label: 'Le queda', num: 1 }, { k: 'u', label: 'Último movimiento' }],
          rows: arr.map(function (c) {
            var dd = dias(c);
            return {
              n: { _main: c.nombre },
              t: { _pill: [c.tipo === 'empleado' ? 'violet' : 'brand', c.tipo === 'empleado' ? 'Empleado' : 'Cliente'] },
              c: $(c.cupo),
              d: { _neg: $(c.saldo) },
              q: $(c.disponible),
              u: dd == null ? '—' : { _pill: [dd > 30 ? 'bad' : dd > 15 ? 'warn' : 'neu',
                                              dd === 0 ? 'hoy' : 'hace ' + dd + (dd === 1 ? ' día' : ' días')] } }; }),
          total: { n: 'Total', t: '', c: $(cupo), d: $(total), q: '', u: '' } } },
      ],
    };
  };

  /* ═══════════ CUADRE DE STOCK ═══════════
     Lo que el sistema creía vs lo que había de verdad. Incluye también los
     ajustes hechos a mano desde la ficha del insumo: antes esos no dejaban
     rastro y la plata que faltaba desaparecía sin que nadie se enterara. */
  R['inv-cuadre'] = async function (p) {
    var s = sb(); var r = rango(p);
    var qc = s.from('iv_conteos').select('*')
      .gte('created_at', r.from).lt('created_at', r.to).order('created_at', { ascending: false });
    qc = qc.eq('branch_id', (CTX.branchId || SIN_SEDE));
    var rc = await qc; if (rc.error) throw rc.error;
    var conteos = (rc.data || []).filter(function (x) { return x.estado === 'cerrado'; });

    // Ajustes manuales del período (los que NO vienen de un conteo).
    var manuales = [];
    try {
      var qm = s.from('iv_movimientos').select('insumo_id,delta,motivo,created_at')
        .eq('motivo', 'ajuste manual').gte('created_at', r.from).lt('created_at', r.to).limit(500);
      qm = qm.eq('branch_id', (CTX.branchId || SIN_SEDE));
      var rm = await qm; manuales = rm.data || [];
    } catch (e) {}

    if (!conteos.length && !manuales.length) return vacio();

    var ins = {};
    try {
      var qi = s.from('iv_insumos').select('id,nombre,buy_unit,precio');
      qi = qi.eq('branch_id', (CTX.branchId || SIN_SEDE));
      var ri = await qi;
      (ri.data || []).forEach(function (x) { ins[x.id] = x; });
    } catch (e) {}

    var falta = conteos.reduce(function (a, x) { return a + (Number(x.valor_faltante) || 0); }, 0);
    var sobra = conteos.reduce(function (a, x) { return a + (Number(x.valor_sobrante) || 0); }, 0);
    var valManual = manuales.reduce(function (a, m) {
      var i = ins[m.insumo_id] || {};
      return a + Math.abs((parseFloat(m.delta) || 0) * costoCompra(i));
    }, 0);

    var bloques = [];

    if (conteos.length) {
      bloques.push({ t: 'card', title: 'Conteos hechos', sub: 'La diferencia es lo que había de menos o de más frente al sistema',
        body: { t: 'table', min: 620,
        cols: [{ k: 'f', label: 'Fecha' }, { k: 'q', label: 'Qué se contó' }, { k: 'n', label: 'Insumos', num: 1 },
               { k: 'd', label: 'Con diferencia', num: 1 }, { k: 'fa', label: 'Faltó', num: 1 }, { k: 'so', label: 'Sobró', num: 1 }],
        rows: conteos.map(function (x) { return {
          f: new Date(x.closed_at || x.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
          q: { _main: x.categoria || 'Todo el inventario' },
          n: n0(x.n_items), d: n0(x.n_diferencias),
          fa: Number(x.valor_faltante) > 0 ? { _neg: '– ' + $(x.valor_faltante) } : '—',
          so: Number(x.valor_sobrante) > 0 ? $(x.valor_sobrante) : '—' }; }),
        total: { f: 'Total', q: '', n: '', d: '', fa: $(falta), so: $(sobra) } } });
    }

    if (manuales.length) {
      bloques.push({ t: 'card', title: 'Ajustes hechos a mano',
        sub: 'Stock corregido directamente en la ficha del insumo, sin conteo. Muchos ajustes seguidos del mismo insumo son señal de que algo no cuadra.',
        body: { t: 'table', min: 520,
        cols: [{ k: 'f', label: 'Fecha' }, { k: 'i', label: 'Insumo' }, { k: 'd', label: 'Cambio', num: 1 }, { k: 'v', label: 'Valor', num: 1 }],
        rows: manuales.slice(0, 100).map(function (m) {
          var i = ins[m.insumo_id] || {};
          var dl = parseFloat(m.delta) || 0;
          return {
            f: new Date(m.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
            i: { _main: i.nombre || '—' },
            d: dl < 0 ? { _neg: nDec(dl) + ' ' + (i.buy_unit || '') } : { _pill: ['ok', '+' + nDec(dl) + ' ' + (i.buy_unit || '')] },
            v: $(Math.abs(dl * costoCompra(i))) }; }) } });
    }

    return {
      kpis: [
        { lbl: 'Faltó en los conteos', val: $(falta), tone: falta > 0 ? 'bad' : 'good', big: 1 },
        { lbl: 'Sobró', val: $(sobra), tone: sobra > 0 ? 'warn' : 'good' },
        { lbl: 'Conteos', val: n0(conteos.length) },
        { lbl: 'Ajustes a mano', val: n0(manuales.length), tone: manuales.length > 5 ? 'warn' : '',
          sub: manuales.length ? 'mueven ' + $(valManual) : 'ninguno' },
      ],
      blocks: bloques,
    };
  };

  window.INFORMES_DATOS = {
    /* Poner o quitar un filtro. Devuelve true si de verdad cambio algo, para
       que la pantalla no repinte por gusto. */
    setFiltro: function (k, v) {
      if (!(k in FILTROS)) return false;
      var nuevo = v || null;
      if (FILTROS[k] === nuevo) return false;
      FILTROS[k] = nuevo; limpiarCache();
      return true;
    },
    filtros: function () { var c = {}; for (var k in FILTROS) c[k] = FILTROS[k]; return c; },
    limpiarFiltros: function () {
      var habia = false;
      for (var k in FILTROS) { if (FILTROS[k]) { FILTROS[k] = null; habia = true; } }
      if (habia) limpiarCache();
      return habia;
    },
    opciones: opcionesFiltro,

    /* Las sedes entre las que se puede mirar: solo las de ESTA marca. Mezclar
       marcas en un desplegable es justo lo que se quiere evitar. */
    sucursales: async function () {
      var marca = await marcaDeLaSede();
      if (!marca) return [];
      try {
        var r = await sb().from('branches').select('id,name').eq('brand_id', marca).order('name');
        return r.data || [];
      } catch (e) { return []; }
    },

    setCtx: function (t, b) { CTX.tenantId = t || null; CTX.branchId = b || null; limpiarCache(); _rec = null; },
    tiene:  function (id) { return !!R[id]; },
    cargar: function (id, preset) { return R[id](preset || 'mes'); },
    limpiarCache: limpiarCache,
    ids: function () { return Object.keys(R); },
  };
})();
