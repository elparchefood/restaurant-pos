/* ══════════════════════════════════════════════════════════════════════
   LA CARTA DE ESTA SUCURSAL — un solo sitio que resuelve la herencia.

   La regla, decidida el 2-ago-2026 y escrita en PLAN-MULTIMARCA.md:

     La carta es de la MARCA. El ajuste del local manda cuando existe; si no,
     rige el precio de la marca. Cambiar el precio base NO pisa a los locales
     que ya tienen ajuste propio.

   Nada se copia: una sucursal nueva ve los productos de su marca desde el
   primer segundo. Solo se guarda una fila en `pos_producto_sucursal` cuando
   ese local se APARTA — por eso "restablecer" es borrar esa fila.

   POR QUE UN MODULO Y NO EN CADA PANTALLA: el precio se lee en domicilios,
   venta rapida, salon, pagos y catalogo. Si cada una resolviera la herencia a
   su manera, dos pantallas cobrarian distinto — que es exactamente lo que ya
   paso con `payment_method` y con las notas frecuentes. Una regla, un sitio.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var _ajustes = null;     // { product_id: {precio, activo} } de la sucursal activa
  var _branch  = null;
  var _cargando = null;

  function sb() {
    try { return window.sb || (window._pos && window._pos.sb); }
    catch (e) { return null; }
  }
  function sucursalActiva() {
    try {
      return (window.posContexto && window.posContexto.sucursalId())
          || (window._pos && window._pos.state && window._pos.state.branchId)
          || null;
    } catch (e) { return null; }
  }

  /* Trae los ajustes de la sucursal activa. Una sola vez por pantalla.
     Si falla, se queda sin ajustes: la carta se ve con los precios de la
     marca, que es el comportamiento de siempre. Nunca deja una pantalla sin
     carta por un problema de red. */
  async function cargar(forzar) {
    var b = sucursalActiva();
    if (!b) { _ajustes = {}; return _ajustes; }
    if (!forzar && _ajustes && _branch === b) return _ajustes;
    if (_cargando) return _cargando;

    _cargando = (async function () {
      var mapa = {};
      try {
        var s = sb();
        if (s) {
          var r = await s.from('pos_producto_sucursal')
            .select('product_id,precio,activo').eq('branch_id', b);
          (r.data || []).forEach(function (x) {
            mapa[x.product_id] = { precio: x.precio, activo: x.activo };
          });
        }
      } catch (e) { console.warn('[carta] sin ajustes de sucursal:', e && e.message); }
      _ajustes = mapa; _branch = b; _cargando = null;
      return _ajustes;
    })();
    return _cargando;
  }

  /* El precio que se COBRA en esta sucursal. */
  function precio(productId, precioBase) {
    var a = _ajustes && _ajustes[productId];
    return (a && a.precio != null) ? Number(a.precio) : Number(precioBase) || 0;
  }
  /* ¿Se vende aqui? Un local puede apagar un plato sin tocar la carta de la
     marca. `available` del producto sigue mandando si no hay ajuste. */
  function activo(productId, disponibleBase) {
    var a = _ajustes && _ajustes[productId];
    if (a && a.activo != null) return !!a.activo;
    return disponibleBase !== false;
  }
  function ajustado(productId) {
    var a = _ajustes && _ajustes[productId];
    return !!(a && (a.precio != null || a.activo != null));
  }
  function precioBaseDe(productId, precioBase) { return Number(precioBase) || 0; }

  /* Aplica la herencia a una lista ya cargada de productos.
     Devuelve la MISMA lista con `price` y `available` resueltos para esta
     sucursal, y deja el original en `price_base` para poder mostrarlo. */
  function aplicar(productos) {
    (productos || []).forEach(function (p) {
      if (!p || !p.id) return;
      if (p.price_base === undefined) p.price_base = p.price;
      p.price     = precio(p.id, p.price_base);
      p.available = activo(p.id, p.available);
      p.ajustado  = ajustado(p.id);
    });
    return productos || [];
  }

  /* Guardar un ajuste SOLO para esta sucursal. */
  async function ajustar(productId, opts) {
    var s = sb(), b = sucursalActiva();
    if (!s || !b) throw new Error('No se sabe en que sucursal estas');
    var tenantId = (window._pos && window._pos.state && window._pos.state.tenantId) || null;
    var fila = { tenant_id: tenantId, product_id: productId, branch_id: b, updated_at: new Date().toISOString() };
    if (opts && 'precio' in opts) fila.precio = (opts.precio === null ? null : Number(opts.precio));
    if (opts && 'activo' in opts) fila.activo = opts.activo;
    var r = await s.from('pos_producto_sucursal')
      .upsert(fila, { onConflict: 'product_id,branch_id' }).select('id');
    /* 0 filas sin error es el fallo silencioso de siempre. */
    if (r.error || !r.data || !r.data.length) {
      throw new Error((r.error && r.error.message) || 'no se guardo el ajuste');
    }
    await cargar(true);
    return true;
  }

  /* RESTABLECER: borrar la excepcion. El producto vuelve al precio de la
     marca — no se "copia de vuelta" un valor, simplemente se deja de tener
     opinion propia. */
  async function restablecer(productId) {
    var s = sb(), b = sucursalActiva();
    if (!s || !b) throw new Error('No se sabe en que sucursal estas');
    var q = s.from('pos_producto_sucursal').delete().eq('branch_id', b);
    if (productId) q = q.eq('product_id', productId);
    var r = await q;
    if (r.error) throw new Error(r.error.message);
    await cargar(true);
    return true;
  }

  /* Cuantos productos estan ajustados en esta sucursal. Para el aviso de
     "esta carta tiene N precios propios". */
  function cuantosAjustados() {
    return Object.keys(_ajustes || {}).length;
  }

  window.posCarta = {
    cargar: cargar, aplicar: aplicar,
    precio: precio, activo: activo, ajustado: ajustado, precioBase: precioBaseDe,
    ajustar: ajustar, restablecer: restablecer,
    cuantosAjustados: cuantosAjustados,
    sucursal: sucursalActiva
  };

  /* Se precarga en cuanto pos-core sabe la sucursal, para que la primera
     pantalla que pregunte ya lo tenga. */
  try {
    if (window._pos && window._pos.on) window._pos.on('core:ready', function () { cargar(); });
  } catch (e) {}
})();
