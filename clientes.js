/* clientes.js — la gente que le compra al restaurante.
 *
 * POR QUÉ NO VIVE EN CAJA (decidido con Sergio el 8-ago-2026):
 * Caja es de un turno — abre, cuadra y cierra. Esto es lo contrario: datos que
 * se acumulan para siempre. Cuánto ha gastado alguien desde que existe, cuántas
 * veces ha vuelto. Mezclar los dos relojes en una misma sección obliga a
 * decidir, en cada dato nuevo, a cuál de los dos pertenece.
 *
 * QUÉ QUEDÓ AFUERA Y POR QUÉ (20-ago-2026):
 * Recargas, solicitudes, saldo y los registrados en la app se fueron a
 * "Mi página web". No es acomodo: esta pantalla la ve CUALQUIER restaurante que
 * use Cobra, y esas cuatro cosas solo existen si hay página de clientes, que hoy
 * no se le vende a nadie. Mientras vivieron aquí, la pantalla tenía que esconder
 * media interfaz con `data-solo-pagina` y la ficha cambiaba de forma según el
 * restaurante. Separadas, cada módulo se lee entero y coherente.
 *
 * LA PREGUNTA DE LA PANTALLA:
 * No es "cuántos clientes tengo" — es "cuántos vuelven". Por eso la barra de
 * repetición va arriba, antes que la lista: de los 167 que han comprado, 139
 * vinieron una sola vez, y ese es el número que los puntos existen para mover.
 */
