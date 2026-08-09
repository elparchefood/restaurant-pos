/* pos-saldo.js — cobrar con el saldo que el cliente recargó en la página.
 *
 * El saldo NO es un método de pago tradicional: no entra plata nueva al
 * negocio. El cliente ya te pagó cuando recargó; aquí solo se consume. Por eso
 * vive junto a los puntos y no junto al efectivo.
 *
 * PERO SÍ ES VENTA. La venta ocurre el día que el cliente se come la comida,
 * no el día que recargó (criterio de Sergio, 8-ago-2026). Por eso el cobro
 * entra en pos_payments como cualquier otro y suma en el cuadre de caja; lo
 * que se guarda aparte es la recarga, que no es venta.
 *
 * La plata se mueve SOLO en la base, con `fn_saldo_mover`: bloquea la fila y
 * no deja el saldo en negativo. Este archivo no calcula saldos; solo pregunta
 * y ordena. Si un día cambia la regla, cambia en un solo sitio.
 */
(function (w) {
  'use strict';

  var CTX = { tenantId: null, branchId: null };
  var COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

  function sb() { return w._pos && w._pos.sb; }
  function setCtx(t, b) { CTX.tenantId = t || null; CTX.branchId = b || null; }
  function money(n) { return COP.format(Math.round(Number(n) || 0)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* Cuánto tiene disponible. Devuelve 0 ante cualquier duda: es preferible que
     el cajero vea "sin saldo" y cobre de otra forma, a que el sistema prometa
     un saldo que la base va a rechazar un segundo después. */
  async function disponibles(clienteId) {
    var s = sb();
    if (!s || !clienteId || !CTX.tenantId) return 0;
    try {
      var r = await s.rpc('fn_saldo_cliente', { p_tenant: CTX.tenantId, p_cliente: clienteId });
      var d = r && r.data;
      var fila = Array.isArray(d) ? d[0] : d;
      return Math.max(0, Math.round(Number(fila && fila.saldo) || 0));
    } catch (e) { console.warn('[saldo] no se pudo leer:', e); return 0; }
  }

  /* Descuenta. `ref` es la llave contra el cobro doble: la base tiene un índice
     único por (tenant, referencia), así que si el cajero toca dos veces o se
     cae el internet a mitad, el segundo intento no descuenta otra vez.
     Por eso la referencia lleva el id del pago y no solo el del pedido: un
     pedido puede tener dos abonos con saldo, y son cobros distintos. */
  async function consumir(clienteId, monto, orderId, ref, detalle) {
    var s = sb();
    if (!s) throw new Error('Sin conexión');
    var valor = Math.round(Number(monto) || 0);
    if (valor <= 0) throw new Error('El monto debe ser mayor que cero');
    var r = await s.rpc('fn_saldo_mover', {
      p_tenant: CTX.tenantId, p_cliente: clienteId, p_motivo: 'consumo',
      p_monto: -valor, p_branch: CTX.branchId, p_order: orderId || null,
      p_ref: ref, p_detalle: detalle || 'Pago con saldo',
    });
    if (r && r.error) {
      var m = String(r.error.message || '');
      /* La base grita SALDO_INSUFICIENTE|<tenía>|<pedía>. Se traduce a algo que
         el cajero entienda, con las dos cifras, en vez del error de Postgres. */
      if (m.indexOf('SALDO_INSUFICIENTE') >= 0) {
        var p = m.split('|');
        var e = new Error('Al cliente no le alcanza el saldo.');
        e.codigo = 'SALDO_INSUFICIENTE';
        e.disponible = Math.round(Number(p[1]) || 0);
        e.pedido = Math.round(Number(p[2]) || valor);
        throw e;
      }
      /* Referencia repetida = este cobro YA se hizo. Pasa cuando el cajero toca
         dos veces o se reintenta tras un corte. No es un error: es la prueba de
         que el índice único hizo su trabajo. Se sigue como si hubiera pasado. */
      if (String(r.error.code) === '23505') {
        console.warn('[saldo] cobro repetido, se ignora:', ref);
        return await disponibles(clienteId);
      }
      throw r.error;
    }
    return Math.round(Number(r && r.data) || 0);   // saldo que le queda
  }

  /* Le devuelve el saldo al cliente al anular un pedido: la plata era suya, no
     nuestra. El motivo es 'anulacion' —uno de los que acepta la base— para que
     en el historial se vea POR QUÉ volvió, y no confundirlo con una recarga.
     La referencia lleva ":anul" para no chocar con la del cobro original. */
  async function devolver(clienteId, monto, orderId, ref, detalle) {
    var s = sb();
    if (!s) throw new Error('Sin conexión');
    var valor = Math.round(Number(monto) || 0);
    if (valor <= 0) return 0;
    var r = await s.rpc('fn_saldo_mover', {
      p_tenant: CTX.tenantId, p_cliente: clienteId, p_motivo: 'anulacion',
      p_monto: valor, p_branch: CTX.branchId, p_order: orderId || null,
      p_ref: ref, p_detalle: detalle || 'Devolución por pedido anulado',
    });
    if (r && r.error) {
      /* Ya se le habia devuelto: no se devuelve dos veces. */
      if (String(r.error.code) === '23505') return await disponibles(clienteId);
      throw r.error;
    }
    return Math.round(Number(r && r.data) || 0);
  }

  /* Cuánto se pagó con saldo en un pedido. Se lee de pos_payments, que es
     donde quedó el desglose, para no depender de que quien anula sepa el
     detalle del cobro. */
  async function pagadoEn(orderId) {
    var s = sb();
    if (!s || !orderId) return 0;
    try {
      var r = await s.from('pos_payments').select('amount, method').eq('order_id', orderId);
      var filas = (r && r.data) || [];
      var total = 0;
      filas.forEach(function (f) {
        var m = w.posMetodos && w.posMetodos.resolver(f.method);
        if ((m && m.tipo === 'saldo') || String(f.method) === '__saldo') total += Number(f.amount) || 0;
      });
      return Math.round(total);
    } catch (e) { console.warn('[saldo] no se pudo leer lo pagado:', e); return 0; }
  }

  /* Anular un pedido pagado con saldo: hay que devolvérselo. La plata era del
     cliente, no nuestra — no nos podemos quedar con algo que no es nuestro.
     (Criterio de Sergio, 8-ago-2026.)

     Se pregunta ANTES con una sola ventana que dice las dos cosas: que se va a
     anular y que el saldo vuelve. Y se devuelve DESPUÉS de que la anulación de
     verdad quedó guardada, para no regalarle saldo por un pedido que sigue vivo
     porque falló el guardado.

     Se usa así:
       var permiso = await posSaldo.pedirAnular(id, '¿Anular esta venta?');
       if (!permiso) return;                  // dijo que no
       ...anular el pedido...
       await permiso.devolver();              // ya con la anulación guardada
  */
  async function pedirAnular(orderId, pregunta) {
    var texto = pregunta || '¿Anular este pedido?';
    var monto = 0, clienteId = null, nombre = '';
    try {
      monto = await pagadoEn(orderId);
      if (monto > 0) {
        var s = sb();
        var r = await s.from('pos_orders')
          .select('cliente_id, pos_clientes(nombre)').eq('id', orderId).maybeSingle();
        clienteId = (r && r.data && r.data.cliente_id) || null;
        nombre = (r && r.data && r.data.pos_clientes && r.data.pos_clientes.nombre) || 'el cliente';
      }
    } catch (e) { console.warn('[saldo] no se pudo revisar el pedido:', e); }

    if (monto > 0 && clienteId) {
      texto += '\n\nEste pedido se pagó con ' + money(monto) + ' de saldo.'
             + '\nAl anularlo se le devuelven a ' + nombre + '.';
    } else if (monto > 0) {
      /* Se pagó con saldo pero no sabemos de quién: mejor decirlo que
         devolvérselo a la persona equivocada. */
      texto += '\n\nOJO: este pedido se pagó con ' + money(monto) + ' de saldo y no'
             + '\npudimos identificar al cliente. Tendrás que devolvérselo a mano.';
    }
    if (!w.confirm(texto)) return null;

    return {
      monto: monto,
      devolver: async function () {
        if (monto <= 0 || !clienteId) return 0;
        try {
          return await devolver(clienteId, monto, orderId,
            'pedido:' + orderId + ':anulado', 'Devolución por pedido anulado');
        } catch (e) {
          console.error('[saldo] no se pudo devolver:', e);
          w.alert('El pedido quedó anulado, pero NO se pudo devolver el saldo.\n\n'
                + 'Devuélveselo a mano desde Clientes: ' + money(monto) + ' a ' + nombre + '.');
          return 0;
        }
      },
    };
  }

  /* Devolver lo que se pagó con saldo en un pedido, sin preguntar nada. Para
     las pantallas que YA mostraron su propia ventana de confirmación: volver a
     preguntar algo cuya única respuesta correcta es "sí" solo estorba.
     Devuelve cuánto se devolvió, para poder avisarlo. */
  async function devolverDeOrden(orderId) {
    var monto = await pagadoEn(orderId);
    if (monto <= 0) return 0;
    try {
      var s = sb();
      var r = await s.from('pos_orders').select('cliente_id').eq('id', orderId).maybeSingle();
      var cli = (r && r.data && r.data.cliente_id) || null;
      if (!cli) { console.warn('[saldo] pedido sin cliente, no se puede devolver:', orderId); return 0; }
      await devolver(cli, monto, orderId, 'pedido:' + orderId + ':anulado',
                     'Devolución por pedido anulado');
      return monto;
    } catch (e) { console.error('[saldo] no se pudo devolver:', e); return 0; }
  }

  /* Modal de "no le alcanza el saldo". Solo informa: recargar es un acto del
     cliente en la pagina, no algo que el cajero se salte en el cobro.
     Se le dice cuanto tiene y cuanto falta, porque es justo lo que el cajero
     va a tener que decirle al cliente en voz alta. */
  function modalInsuficiente(op) {
    op = op || {};
    var tiene    = Math.round(Number(op.tiene) || 0);
    var necesita = Math.round(Number(op.necesita) || 0);
    var falta    = Math.max(0, necesita - tiene);
    var nombre   = String(op.nombre || '').trim();
    var apuntado = Math.round(Number(op.yaApuntado) || 0);

    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.5);'
      + 'display:flex;align-items:center;justify-content:center;padding:20px';

    function linea(l, v, color) {
      return '<div style="display:flex;justify-content:space-between;align-items:baseline;'
        + 'padding:7px 0;font-size:13px"><span style="color:#64748B">' + l + '</span>'
        + '<b style="color:' + (color || '#0F172A') + ';font-variant-numeric:tabular-nums">' + v + '</b></div>';
    }

    ov.innerHTML =
      '<div style="background:#fff;border-radius:16px;padding:22px 24px;width:390px;max-width:94vw;'
      + 'font-family:\'DM Sans\',system-ui,sans-serif;box-shadow:0 24px 60px -12px rgba(0,0,0,.35)">'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">'
      +   '<span style="width:36px;height:36px;border-radius:10px;background:#ECFEFF;color:#0891B2;'
      +   'display:flex;align-items:center;justify-content:center">'
      +     '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      +     'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'
      +     '<rect x="2" y="5" width="20" height="14" rx="2.5"/>'
      +     '<rect x="5" y="9.5" width="4.5" height="3.5" rx="1"/>'
      +     '<path d="M15.5 10a3.2 3.2 0 0 1 0 4"/><path d="M18 8.4a6 6 0 0 1 0 7.2"/></svg></span>'
      +   '<div style="font-size:16px;font-weight:800;color:#0F172A">'
      +     (tiene > 0 ? 'No le alcanza el saldo' : 'Este cliente no tiene saldo') + '</div>'
      + '</div>'
      + (nombre ? '<div style="font-size:13px;color:#475569;line-height:1.6;margin-bottom:10px">'
                  + '<b>' + esc(nombre) + '</b></div>' : '')
      + '<div style="background:#F8FAFC;border-radius:11px;padding:6px 13px">'
      +   linea('Tiene', money(tiene))
      +   (apuntado > 0 ? linea('Ya apuntado en este pedido', money(apuntado), '#B45309') : '')
      +   (necesita > 0 ? linea('Se necesita', money(necesita)) : '')
      +   (falta > 0 ? '<div style="border-top:1px solid #E2E8F0">'
                       + linea('Le falta', money(falta), '#DC2626') + '</div>' : '')
      + '</div>'
      + '<div style="font-size:12.5px;color:#64748B;line-height:1.55;margin-top:12px">'
      +   (tiene > 0
          ? 'Cobra <b>' + money(tiene - apuntado > 0 ? tiene - apuntado : 0)
            + '</b> con el saldo y el resto con otro metodo, o pidele que recargue en tu pagina.'
          : 'Puede recargar en tu pagina de clientes. Mientras tanto, cobra con otro metodo.')
      + '</div>'
      + '<button style="width:100%;margin-top:16px;padding:11px;border:none;border-radius:10px;'
      + 'background:#0F172A;color:#fff;font-weight:700;font-size:13.5px;cursor:pointer">Entendido</button>'
      + '</div>';

    ov.querySelector('button').onclick = function () { ov.remove(); };
    ov.onclick = function (e) { if (e.target === ov) ov.remove(); };
    document.body.appendChild(ov);
  }

  w.posSaldo = {
    setCtx: setCtx, disponibles: disponibles, consumir: consumir,
    devolver: devolver, pagadoEn: pagadoEn, pedirAnular: pedirAnular,
    devolverDeOrden: devolverDeOrden, modalInsuficiente: modalInsuficiente,
    money: money, esc: esc,
  };
})(window);
