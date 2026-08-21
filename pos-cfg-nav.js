/* pos-cfg-nav.js — EL menú de Configuración. Uno solo, para todas las pantallas.
 *
 * Estaba copiado dentro de cada HTML y se fue separando: a Impresoras le
 * faltaban Operación, Puntos, Créditos y Asistente IA, y arrastraba cinco
 * etiquetas "Pronto" de pantallas que ya funcionan. Copiado, eso vuelve a
 * pasar en cuanto se agregue la siguiente entrada.
 *
 * Cada pantalla solo dice cuál está abierta:
 *     posCfgNav.render('impresora')
 *
 * Configuración las abre en el sitio; las demás pantallas navegan a
 * configuracion.html?s=<sección>, para no perder a dónde iba el clic.
 */
(function (w) {
  'use strict';

  var ITEMS = [
  { g: '', s: 'back', t: 'Regresar',
    i: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>' },
  { g: 'Establecimiento', s: 'general', t: 'General',
    i: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1-5h16l1 5"/><path d="M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M3 9h18"/><path d="M8 21v-6h4v6"/></svg>' },
  { g: 'Establecimiento', s: 'mesas', t: 'Mesas y zonas',
    i: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>' },
  { g: 'Establecimiento', s: 'horario', t: 'Horarios',
    i: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' },
  { g: 'Ventas', s: 'pagos', t: 'Métodos de pago',
    i: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>' },
  { g: 'Ventas', s: 'impuesto', t: 'Impuestos y propina',
    i: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>' },
  { g: 'Ventas', s: 'dian', t: 'Facturación DIAN',
    i: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/><circle cx="17" cy="17" r="3.2"/></svg>' },
  { g: 'Ventas', s: 'operacion', t: 'Operación',
    i: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>' },
  { g: 'Ventas', s: 'impresora', t: 'Impresoras',
    i: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>' },
  { g: 'Equipo', s: 'puntos', t: 'Puntos',
    i: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' },
  { g: 'Equipo', s: 'creditos', t: 'Créditos',
    i: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>' },
  { g: 'Equipo', s: 'usuarios', t: 'Usuarios y roles',
    i: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>' },
  { g: 'Chat IA', s: 'chatia', t: 'Asistente IA',
    i: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V5"/><circle cx="12" cy="4" r="1.2" fill="currentColor"/><circle cx="9" cy="14" r="1" fill="currentColor"/><circle cx="15" cy="14" r="1" fill="currentColor"/><path d="M9.5 17h5"/></svg>' },
  ];

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* `activa` es la sección abierta. Si el HTML no trae <nav id="cf-nav">, no
     se hace nada: es una pantalla que todavía no usa el menú compartido. */
  function render(activa) {
    var nav = document.getElementById('cf-nav');
    if (!nav) return null;
    var html = '', grupo = null;
    ITEMS.forEach(function (it) {
      if (it.g && it.g !== grupo) {
        if (grupo !== null) html += '</div>';
        html += '<div class="cf-navgroup-wrap"><div class="cf-navgroup">' + esc(it.g) + '</div>';
        grupo = it.g;
      }
      html += '<button class="lm-nav' + (it.s === activa ? ' on' : '') + '"'
            + ' id="nav-' + it.s + '" data-section="' + it.s + '">'
            + '<span class="cf-nav-l">' + it.i
            + '<span class="cf-nav-label">' + esc(it.t) + '</span></span></button>';
    });
    if (grupo !== null) html += '</div>';
    nav.innerHTML = html;
    return nav;
  }

  /* Para las pantallas que NO son configuracion.html: cada entrada lleva a su
     sección. Antes todas caían en configuracion.html a secas y se perdía a
     dónde ibas. */
  function enlazarFuera() {
    document.querySelectorAll('#cf-nav .lm-nav[data-section]').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = b.dataset.section;
        if (s === 'back') { w.location.href = 'dashboard.html'; return; }
        w.location.href = 'configuracion.html?s=' + encodeURIComponent(s);
      });
    });
  }

  w.posCfgNav = { render: render, enlazarFuera: enlazarFuera, items: ITEMS };
})(window);
