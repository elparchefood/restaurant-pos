/* pos-notifs.js — la campana de notificaciones del escritorio.
 *
 * El buzón de las cosas que le pasan al negocio y piden un vistazo. Hoy trae
 * dos fuentes de verdad; las demás (fechas de pago, avisos del sistema…) se
 * agregan como una fuente más sin tocar el armazón:
 *
 *  · RECARGAS de la página del cliente — solo si el restaurante la tiene
 *    activa. Una recarga es plata que entró: merece verse sin ir a buscarla.
 *    Y las solicitudes pendientes (recargas que la verificación automática no
 *    pudo confirmar) que esperan una decisión.
 *  · PRIMEROS PASOS — para una cuenta que arranca: qué falta configurar antes
 *    de vender (productos, mesas, métodos de pago), cada uno llevando a su
 *    pantalla. En cuanto todo está, el grupo desaparece solo.
 *
 * Lo leído se recuerda en el equipo (por negocio): el punto rojo cuenta solo
 * lo que no se ha abierto. Abrir el buzón lo marca todo como visto.
 */
(function (w) {
  'use strict';

  var K_VISTOS = null;      // llave localStorage, se arma con el tenant
  var abierta = false;

  function sb() { return w._pos && w._pos.sb; }
  function st() { return (w._pos && w._pos.state) || {}; }
  function money(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO'); }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  /* "hace 5 min" se entiende; "01:30:27.088+00" no. */
  function hace(fecha) {
    var ms = Date.now() - new Date(fecha).getTime();
    var m = Math.floor(ms / 60000);
    if (m < 1) return 'ahora';
    if (m < 60) return 'hace ' + m + ' min';
    var h = Math.floor(m / 60);
    if (h < 24) return 'hace ' + h + ' h';
    var d = Math.floor(h / 24);
    return d === 1 ? 'ayer' : 'hace ' + d + ' días';
  }

  function vistos() {
    try { return JSON.parse(localStorage.getItem(K_VISTOS) || '[]'); } catch (e) { return []; }
  }
  function marcarVistos(ids) {
    try {
      var s = vistos();
      ids.forEach(function (i) { if (s.indexOf(i) < 0) s.push(i); });
      localStorage.setItem(K_VISTOS, JSON.stringify(s.slice(-300)));
    } catch (e) {}
  }

  var ICO = {
    recarga: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><circle cx="17" cy="15" r="1.4"/></svg>',
    solicitud: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    paso: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  };
  var TINTE = { recarga: ['#ECFEFF', '#0891B2'], solicitud: ['#FFFBEB', '#B45309'], paso: ['#EEF2FF', '#5B6BFF'] };

  /* ── Las fuentes. Cada una devuelve items {id, tipo, titulo, sub, cuando, ir} ── */

  async function fuenteRecargas() {
    var s = sb(); if (!s) return [];
    try {
      var t = await s.from('tenants').select('web_activa').eq('id', st().tenantId).maybeSingle();
      if (!t.data || !t.data.web_activa) return [];
    } catch (e) { return []; }
    var items = [];
    try {
      var r = await s.from('pos_saldo_mov')
        .select('id, monto, created_at, pos_clientes(nombre)')
        .eq('tenant_id', st().tenantId).eq('motivo', 'recarga')
        .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
        .order('created_at', { ascending: false }).limit(10);
      (r.data || []).forEach(function (f) {
        items.push({
          id: 'rec-' + f.id, tipo: 'recarga',
          titulo: ((f.pos_clientes && f.pos_clientes.nombre) || 'Un cliente') + ' recargó ' + money(f.monto),
          sub: 'El saldo ya quedó en su cuenta', cuando: f.created_at, ir: 'clientes.html',
        });
      });
    } catch (e) {}
    try {
      var p = await s.from('pos_recargas_solicitudes')
        .select('id, monto_leido, monto_dicho, creado, pos_clientes(nombre)')
        .eq('tenant_id', st().tenantId)
        .not('estado', 'in', '("aplicada","descartada")')
        .order('creado', { ascending: false }).limit(5);
      (p.data || []).forEach(function (f) {
        items.push({
          id: 'sol-' + f.id, tipo: 'solicitud',
          titulo: 'Recarga por confirmar: ' + money(f.monto_leido || f.monto_dicho),
          sub: ((f.pos_clientes && f.pos_clientes.nombre) || 'Un cliente') + ' espera que la revises',
          cuando: f.creado, ir: 'clientes.html', urgente: true,
        });
      });
    } catch (e) {}
    return items;
  }

  /* BARRIOS SIN PRECIO DE DOMICILIO (17-ago).
     Cuando un cliente guarda una direccion cuyo barrio no esta en la tabla de
     zonas, queda anotado en `pos_domi_aprendidos` esperando que el dueNo le
     ponga precio. La pantalla para aprobarlo YA existe (Configuracion →
     Domicilios); lo que faltaba era enterarse sin ir a buscarlo.

     Mientras nadie le ponga precio, ese domicilio se cobra en CERO: es plata
     que el negocio esta perdiendo en cada pedido a ese barrio. Por eso va
     como urgente. */
  async function fuenteBarrios() {
    var s = sb(); var items = [];
    if (!s || !st().tenantId) return items;
    try {
      var r = await s.from('pos_domi_aprendidos')
        .select('id, barrio, veces, direccion, updated_at, created_at, tipo')
        .eq('tenant_id', st().tenantId)
        .eq('tipo', 'nuevo')
        .eq('descartado', false)
        .order('veces', { ascending: false }).limit(5);
      (r.data || []).forEach(function (f) {
        var n = Number(f.veces) || 1;
        items.push({
          id: 'barrio-' + f.id, tipo: 'solicitud',
          titulo: 'Barrio sin precio de domicilio: ' + esc(f.barrio || ''),
          sub: (n > 1 ? n + ' clientes lo han escrito' : 'Un cliente lo escribio')
               + ' · hoy se cobra en $0',
          cuando: f.updated_at || f.created_at,
          ir: 'configuracion.html#domicilios', urgente: true,
        });
      });
    } catch (e) {}
    return items;
  }

  /* Los primeros pasos de una cuenta nueva. Sin fecha: son estado, no evento.
     En cuanto el paso se cumple, desaparece de aquí solito. */
  async function fuentePrimerosPasos() {
    var s = sb(); if (!s) return [];
    var items = [];
    try {
      var checks = await Promise.allSettled([
        s.from('pos_products').select('id', { count: 'exact', head: true }).eq('tenant_id', st().tenantId),
        s.from('pos_tables').select('id', { count: 'exact', head: true }).eq('branch_id', st().branchId),
        s.from('ia_config').select('pagos').eq('branch_id', st().branchId).maybeSingle(),
      ]);
      var nProd = checks[0].status === 'fulfilled' ? (checks[0].value.count || 0) : 1;
      var nMesas = checks[1].status === 'fulfilled' ? (checks[1].value.count || 0) : 1;
      var mets = 0;
      if (checks[2].status === 'fulfilled') {
        var pg = (checks[2].value.data && checks[2].value.data.pagos) || {};
        mets = (Array.isArray(pg.metodos) ? pg.metodos : []).filter(function (m) {
          return m && m.activo !== false && String(m.nombre || '').trim() && !/^__/.test(String(m.id || ''));
        }).length;
      }
      if (!nProd) items.push({ id: 'paso-productos', tipo: 'paso', titulo: 'Carga tu carta',
        sub: 'Sin productos no hay nada que vender. Empieza por aquí.', ir: 'catalogo-productos.html' });
      if (!nMesas) items.push({ id: 'paso-mesas', tipo: 'paso', titulo: 'Crea tus mesas y zonas',
        sub: 'Para vender por salón. Si solo vendes para llevar, puedes saltarlo.', ir: 'configuracion.html?s=mesas' });
      if (!mets) items.push({ id: 'paso-pagos', tipo: 'paso', titulo: 'Configura cómo te pagan',
        sub: 'Efectivo, transferencia… lo que aceptes al cobrar.', ir: 'configuracion.html?s=pagos' });
    } catch (e) {}
    return items;
  }

  /* ── El panel ─────────────────────────────────────────────────────────── */

  function pintar(items) {
    var panel = document.getElementById('notif-panel');
    if (!panel) return;
    if (!items.length) {
      panel.innerHTML = '<div class="ntf-head">Notificaciones</div>'
        + '<div class="ntf-vacio">'
        + '<div class="ntf-vacio-ico"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></div>'
        + '<div class="ntf-vacio-t">Estás al día</div>'
        + '<div class="ntf-vacio-s">Aquí van a llegar las recargas de tus clientes, los avisos del sistema y lo que pida tu atención.</div>'
        + '</div>';
      return;
    }
    var vist = vistos();
    var pasos = items.filter(function (i) { return i.tipo === 'paso'; });
    var resto = items.filter(function (i) { return i.tipo !== 'paso'; });

    function fila(i) {
      var tint = TINTE[i.tipo] || TINTE.paso;
      var nuevo = vist.indexOf(i.id) < 0;
      return '<button class="ntf-item' + (nuevo ? ' nuevo' : '') + (i.urgente ? ' urgente' : '') + '" data-ir="' + esc(i.ir || '') + '">'
        + '<span class="ntf-ico" style="background:' + tint[0] + ';color:' + tint[1] + '">' + (ICO[i.tipo] || ICO.paso) + '</span>'
        + '<span class="ntf-tx"><span class="ntf-t">' + esc(i.titulo) + '</span>'
        + '<span class="ntf-s">' + esc(i.sub || '') + (i.cuando ? ' · ' + hace(i.cuando) : '') + '</span></span>'
        + (nuevo ? '<span class="ntf-punto"></span>' : '')
        + '</button>';
    }

    var h = '<div class="ntf-head">Notificaciones</div>';
    if (pasos.length) {
      h += '<div class="ntf-grupo">Primeros pasos</div>' + pasos.map(fila).join('');
    }
    if (resto.length) {
      if (pasos.length) h += '<div class="ntf-grupo">Actividad</div>';
      h += resto.map(fila).join('');
    }
    panel.innerHTML = h;
    panel.querySelectorAll('.ntf-item[data-ir]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.ir) w.location.href = b.dataset.ir;
      });
    });
  }

  function badge(n) {
    var el = document.getElementById('notif-badge');
    if (!el) return;
    el.textContent = n > 9 ? '9+' : String(n);
    el.style.display = n > 0 ? '' : 'none';
  }

  var _items = [];
  async function cargar() {
    var listas = await Promise.allSettled([fuenteRecargas(), fuenteBarrios(), fuentePrimerosPasos()]);
    _items = [];
    listas.forEach(function (r) { if (r.status === 'fulfilled') _items = _items.concat(r.value); });
    /* Lo urgente arriba; lo demás por fecha; los pasos van en su propio grupo. */
    _items.sort(function (a, b) {
      if (!!b.urgente - !!a.urgente) return (!!b.urgente) - (!!a.urgente);
      return new Date(b.cuando || 0) - new Date(a.cuando || 0);
    });
    var vist = vistos();
    badge(_items.filter(function (i) { return vist.indexOf(i.id) < 0; }).length);
    if (abierta) pintar(_items);
  }

  function alternar() {
    var panel = document.getElementById('notif-panel');
    if (!panel) return;
    abierta = !abierta;
    panel.classList.toggle('on', abierta);
    if (abierta) {
      pintar(_items);
      /* Abrirlo es leerlo: el punto rojo se apaga, pero el punto de cada
         notificación nueva se queda hasta que se cierre el panel. */
      marcarVistos(_items.map(function (i) { return i.id; }));
      badge(0);
    }
  }

  function init() {
    var t = st().tenantId || 'sin';
    K_VISTOS = 'pos.notifs.vistos.' + t;
    var wrap = document.querySelector('.notif-wrap');
    var btn = document.getElementById('btn-notif');
    if (!wrap || !btn) return;
    if (!document.getElementById('notif-panel')) {
      var p = document.createElement('div');
      p.id = 'notif-panel';
      p.className = 'ntf-panel';
      wrap.appendChild(p);
    }
    btn.addEventListener('click', function (e) { e.stopPropagation(); alternar(); });
    document.addEventListener('click', function (e) {
      if (abierta && !wrap.contains(e.target)) alternar();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && abierta) alternar(); });
    cargar();
    /* Cada 3 minutos se mira si llegó algo. Es un buzón, no un chat: no
       necesita tiempo real, necesita no mentir. */
    setInterval(cargar, 180000);
  }

  if (w._pos) w._pos.on('core:ready', init);
  w.posNotifs = { recargar: cargar };
})(window);
