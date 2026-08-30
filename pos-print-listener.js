// =====================================================================
// pos-print-listener.js — Receptor GLOBAL de impresión (equipo de caja)
//
// Problema que resuelve: la impresión de pedidos creados desde la tablet
// dependía de que el PC estuviera en la pantalla de Ventas (el único lugar
// con el listener realtime). Si la caja estaba en dashboard, caja, informes,
// etc., la comanda no salía.
//
// Este receptor se carga en TODAS las pantallas del POS. Solo actúa en el
// equipo con impresora (Electron); en la tablet/celular queda inerte.
//
//  1. RECEPTOR (principal): escucha INSERT/UPDATE de pos_orders por realtime
//     y ordena imprimir al instante, esté la caja en la pantalla que esté.
//  2. SEÑAL DE REIMPRESIÓN: si otro dispositivo marca reprint_at, se fuerza
//     la reimpresión aunque ya se hubiera impreso antes.
//  3. BARRIDO DE SEGURIDAD (paracaídas): cada 45 s consulta si quedó algún
//     pedido sin imprimir (printed_at IS NULL) por si el realtime perdió la
//     conexión un instante. Consulta mínima (solo ids recientes).
// =====================================================================
(function () {
  function boot() {
    if (!window.electronPOS) return;                 // solo el equipo con impresora
    var sb = window._pos && window._pos.sb;
    if (!sb || typeof window.posAutoprint !== 'function') return;
    if (window.__posPrintListenerOn) return;          // no duplicar por doble carga
    window.__posPrintListenerOn = true;

    /*  ⚠️ EL BARRIDO NO PUEDE MIRAR HACIA ATRÁS DE CUANDO ARRANCÓ.

        Ventana fija de 10 minutos + el cambio de hoy (que el barrido también
        recoja los de salón) = al recargar la caja se reimprimía todo lo que
        estuviera sin marcar de los últimos 10 minutos. Sergio: *«nuevamente
        volvieron a salir comandas del pedido que hice»*. Fue mío.

        Ahora son dos cortes a la vez:
          · una ventana CORTA y rodante (4 min), recalculada en cada pasada;
          · y nunca antes del momento en que este receptor arrancó.

        Con eso, recargar la pantalla ya no puede reimprimir historia: lo de
        antes de arrancar es de otro, y quien tuviera que imprimirlo ya tuvo su
        turno. Lo que sí sigue cubriendo es para lo que existe — un pedido
        hecho mientras esta página cargaba o mientras el aviso en vivo perdió la
        conexión un instante.                                                 */
    var ARRANQUE = Date.now();
    function ventanaDesde() {
      return new Date(Math.max(ARRANQUE, Date.now() - 4 * 60000)).toISOString();
    }
    var _seenReprint = {};   // {orderId: reprint_at} — dedupe de señales

    // Candado anti-bucle: solo la PRIMERA comanda (printed_at nulo). Sin este
    // filtro, el update de printed_at re-disparaba la impresión sin parar.
    // Los ítems agregados a una mesa ocupada se disparan por el listener de
    // pos_order_items (INSERT) más abajo, no por aquí.
    /*  ⚠️ LOS DE SALON CON COBRO ADELANTADO NO LLEVAN `visible_cocina`.

        Sergio, 29-ago-2026, en pleno turno: *«al hacer el pedido no imprimió
        la comanda, la tuve que imprimir manual»*. Comprobado en la base: el
        pedido de las 21:38 tenía `visible_cocina = false`.

        Por qué: con el cobro adelantado encendido, un pedido de salón NO se
        marca `visible_cocina` — se cobra antes y llega a la cocina por ser de
        salón, no por la marca. `cocina.js` ya lo sabía y trae los de salón con
        una consulta aparte; **este receptor nunca recibió el mismo trato**, así
        que exigía una marca que esos pedidos jamás van a tener.

        Y el hueco solo se abre desde la TABLET: el que toma el pedido en el
        computador de la caja imprime por la llamada directa, que no pasa por
        aquí. Desde la tablet no hay llamada directa —no es el equipo con
        impresora— y el receptor lo descartaba. Nadie imprimía.

        Se exige que YA SE HAYA ENVIADO a cocina: un pedido que todavía se está
        armando no puede salir por la impresora.                             */
    var ENVIADOS = ['in_progress', 'ready', 'paid', 'completed', 'pendiente_pago'];
    function yaEnviado(o) { return ENVIADOS.indexOf(String(o && o.status || '')) >= 0; }
    function shouldPrint(o) {
      if (!o || o.printed_at) return false;
      if (o.visible_cocina) return true;
      return String(o.channel || '') === 'salon' && yaEnviado(o);
    }

    function handleRow(o) {
      if (!o || !o.id) return;
      // Señal de reimpresión desde otro dispositivo (tablet): forzar
      if (o.reprint_at && _seenReprint[o.id] !== o.reprint_at) {
        _seenReprint[o.id] = o.reprint_at;
        window.posAutoprint(o.id, { force: true });
        return;
      }
      if (shouldPrint(o)) window.posAutoprint(o.id);
    }

    // Ítems agregados a una mesa ya en cocina: se disparan por la INSERCIÓN de
    // ítems (no por updates del pedido), con anti-rebote para agrupar un lote y
    // no imprimir uno por uno. posAutoprint imprime solo los NO enviados. Esto
    // NO puede entrar en bucle: el marcado es un UPDATE de pos_order_items (no
    // INSERT) y printed_at es de pos_orders (con su candado). Delay > que el
    // primer print del pedido, para que ese ya haya marcado sus ítems.
    var _itemTimers = {};
    function handleItemInsert(row) {
      if (!row || !row.order_id) return;
      var oid = row.order_id;
      if (_itemTimers[oid]) clearTimeout(_itemTimers[oid]);
      _itemTimers[oid] = setTimeout(async function () {
        delete _itemTimers[oid];
        try {
          // Solo disparar si el pedido YA tuvo una comanda (printed_at). Es decir,
          // es una ADICIÓN a una mesa ya enviada. Un pedido nuevo (primera vez) o
          // un borrador guardado sin enviar NO deben imprimir por aquí.
          var r = await sb.from('pos_orders').select('printed_at, status').eq('id', oid).maybeSingle();
          var o = r && r.data;
          if (!o || !o.printed_at) return;
          if (o.status === 'cancelled' || o.status === 'abandoned') return;
          window.posAutoprint(oid);
        } catch (e) { /* silencioso */ }
      }, 2500);
    }

    // Solo los pedidos de esta sucursal: la impresora de un restaurante no
    // tiene nada que ver con los pedidos de otro.
    var _br = window._pos && window._pos.state && window._pos.state.branchId;
    var _fb = _br ? 'branch_id=eq.' + _br : undefined;
    sb.channel('pos-print-listener')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pos_orders', filter: _fb }, function (p) { handleRow(p.new); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pos_orders', filter: _fb }, function (p) { handleRow(p.new); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pos_order_items', filter: _fb }, function (p) { handleItemInsert(p.new); })
      .subscribe();

    // Barrido de seguridad: pedidos visibles sin imprimir (ventana reciente).
    var _sweeping = false;
    async function sweep() {
      if (_sweeping) return;
      _sweeping = true;
      try {
        /* SOLO los de esta sucursal. El aislamiento por restaurante no basta
           aqui: dos sucursales del MISMO dueño comparten tenant, asi que sin
           esto la impresora de una sucursal imprimiria los pedidos de la otra.
           Con una sola sucursal no se nota; con dos, si. */
        var q = sb.from('pos_orders')
          .select('id, reprint_at')
          /*  El mismo criterio del receptor: o lleva la marca, o es de salón
              y ya se envió. Sin esto el paracaídas tampoco los recogía.   */
          .or('visible_cocina.eq.true,and(channel.eq.salon,status.in.(in_progress,ready,paid,pendiente_pago))')
          .is('printed_at', null)
          .gte('created_at', ventanaDesde())
          .not('status', 'in', '("cancelled","abandoned")')
          .order('created_at', { ascending: true })
          .limit(10);
        var _brSweep = window._pos && window._pos.state && window._pos.state.branchId;
        if (_brSweep) q = q.eq('branch_id', _brSweep);
        var r = await q;
        var rows = (r && r.data) || [];
        for (var i = 0; i < rows.length; i++) await window.posAutoprint(rows[i].id);
      } catch (e) { /* silencioso: reintenta en el próximo ciclo */ }
      _sweeping = false;
    }
    setTimeout(sweep, 3000);                          // recuperación al abrir la página
    //  La ventana ya se recalcula sola en cada pasada (`ventanaDesde`), asi
    //  que aqui solo hay que llamar al barrido.
    setInterval(sweep, 45000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) sweep(); });

    console.log('[POS PrintListener] Receptor global de impresión activo');
  }

  if (window._pos && window._pos.on) window._pos.on('core:ready', boot);
  else document.addEventListener('DOMContentLoaded', function () {
    if (window._pos && window._pos.on) window._pos.on('core:ready', boot);
  });
})();
