/* pos-traspaso.js — Pasar un pedido de una pantalla a otra sin rearmarlo.
 *
 * Sergio, 28-ago-2026: «el cliente me dice dame x producto, yo lo atiendo en
 * la mesa, y de un momento a otro me dice no, mejor dámelo para llevar. Me
 * toca salirme, pierdo todo lo que había seleccionado, y volver a meterme».
 *
 * Uso:
 *   posTraspaso.abrir({ origen:'mesa', etiqueta:'Mesa 3', items:[...],
 *                       total:55000, alSalir:fn });      // muestra el menú
 *   posTraspaso.recoger('llevar');                        // al cargar la otra
 */
(function (w) {
  'use strict';

  var LLAVE = 'pos.traspaso.v1';
  /*  QUINCE MINUTOS. Un traspaso es un gesto de un momento: se toca aquí y se
      llega allá en dos segundos. Si algo queda guardado más tiempo del que
      dura un cambio de pantalla, ya no es un traspaso — es basura que un día
      va a aparecer sola en medio de otra venta.                            */
  var VIDA_MS = 15 * 60 * 1000;

  var DESTINOS = {
    mesa:      { pagina: 'ventas.html',      nombre: 'Mesa',        sub: 'eliges la mesa' },
    llevar:    { pagina: 'venta-rapida.html', nombre: 'Para llevar', sub: 'cobras y listo' },
    domicilio: { pagina: 'domicilios.html',   nombre: 'Domicilio',   sub: 'te pide la dirección' },
  };

  function cop(n) { return '$ ' + Math.round(Number(n) || 0).toLocaleString('es-CO'); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /*  ══ EL FORMATO COMÚN ═════════════════════════════════════════════════
      Las tres pantallas guardan la comanda distinto: mesas usa `unitPrice` y
      `wip`, venta rápida usa `price` y mete el id de la LÍNEA en `id`, y
      domicilios usa `price` pero mete el id del PRODUCTO en `id`. Nacieron
      en momentos distintos y cada una resolvió lo suyo.

      Traducir de cualquiera a cualquiera serían seis conversiones, y seis
      sitios donde se pierde una adición. Con un formato en medio son tres de
      ida y tres de vuelta, y —lo que importa— hay UN solo sitio donde mirar
      cuando algo no llegue.

      Lo que viaja es el estado CRUDO del modal (`pres`, `vars`, `mods`), no
      el texto ya armado: de ahí las tres pueden reconstruir su propia forma,
      incluido el nombre. Mandar solo el nombre pintado haría que el pedido
      se viera bien y llegara vacío a la cocina.                            */
  function normalizar(it) {
    if (!it) return null;
    var pres = it.pres || (it.wip && it.wip.presId ? { id: it.wip.presId, name: (it.selections && it.selections.pres) || '' } : null);
    if (!pres && it.presId) pres = { id: it.presId, name: (it.selections && it.selections.pres) || '' };
    return {
      productId: it.productId || it.product_id || it.id || null,
      name:      it.name || '',
      qty:       Number(it.qty) || 1,
      unitPrice: Number(it.unitPrice != null ? it.unitPrice : it.price) || 0,
      note:      it.note || '',
      modSummary: it.modSummary || '',
      catId:     it.catId || it.category_id || null,
      catName:   it.catName || '',
      catColor:  it.catColor || '#94A3B8',
      pres:      pres,
      vars:      (it.vars || (it.wip && it.wip.vars) || (it.selections && it.selections.vars) || {}),
      mods:      (it.mods || (it.wip && it.wip.mods) || (it.selections && it.selections.mods) || {}),
    };
  }

  /*  Y de vuelta, a la forma de cada pantalla. Cada una es fiel a lo que esa
      pantalla ya construye cuando alguien agrega un producto a mano — se
      copió de ahí a propósito: si el traspaso inventara su propia forma,
      funcionaría hasta el día que alguien cambie el modal.                 */
  function aMesa(n) {
    var presLabel = (n.pres && n.pres.name) || '';
    return {
      id: null, lineId: 'li_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      productId: n.productId, name: n.name, qty: n.qty, unitPrice: n.unitPrice,
      catColor: n.catColor, modSummary: n.modSummary, note: n.note, forHere: true,
      wip: { presId: (n.pres && n.pres.id) || null, vars: n.vars, mods: n.mods },
      selections: { pres: presLabel || null, vars: n.vars, mods: n.mods },
    };
  }
  function aLlevar(n) {
    var presLabel = (n.pres && n.pres.name) || '';
    var lineId = 'vr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    return {
      /*  Ojo: aquí `id` es el de la LÍNEA y el producto va aparte. En
          domicilios es al revés. Confundirlos deja la venta sin descontar
          inventario, que no se ve hasta el cierre del mes.                */
      id: lineId, productId: n.productId,
      presId: (n.pres && n.pres.id) || null,
      name: n.name, price: n.unitPrice, qty: n.qty,
      note: n.note, modSummary: n.modSummary,
      catId: n.catId, catName: n.catName, catColor: n.catColor,
      fav: false, fromModal: true,
      selections: { pres: presLabel || null, vars: n.vars, mods: n.mods },
    };
  }
  function aDomicilio(n) {
    return {
      lineId: 'li_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      id: n.productId, name: n.name, price: n.unitPrice, qty: n.qty,
      catName: n.catName, catColor: n.catColor,
      note: n.note, modSummary: n.modSummary,
      pres: n.pres, vars: n.vars, mods: n.mods,
    };
  }

  var HACIA = { mesa: aMesa, llevar: aLlevar, domicilio: aDomicilio };

  /* ── Guardar y recoger ──────────────────────────────────────────────── */
  function guardar(destino, datos) {
    var paquete = {
      destino: destino,
      origen: datos.origen || '',
      etiqueta: datos.etiqueta || '',
      cliente: datos.cliente || null,
      items: (datos.items || []).map(normalizar).filter(Boolean),
      en: Date.now(),
    };
    try { localStorage.setItem(LLAVE, JSON.stringify(paquete)); return true; }
    catch (e) { return false; }
  }

  /*  Recoger BORRA. Un traspaso se usa una vez: si se quedara guardado, el
      pedido volvería a aparecer la próxima vez que se abra la pantalla — y
      esa vez nadie lo está esperando.                                      */
  function recoger(pantalla) {
    var crudo;
    try { crudo = localStorage.getItem(LLAVE); } catch (e) { return null; }
    if (!crudo) return null;
    var p;
    try { p = JSON.parse(crudo); } catch (e) { limpiar(); return null; }
    if (!p || p.destino !== pantalla) return null;
    if (!p.en || (Date.now() - p.en) > VIDA_MS) { limpiar(); return null; }
    limpiar();
    var conv = HACIA[pantalla];
    if (!conv) return null;
    return {
      origen: p.origen, etiqueta: p.etiqueta, cliente: p.cliente,
      items: (p.items || []).map(conv),
    };
  }

  function limpiar() { try { localStorage.removeItem(LLAVE); } catch (e) {} }

  /*  Mirar SIN consumir. La pantalla de mesas no recibe el pedido — lo recibe
      `tomar-pedido` cuando se elige la mesa— pero tiene que poder decir por
      que se llego ahi. Sin este aviso, elegir «Mesa» lleva a una pantalla de
      mesas igual a siempre y parece que no paso nada.                     */
  function hay(pantalla) {
    try {
      var p = JSON.parse(localStorage.getItem(LLAVE) || 'null');
      if (!p || p.destino !== pantalla) return null;
      if (!p.en || (Date.now() - p.en) > VIDA_MS) return null;
      return { origen: p.origen, etiqueta: p.etiqueta, n: (p.items || []).length };
    } catch (e) { return null; }
  }

  /* ── El menú ────────────────────────────────────────────────────────── */
  var ICONOS = {
    mesa: '<path d="M3 10h18M5 10v10M19 10v10M8 4h8l2 6H6z"/>',
    llevar: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    domicilio: '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 17.5h-6l-2-9h-3"/><path d="M9 8.5h7l2 9"/>',
  };

  function abrir(cfg) {
    cerrar();
    var items = cfg.items || [];
    var total = cfg.total != null ? cfg.total
      : items.reduce(function (s, i) { return s + (Number(i.unitPrice != null ? i.unitPrice : i.price) || 0) * (Number(i.qty) || 1); }, 0);
    var n = items.reduce(function (s, i) { return s + (Number(i.qty) || 1); }, 0);

    var ov = document.createElement('div');
    ov.className = 'tr-ov';
    ov.id = 'tr-ov';

    var filas = Object.keys(DESTINOS).map(function (k) {
      var d = DESTINOS[k];
      var aqui = k === cfg.origen;
      return '<button type="button" class="tr-op' + (aqui ? ' aqui' : '') + '"'
        + (aqui ? ' disabled' : ' data-destino="' + k + '"') + '>'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
        + ICONOS[k] + '</svg>'
        + '<span><b>' + esc(aqui && cfg.etiqueta ? cfg.etiqueta : d.nombre) + '</b>'
        + '<small>' + esc(aqui ? 'donde está ahora' : d.sub) + '</small></span>'
        + (aqui
          ? '<svg class="tr-ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
          : '<svg class="tr-mas" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>')
        + '</button>';
    }).join('');

    ov.innerHTML = '<div class="tr-caja" role="dialog" aria-modal="true">'
      + '<div class="tr-tit">Pasar el pedido a</div>'
      + '<div class="tr-sub">' + n + (n === 1 ? ' ítem' : ' ítems') + ' · ' + cop(total)
      + ' — se van todos, con sus tamaños, adiciones y notas.</div>'
      + '<div class="tr-ops">' + filas + '</div>'
      + (cfg.aviso ? '<div class="tr-aviso">' + esc(cfg.aviso) + '</div>' : '')
      + '<div class="tr-pie"><button type="button" class="tr-cancelar">Cancelar</button></div>'
      + '</div>';

    ov.addEventListener('click', function (e) {
      if (e.target === ov) { cerrar(); return; }
      var b = e.target.closest ? e.target.closest('[data-destino]') : null;
      if (!b) {
        if (e.target.closest && e.target.closest('.tr-cancelar')) cerrar();
        return;
      }
      var destino = b.getAttribute('data-destino');
      if (!guardar(destino, { origen: cfg.origen, etiqueta: cfg.etiqueta, items: items, cliente: cfg.cliente })) return;
      /*  El aviso al salir es de quien lo abrió: solo esa pantalla sabe si
          tiene que soltar la mesa, borrar su copia guardada o no hacer nada. */
      try { if (typeof cfg.alSalir === 'function') cfg.alSalir(destino); } catch (err) {}
      w.location.href = DESTINOS[destino].pagina;
    });
    document.addEventListener('keydown', tecla);
    document.body.appendChild(ov);
  }

  function tecla(e) { if (e.key === 'Escape') cerrar(); }
  function cerrar() {
    document.removeEventListener('keydown', tecla);
    var ov = document.getElementById('tr-ov');
    if (ov) ov.remove();
  }

  w.posTraspaso = { abrir: abrir, cerrar: cerrar, recoger: recoger, hay: hay, limpiar: limpiar, guardar: guardar };
})(window);
