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
