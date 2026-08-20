-- 2026-08-20 · Los combos también llevan etiqueta
--
-- Sergio: "quiero que en las configuraciones de producto yo pueda colocarle
-- también etiquetas a los combos, es decir etiqueta más vendido, picante, etc.,
-- las etiquetas que tenemos".
--
-- Los productos ya tenían `medalla` y `medalla_valor`; los combos no. Se usan
-- los MISMOS nombres de columna a propósito: la página del cliente ya sabe
-- pintar `medalla` y `medalla_valor`, así que con que el combo los traiga se
-- dibuja igual, sin una segunda manera de hacer lo mismo.
--
-- "Más pedido" NO se puede poner a mano —ni en productos ni en combos—: la pone
-- el sistema con las ventas de verdad, y poder ponerla a mano sería poder
-- mentirle al cliente. Esa regla no cambia.

alter table public.pos_combos add column if not exists medalla text;
alter table public.pos_combos add column if not exists medalla_valor integer;

comment on column public.pos_combos.medalla is
  'La etiqueta que se ve sobre la foto en la página de clientes. Mismos valores que pos_products.medalla.';
