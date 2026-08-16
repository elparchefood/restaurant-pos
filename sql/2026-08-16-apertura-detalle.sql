-- De donde salio la base de apertura (16-ago).
--
-- La caja ahora se puede abrir sumando tres cosas: plata que pone el cajero,
-- un arqueo contado a mano, y lo que quedo en el cajon del cierre anterior
-- (eligiendo que denominaciones deja y cuales saca).
--
-- `opening_cash` guarda el TOTAL, que es lo que necesita el cuadre. Pero al ver
-- "$121.700" mañana nadie sabria si el cajero puso plata suya o si eso venia
-- del cajon — y esa es justo la pregunta cuando algo no cuadra.

alter table pos_sessions add column if not exists apertura_detalle jsonb;

comment on column pos_sessions.apertura_detalle is
  'De donde salio la base: {puesto, contado, heredado, arqueo:[{denom,qty}], '
  'dejadas:[{denom,qty}]}. Vacio = apertura vieja, de antes de las tres fuentes.';
