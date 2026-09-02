/* marketing.js — Marketing (maqueta operativa)
 *
 * ────────────────────────────────────────────────────────────────────────
 *  ATENCIÓN: TODAVÍA NO HAY DATOS DE VERDAD.
 *
 *  Todo lo que se ve aquí está escrito a mano en este archivo: las
 *  publicaciones, las cifras, el calendario y las automatizaciones. Nada sale
 *  de Meta ni de TikTok, porque los permisos para leer estadísticas y para
 *  publicar todavía no están aprobados.
 *
 *  Sirve para dos cosas hasta que lo estén:
 *    · que Sergio pruebe el recorrido y diga qué falta antes de construirlo;
 *    · grabar los vídeos que Meta pide para conceder los permisos.
 *
 *  Por eso la pantalla NO se le muestra a ningún restaurante: la entrada del
 *  menú nace escondida y solo se destapa para el administrador de la
 *  plataforma (ver pos-nav.js). El día que Meta apruebe, esto se cambia por
 *  datos reales y la entrada pasa a depender del plan.
 * ────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  var $  = function (id) { return document.getElementById(id); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* Números en colombiano: miles con punto, decimales con coma. */
  var NUM = new Intl.NumberFormat('es-CO');
  function miles(n) { return NUM.format(n); }
  function pesos(n) { return '$ ' + NUM.format(Math.round(n)); }
  function corto(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.', ',') + 'M';
    if (n >= 1000)    return (n / 1000).toFixed(1).replace('.', ',') + 'K';
    return miles(n);
  }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  //  LOS DATOS DE MENTIRA
  //  Salen de las notas del diseño. Cuando lleguen los de verdad, esto se
  //  sustituye por la consulta y el resto del archivo no cambia.
  // ══════════════════════════════════════════════════════════════════════
  var POSTS = [
    { id:'427-012', prod:'Burger Parche',            estado:'Publicada', red:'tt', formato:'Reel 0:28',
      fecha:'24 ago 13:00', vistas:41200, clientes:318, pedidos:214, likes:6940, coment:842,
      ventas:9500000, conv:0.77, guard:1284 },
    { id:'426-001', prod:'Combo alitas 2x1',         estado:'Publicada', red:'ig', formato:'Reel 0:22',
      fecha:'19 ago 12:00', vistas:28700, clientes:261, pedidos:188, likes:5120, coment:614,
      ventas:8400000, conv:0.91, guard:980 },
    { id:'424-112', prod:'Domicilio gratis Laureles',estado:'Publicada', red:'ig', formato:'Carrusel 4',
      fecha:'12 ago 19:00', vistas:19400, clientes:174, pedidos:121, likes:3480, coment:298,
      ventas:5400000, conv:0.90, guard:742 },
    { id:'421-020', prod:'Sin vincular',             estado:'En pausa',  red:'fb', formato:'Video 1:04',
      fecha:'8 ago 11:00',  vistas:9860,  clientes:63,  pedidos:34,  likes:1180, coment:96,
      ventas:1500000, conv:0.64, guard:210 },
    { id:'419-004', prod:'Trío de salsas',           estado:'En cola',   red:'tt', formato:'Reel 0:35',
      fecha:'5 ago 21:00',  vistas:16240, clientes:112, pedidos:71,  likes:2640, coment:351,
      ventas:3100000, conv:0.69, guard:488 }
  ];

  var RED = {
    ig: { n:'Instagram', c:'#7C5CFF' },
    tt: { n:'TikTok',    c:'#F0629B' },
    fb: { n:'Facebook',  c:'#4C9BFF' }
  };

  /*  dia 0 = lunes. `h` es hora decimal: 19.5 son las 19:30.
      `dur` en 1 y no en 0.5: el alto es `dur * 54 - 6`, y con media hora
      salen 21 px, donde no cabe el titulo y solo se ve la hora.        */
  var EVENTOS = [
    { d:0, h:12.5, dur:1, red:'ig', t:'Combo del día — Burger Parche',      est:'done'  },
    { d:1, h:13,   dur:1, red:'tt', t:'Reto: 3 salsas a ciegas',            est:'done'  },
    { d:1, h:19.5, dur:1, red:'ig', t:'Historia: detrás de la parrilla',    est:'done'  },
    { d:2, h:12,   dur:1, red:'ig', t:'2x1 en alitas — código PARCHE2',     est:'done'  },
    { d:2, h:21,   dur:1, red:'tt', t:'Domicilio en 18 minutos: el recorrido', est:'cola' },
    { d:3, h:12.5, dur:1, red:'ig', t:'Carrusel: nuevo menú de almuerzo',   est:''      },
    { d:3, h:17,   dur:1, red:'fb', t:'Reserva para grupos — 10% dto.',     est:'draft' },
    { d:4, h:13,   dur:1, red:'tt', t:'Viernes de parche: mesa larga',      est:''      },
    { d:4, h:19,   dur:1, red:'ig', t:'Reel: la salsa de la casa',          est:''      },
    { d:4, h:20.5, dur:1, red:'fb', t:'Evento: música en vivo',             est:''      },
    { d:5, h:12,   dur:1, red:'ig', t:'Antes y después del plato estrella', est:''      },
    { d:6, h:13.5, dur:1, red:'tt', t:'Domingo de sancocho',                est:''      }
  ];

  /* Las mejores horas por día, que se pintan de fondo en la rejilla. */
  var MEJORES = [[12,19],[13,21],[12,19],[12,19],[13,19],[12,13],[13,21]];

  var H0 = 6, H1 = 23, ROW = 54;      // primera hora, última hora, alto por hora

  // ══════════════════════════════════════════════════════════════════════
  //  AVISOS
  // ══════════════════════════════════════════════════════════════════════
  var avisoActual = null;
  function aviso(msg) {
    if (avisoActual) avisoActual.remove();
    var d = document.createElement('div');
    d.className = 'cc-toast';
    d.textContent = msg;
    document.body.appendChild(d);
    avisoActual = d;
    setTimeout(function () { if (d.parentNode) d.remove(); if (avisoActual === d) avisoActual = null; }, 2600);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  LA LISTA DE PUBLICACIONES Y SU DETALLE
  // ══════════════════════════════════════════════════════════════════════
  var sel = 0;

  function pintarLista() {
    var caja = $('post-list');
    if (!caja) return;
    caja.innerHTML = POSTS.map(function (p, i) {
      var enCola = p.estado === 'En cola';
      return '<div class="mkd-lrow' + (i === sel ? ' on' : '') + '" data-i="' + i + '">'
        + '<span class="mkd-lthumb" style="background:' + RED[p.red].c + '33"></span>'
        + '<span class="mkd-lmain">'
        +   '<span class="mkd-lid" style="display:block"># ' + esc(p.id) + '</span>'
        +   '<span class="mkd-lsub" style="display:block">' + esc(p.fecha) + ' · ' + esc(RED[p.red].n) + '</span>'
        + '</span>'
        + '<span class="mkd-chip' + (enCola ? ' live' : '') + '">' + esc(p.estado) + '</span>'
        + '<span class="mkd-lamount">' + corto(p.vistas) + '</span>'
        + '</div>';
    }).join('');
  }

  function pintarDetalle() {
    var caja = $('post-detail');
    if (!caja) return;
    var p = POSTS[sel], r = RED[p.red];
    caja.innerHTML =
        '<div class="mkd-det-top">'
      +   '<span class="mkd-det-lbl">Publicación</span>'
      +   '<span class="mkd-chip' + (p.estado === 'En cola' ? ' live' : '') + '">' + esc(p.estado) + '</span>'
      + '</div>'
      + '<div class="mkd-det-id"><span class="mkd-det-num"># ' + esc(p.id) + '</span></div>'
      + '<div class="mkd-det-cols">'
      +   '<div><div class="mkd-det-col-lbl">Cuenta</div>'
      +     '<div class="mkd-det-col-v">'
      +       '<span style="width:9px;height:9px;border-radius:999px;flex:0 0 auto;background:' + r.c + '"></span>'
      +       '<div><div class="mkd-det-col-t">' + esc(r.n) + '</div>'
      +       '<div class="mkd-det-col-s">' + esc(p.formato) + ' · ' + esc(p.fecha) + '</div></div>'
      +     '</div></div>'
      +   '<div><div class="mkd-det-col-lbl">Producto vinculado</div>'
      +     '<div class="mkd-det-col-v"><div>'
      +       '<div class="mkd-det-col-t">' + esc(p.prod) + '</div>'
      +       '<div class="mkd-det-col-s">' + miles(p.guard) + ' guardados</div></div>'
      +     '</div></div>'
      + '</div>'
      + '<div class="mkd-det-tiles">'
      +   dtile(corto(p.vistas), 'Vistas')
      +   dtile(miles(p.clientes) + ' · ' + String(p.conv).replace('.', ',') + '%', 'Vistas → clientes')
      +   dtile(miles(p.pedidos), 'Pedidos')
      +   '<button class="mkd-plus js-open-drawer" title="Programar una publicación como esta">+</button>'
      + '</div>'
      + '<div class="mkd-det-foot">'
      +   tot('Likes', miles(p.likes))
      +   tot('Comentarios', miles(p.coment))
      +   tot('Ventas atribuidas', pesos(p.ventas))
      +   '<div class="mkd-foot-actions">'
      +     '<button class="cc-btn-ghost js-toast" data-msg="Abriendo la publicación en ' + esc(r.n) + '">Abrir publicación</button>'
      +     '<button class="cc-btn-ghost js-toast" data-msg="Más opciones">···</button>'
      +     '<button class="mkd-brand-pill js-toast" data-msg="Duplicando con IA">Duplicar con IA</button>'
      +   '</div>'
      + '</div>';
  }
  function dtile(n, s2) {
    return '<div class="mkd-dtile"><div class="mkd-dtile-n">' + esc(n) + '</div>'
      + '<div class="mkd-dtile-s">' + esc(s2) + '</div></div>';
  }
  function tot(lbl, val) {
    return '<div class="mkd-tot"><span>' + esc(lbl) + '</span><b>' + esc(val) + '</b></div>';
  }

  var DIAS = ['lun','mar','mié','jue','vie','sáb','dom'];
  var FECHAS = ['31 ago','1 sep','2 sep','3 sep','4 sep','5 sep','6 sep'];
  var HOY = 3;                          // jueves, para que la linea de ahora se vea

  function pintarCalendario() {
    var cab = $('cal-head'), rejilla = $('cal-grid');
    if (!cab || !rejilla) return;

    /*  La cabecera y la rejilla son dos `grid` de 58px + 7 columnas, asi que
        las dos empiezan con una celda vacia: la de la columna de las horas. */
    cab.innerHTML = '<div class="mk-cal-hcell"></div>' + DIAS.map(function (d, i) {
      var cl = 'mk-cal-hcell' + (i >= 5 ? ' weekend' : '') + (i === HOY ? ' today' : '');
      return '<div class="' + cl + '"><div class="mk-cal-dow">' + d + '</div>'
        + '<div class="mk-cal-hsub">' + FECHAS[i] + '</div></div>';
    }).join('');

    var horas = '<div class="mk-cal-hours">';
    for (var h = H0; h <= H1; h++) {
      horas += '<div class="mk-cal-hour"><span>' + (h < 10 ? '0' + h : h) + ':00</span></div>';
    }
    horas += '</div>';

    var cols = '';
    for (var d = 0; d < 7; d++) {
      var clases = 'mk-cal-col' + (d >= 5 ? ' weekend' : '') + (d === HOY ? ' today' : '');
      var celdas = '';
      for (var k = H0; k <= H1; k++) {
        celdas += '<div class="mk-cal-cell' + (MEJORES[d].indexOf(k) >= 0 ? ' best' : '') + '"></div>';
      }
      var evs = EVENTOS.filter(function (e) { return e.d === d; }).map(function (e) {
        var top = (e.h - H0) * ROW + 2, alto = e.dur * ROW - 6;
        var hm = Math.floor(e.h), mm = Math.round((e.h - hm) * 60);
        return '<button class="mk-ev ' + e.red + (e.est ? ' ' + e.est : '') + '"'
          + ' style="top:' + top + 'px;height:' + alto + 'px" data-drawer="1">'
          + '<span class="mk-ev-dot"></span>'
          + '<span class="mk-ev-h">' + (hm < 10 ? '0' + hm : hm) + ':' + (mm < 10 ? '0' + mm : mm) + '</span>'
          + '<span class="mk-ev-t">' + esc(e.t) + '</span></button>';
      }).join('');
      var ahora = d === HOY
        ? '<div class="mk-cal-now" style="top:' + ((11.05 - H0) * ROW) + 'px"></div>' : '';
      cols += '<div class="' + clases + '">' + celdas + evs + ahora + '</div>';
    }
    rejilla.innerHTML = horas + cols;
  }

  // ══════════════════════════════════════════════════════════════════════
  //  PESTAÑAS
  // ══════════════════════════════════════════════════════════════════════
  function pestana(nombre) {
    $$('.cc-tab').forEach(function (t) {
      var suya = t.getAttribute('data-screen') === nombre;
      t.classList.toggle('on', suya);
      if (suya) { var c = $('crumb'); if (c) c.textContent = t.getAttribute('data-crumb') || t.textContent.trim(); }
    });
    $$('.screen').forEach(function (s) { s.classList.toggle('on', s.id === 'screen-' + nombre); });
    if (nombre === 'calendario') {
      var sc = document.querySelector('.mk-cal-scroll');
      /* Se deja la hora actual a la vista en vez de empezar a las 6 de la
         mañana, que es cuando no hay nada. */
      if (sc) sc.scrollTop = (11 - H0) * ROW - 70;
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  //  DRAWER Y MODALES
  // ══════════════════════════════════════════════════════════════════════
  function abrir(id)  { var e = $(id); if (e) e.hidden = false; }
  function cerrar(id) { var e = $(id); if (e) e.hidden = true; }
  function cerrarTodo() { $$('.cc-overlay').forEach(function (o) { o.hidden = true; }); }

  // ══════════════════════════════════════════════════════════════════════
  //  ARRANQUE
  // ══════════════════════════════════════════════════════════════════════
  function arrancar() {
    pintarLista();
    pintarDetalle();
    pintarCalendario();

    /* Un solo oyente para todo: la lista y el calendario se vuelven a pintar
       enteros, así que colgar oyentes de cada fila sería volverlos a colgar
       cada vez. */
    document.addEventListener('click', function (ev) {
      var t = ev.target.closest ? ev.target : null;
      if (!t) return;

      var toast = t.closest('.js-toast');
      if (toast) { aviso(toast.getAttribute('data-msg') || 'Listo'); return; }

      var tab = t.closest('.cc-tab');
      if (tab) { pestana(tab.getAttribute('data-screen')); return; }

      var fila = t.closest('.mkd-lrow');
      if (fila) { sel = +fila.getAttribute('data-i'); pintarLista(); pintarDetalle(); return; }

      /* Segmentados y píldoras: solo mueven el `.on` dentro de su grupo. */
      var seg = t.closest('.cc-seg button, #range-seg button, .mkd-pills button');
      if (seg) {
        Array.prototype.forEach.call(seg.parentElement.children, function (b) { b.classList.remove('on'); });
        seg.classList.add('on');
        return;
      }
      var chip = t.closest('.cc-fchip');
      if (chip) {
        Array.prototype.forEach.call(chip.parentElement.children, function (b) { b.classList.remove('on'); });
        chip.classList.add('on');
        return;
      }
      /* Las cuentas del drawer sí son de selección múltiple. */
      var net = t.closest('.mk-netopt');
      if (net) { net.classList.toggle('on'); return; }

      var sw = t.closest('.mk-switch');
      if (sw) {
        sw.classList.toggle('on');
        var lbl = sw.parentElement.querySelector('.mk-switch-lbl');
        if (lbl) {
          var on = sw.classList.contains('on');
          lbl.textContent = on ? 'Activa' : 'En pausa';
          lbl.classList.toggle('off', !on);
        }
        return;
      }

      if (t.closest('.js-open-drawer, .mk-cal-cell, [data-drawer], .mk-qcard')) { abrir('drawer-post'); return; }
      if (t.closest('.js-open-rule, .cc-add-tile')) { abrir('modal-rule'); return; }
      if (t.closest('.js-open-ai'))                 { abrir('modal-ai');   return; }
      if (t.closest('.js-close'))                   { cerrarTodo();        return; }

      /* Programar: cierra y avisa, que es lo único que puede hacer hoy. */
      if (t.closest('.js-programar')) {
        cerrarTodo();
        aviso('Publicación programada para el vie 4 sep, 19:00');
        return;
      }
    });

    /* El fondo del overlay cierra; el contenido no. */
    $$('.cc-overlay').forEach(function (o) {
      o.addEventListener('mousedown', function (e) { if (e.target === o) o.hidden = true; });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarTodo(); });

    /*  El contador de caracteres. El textarea no tiene id en el diseno, asi
        que se busca por clase dentro del drawer, y el texto de ayuda es el
        `.mk-hint` que va justo despues.                                   */
    var desc = document.querySelector('#drawer-post .mk-textarea');
    var ayuda = desc && desc.nextElementSibling;
    if (desc && ayuda && ayuda.classList.contains('mk-hint')) {
      desc.addEventListener('input', function () {
        ayuda.textContent = miles(desc.value.length)
          + ' / 2.200 caracteres · el texto se adapta por red al publicar';
      });
    }

    pestana('resumen');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();
})();
