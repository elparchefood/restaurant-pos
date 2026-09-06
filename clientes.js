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
      (hayPuntos()
        ? cifra('Puntos sin usar', num(puntos),
                'en manos de ' + num(conPuntos) + (conPuntos === 1 ? ' cliente' : ' clientes'))
        : '');
  }
  /* Los puntos vienen con el plan Pro. En un Starter esta pantalla no debe
     hablar de puntos: ni la cifra de arriba, ni el "0 pts" al lado de cada
     nombre, ni la barra del premio en la ficha. Si el plan todavia no se sabe
     se deja pasar, igual que en el resto del sistema. */
  function hayPuntos() { return !window.posPlan || posPlan.puede('puntos'); }

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
          '<small>' + (p ? p + (p === 1 ? ' pedido' : ' pedidos')
                             + (hayPuntos() ? ' · ' + num(c.puntos) + ' pts' : '')
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
    S.selSaldo = null;             // el saldo llega un instante despues
    pintarLista();
    pintarFicha();                 // primero con lo que ya se sabe
    cargarSaldoFicha(c.id);
    await cargarPedidos(c.id);
    if (S.sel && String(S.sel.id) === String(id)) pintarFicha();
  }

  /* El saldo de su billetera, para poder consultarlo aqui mismo (20-ago,
     pedido de Sergio: pasar la tarjeta y ver nombre, puntos y saldo). */
  async function cargarSaldoFicha(id) {
    try {
      var r = await sb.from('pos_saldo').select('saldo')
        .eq('tenant_id', tenantId).eq('cliente_id', id).limit(1);
      S.selSaldo = (r.data && r.data[0]) ? Number(r.data[0].saldo) || 0 : 0;
    } catch (e) { S.selSaldo = null; }
    if (S.sel && String(S.sel.id) === String(id)) pintarFicha();
  }

  /* ── La tarjeta como llave de consulta ─────────────────────────────
     Con la pantalla de Clientes abierta, acercar una tarjeta al lector abre
     la ficha de su dueNo — sin buscarlo. Si esta abierto el modal de
     vincular, ese manda (el modal escucha aparte). */
  var _nfcClientes = false;
  function arrancarLectorClientes() {
    if (_nfcClientes || !window.posNfc) return;
    _nfcClientes = true;
    posNfc.setCtx(tenantId);
    posNfc.escuchar(async function (uid) {
      if (document.getElementById('clt-lista')) return;   // el modal de vincular esta abierto
      try {
        var t = await posNfc.buscar(uid);
        if (!t) { avisoFlotante('La tarjeta ····' + uid.slice(-4) + ' no está vinculada a nadie'); return; }
        var tel10 = String(t.telefono).replace(/[^0-9]/g, '').slice(-10);
        var c = (S.clientes || []).find(function (x) {
          return String(x.telefono || '').replace(/[^0-9]/g, '').slice(-10) === tel10;
        });
        if (!c) { avisoFlotante('La tarjeta es de ••• ' + tel10.slice(-4) + ', pero no está en esta lista'); return; }
        abrirFicha(c.id);
      } catch (e) { avisoFlotante('No se pudo leer la tarjeta: ' + (e.message || e)); }
    });
  }
  function avisoFlotante(txt) {
    var v = document.getElementById('cl-flot'); if (v) v.remove();
    var d = document.createElement('div');
    d.id = 'cl-flot';
    d.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:10001;background:#0F172A;color:#fff;padding:12px 18px;border-radius:12px;font-size:13px;font-weight:600;box-shadow:0 12px 30px -8px rgba(15,23,42,.5)';
    d.textContent = txt;
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 3500);
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
        '<div style="flex:1;min-width:0"><div class="cl-f-n">' + esc(c.nombre || 'Sin nombre') + '</div>' +
          '<div class="cl-f-t">' + sello +
            (c.telefono ? '<span>' + esc(c.telefono) + '</span>' : '') +
            (c.barrio ? '<span>· ' + esc(c.barrio) + '</span>' : '') +
          '</div></div>' +
        /* La tarjeta fisica del cliente: vincular, ver y quitar. Solo tiene
           sentido con telefono — la tarjeta apunta al numero, no a la ficha. */
        (c.telefono && (!window.posPlan || posPlan.puede('nfc'))
          ? '<button class="cl-tarjeta-btn" id="cl-tarjeta" type="button" title="Tarjeta física del cliente">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M6 15h.01M10 15h4"/></svg>' +
            ' Tarjeta</button>'
          : '') +
      '</div>' +
      '<div class="cl-f-fijo">' +
        '<div class="cl-kpis">' +
          kpi('Ha gastado', COP(c.gastado)) +
          kpi('Pedidos', num(p)) +
          kpi('Promedio', p ? COP(c.promedio) : '—') +
          kpi('Último pedido', haceCuanto(c.ultimo)) +
        '</div>' +
        (!hayPuntos() ? '' :
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
          '<div class="cl-pt-s">' + (window.posPuntosFrase
              ? (posPuntosFrase() ? posPuntosFrase() + ' de comida. El domicilio no da puntos.' : 'Este restaurante no tiene programa de puntos.')
              : '1 punto por cada $ 1.000 de comida. El domicilio no da puntos.') + '</div>' +
          /* Su billetera, aqui mismo: la consulta completa de un vistazo. Solo
             cuando tiene algo — "$ 0" de alguien sin billetera no dice nada. */
          (Number(S.selSaldo) > 0 && (!window.posPlan || posPlan.puede('nfc'))
            ? '<div class="cl-pt-s" style="margin-top:4px"><b>Saldo en su billetera: ' + COP(S.selSaldo) + '</b></div>'
            : '') +
        '</div>') +
      '</div>' +
      /* El historial es lo unico que se mueve. Arriba queda quieto para poder
         mirar cuanto ha gastado mientras se baja por sus pedidos. */
      '<div class="cl-f-peds">' +
        '<div class="cl-sec-t">Sus pedidos</div>' + listaPedidos() +
      '</div>';
    var bt = document.getElementById('cl-tarjeta');
    if (bt) bt.onclick = function () { modalTarjeta(c); };
  }

  /* ── La tarjeta fisica ─────────────────────────────────────────────
     El modal escucha el lector SOLO mientras esta abierto. Vincular es
     acercar la tarjeta; si ya es de otro cliente, se dice de quien. */
  function modalTarjeta(c) {
    if (!window.posNfc) return;
    posNfc.setCtx(tenantId);
    var tel = String(c.telefono || '').replace(/[^0-9]/g, '').slice(-10);
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML =
      '<div style="background:#fff;border-radius:16px;width:420px;max-width:94vw;padding:20px 22px;box-shadow:0 30px 70px -20px rgba(15,23,42,.4)">' +
        '<div style="font-size:15.5px;font-weight:800;color:#0F172A;letter-spacing:-.02em">Tarjeta de ' + esc(c.nombre || 'este cliente') + '</div>' +
        '<div id="clt-lista" style="margin:12px 0"><div style="font-size:12.5px;color:#94A3B8">Buscando sus tarjetas…</div></div>' +
        '<div style="display:flex;align-items:center;gap:10px;padding:14px;border:1.5px dashed #DCE0E8;border-radius:12px;background:#FBFBFD">' +
          '<div class="cl-nfc-onda" style="width:34px;height:34px;border-radius:999px;background:#EEF2FF;display:flex;align-items:center;justify-content:center;color:#5B6BFF;flex-shrink:0">' +
            '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8.5a7 7 0 0 1 12 0"/><path d="M8.5 11.5a3.5 3.5 0 0 1 7 0"/><circle cx="12" cy="15" r="1"/></svg>' +
          '</div>' +
          '<div style="font-size:12.5px;color:#475569;line-height:1.5"><b>Acerca una tarjeta al lector</b> para vincularla a este cliente. No hay que tocar nada más.</div>' +
        '</div>' +
        '<div id="clt-aviso" style="display:none;font-size:12.5px;margin-top:10px;padding:9px 12px;border-radius:9px"></div>' +
        '<div style="display:flex;justify-content:flex-end;margin-top:16px">' +
          '<button id="clt-cerrar" style="background:#fff;color:#475569;border:1px solid #ECEEF2;padding:9px 14px;border-radius:9px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit">Cerrar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    function aviso(txt, bien) {
      var a = ov.querySelector('#clt-aviso');
      a.style.display = 'block';
      a.style.background = bien ? '#DCFCE7' : '#FEF2F2';
      a.style.color = bien ? '#16A34A' : '#DC2626';
      a.textContent = txt;
    }
    async function pintarLista() {
      var caja = ov.querySelector('#clt-lista');
      try {
        var ts = await posNfc.tarjetasDe(tel);
        if (!ts.length) { caja.innerHTML = '<div style="font-size:12.5px;color:#94A3B8">Todavía no tiene tarjeta.</div>'; return; }
        caja.innerHTML = ts.map(function (t) {
          return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 11px;border:1px solid #ECEEF2;border-radius:10px;margin-bottom:6px">' +
            '<div style="font-size:12.5px;color:#0F172A;font-weight:600">Tarjeta ····' + esc(String(t.uid).slice(-4)) + '</div>' +
            '<button data-quitar="' + esc(t.id) + '" style="background:none;border:none;color:#DC2626;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">Quitar</button>' +
          '</div>';
        }).join('');
        caja.querySelectorAll('[data-quitar]').forEach(function (b) {
          b.onclick = async function () {
            try { await posNfc.desvincular(b.dataset.quitar); aviso('Tarjeta quitada.', true); pintarLista(); }
            catch (e) { aviso('No se pudo quitar: ' + (e.message || e), false); }
          };
        });
      } catch (e) { caja.innerHTML = '<div style="font-size:12.5px;color:#DC2626">No se pudieron cargar: ' + esc(e.message || e) + '</div>'; }
    }
    /*  ══ PASAR UNA TARJETA QUE YA ES DE ALGUIEN ═══════════════════════════
        Sergio, 5-sep: *"si coloco en un cliente vacío una tarjeta que ya está
        ocupada me debe aparecer un modal informando que la tarjeta ya tiene
        dueño, y darme la opción de vincularla. Y si acepto, otro modal
        diciéndome: ¿está seguro?"*

        DOS ventanas, no una. La primera informa y ofrece; la segunda hace
        parar y decir que sí a sabiendas. Es una operación que le quita la
        tarjeta a un cliente, y equivocarse aquí se nota tarde.

        Ventana propia y nunca `confirm()` del navegador: en el ejecutable no
        sale y la acción se quedaría muda.                                */
    function preguntar(opciones) {
      return new Promise(function (resolver) {
        var f = document.createElement('div');
        f.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);' +
          'display:flex;align-items:center;justify-content:center;z-index:100010;padding:24px';
        f.innerHTML =
          '<div style="background:#fff;border-radius:16px;width:440px;max-width:96vw;' +
              'box-shadow:0 24px 60px -12px rgba(15,23,42,.4);overflow:hidden">' +
            '<div style="padding:20px 22px 6px">' +
              '<div style="font-size:17px;font-weight:800;color:#0F172A;letter-spacing:-.02em">' +
                esc(opciones.titulo) + '</div>' +
              '<div style="font-size:13.5px;color:#475569;line-height:1.6;margin-top:8px">' +
                opciones.texto + '</div>' +
            '</div>' +
            '<div style="display:flex;gap:10px;justify-content:flex-end;padding:16px 22px;' +
                'border-top:1px solid #ECEEF2;background:#FBFBFD;margin-top:16px">' +
              '<button data-no style="background:#fff;color:#475569;border:1px solid #ECEEF2;' +
                'padding:9px 14px;border-radius:9px;font-size:12.5px;font-weight:700;' +
                'cursor:pointer;font-family:inherit">' + esc(opciones.no || 'Cancelar') + '</button>' +
              '<button data-si style="background:' + (opciones.peligro ? '#DC2626' : '#5B6BFF') + ';' +
                'color:#fff;border:none;padding:9px 14px;border-radius:9px;font-size:12.5px;' +
                'font-weight:700;cursor:pointer;font-family:inherit">' + esc(opciones.si) + '</button>' +
            '</div>' +
          '</div>';
        function cerrar(r) { f.remove(); document.removeEventListener('keydown', tecla); resolver(r); }
        function tecla(e) { if (e.key === 'Escape') cerrar(false); }
        f.querySelector('[data-no]').onclick = function () { cerrar(false); };
        f.querySelector('[data-si]').onclick = function () { cerrar(true); };
        f.addEventListener('click', function (e) { if (e.target === f) cerrar(false); });
        document.addEventListener('keydown', tecla);
        document.body.appendChild(f);
        setTimeout(function () { try { f.querySelector('[data-no]').focus(); } catch (x) {} }, 50);
      });
    }

    async function preguntarPasarla(uid, duena) {
      var nom = (duena && duena.cliente && duena.cliente.nombre)
        || ('el celular ···' + String(duena && duena.telefono || '').slice(-4));
      var aQuien = c.nombre || 'este cliente';
      var cuatro = String(uid).slice(-4);

      //  ── primera ventana: informar y ofrecer ──────────────────────────
      var sigue = await preguntar({
        titulo: 'Esa tarjeta ya tiene dueño',
        texto: 'La tarjeta ····' + esc(cuatro) + ' está vinculada a <b>' + esc(nom) + '</b>.' +
               '<br><br>¿Quieres vincularla a <b>' + esc(aQuien) + '</b>?',
        si: 'Sí, vincularla',
        no: 'Dejarla como está',
      });
      if (!sigue) return;

      //  ── segunda ventana: la consecuencia, dicha con precisión ────────
      //  No se dice "se pierden los datos" a secas porque no es verdad y
      //  asusta de más: los puntos y el saldo van con el TELEFONO, no con
      //  el plastico. Lo que de verdad pasa es que el otro se queda sin
      //  tarjeta — y eso sí hay que decirlo claro.
      var seguro = await preguntar({
        titulo: '¿Seguro?',
        texto: '<b>' + esc(nom) + '</b> se queda sin tarjeta y no la va a poder usar más.' +
               '<br><br>Sus puntos y su saldo <b>no se pierden</b>: están atados a su celular, ' +
               'no a la tarjeta. Pero si la vuelve a necesitar habrá que darle otra.',
        si: 'Sí, pasarla a ' + aQuien,
        no: 'Cancelar',
        peligro: true,
      });
      if (!seguro) return;

      try {
        await posNfc.vincular(tel, uid, null, { forzar: true });
        aviso('Listo: la tarjeta ····' + cuatro + ' pasó de ' + nom + ' a ' + aQuien + '.', true);
        pintarLista();
      } catch (e2) { aviso('No se pudo pasar: ' + (e2.message || e2), false); }
    }

    var soltar = posNfc.escuchar(async function (uid) {
      try {
        await posNfc.vincular(tel, uid);
        aviso('Tarjeta ····' + uid.slice(-4) + ' vinculada a ' + (c.nombre || 'este cliente') + '.', true);
        pintarLista();
      } catch (e) {
        if (e && e.codigo === 'OCUPADA') { preguntarPasarla(uid, e.duena); return; }
        aviso(e.message || String(e), false);
      }
    });
    function cerrar() { soltar(); ov.remove(); }
    ov.querySelector('#clt-cerrar').onclick = cerrar;
    ov.addEventListener('click', function (e) { if (e.target === ov) cerrar(); });
    pintarLista();
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
    try { arrancarLectorClientes(); } catch (e) {}

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
