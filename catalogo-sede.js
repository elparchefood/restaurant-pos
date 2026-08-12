/* ══════════════════════════════════════════════════════════════════════
   PRECIO EN ESTA SEDE — la excepción del local sobre la carta de la marca.

   Vive APARTE del editor del producto a propósito. En el editor se cambia la
   carta de TODA la marca; aquí solo lo de este local. Si compartieran
   formulario, un "Guardar" distraído subiría a la marca un precio que era de
   una sola sede — y nadie lo notaría hasta ver la caja.

   Solo aparece cuando la marca tiene más de una sucursal. Con una sola,
   "precio en esta sede" es ruido: es el mismo precio de la marca.

   Depende de catalogo-productos.js (S, icon, escHtml, fmt, openOverlay,
   closeOverlay, renderPage, toast, showConfirmModal) y de pos-carta.js.
   Por eso el <script> va DESPUES de los dos.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function sedeIcon(s) {
    s = s || 13;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" '
      + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/>'
      + '<path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/></svg>';
  }

  /* El contexto, sin depender de pos-core.
     Esta pantalla no puede cargar pos-core: los dos declaran `const sb` y
     juntos rompen la página entera. Pero el switch guarda su elección en
     localStorage y las listas en posCache, así que se lee de ahí. */
  var _sucs = null;      // sedes conocidas en esta pantalla
  var _propia = null;    // la sucursal del usuario, del login

  function ctx() {
    if (window.posContexto && posContexto.sucursalId()) {
      return {
        id: posContexto.sucursalId(),
        marca: posContexto.marcaId(),
        sucs: posContexto.sucursales() || []
      };
    }
    var sucs = _sucs || [];
    var id = null;
    try { id = localStorage.getItem('pos.contexto.sucursal'); } catch (e) {}
    if (!sucs.some(function (s) { return s.id === id; })) id = null;
    /* Sin elección guardada manda la sucursal del login, NO la primera de la
       lista: elegir "la primera" mostraría precios de una sede ajena. */
    if (!id) id = _propia;
    if (!id && sucs.length === 1) id = sucs[0].id;
    var s = sucs.filter(function (x) { return x.id === id; })[0];
    return { id: id, marca: s ? s.brand_id : null, sucs: sucs };
  }

  /* Esta pantalla se entera sola de las sedes.
     Antes dependía de la caché que llena pos-core en OTRAS pantallas: recién
     creada una sucursal, el Catálogo seguía creyendo que había una sola y el
     botón no aparecía hasta pasar por otra pantalla. */
  async function cargarSedes() {
    try {
      var g = window.posCache && posCache.leer('contexto');
      if (g && g.datos && g.datos.sucs) _sucs = g.datos.sucs;
    } catch (e) {}
    try {
      var u = await sb.auth.getUser();
      var md = (u && u.data && u.data.user && u.data.user.user_metadata) || {};
      _propia = md.branch_id || null;
    } catch (e) {}
    try {
      /* RLS ya limita a su propio negocio. */
      var r = await sb.from('branches').select('id,name,brand_id').order('name');
      if (!r.error && r.data) _sucs = r.data;
    } catch (e) {}
    return _sucs || [];
  }

  /* ¿Tiene sentido hablar de "esta sede"? Solo con 2 o más sucursales
     DE LA MISMA MARCA — las de otra marca no comparten carta. */
  function multiSede() {
    try {
      if (!window.posCarta) return false;
      var c = ctx();
      if (!c.id) return false;
      var mismas = c.marca
        ? c.sucs.filter(function (s) { return s.brand_id === c.marca; })
        : c.sucs;
      return mismas.length > 1;
    } catch (e) { return false; }
  }

  function sucNombre() {
    try {
      var c = ctx();
      var s = c.sucs.filter(function (x) { return x.id === c.id; })[0];
      return (s && (s.name || s.nombre)) || 'esta sede';
    } catch (e) { return 'esta sede'; }
  }

  /* El botón de la tarjeta. Devuelve '' con una sola sucursal: la pantalla
     queda exactamente como está hoy para quien no tiene sedes. */
  function sedeBtn(id) {
    if (!multiSede()) return '';
    var aj = false;
    try { aj = posCarta.ajustado(id); } catch (e) {}
    return '<button class="cp-sede-btn' + (aj ? ' on' : '') + '"'
      + ' title="Precio y disponibilidad solo en ' + escHtml(sucNombre()) + '"'
      + ' onclick="openPrecioSede(\'' + id + '\')">' + sedeIcon(13)
      + '<span>' + (aj ? 'Precio propio' : 'Esta sede') + '</span></button>';
  }

  /* ── El panel ───────────────────────────────────────────────────── */
  function openPrecioSede(id) {
    var p = S.products.find(function (x) { return x.id === id; });
    if (!p) { toast('No se encontró el producto'); return; }
    var aj = posCarta.ajustesDe(id);
    S.sede = {
      id: id,
      precio: aj.precio,
      activo: (aj.activo === null ? true : aj.activo),
      pres: aj.pres || {}
    };
    openOverlay(
      '<div class="cc-overlay" onmousedown="handleOverlayClose(event)">'
      + '<aside class="cc-drawer" style="max-width:520px" onmousedown="event.stopPropagation()">'
      + '<div class="cc-drawer-head"><div style="display:flex;align-items:center;gap:10px">'
      + '<span class="cc-drawer-glyph" style="color:#0EA5E9;background:#E0F2FE">' + sedeIcon(17) + '</span>'
      + '<div><div class="cc-drawer-eyebrow">Solo en ' + escHtml(sucNombre()) + '</div>'
      + '<div class="cc-drawer-title">' + escHtml(p.name) + '</div></div></div>'
      + '<button class="lm-icon-sm" onclick="closeOverlay()">' + icon('x', 15) + '</button></div>'
      + '<div class="cc-drawer-body"><div id="sede-body">' + bodyHTML(p) + '</div></div>'
      + '<div class="cc-drawer-foot">'
      + '<button class="lm-btn-ghost" onclick="cpSedeRestablecer()">Restablecer</button>'
      + '<div style="display:flex;gap:8px">'
      + '<button class="lm-btn-ghost" onclick="closeOverlay()">Cancelar</button>'
      + '<button class="lm-btn-primary" onclick="cpSedeGuardar()">' + icon('check', 14) + ' Guardar</button>'
      + '</div></div></aside></div>'
    );
  }

  function bodyHTML(p) {
    var pres = (p.presentations || []).filter(function (x) { return x && x.id; });
    var filas;
    if (pres.length) {
      /* El cobro sale de la presentación, no de `price` — por eso cada
         presentación lleva su propia casilla. Ajustar solo el precio base
         no habría hecho nada en 22 de los 53 productos de El Parche. */
      filas = pres.map(function (pr) {
        var base = Number(pr.price_base != null ? pr.price_base : pr.price) || 0;
        var v = S.sede.pres[pr.id];
        return '<div class="cp-sede-row"><div class="cp-sede-lbl">' + escHtml(pr.name || 'Única')
          + '<span class="cp-sede-base">Marca: ' + fmt(base) + '</span></div>'
          + '<div class="cc-money"><span class="cc-money-sym">$</span>'
          + '<input type="number" min="0" step="500" placeholder="' + base + '"'
          + ' value="' + (v != null ? v : '') + '"'
          + ' oninput="cpSedeSetPres(\'' + pr.id + '\',this.value)"></div></div>';
      }).join('');
    } else {
      var base = Number(p.price_base != null ? p.price_base : p.price) || 0;
      filas = '<div class="cp-sede-row"><div class="cp-sede-lbl">Precio'
        + '<span class="cp-sede-base">Marca: ' + fmt(base) + '</span></div>'
        + '<div class="cc-money"><span class="cc-money-sym">$</span>'
        + '<input type="number" min="0" step="500" placeholder="' + base + '"'
        + ' value="' + (S.sede.precio != null ? S.sede.precio : '') + '"'
        + ' oninput="cpSedeSetBase(this.value)"></div></div>';
    }
    return '<div class="cp-sede-note">Lo que dejes en blanco cobra el precio de la marca. '
      + 'Cambiar el precio de la marca <strong>no</strong> pisa lo que pongas aquí.</div>'
      + '<div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">' + filas + '</div>'
      + '<div class="cp-sede-row" style="margin-top:14px"><div class="cp-sede-lbl">¿Se vende aquí?'
      + '<span class="cp-sede-base">Apagarlo no lo quita de las otras sedes</span></div>'
      + '<button class="cp-switch' + (S.sede.activo ? ' on' : '') + '" onclick="cpSedeToggle()">'
      + '<span class="cp-switch-lbl">' + (S.sede.activo ? 'Sí' : 'No') + '</span>'
      + '<span class="cp-switch-track"><span class="cp-switch-knob"></span></span></button></div>';
  }

  function setPres(presId, val) {
    var n = parseInt(val, 10);
    if (val === '' || isNaN(n)) delete S.sede.pres[presId]; else S.sede.pres[presId] = n;
  }
  function setBase(val) {
    var n = parseInt(val, 10);
    S.sede.precio = (val === '' || isNaN(n)) ? null : n;
  }
  function toggle() {
    S.sede.activo = !S.sede.activo;
    var p = S.products.find(function (x) { return x.id === S.sede.id; });
    var el = document.getElementById('sede-body');
    if (el && p) el.innerHTML = bodyHTML(p);
  }

  async function guardar() {
    try {
      /* Sin ninguna excepción no se guarda una fila vacía: se borra. Una fila
         sin nada encendería el aviso de "precio propio" sin que nada lo sea. */
      var hayPres = Object.keys(S.sede.pres || {}).length > 0;
      if (!hayPres && S.sede.precio == null && S.sede.activo === true) {
        await posCarta.restablecer(S.sede.id);
      } else {
        await posCarta.ajustar(S.sede.id, {
          precio: S.sede.precio,
          activo: S.sede.activo ? null : false,
          pres: S.sede.pres
        });
      }
      closeOverlay(); renderPage(); toast('Guardado solo para ' + sucNombre());
    } catch (e) { toast('No se pudo guardar: ' + ((e && e.message) || 'error')); }
  }

  async function restablecer() {
    try {
      await posCarta.restablecer(S.sede.id);
      closeOverlay(); renderPage(); toast('Vuelve al precio de la marca');
    } catch (e) { toast('No se pudo restablecer: ' + ((e && e.message) || 'error')); }
  }

  /* Restablecer TODA la carta del local. Confirma porque borra de un golpe
     todos los precios propios de esa sede. */
  function restablecerCarta() {
    var n = 0;
    try { n = posCarta.cuantosAjustados(); } catch (e) {}
    if (!n) { toast('Esta sede ya usa toda la carta de la marca'); return; }
    showConfirmModal('Restablecer la carta de ' + sucNombre(),
      n + ' ' + (n === 1 ? 'producto tiene' : 'productos tienen') + ' precio o disponibilidad '
      + 'propios en esta sede. Todos volverán a lo de la marca. Las otras sedes no se tocan.',
      async function () {
        try { await posCarta.restablecer(null); renderPage(); toast('Esta sede vuelve a la carta de la marca'); }
        catch (e) { toast('No se pudo: ' + ((e && e.message) || 'error')); }
      });
  }

  window.cpSedeBtn          = sedeBtn;
  window.cpMultiSede        = multiSede;
  window.cpSucNombre        = sucNombre;
  window.openPrecioSede     = openPrecioSede;
  window.cpSedeSetPres      = setPres;
  window.cpSedeSetBase      = setBase;
  window.cpSedeToggle       = toggle;
  window.cpSedeGuardar      = guardar;
  window.cpSedeRestablecer  = restablecer;
  window.cpRestablecerCarta = restablecerCarta;

  /* Arranque: se espera a que el catálogo tenga sesión, se averiguan las
     sedes y los ajustes, y solo se repinta si hay algo que mostrar — con una
     sola sucursal la pantalla queda idéntica a como estaba. */
  (function init(intentos) {
    intentos = intentos || 0;
    var listo = (typeof S !== 'undefined') && S.tenantId;
    if (!listo) {
      if (intentos < 40) setTimeout(function () { init(intentos + 1); }, 250);
      return;
    }
    (async function () {
      try {
        await cargarSedes();
        if (!multiSede()) return;
        await posCarta.cargar(true);
        if (typeof renderPage === 'function') renderPage();
      } catch (e) { console.warn('[sede] no se pudo preparar:', e && e.message); }
    })();
  })();
})();
