// ══════════════════════════════════════════════════════════════════
// PUNTOS COMO MÉTODO DE PAGO
//
// Regla de Sergio, textual: "ante el sistema nada fue gratis, simplemente se
// usaron puntos para hacer el pago. Y solo aplica para productos que estén
// dentro del catálogo; si se quiere pagar con puntos un producto que no está,
// debe aparecer la alerta".
//
// Por eso NO se descuenta un valor suelto: se eligen los PRODUCTOS del pedido
// que se van a pagar con puntos, y el pago que se registra vale exactamente lo
// que valen esos productos en pesos. La venta sigue existiendo, la caja cuadra
// y el inventario descuenta igual. Solo cambia con qué se pagó.
// ══════════════════════════════════════════════════════════════════
(function () {
  var _tenant = null, _branch = null;
  var _cat = [];      // pos_puntos_catalogo
  var _prods = {};    // id -> {presentations, variables}

  function sb() { return (window._pos && window._pos.sb) || null; }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  }
  function tel10(s) {
    var d = String(s == null ? '' : s).replace(/[^0-9]/g, '');
    return d.length > 10 ? d.slice(-10) : d;
  }
  function setCtx(t, b) { _tenant = t; _branch = b; }

  async function cargar() {
    var s = sb(); if (!s || !_tenant) return;
    var r = await s.from('pos_puntos_catalogo').select('*').eq('tenant_id', _tenant).eq('activo', true);
    _cat = r.data || [];
    if (!_cat.length) return;
    var ids = [];
    _cat.forEach(function (f) { if (ids.indexOf(f.product_id) < 0) ids.push(f.product_id); });
    var rp = await s.from('pos_products').select('id,presentations,variables').in('id', ids);
    (rp.data || []).forEach(function (p) { _prods[p.id] = p; });
  }

  async function disponibles(tel) {
    var s = sb(), t = tel10(tel);
    if (!s || !_tenant || t.length < 7) return 0;
    var r = await s.from('pos_puntos').select('puntos')
      .eq('tenant_id', _tenant).ilike('telefono', '%' + t).maybeSingle();
    return (r.data && Number(r.data.puntos)) || 0;
  }

  /* Resolver la presentación vendida a su id. Mismo problema (y misma solución
     en tres pasos) que en el descuento de inventario: el pedido guarda el
     NOMBRE y aquí hace falta el id, y hay productos cuya única presentación
     tiene el nombre vacío. */
  function presIdDe(prod, item) {
    var press = (prod && prod.presentations) || [];
    var quiere = norm((item.selections && item.selections.pres) || '');
    for (var i = 0; i < press.length; i++) {
      if (norm(press[i].name) === quiere) return press[i].id || '';
    }
    if (press.length === 1) return press[0].id || '';
    var nom = norm(item.name || '');
    for (var j = 0; j < press.length; j++) {
      var pn = norm(press[j].name);
      if (pn && nom.indexOf(pn) >= 0) return press[j].id || '';
    }
    return null;
  }

  // Las variantes elegidas, ¿están permitidas en ese canje?
  function variantesOk(fila, item) {
    if (!fila.variantes) return true;              // null = todas
    var elegidas = (item.selections && item.selections.vars) || {};
    for (var gid in fila.variantes) {
      if (!Object.prototype.hasOwnProperty.call(fila.variantes, gid)) continue;
      var permitidas = fila.variantes[gid] || [];
      var sel = elegidas[gid];
      if (!sel) continue;                          // no eligió de ese grupo
      if (permitidas.indexOf(sel.id) < 0) return false;
    }
    return true;
  }

  /* Cuántos puntos cuesta UNA unidad de este ítem, o null si no se puede pagar
     con puntos. El motivo se devuelve para poder decírselo al cajero. */
  function canjeDe(item) {
    if (!item || !item.productId) return { ok: false, motivo: 'no está en el catálogo de puntos' };
    var filas = _cat.filter(function (f) { return f.product_id === item.productId; });
    if (!filas.length) return { ok: false, motivo: 'no está en el catálogo de puntos' };

    var prod = _prods[item.productId];
    var pid = presIdDe(prod, item);
    var fila = null;
    for (var i = 0; i < filas.length; i++) {
      var fp = filas[i].pres_id || '';
      if (fp === (pid || '')) { fila = filas[i]; break; }
    }
    if (!fila) return { ok: false, motivo: 'ese tamaño no se puede pagar con puntos' };
    if (!variantesOk(fila, item)) return { ok: false, motivo: 'esa variante no entra en el canje' };
    return { ok: true, puntos: Number(fila.puntos) || 0, fila: fila };
  }

  async function consumir(tel, puntos, orderId, detalle, quien) {
    var s = sb();
    var r = await s.rpc('fn_puntos_consumir', {
      p_tenant: _tenant, p_branch: _branch, p_telefono: tel10(tel),
      p_puntos: puntos, p_order: orderId, p_detalle: detalle || null, p_quien: quien || null,
    });
    if (r.error) {
      var m = String(r.error.message || '');
      if (m.indexOf('PUNTOS_INSUFICIENTES') >= 0) {
        var p = m.split('PUNTOS_INSUFICIENTES|')[1] || '';
        var xs = p.split('|');
        var e = new Error('Puntos insuficientes');
        e.codigo = 'PUNTOS_INSUFICIENTES';
        e.disponible = parseInt(xs[0], 10) || 0;
        e.pedidos = parseInt(xs[1], 10) || 0;
        throw e;
      }
      throw r.error;
    }
    return r.data;
  }

  /* Modal para elegir qué productos del pedido se pagan con puntos.
     Los que NO se pueden se muestran igual, apagados y CON EL MOTIVO: esconder
     un producto solo haría que el cajero no entienda por qué no aparece. */
  function modalCanje(items, saldo, onOk) {
    var filas = items.map(function (it) {
      var c = canjeDe(it);
      return { it: it, ok: c.ok, puntos: c.puntos || 0, motivo: c.motivo || '' };
    });
    var canjeables = filas.filter(function (f) { return f.ok; });

    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;padding:20px';

    function money(n) { return '$' + Number(n || 0).toLocaleString('es-CO'); }
    function pinta() {
      var sel = [].slice.call(ov.querySelectorAll('.pp-chk:checked'));
      var pts = 0, pesos = 0;
      sel.forEach(function (ch) {
        pts += Number(ch.dataset.pts) || 0;
        pesos += Number(ch.dataset.pesos) || 0;
      });
      var falta = pts > saldo;
      ov.querySelector('#pp-tot').innerHTML =
          '<div style="display:flex;justify-content:space-between;font-size:13px">'
        +   '<span style="color:#64748B">Puntos a usar</span>'
        +   '<b style="color:' + (falta ? '#DC2626' : '#7C3AED') + '">' + pts.toLocaleString('es-CO') + '</b></div>'
        + '<div style="display:flex;justify-content:space-between;font-size:12px;margin-top:3px">'
        +   '<span style="color:#94A3B8">Le quedan</span>'
        +   '<span style="color:' + (falta ? '#DC2626' : '#64748B') + '">'
        +     (falta ? 'no alcanza · tiene ' + saldo.toLocaleString('es-CO')
                     : (saldo - pts).toLocaleString('es-CO')) + '</span></div>'
        + '<div style="display:flex;justify-content:space-between;font-size:12px;margin-top:3px">'
        +   '<span style="color:#94A3B8">Equivale a</span>'
        +   '<span style="color:#64748B">' + money(pesos) + '</span></div>';
      ov.querySelector('#pp-ok').disabled = (pts <= 0 || falta);
    }

    ov.innerHTML =
      '<div style="background:#fff;border-radius:16px;width:440px;max-width:94vw;max-height:88vh;display:flex;flex-direction:column;font-family:\'DM Sans\',system-ui,sans-serif;box-shadow:0 24px 60px -12px rgba(0,0,0,.35)">'
      + '<div style="padding:18px 20px 12px">'
      +   '<div style="font-size:15px;font-weight:800;color:#0F172A">Pagar con puntos</div>'
      +   '<div style="font-size:12.5px;color:#64748B;margin-top:4px;line-height:1.5">'
      +     'El cliente tiene <b style="color:#7C3AED">' + saldo.toLocaleString('es-CO') + ' puntos</b>. '
      +     'Elige qué productos paga con ellos.</div>'
      + '</div>'
      + '<div style="flex:1;overflow:auto;padding:0 20px">'
      + (filas.length ? filas.map(function (f, i) {
          var pesos = (Number(f.it.qty) || 1) * (Number(f.it.unitPrice) || 0);
          if (!f.ok) {
            return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #F1F5F9;opacity:.55">'
              + '<span style="width:15px"></span>'
              + '<span style="flex:1;min-width:0"><span style="font-size:13px;color:#334155">'
              +   esc(f.it.name) + '</span>'
              + '<span style="display:block;font-size:11.5px;color:#B45309">' + esc(f.motivo) + '</span></span>'
              + '<span style="font-size:12px;color:#94A3B8">' + money(pesos) + '</span></div>';
          }
          var ptsTot = f.puntos * (Number(f.it.qty) || 1);
          return '<label style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #F1F5F9;cursor:pointer">'
            + '<input type="checkbox" class="pp-chk" data-i="' + i + '" data-pts="' + ptsTot + '"'
            +   ' data-pesos="' + pesos + '" style="width:15px;height:15px;accent-color:#5B6BFF">'
            + '<span style="flex:1;min-width:0"><span style="font-size:13px;color:#0F172A;font-weight:600">'
            +   esc(f.it.name) + '</span>'
            + '<span style="display:block;font-size:11.5px;color:#94A3B8">' + money(pesos) + '</span></span>'
            + '<span style="font-weight:800;font-size:12.5px;color:#7C3AED;background:#F5F3FF;border:1px solid #DDD6FE;padding:3px 8px;border-radius:7px;white-space:nowrap">'
            +   ptsTot.toLocaleString('es-CO') + ' pts</span></label>';
        }).join('')
        : '<div style="padding:24px;text-align:center;color:#94A3B8;font-size:12.5px">Este pedido no tiene productos.</div>')
      + (canjeables.length ? '' :
          '<div style="margin:14px 0;padding:11px 13px;border-radius:10px;background:#FFFBEB;border:1px solid #FDE68A;font-size:12.5px;color:#92400E;line-height:1.5">'
        + 'Ninguno de estos productos está en el catálogo de puntos. Se pueden agregar en '
        + '<b>Configuración → Puntos</b>.</div>')
      + '</div>'
      + '<div style="padding:14px 20px;border-top:1px solid #F1F5F9">'
      +   '<div id="pp-tot" style="margin-bottom:12px"></div>'
      +   '<div style="display:flex;gap:8px">'
      +     '<button id="pp-cancel" style="flex:1;padding:11px;border-radius:10px;border:1px solid #E2E8F0;background:#fff;color:#475569;font-weight:700;font-size:13px;cursor:pointer">Cancelar</button>'
      +     '<button id="pp-ok" disabled style="flex:1;padding:11px;border-radius:10px;border:0;background:#5B6BFF;color:#fff;font-weight:800;font-size:13px;cursor:pointer">Usar puntos</button>'
      +   '</div>'
      + '</div></div>';

    document.body.appendChild(ov);
    ov.querySelectorAll('.pp-chk').forEach(function (ch) { ch.addEventListener('change', pinta); });
    pinta();

    function cerrar() { ov.remove(); }
    ov.querySelector('#pp-cancel').onclick = cerrar;
    ov.onclick = function (e) { if (e.target === ov) cerrar(); };
    ov.querySelector('#pp-ok').onclick = function () {
      var sel = [].slice.call(ov.querySelectorAll('.pp-chk:checked'));
      var pts = 0, pesos = 0, nombres = [];
      sel.forEach(function (ch) {
        pts += Number(ch.dataset.pts) || 0;
        pesos += Number(ch.dataset.pesos) || 0;
        nombres.push(filas[Number(ch.dataset.i)].it.name);
      });
      cerrar();
      onOk({ puntos: pts, pesos: pesos, detalle: nombres.join(', ') });
    };
  }

  function modalInsuficiente(e) {
    alert('Puntos insuficientes.\n\nEl cliente tiene ' + (e.disponible || 0)
      + ' y se necesitan ' + (e.pedidos || 0) + '.');
  }

  window.posPuntos = {
    setCtx: setCtx, cargar: cargar, disponibles: disponibles,
    canjeDe: canjeDe, consumir: consumir,
    modalCanje: modalCanje, modalInsuficiente: modalInsuficiente,
    hayCatalogo: function () { return _cat.length > 0; },
    esc: esc, tel10: tel10,
  };
})();
