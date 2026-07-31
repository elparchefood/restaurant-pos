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
  var _cache = { key: null, datos: null };
  async function pedidos(preset) {
    var key = preset + '|' + CTX.branchId;
    if (_cache.key === key) return _cache.datos;
    var s = sb(); if (!s) throw new Error('sin conexión');
    var r = rango(preset);

    var q = s.from('pos_orders').select(
        'id,status,channel,total,total_final,delivery_fee,tip_amount,discount_amount,' +
        'guests,waiter_name,payment_method,closed_at,opened_at,cliente_id,notes,' +
        'pos_order_items(id,product_id,product_name,name,quantity,unit_price,total,selections)')
      .eq('status', 'paid').gte('closed_at', r.from).lt('closed_at', r.to)
      .order('closed_at', { ascending: true });
    if (CTX.branchId) q = q.eq('branch_id', CTX.branchId);
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
        var rp = await s.from('pos_payments').select('order_id,method,amount').in('order_id', ids);
        pagos = rp.data || [];
      }
    } catch (e) { console.warn('[Informes] pagos:', e); }

    _cache = { key: key, datos: { lista: lista, pagos: pagos, rango: r } };
    return _cache.datos;
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
      var qi = s.from('iv_insumos').select('id,precio,conversion');
      var qr = s.from('iv_recetas').select('product_id,insumo_id,cantidad,cantidades,variant_option_id,mod_option_id,merma');
      var qp = s.from('pos_products').select('id,presentations,variables');
      var qm = s.from('iv_params').select('merma_enabled');
      if (CTX.branchId) { qi = qi.eq('branch_id', CTX.branchId); qr = qr.eq('branch_id', CTX.branchId); qm = qm.eq('branch_id', CTX.branchId); }
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
        var k = (x.method || 'Otro'); k = k.charAt(0).toUpperCase() + k.slice(1);
        acc[k] = (acc[k] || 0) + (parseFloat(x.amount) || 0);
      });
    } else {
      d.lista.forEach(function (o) {
        var k = o.payment_method || 'Otro'; k = k.charAt(0).toUpperCase() + k.slice(1);
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

  window.INFORMES_DATOS = {
    setCtx: function (t, b) { CTX.tenantId = t || null; CTX.branchId = b || null; limpiarCache(); _rec = null; },
    tiene:  function (id) { return !!R[id]; },
    cargar: function (id, preset) { return R[id](preset || 'mes'); },
    limpiarCache: limpiarCache,
    ids: function () { return Object.keys(R); },
  };
})();
