-- Las medallas de los destacados de la pagina de clientes (16-ago).
--
-- Cuatro medallas, y solo TRES se ponen a mano. "Mas pedido" sale de las ventas
-- de verdad: si el dueño pudiera ponerla donde quisiera, dejaria de significar
-- algo y el cliente aprenderia a no creerle.
--
-- YA APLICADO EN PRODUCCION. Queda aqui para el proximo restaurante.

alter table pos_products add column if not exists medalla text;

comment on column pos_products.medalla is
  'Medalla que se muestra en la pagina de clientes: nuevo | para2 | dosxuno. '
  'Vacio = ninguna. "Mas pedido" NO va aqui: esa sale sola de las ventas.';

-- fn_web_carta calcula "mas_pedido" UNA vez por restaurante (no una consulta de
-- ventas por cada plato) y devuelve por producto:
--
--   'medalla', coalesce(nullif(p.medalla, ''),
--              case when p.id = v_top then 'mas_pedido' end)
--
-- donde v_top es el producto con mas unidades vendidas en 60 dias, con un minimo
-- de 10 unidades: con tres ventas "el mas pedido" no dice nada.
-- Manda siempre la medalla que puso el dueño; la dorada solo llena el hueco.
