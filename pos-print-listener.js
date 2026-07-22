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

    // Al arrancar, recuperar hasta 10 min hacia atrás (pedidos hechos mientras
    // esta página cargaba o el equipo estaba en otra pantalla sin receptor).
    var sinceIso = new Date(Date.now() - 10 * 60000).toISOString();
    var _seenReprint = {};   // {orderId: reprint_at} — dedupe de señales

    function shouldPrint(o) { return o && o.visible_cocina && !o.printed_at; }

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

    sb.channel('pos-print-listener')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pos_orders' }, function (p) { handleRow(p.new); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pos_orders' }, function (p) { handleRow(p.new); })
      .subscribe();

    // Barrido de seguridad: pedidos visibles sin imprimir (ventana reciente).
    var _sweeping = false;
    async function sweep() {
      if (_sweeping) return;
      _sweeping = true;
      try {
        var r = await sb.from('pos_orders')
          .select('id, reprint_at')
          .eq('visible_cocina', true)
          .is('printed_at', null)
          .gte('created_at', sinceIso)
          .not('status', 'in', '("cancelled","abandoned")')
          .order('created_at', { ascending: true })
          .limit(10);
        var rows = (r && r.data) || [];
        for (var i = 0; i < rows.length; i++) await window.posAutoprint(rows[i].id);
      } catch (e) { /* silencioso: reintenta en el próximo ciclo */ }
      _sweeping = false;
    }
    setTimeout(sweep, 3000);                          // recuperación al abrir la página
    setInterval(function () {
      // mantener la ventana del barrido siempre "reciente" (últimos 10 min)
      sinceIso = new Date(Date.now() - 10 * 60000).toISOString();
      sweep();
    }, 45000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) sweep(); });

    console.log('[POS PrintListener] Receptor global de impresión activo');
  }

  if (window._pos && window._pos.on) window._pos.on('core:ready', boot);
  else document.addEventListener('DOMContentLoaded', function () {
    if (window._pos && window._pos.on) window._pos.on('core:ready', boot);
  });
})();