(function () {
  'use strict';

  var sb = null, tenantId = null;
  var S = { clientes: [], filtro: '', sel: null, peds: null, cargandoPeds: false };

  var $ = function (id) { return document.getElementById(id); };
  var COP = function (n) { return '$ ' + Math.round(Number(n) || 0).toLocaleString('es-CO'); };
  var num = function (n) { return (Number(n) || 0).toLocaleString('es-CO'); };
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function iniciales(n) {
    var t = String(n || '?').trim().split(/\s+/);
    return ((t[0] || '?')[0] + ((t[1] || '')[0] || '')).toUpperCase();
  }
  function haceCuanto(v) {
    if (!v) return 'nunca';
    var dias = Math.floor((Date.now() - new Date(v).getTime()) / 86400000);
    if (dias <= 0) return 'hoy';
    if (dias === 1) return 'ayer';
    if (dias < 30) return 'hace ' + dias + ' días';
    var m = Math.floor(dias / 30);
    return 'hace ' + m + (m === 1 ? ' mes' : ' meses');
  }
  function fechaCorta(v) {
    if (!v) return '—';
    var d = new Date(v);
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) + ', ' +
           d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  }

  // ── Datos ─────────────────────────────────────────────────────────
  async function cargarClientes() {
    try {
      var r = await sb.rpc('fn_clientes_resumen', { p_tenant: tenantId });
      S.clientes = r.data || [];
    } catch (e) { console.error('[clientes]', e); S.clientes = []; }
  }

  /* Los pedidos se piden solo al abrir una ficha. Traerlos todos de entrada
     serían cientos de filas que casi nadie mira. */
  async function cargarPedidos(clienteId) {
    S.peds = null; S.cargandoPeds = true;
    try {
      var r = await sb.from('pos_orders')
        .select('id, created_at, channel, payment_method, total_final, total, puntos_redimidos, ' +
                'pos_order_items(name, product_name, quantity)')
        .eq('tenant_id', tenantId).eq('cliente_id', clienteId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false }).limit(40);
      S.peds = r.data || [];
    } catch (e) { console.error('[pedidos]', e); S.peds = []; }
    S.cargandoPeds = false;
  }

  // ── Las tres cifras ───────────────────────────────────────────────
  function pintarFranja() {
    var tot = S.clientes.length;
    var compraron = 0, gasto = 0, pedidos = 0, puntos = 0, conPuntos = 0;
    S.clientes.forEach(function (c) {
      var p = Number(c.pedidos) || 0;
      if (p > 0) { compraron++; pedidos += p; }
      gasto  += Number(c.gastado) || 0;
      var pt = Number(c.puntos) || 0;
      puntos += pt;
      if (pt > 0) conPuntos++;
    });
    var ticket = pedidos ? gasto / pedidos : 0;

    $('cl-franja').innerHTML =
      cifra('Te han comprado', num(compraron), 'de ' + num(tot) + ' registrados') +
      cifra('Han gastado', COP(gasto),
            num(pedidos) + (pedidos === 1 ? ' pedido' : ' pedidos') + ' · ' + COP(ticket) + ' cada uno') +
      cifra('Puntos sin usar', num(puntos),
            'en manos de ' + num(conPuntos) + (conPuntos === 1 ? ' cliente' : ' clientes'));
  }
  function cifra(rotulo, valor, pie) {
    return '<div class="cl-fr"><div class="cl-fr-l">' + esc(rotulo) + '</div>' +
           '<div class="cl-fr-v">' + esc(valor) + '</div>' +
           '<div class="cl-fr-s">' + esc(pie) + '</div></div>';
  }

  // ── Cuántos vuelven ───────────────────────────────────────────────
  /* Cuatro grupos, no una curva: "vino una vez" y "vino cinco" son dos
     situaciones distintas del negocio, no dos puntos de la misma línea. */
  var GRUPOS = [
    { t: 'Vino 1 vez', c: '#CBD5E1', ok: function (p) { return p === 1; } },
    { t: '2 veces',    c: '#8B5CF6', ok: function (p) { return p === 2; } },
    { t: '3 o 4 veces',c: '#5B6BFF', ok: function (p) { return p >= 3 && p <= 4; } },
    { t: '5 o más',    c: '#16A34A', ok: function (p) { return p >= 5; } },
  ];
  function pintarRepeticion() {
    var compraron = S.clientes.filter(function (c) { return (Number(c.pedidos) || 0) > 0; });
    var n = compraron.length;
    if (!n) { $('cl-rep').innerHTML = ''; $('cl-rep').hidden = true; return; }
    $('cl-rep').hidden = false;

    var cuentas = GRUPOS.map(function (g) {
      return compraron.filter(function (c) { return g.ok(Number(c.pedidos) || 0); }).length;
    });
    var unaVez = cuentas[0];
    var pct = Math.round(unaVez / n * 100);

    $('cl-rep').innerHTML =
      '<div class="cl-rep-h">' +
        '<div class="cl-rep-t">De los ' + num(n) + ' que te compraron, ¿cuántos volvieron?</div>' +
        '<div class="cl-rep-s">' + pct + ' de cada 100 vinieron una sola vez</div>' +
      '</div>' +
      '<div class="cl-rep-b">' +
        GRUPOS.map(function (g, i) {
          if (!cuentas[i]) return '';
          /* El número va dentro de la barra solo si el pedazo da el ancho;
             en una tajada de dos personas el texto saldría cortado. */
          var ancho = cuentas[i] / n;
          return '<i style="flex:' + cuentas[i] + ';background:' + g.c + '">' +
                 (ancho > 0.06 ? num(cuentas[i]) : '') + '</i>';
        }).join('') +
      '</div>' +
      '<div class="cl-rep-lg">' +
        GRUPOS.map(function (g, i) {
          return '<span class="cl-lg"><i style="background:' + g.c + '"></i>' +
                 esc(g.t) + ' · ' + num(cuentas[i]) + '</span>';
        }).join('') +
      '</div>';
  }

  // ── La lista ──────────────────────────────────────────────────────
  var FILTROS = {
    todos:   function () { return true; },
    gastan:  function (c) { return (Number(c.gastado) || 0) > 0; },
    repiten: function (c) { return (Number(c.pedidos) || 0) >= 2; },
    una:     function (c) { return (Number(c.pedidos) || 0) === 1; },
  };
  var filtroActivo = 'todos';

  function visibles() {
    var f = S.filtro.toLowerCase().trim();
    var ok = FILTROS[filtroActivo] || FILTROS.todos;
    var lista = S.clientes.filter(function (c) {
      if (!ok(c)) return false;
      if (!f) return true;
      return String(c.nombre || '').toLowerCase().indexOf(f) >= 0 ||
             String(c.telefono || '').indexOf(f) >= 0;
    });
    /* Ordenar por gasto y no por nombre: la lista se mira para encontrar a
       alguien concreto (para eso está el buscador) o para ver quién pesa. */
    return lista.sort(function (a, b) { return (Number(b.gastado) || 0) - (Number(a.gastado) || 0); });
  }

  function pintarLista() {
    var lista = visibles();
    var tope = lista.reduce(function (m, c) { return Math.max(m, Number(c.gastado) || 0); }, 0) || 1;

    if (!lista.length) {
      $('cl-filas').innerHTML = '<div class="cl-cargando">' +
        (S.filtro ? 'Ningún cliente coincide con esa búsqueda.' : 'Nadie en este filtro todavía.') +
        '</div>';
      return;
    }

    $('cl-filas').innerHTML = lista.map(function (c) {
      var p = Number(c.pedidos) || 0;
      var sel = S.sel && String(S.sel.id) === String(c.id);
      return '<button class="cl-li-r' + (sel ? ' on' : '') + '" data-cli="' + esc(c.id) + '">' +
        '<div class="cl-av">' + esc(iniciales(c.nombre)) + '</div>' +
        '<div class="cl-li-m"><b>' + esc(c.nombre || 'Sin nombre') + '</b>' +
          '<small>' + (p ? p + (p === 1 ? ' pedido' : ' pedidos') + ' · ' + num(c.puntos) + ' pts'
                         : esc(c.telefono || 'Sin pedidos')) + '</small></div>' +
        '<div class="cl-li-d"><b>' + COP(c.gastado) + '</b>' +
          '<div class="cl-gbar"><i style="width:' +
            Math.round((Number(c.gastado) || 0) / tope * 100) + '%"></i></div></div>' +
      '</button>';
    }).join('');

    $('cl-filas').querySelectorAll('[data-cli]').forEach(function (b) {
      b.addEventListener('click', function () { abrirFicha(b.dataset.cli); });
    });
  }

  // ── La ficha ──────────────────────────────────────────────────────
  async function abrirFicha(id) {
    var c = S.clientes.find(function (x) { return String(x.id) === String(id); });
    if (!c) return;
    S.sel = c;
    pintarLista();
    pintarFicha();                 // primero con lo que ya se sabe
    await cargarPedidos(c.id);
    if (S.sel && String(S.sel.id) === String(id)) pintarFicha();
  }

  function pintarFicha() {
    var c = S.sel;
    if (!c) {
      $('cl-ficha').innerHTML =
        '<div class="cl-f-peds"><div class="cl-vacio">' +
        'Toca a una persona de la lista para ver todo lo suyo: cuánto ha gastado, ' +
        'cuántas veces ha vuelto, sus puntos y sus pedidos.</div></div>';
      return;
    }

    var p = Number(c.pedidos) || 0;
    var sello = p >= 3 ? '<span class="cl-pill ok">Repite seguido</span>'
              : p === 2 ? '<span class="cl-pill brand">Ha vuelto una vez</span>'
              : p === 1 ? '<span class="cl-pill warn">Vino una sola vez</span>'
              : '<span class="cl-pill neu">Todavía no te ha comprado</span>';

    var pts = Number(c.puntos) || 0;
    /* El premio más barato del catálogo cuesta 200 puntos; mientras no se lea
       de pos_puntos_catalogo, se muestra el siguiente escalón de 200. */
    var falta = 200 - (pts % 200), prog = (pts % 200) / 2;

    $('cl-ficha').innerHTML =
      '<div class="cl-f-cab">' +
        '<div class="cl-av">' + esc(iniciales(c.nombre)) + '</div>' +
        '<div><div class="cl-f-n">' + esc(c.nombre || 'Sin nombre') + '</div>' +
          '<div class="cl-f-t">' + sello +
            (c.telefono ? '<span>' + esc(c.telefono) + '</span>' : '') +
            (c.barrio ? '<span>· ' + esc(c.barrio) + '</span>' : '') +
          '</div></div>' +
      '</div>' +
      '<div class="cl-f-fijo">' +
        '<div class="cl-kpis">' +
          kpi('Ha gastado', COP(c.gastado)) +
          kpi('Pedidos', num(p)) +
          kpi('Promedio', p ? COP(c.promedio) : '—') +
          kpi('Último pedido', haceCuanto(c.ultimo)) +
        '</div>' +
        '<div class="cl-puntos">' +
          '<div class="cl-pt-h">' +
            '<div><div class="cl-fr-l">Puntos</div>' +
              '<div class="cl-pt-v">' + num(pts) + ' <small>pts</small></div></div>' +
            '<div class="cl-rep-s">' + (pts
              ? 'Le faltan ' + num(falta) + ' para el próximo premio'
              : 'Aún no tiene puntos') +
              (Number(c.redimido) ? ' · ya ha redimido ' + num(c.redimido) : '') +
            '</div>' +
          '</div>' +
          '<div class="cl-pt-b"><i style="width:' + prog + '%"></i></div>' +
          '<div class="cl-pt-s">1 punto por cada $ 1.000 de comida. El domicilio no da puntos.</div>' +
        '</div>' +
      '</div>' +
      /* El historial es lo unico que se mueve. Arriba queda quieto para poder
         mirar cuanto ha gastado mientras se baja por sus pedidos. */
      '<div class="cl-f-peds">' +
        '<div class="cl-sec-t">Sus pedidos</div>' + listaPedidos() +
      '</div>';
  }
  function kpi(rotulo, valor) {
    return '<div class="cl-kpi"><div class="cl-kpi-l">' + esc(rotulo) + '</div>' +
           '<div class="cl-kpi-v">' + esc(valor) + '</div></div>';
  }

  function listaPedidos() {
    if (S.cargandoPeds) return '<div class="cl-cargando">Buscando sus pedidos…</div>';
    var ps = S.peds || [];
    if (!ps.length) return '<div class="cl-vacio">Todavía no ha hecho ningún pedido.</div>';

    return '<div class="cl-peds">' + ps.map(function (o) {
      var items = (o.pos_order_items || []).map(function (it) {
        var q = Number(it.quantity) || 1;
        return (q > 1 ? q + 'x ' : '') + (it.name || it.product_name || 'Producto');
      });
      var resumen = items.slice(0, 4).join(', ') +
                    (items.length > 4 ? ' y ' + (items.length - 4) + ' más' : '');
      var como = o.channel === 'domicilio' ? 'Domicilio' : 'Para recoger';
      var pago = o.puntos_redimidos > 0 ? 'Pagado con puntos'
               : (o.payment_method || 'sin registrar');
      return '<div class="cl-ped">' +
        '<div><div class="cl-ped-t">' + esc(fechaCorta(o.created_at)) + ' · ' + esc(como) + '</div>' +
          '<div class="cl-ped-s">' + esc(resumen || 'Sin detalle') + '</div></div>' +
        '<div><div class="cl-ped-v">' + COP(o.total_final != null ? o.total_final : o.total) + '</div>' +
          '<div class="cl-ped-p">' + esc(pago) + '</div></div>' +
      '</div>';
    }).join('') + '</div>';
  }

  // ── Arranque ──────────────────────────────────────────────────────
  /* Se arranca con core:ready, NO con DOMContentLoaded: el tenant llega de la
     sesión de Supabase, que se resuelve después de que el HTML está listo. */
  window._pos.on('core:ready', async function () {
    sb       = window._pos.sb;
    tenantId = window._pos.state.tenantId;
    if (!sb || !tenantId) { console.error('[clientes] sin sesión'); return; }

    /* El atajo a "Mi pagina web" solo para el administrador de la
       plataforma. Se pregunta por es_admin_plataforma(), la misma funcion
       que abre ese modulo, para no inventar un segundo criterio que despues
       se desincronice. Si falla, se queda oculto: es lo prudente. */
    try {
      var adm = await sb.rpc('es_admin_plataforma');
      if (adm && adm.data === true) $('cl-nav-pw').style.display = '';
    } catch (e) { /* oculto */ }

    $('cl-filas').innerHTML = '<div class="cl-cargando">Cargando…</div>';
    pintarFicha();

    $('cl-buscar').addEventListener('input', function () {
      S.filtro = this.value; pintarLista();
    });
    $('cl-chips').querySelectorAll('[data-f]').forEach(function (b) {
      b.addEventListener('click', function () {
        $('cl-chips').querySelectorAll('[data-f]').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        filtroActivo = b.dataset.f;
        /* Si el seleccionado se sale del filtro, la ficha se queda mostrando a
           alguien que ya no está en la lista. Se cambia al primero que quede. */
        var v = visibles();
        if (S.sel && v.indexOf(S.sel) < 0) { S.sel = null; S.peds = null; }
        pintarLista();
        if (!S.sel && v.length) abrirFicha(v[0].id); else pintarFicha();
      });
    });

    await cargarClientes();
    pintarFranja();
    pintarRepeticion();
    pintarLista();
    var v = visibles();
    if (v.length) await abrirFicha(v[0].id);
  });
})();
