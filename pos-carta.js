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
  /* La sucursal activa. El ultimo recurso es lo guardado en el equipo porque
     el Catalogo NO carga pos-core (declara su propio `sb`, y cargar los dos
     revienta la pagina con "sb ya fue declarado"). Ahi no existe posContexto,
     pero la eleccion del switch sigue en el mismo sitio. */
  function sucursalActiva() {
    try {
      return (window.posContexto && window.posContexto.sucursalId())
          || (window._pos && window._pos.state && window._pos.state.branchId)
          || localStorage.getItem('pos.contexto.sucursal')
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
            .select('product_id,precio,activo,precios_pres').eq('branch_id', b);
          (r.data || []).forEach(function (x) {
            mapa[x.product_id] = { precio: x.precio, activo: x.activo, pres: x.precios_pres || null };
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
    if (!a) return false;
    var tienePres = a.pres && Object.keys(a.pres).length > 0;
    return !!(a.precio != null || a.activo != null || tienePres);
  }

  /* El precio de UNA presentacion en esta sucursal.
     Existe porque 22 de los 53 productos de El Parche se venden por
     presentacion (Personal/Familiar): el cobro sale de ahi, no de `price`.
     Ajustar solo `price` habria dejado sin efecto el 41% de la carta, en
     silencio. */
  function precioPres(productId, presId, precioBase) {
    var a = _ajustes && _ajustes[productId];
    var v = a && a.pres && a.pres[presId];
    return (v != null) ? Number(v) : Number(precioBase) || 0;
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
      /* Las presentaciones tambien: el precio que se cobra sale de aqui
         cuando el producto se vende por tamaños. */
      if (Array.isArray(p.presentations)) {
        p.presentations.forEach(function (pr) {
          if (!pr || !pr.id) return;
          if (pr.price_base === undefined) pr.price_base = pr.price;
          pr.price = precioPres(p.id, pr.id, pr.price_base);
        });
      }
    });
    return productos || [];
  }

  /* Guardar un ajuste SOLO para esta sucursal. */
  async function ajustar(productId, opts) {
    var s = sb(), b = sucursalActiva();
    if (!s || !b) throw new Error('No se sabe en que sucursal estas');
    var tenantId = (window._pos && window._pos.state && window._pos.state.tenantId) || null;
    var fila = { product_id: productId, branch_id: b, updated_at: new Date().toISOString() };
    /* Solo se manda si se sabe. Mandar null lo pisaria: la columna tiene
       DEFAULT current_tenant_id(), que acierta siempre. En el Catalogo no hay
       pos-core y por tanto no hay tenant a mano. */
    if (tenantId) fila.tenant_id = tenantId;
    if (opts && 'precio' in opts) fila.precio = (opts.precio === null ? null : Number(opts.precio));
    if (opts && 'activo' in opts) fila.activo = opts.activo;
    /* Se manda el mapa COMPLETO de presentaciones ajustadas, no un parche:
       quitar el ajuste de una presentacion es mandarla fuera del mapa. */
    if (opts && 'pres' in opts) {
      var m = opts.pres || {}, limpio = {};
      Object.keys(m).forEach(function (k) { if (m[k] != null) limpio[k] = Number(m[k]); });
      fila.precios_pres = Object.keys(limpio).length ? limpio : null;
    }
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

  /* Lo que esta ajustado hoy para un producto. Lo usa la pantalla para pintar
     los campos sin volver a consultar. */
  function ajustesDe(productId) {
    var a = (_ajustes && _ajustes[productId]) || {};
    return { precio: a.precio != null ? Number(a.precio) : null,
             activo: a.activo != null ? !!a.activo : null,
             pres: a.pres ? JSON.parse(JSON.stringify(a.pres)) : {} };
  }

  window.posCarta = {
    cargar: cargar, aplicar: aplicar,
    precio: precio, precioPres: precioPres,
    activo: activo, ajustado: ajustado, ajustesDe: ajustesDe, precioBase: precioBaseDe,
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
