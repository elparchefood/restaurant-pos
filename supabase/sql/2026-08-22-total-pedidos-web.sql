-- ══════════════════════════════════════════════════════════════════════
--  EL TOTAL DE LOS PEDIDOS DE LA PÁGINA NO INCLUÍA EL DOMICILIO
--  (22-ago-2026, hallado revisando el pedido de Angela)
--
--  `web-pedido` guardaba total = comida + empaque, SIN el domicilio. Todos
--  los demás caminos (caja, chat) guardan total = lo que el cliente paga,
--  domicilio incluido.
--
--  El cierre de caja hace `total_final = total − domicilio` para sacar la
--  comida (regla: el domicilio nunca es una venta). Con un total que ya
--  venía sin domicilio, restaba un domicilio que no estaba: la venta de
--  Angela contaba $23.000 en vez de $29.000.
--
--  Se repara cada pedido de la página que tenga domicilio: total pasa a ser
--  comida + domicilio. `total_final` (solo comida) NO se toca.
-- ══════════════════════════════════════════════════════════════════════
update pos_orders
   set total = total_final + delivery_fee
 where origen = 'web'
   and coalesce(delivery_fee, 0) > 0
   and total_final is not null
   and total < total_final + delivery_fee
returning customer_name, total_final as comida, delivery_fee as domicilio, total as nuevo_total;
