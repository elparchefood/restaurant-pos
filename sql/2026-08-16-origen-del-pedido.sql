-- De donde vino el pedido (16-ago).
--
-- La pantalla "Mi pagina web" muestra cuantos pedidos entraron POR LA PAGINA, y
-- hasta hoy eso no se podia saber: web-pedido guardaba `channel` como
-- "domicilio" o "rapido", exactamente igual que un pedido tomado en la caja.
--
-- `channel` dice COMO se entrega (salon, domicilio, rapido) y eso no cambia.
-- `origen` dice POR DONDE entro (caja, web, chat). Son dos preguntas distintas
-- y por eso son dos columnas: mezclarlas obligaria a inventar un canal falso
-- ("web") que despues romperia los informes de domicilios.
--
-- Los pedidos viejos quedan sin marcar y asi se queda: no hay forma de saber a
-- posteriori cuales fueron por la pagina, y rellenarlo a ojo seria inventar.
-- Por eso la tarjeta dice "desde que publicaste".

alter table pos_orders add column if not exists origen text;

comment on column pos_orders.origen is
  'Por donde entro el pedido: web | chat | caja. Vacio = viejo o desde la caja. '
  'No confundir con `channel`, que dice como se entrega.';

create index if not exists ix_pos_orders_origen
  on pos_orders (tenant_id, origen, created_at desc)
  where origen is not null;
