/* ═══════════════════════════════════════════════════════════════════════════
   pos-tabs.js — Las pestañas COMBOS y PUNTOS de las pantallas de venta
   ───────────────────────────────────────────────────────────────────────────
   Los combos estaban entrando como una categoría más, mezclados con la carta.
   Pedido de Sergio: que sean una pestaña propia arriba, y que la otra pestaña
   muestre lo que se puede pagar con puntos — para escogerlo de un toque en vez
   de tener que acordarse de cuáles eran.

   Cada pantalla dibuja sus tarjetas distinto (mesa marca favoritos, domicilios
   y venta rápida no), así que este módulo NO dibuja tarjetas: recibe la función
   de la pantalla y solo se encarga de qué mostrar y en qué orden. Es la misma
   razón por la que las notas frecuentes salieron a un módulo — copiar esto tres
   veces es cómo terminaron los recibos de mesa en tres versiones distintas.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function vacio(txt) {
    return '<div style="color:#94A3B8;font-size:13px;padding:28px 16px;text-align:center;grid-column:1/-1;line-height:1.6">'
      + txt + '</div>';
  }

  /* ── Pestaña COMBOS ─────────────────────────────────────────────────────
     Los combos ya viven en S.products con forma de producto, así que se
     dibujan con la misma tarjeta y el mismo toque para agregar. */
  function pintarCombos(host, productos, card) {
    if (!host) return;
    var combos = (productos || []).filter(function (p) {
      return global.posCombos && posCombos.esCombo(p.id);
    });
    host.innerHTML = combos.length
      ? combos.map(function (p) { return card(p, '#8B5CF6'); }).join('')
      : vacio('Todavía no hay combos.<br>Se arman en <b>Catálogo → Combos</b>.');
  }

  /* ── Pestaña PUNTOS ─────────────────────────────────────────────────────
     Solo lo que está en el catálogo de puntos, con su precio en puntos encima
     de la tarjeta. Un toque lo agrega igual que cualquier producto; el canje
     se confirma al cobrar, que es donde se sabe cuántos puntos tiene el
     cliente. */
  function pintarPuntos(host, productos, card) {
    if (!host) return;
    if (!global.posPuntos || !posPuntos.hayCatalogo()) {
      host.innerHTML = vacio('Todavía no hay productos para canjear con puntos.<br>'
        + 'Se configuran en <b>Configuración → Puntos</b>.');
      return;
    }
    var lista = (productos || []).filter(function (p) { return posPuntos.enCatalogo(p.id); });
    if (!lista.length) {
      host.innerHTML = vacio('Los productos del catálogo de puntos no están disponibles ahora mismo.');
      return;
    }
    host.innerHTML = lista.map(function (p) {
      var pr = posPuntos.precioDe(p.id) || {};
      var etiqueta = Number(pr.puntos || 0).toLocaleString('es-CO') + ' pts'
        + (pr.dinero > 0 ? ' + $' + Number(pr.dinero).toLocaleString('es-CO') : '');
      /* El precio en puntos va ENCIMA de la tarjeta, no reemplazando el precio
         en plata: el producto se sigue pudiendo cobrar normal, y el cajero
         necesita ver los dos números para explicárselo al cliente. */
      return '<div style="position:relative">' + card(p, '#7C3AED')
        + '<span style="position:absolute;top:6px;left:6px;z-index:2;background:#7C3AED;color:#fff;'
        + 'font-size:10.5px;font-weight:800;padding:2px 7px;border-radius:999px;white-space:nowrap;'
        + 'box-shadow:0 1px 4px rgba(0,0,0,.2)">' + etiqueta + '</span></div>';
    }).join('');
  }

  /* ── Enganche ────────────────────────────────────────────────────────────
     Cada pantalla tiene su propia logica de pestañas, y las tres funcionan
     igual: muestran el panel cuyo data-tab coincide. Con solo cambiarle el
     nombre a la pestaña en el HTML, eso sigue funcionando sin tocarlo.
     Aqui solo se repinta cuando se entra a una de las dos nuevas, para que
     siempre muestren lo que hay AHORA (un combo recien creado, un producto que
     se acaba de meter al catalogo de puntos). */
  var _cfg = null;

  function repintar() {
    if (!_cfg) return;
    var prods = _cfg.productos ? _cfg.productos() : [];
    pintarCombos(document.getElementById(_cfg.combos), prods, _cfg.card);
    pintarPuntos(document.getElementById(_cfg.puntos), prods, _cfg.card);
  }

  function registrar(cfg) {
    _cfg = cfg;
    /* El catalogo de puntos no lo carga la pantalla de venta: lo carga esto,
       una sola vez, porque solo hace falta para esta pestaña. */
    if (global.posPuntos && cfg.tenantId) {
      posPuntos.setCtx(cfg.tenantId, cfg.branchId || null);
      Promise.resolve(posPuntos.cargar()).then(repintar);
    }
    if (!document._posTabsBound) {
      document._posTabsBound = true;
      document.addEventListener('click', function (e) {
        var b = e.target && e.target.closest && e.target.closest('[data-tab]');
        if (!b) return;
        var t = b.dataset.tab;
        if (t === 'combos' || t === 'puntos') setTimeout(repintar, 0);
      });
    }
    repintar();
  }

  global.posTabs = { pintarCombos: pintarCombos, pintarPuntos: pintarPuntos,
                     registrar: registrar, repintar: repintar };
})(typeof window !== 'undefined' ? window : globalThis);
