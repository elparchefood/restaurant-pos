/* ═══════════════════════════════════════════════════════════════════════════
   pos-combos.js — Vender combos, en las tres pantallas de venta
   ───────────────────────────────────────────────────────────────────────────
   Hasta hoy un combo se podía crear en el catálogo pero no se podía cobrar:
   ninguna pantalla de venta leía la tabla. Se armaban y ahí se quedaban.

   La idea de fondo: al combo se le da forma de PRODUCTO. Así la grilla, el
   buscador, los favoritos, el contador de cantidad y el carrito de cada
   pantalla siguen funcionando sin tocarles nada. Reescribir tres carritos para
   meter un caso nuevo es exactamente como se rompen las cosas que ya andaban —
   y es lo que pasó con los recibos de mesa, que terminaron en tres versiones.

   Lo único que sí tiene que saber que es un combo:
     · al guardar el pedido (product_id va vacío y se anota qué llevaba),
     · la comanda (el cocinero necesita ver el contenido, no el nombre),
     · el inventario (se descuenta cada producto de adentro, no el combo).

   El id del producto falso es "combo:<uuid>" — con prefijo a propósito, para
   que nunca se pueda confundir con un id de producto de verdad.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var PREFIJO = 'combo:';
  var CAT_ID  = '__combos';        // categoría virtual: no existe en la base
  var _combos = [];

  function esCombo(id) { return String(id || '').indexOf(PREFIJO) === 0; }
  function idReal(id)  { return String(id || '').slice(PREFIJO.length); }
  function de(id) {
    var real = esCombo(id) ? idReal(id) : id;
    for (var i = 0; i < _combos.length; i++) if (String(_combos[i].id) === String(real)) return _combos[i];
    return null;
  }

  async function cargar(sb, tenantId) {
    try {
      var r = await sb.from('pos_combos').select('id,name,description,price,photo_url,items,active')
        .eq('tenant_id', tenantId).eq('active', true).order('name');
      /* Solo los que apuntan a productos de verdad. Los del formato viejo
         (items de texto libre) no se pueden preparar ni descontar, así que no
         se ponen a la venta: cobrarlos dejaría el inventario mintiendo. */
      _combos = (r.data || []).filter(function (c) {
        var it = Array.isArray(c.items) ? c.items : [];
        return it.length && it.every(function (x) { return x && x.product_id; });
      });
    } catch (e) { _combos = []; }
    return _combos;
  }

  function lista() { return _combos.slice(); }

  /* La categoría virtual. Va con el morado que ya usa el combo en el catálogo,
     para que se reconozca igual en las dos pantallas. */
  function categoria() {
    return { id: CAT_ID, name: 'Combos', color: '#8B5CF6', tint: '#F5F3FF', ring: '#DDD6FE',
             color_tint: '#F5F3FF', color_ring: '#DDD6FE', comanda_alias: 'Combo', _virtual: true };
  }

  /* Un combo disfrazado de producto: sin presentaciones, sin variantes y sin
     grupos de adición, porque todo eso ya quedó decidido al armarlo. Por eso
     entra al carrito de un toque, sin abrir el modal de opciones. */
  function comoProductos() {
    return _combos.map(function (c) {
      return {
        id: PREFIJO + c.id,
        name: c.name,
        price: Number(c.price) || 0,
        price_mode: 'fixed',
        category_id: CAT_ID,
        photo_url: c.photo_url || null,
        available: true,
        presentations: [], variables: [], mod_group_ids: [], mod_group_pres: {},
        description: c.description || '',
        _combo: c,
      };
    });
  }

  function contenidoTxt(c) {
    if (!c) return '';
    return (c.items || []).map(function (it) {
      return ((it.cantidad || 1) > 1 ? it.cantidad + 'x ' : '') + (it.nombre || '?');
    }).join(' + ');
  }

  /* Lo que se guarda en pos_order_items. product_id queda VACÍO porque un combo
     no es un producto; lo que llevaba se guarda en selections para que la
     comanda y el inventario lo puedan leer después, aunque mañana se cambie el
     combo en el catálogo. */
  function camposDB(comboId) {
    var c = de(comboId);
    if (!c) return null;
    return {
      product_id: null,
      selections: {
        combo_id: String(c.id),
        combo_nombre: c.name,
        combo_items: (c.items || []).map(function (it) {
          return { product_id: it.product_id, pres_id: it.pres_id || null,
                   variantes: it.variantes || {}, cantidad: it.cantidad || 1,
                   nombre: it.nombre || '' };
        }),
      },
    };
  }

  /* Para la comanda: el cocinero necesita ver QUÉ preparar. "Combo El Parche"
     no le dice nada; el contenido sí. */
  function comandaTxt(item) {
    var sel = (item && item.selections) || {};
    if (!sel.combo_id) return null;
    var partes = (sel.combo_items || []).map(function (it) {
      return '  · ' + ((it.cantidad || 1) > 1 ? it.cantidad + 'x ' : '') + (it.nombre || '?');
    });
    return (sel.combo_nombre || 'Combo') + (partes.length ? '\n' + partes.join('\n') : '');
  }

  /* Lo que hay que descontar del inventario: cada producto de adentro por su
     cantidad, multiplicado por cuántos combos se vendieron. Si se descontara el
     combo, el stock nunca bajaría y el "se acabó" no avisaría jamás. */
  function insumosDe(item, cantidadVendida) {
    var sel = (item && item.selections) || {};
    if (!sel.combo_id) return [];
    var n = Number(cantidadVendida) || 1;
    return (sel.combo_items || []).map(function (it) {
      return { product_id: it.product_id, pres_id: it.pres_id || null,
               variantes: it.variantes || {}, cantidad: (it.cantidad || 1) * n };
    });
  }

  global.posCombos = {
    PREFIJO: PREFIJO, CAT_ID: CAT_ID,
    cargar: cargar, lista: lista, de: de, esCombo: esCombo, idReal: idReal,
    categoria: categoria, comoProductos: comoProductos,
    contenidoTxt: contenidoTxt, camposDB: camposDB,
    comandaTxt: comandaTxt, insumosDe: insumosDe,
  };
})(typeof window !== 'undefined' ? window : globalThis);
