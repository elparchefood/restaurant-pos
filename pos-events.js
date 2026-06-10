// =================================================
// pos-events.js — Registro de eventos del sistema
// Los módulos se comunican via window._pos.emit() / .on()
// =================================================

/*
  EVENTOS DISPONIBLES:

  core:ready          → Core listo, rol detectado           { role }
  order:new           → Pedido nuevo creado                 { order }
  order:updated       → Pedido actualizado                  { order }
  order:ready         → Cocina marcó pedido como listo      { orderId }
  order:paid          → Pedido cobrado y cerrado            { orderId }
  table:updated       → Estado de una mesa cambió           { table }
  session:opened      → Turno de caja abierto               { session }
  session:closed      → Turno de caja cerrado               { session }
*/

console.log('[POS Events] Sistema de eventos listo');
