// =================================================
// pos-realtime.js — Sincronización entre dispositivos
// Escucha cambios en Supabase y emite eventos internos
// =================================================

window._pos.on('core:ready', () => {

  const sb = window._pos.sb;

  // Escuchar cambios en pedidos
  sb.channel('pos_orders')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_orders' }, payload => {
      console.log('[Realtime] Pedido actualizado:', payload);
      window._pos.emit('order:updated', payload.new);

      // Auto-imprimir comanda en escritorio (Electron) cuando otro dispositivo crea un pedido.
      // La tablet no tiene electronPOS, así que nunca entra aquí — el escritorio imprime por ella.
      // Si el escritorio está en tomar-pedido.html, ese módulo ya llama posAutoprint, no duplicar.
      if (
        payload.eventType === 'INSERT' &&
        window.electronPOS &&
        typeof posAutoprint === 'function' &&
        !window.location.pathname.includes('tomar-pedido')
      ) {
        posAutoprint(payload.new.id);
      }
    })
    .subscribe();

  // Escuchar cambios en ítems de pedido
  sb.channel('pos_order_items')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_order_items' }, payload => {
      console.log('[Realtime] Ítem actualizado:', payload);
    })
    .subscribe();

  // Escuchar cambios en mesas
  sb.channel('pos_tables')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_tables' }, payload => {
      console.log('[Realtime] Mesa actualizada:', payload);
      window._pos.emit('table:updated', payload.new);
    })
    .subscribe();

  console.log('[POS Realtime] Subscripciones activas');
});
