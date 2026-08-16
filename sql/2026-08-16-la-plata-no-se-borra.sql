-- ══════════════ LA PLATA DE UN CLIENTE NO SE BORRA EN SILENCIO ══════════════
-- Caso real (16-ago): Sergio recargo $50.000 el 7-ago y quedo con $55.000
-- (bono Estandar). El 14-ago su ficha de cliente fue borrada y recreada — y
-- pos_saldo, pos_saldo_mov y pos_recargas_solicitudes tenian ON DELETE CASCADE
-- sobre cliente_id: al irse la ficha se fueron el saldo, sus movimientos y todo
-- el rastro. Nadie se entero, y en la pagina el cliente vio $0.
--
-- Regla: borrar un cliente NO puede destruir su plata. Con RESTRICT, la base
-- IMPIDE borrar a quien tenga saldo o movimientos; primero hay que devolverle
-- o poner en cero su saldo, que es una decision de una persona, no un efecto
-- colateral de un DELETE.
--
-- (pos_web_credenciales SI se queda en CASCADE: una contraseña sin dueño no
--  sirve para nada y no es plata.)

ALTER TABLE pos_saldo                DROP CONSTRAINT IF EXISTS pos_saldo_cliente_id_fkey;
ALTER TABLE pos_saldo                ADD  CONSTRAINT pos_saldo_cliente_id_fkey
  FOREIGN KEY (cliente_id) REFERENCES pos_clientes(id) ON DELETE RESTRICT;

ALTER TABLE pos_saldo_mov            DROP CONSTRAINT IF EXISTS pos_saldo_mov_cliente_id_fkey;
ALTER TABLE pos_saldo_mov            ADD  CONSTRAINT pos_saldo_mov_cliente_id_fkey
  FOREIGN KEY (cliente_id) REFERENCES pos_clientes(id) ON DELETE RESTRICT;

ALTER TABLE pos_recargas_solicitudes DROP CONSTRAINT IF EXISTS pos_recargas_solicitudes_cliente_id_fkey;
ALTER TABLE pos_recargas_solicitudes ADD  CONSTRAINT pos_recargas_solicitudes_cliente_id_fkey
  FOREIGN KEY (cliente_id) REFERENCES pos_clientes(id) ON DELETE RESTRICT;

COMMENT ON TABLE pos_saldo IS
  'Saldo recargado por cliente. RESTRICT a proposito: no se puede borrar un cliente con saldo (16-ago).';
