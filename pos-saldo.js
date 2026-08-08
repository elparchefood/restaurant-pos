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

  w.posSaldo = {
    setCtx: setCtx, disponibles: disponibles, consumir: consumir,
    devolver: devolver, pagadoEn: pagadoEn, pedirAnular: pedirAnular,
    devolverDeOrden: devolverDeOrden, money: money, esc: esc,
  };
})(window);
