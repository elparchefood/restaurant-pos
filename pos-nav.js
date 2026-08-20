/* pos-nav.js — EL MENÚ LATERAL, EN UN SOLO SITIO.
 *
 * POR QUÉ EXISTE (20-ago-2026):
 * El menú estaba copiado a mano en dashboard.html, reservas.html y
 * tutoriales.html. Tres copias del mismo HTML, y ya se habían desincronizado:
 * a Reservas y a Tutoriales les faltaba **Clientes**, así que desde esas dos
 * pantallas no había forma de llegar. El candado de "Mi página web" también
 * estaba solo en el Dashboard, de modo que el mismo enlace existía escondido en
 * unas páginas y ni existía en otras.
 *
 * Ahora el menú se declara UNA vez, aquí, y cada página solo pone el hueco:
 *
 *     <aside id="sidebar"></aside>
 *     <script src="pos-nav.js"></script>
 *
 * Agregar un módulo nuevo es agregar una línea a MENU y aparece en todas.
 *
 * SE PINTA DE UNA, NO EN `DOMContentLoaded`: dashboard.js busca `sb-status`
 * apenas arranca. Si el menú llegara después, ese `getElementById` sería null.
 * Por eso el script va SIEMPRE antes que el JS de la página.
 */
(function () {
  'use strict';

  var ico = function (d) {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
           'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  };

  var MENU = [
    { seccion: 'Operacion' },
    { t: 'Escritorio', h: 'dashboard.html',
      i: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>' },
    { t: 'Ventas', h: 'ventas.html',
      i: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>' },
    { t: 'Chat IA', h: 'chat-ia.html',
      i: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' },
    /* SOLO PARA EL ADMINISTRADOR DE LA PLATAFORMA. Nace oculto a propósito: si
       naciera visible, cada restaurante lo vería el instante que tarda la
       consulta, y ya estaría preguntando por una función que no vendemos. */
    { t: 'Mi página web', h: 'pagina-web.html', id: 'nav-pagina-web', soloPlataforma: true,
      i: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>' },
    { t: 'Domicilio', h: 'domicilios.html',
      i: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>' },
    { t: 'Reservas', h: 'reservas.html',
      i: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' },

    { seccion: 'Backoffice' },
    { t: 'Caja', h: 'caja.html',
      i: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>' },
    { t: 'Clientes', h: 'clientes.html',
      i: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' },
    { t: 'Cocina', h: 'index.html?rol=kitchen', archivo: 'index.html',
      i: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>' },
    { t: 'Productos', h: 'catalogo-productos.html',
      i: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>' },
    { t: 'Inventario', h: 'inventario.html',
      i: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>' },
    { t: 'Informes', h: 'informes.html',
      i: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>' },

    { seccion: null },   // el bloque de abajo, pegado al pie
    { t: 'Tutoriales', h: 'tutoriales.html',
      i: '<path d="M12 6.5A5.5 5.5 0 0 0 6.5 4H3v13h4a4 4 0 0 1 4 3"/><path d="M12 6.5A5.5 5.5 0 0 1 17.5 4H21v13h-4a4 4 0 0 0-4 3"/><path d="M12 6.5V20"/>' },
    { t: 'Configuración', h: 'configuracion.html',
      i: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>' },
  ];

  /* Cuál está abierta. Se compara solo el nombre del archivo: "Cocina" apunta a
     `index.html?rol=kitchen` y con la query completa nunca coincidiría. */
  function aqui() {
    var p = (location.pathname || '').split('/').pop();
    return p || 'dashboard.html';
  }

  function pintar() {
    var caja = document.getElementById('sidebar');
    if (!caja) return;
    var yo = aqui();

    var html =
      '<div class="brand-mark">' +
        '<div class="brand-logo" style="background:transparent;box-shadow:none;padding:0;overflow:hidden">' +
          '<img src="assets/brand/cobra-logo.png?v=2" alt="Cobra POS" ' +
            'style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block"></div>' +
        '<div><div class="brand-name" id="sb-brand">Cobra POS</div>' +
        '<div class="brand-ver">&nbsp;</div></div>' +
      '</div>';

    var abierta = false;
    MENU.forEach(function (m) {
      if ('seccion' in m) {
        if (abierta) html += '</div>';
        html += m.seccion
          ? '<div class="sidebar-section"><div class="sidebar-label">' + m.seccion + '</div>'
          : '<div class="sidebar-section sidebar-section--bottom">';
        abierta = true;
        return;
      }
      var activo = (m.archivo || m.h) === yo;
      html += '<a class="nav-item' + (activo ? ' active' : '') + '" href="' + m.h + '"' +
        (m.id ? ' id="' + m.id + '"' : '') +
        (m.soloPlataforma ? ' style="display:none"' : '') + '>' +
        ico(m.i) + m.t + '</a>';
    });
    if (abierta) html += '</div>';

    html +=
      '<div class="sys-status">' +
        '<div class="sys-row"><span>Sistema</span>' +
          '<span id="sb-status" style="color:#F97316">cargando...</span></div>' +
        '<div class="sys-meta"><span id="sb-ram">Cobra POS</span><span>v1.0.0</span></div>' +
      '</div>';

    caja.innerHTML = html;
  }

  /* El candado de "Mi página web": la misma función que abre ese módulo, para
     no inventar un segundo criterio que después se desincronice. Si falla, el
     enlace se queda oculto, que es lo prudente. */
  function abrirPlataforma() {
    var s = (window._pos && window._pos.sb) || window.sb;
    if (!s) { setTimeout(abrirPlataforma, 400); return; }
    s.rpc('es_admin_plataforma').then(function (r) {
      if (r && r.data === true) {
        var a = document.getElementById('nav-pagina-web');
        if (a) a.style.display = '';
      }
    }).catch(function () { /* oculto */ });
  }

  pintar();
  abrirPlataforma();
})();
