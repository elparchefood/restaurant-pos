/* ==========================================================================
   pos-brand.js — Identidad de marca unificada
   --------------------------------------------------------------------------
   Se carga en TODAS las páginas (después de pos-core.js).

   Reglas de producto (multi-tenant):
     · La primera línea del bloque de marca SIEMPRE dice "Cobra POS".
     · La segunda línea SIEMPRE es el nombre del restaurante del tenant.
     · El recuadro del logo lleva el logo oficial de Cobra POS.

   Cada página tiene su propio prefijo de clases (cj-, cf-, iv-, d-, tp-,
   vs-, o el genérico brand-*), así que en vez de editar 13 HTML distintos
   este script normaliza el bloque sea cual sea su marcado.
   ========================================================================== */
(function () {
  'use strict';

  var LOGO_SRC = 'assets/brand/cobra-logo.png';
  var LS_KEY   = 'pos.brand.restaurante';

  /* Páginas donde la segunda línea la controla la propia página
     (en tablet muestra la ZONA de la mesa, no el restaurante). */
  var SUB_RESERVADO = ['tp-branch-name', 'vr-branch-name'];

  /* ── Nombre del restaurante ─────────────────────────────────────────── */

  function nombreCache() {
    try { return localStorage.getItem(LS_KEY) || ''; } catch (e) { return ''; }
  }

  // El cliente Supabase se llama `sb` en todas las páginas, pero unas lo
  // declaran en pos-core.js y otras en su propio script.
  function cliente() {
    try { return (typeof sb !== 'undefined' && sb) ? sb : (window.sb || null); }
    catch (e) { return window.sb || null; }
  }

  async function nombreDesdeDB() {
    var sb = cliente();
    if (!sb) return '';
    try {
      var r = await sb.from('branches')
        .select('name, brands(name)')
        .eq('is_active', true).limit(1).maybeSingle();
      if (r && r.data) return (r.data.brands && r.data.brands.name) || r.data.name || '';
    } catch (e) { /* sin conexión: se queda con el cache */ }
    try {
      var u = await sb.auth.getUser();
      var meta = (u && u.data && u.data.user && u.data.user.user_metadata) || {};
      if (meta.restaurant_name) return meta.restaurant_name;
    } catch (e) {}
    return '';
  }

  window.posBrandName = function () {
    return nombreCache() || 'Mi restaurante';
  };

  /* ── Normalización del bloque de marca ──────────────────────────────── */

  function pintarLogo(el) {
    if (!el || el.dataset.brandDone === '1') return;
    el.dataset.brandDone = '1';
    el.innerHTML = '<img src="' + LOGO_SRC + '" alt="Cobra POS" ' +
      'style="width:100%;height:100%;object-fit:cover;display:block;' +
      'border-radius:inherit">';
    // El recuadro traía un degradado de fondo con la letra placeholder
    // ("L"/"C"); el app icon oficial ya trae su propio fondo índigo.
    el.style.background = 'transparent';
    el.style.boxShadow  = 'none';
    el.style.color      = 'transparent';
    el.style.padding    = '0';
    el.style.overflow   = 'hidden';
  }

  function pintarTextos(cont, restaurante) {
    var name = cont.querySelector('[class*="brand-name"]');
    var sub  = cont.querySelector('[class*="brand-sub"], [class*="brand-ver"]');

    // domicilios.html sólo tiene la línea de abajo: le creamos la de arriba.
    if (!name && sub) {
      name = document.createElement('div');
      name.className = sub.className.replace(/brand-sub/, 'brand-name');
      name.style.fontWeight = '700';
      sub.parentNode.insertBefore(name, sub);
    }

    if (name) name.textContent = 'Cobra POS';
    if (sub && SUB_RESERVADO.indexOf(sub.id) === -1 && restaurante) {
      sub.textContent = restaurante;
    }
  }

  /* El recuadro del logo se llama brand-logo en casi todas las pantallas,
     pero en catálogo y chat IA se llama brand-mark. Ojo: en el dashboard
     "brand-mark" es el CONTENEDOR, así que descartamos los que contienen
     otras piezas de marca dentro. */
  function esRecuadroLogo(el) {
    if (/brand-logo/.test(el.className)) return true;
    return !el.querySelector('[class*="brand-logo"], [class*="brand-name"]');
  }

  function aplicar(restaurante) {
    var cand = document.querySelectorAll('[class*="brand-logo"], [class*="brand-mark"]');
    var logos = [];
    for (var k = 0; k < cand.length; k++) {
      if (esRecuadroLogo(cand[k])) logos.push(cand[k]);
      // Los contenedores descartados también se marcan para que el
      // observador no los vuelva a evaluar en cada mutación del DOM.
      else cand[k].dataset.brandDone = '1';
    }
    for (var i = 0; i < logos.length; i++) {
      var logo = logos[i];
      pintarLogo(logo);
      // Ojo: closest() se incluye a sí mismo y la clase del recuadro ya
      // contiene "brand" (cj-brand-logo), así que hay que subir un nivel.
      var padre = logo.parentElement;
      var cont  = padre && (padre.closest('[class*="brand"]') || padre);
      if (cont) pintarTextos(cont, restaurante);
    }
  }

  async function init() {
    // 1) Pintado inmediato con lo que haya en cache (sin parpadeo).
    aplicar(nombreCache());
    // 2) Refresco desde la base; si cambió, se repinta y se guarda.
    var fresco = await nombreDesdeDB();
    if (fresco) {
      try { localStorage.setItem(LS_KEY, fresco); } catch (e) {}
      aplicar(fresco);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Ventas ("Por salón") dibuja su sidebar por JS después del load.
     Observamos el DOM para pintar el bloque en cuanto aparezca. */
  var obs = new MutationObserver(function () {
    var pendiente = document.querySelector(
      '[class*="brand-logo"]:not([data-brand-done]), [class*="brand-mark"]:not([data-brand-done])');
    if (pendiente) aplicar(nombreCache());
  });
  function observar() { obs.observe(document.body, { childList: true, subtree: true }); }
  if (document.body) observar();
  else document.addEventListener('DOMContentLoaded', observar);

  window.posBrandRefresh = init;
})();
