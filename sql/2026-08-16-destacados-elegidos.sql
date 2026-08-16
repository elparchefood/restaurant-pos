-- Los productos destacados de la pagina, elegidos a mano (16-ago).
--
-- Hasta hoy los tres destacados se escogian solos: el plato mas caro CON FOTO de
-- cada categoria. Servia para que la pagina no saliera vacia el primer dia, pero
-- el dueño es quien sabe que quiere vender esta semana.
--
-- Una lista de ids en `tenants` y no una marca en `pos_products` porque el ORDEN
-- importa (son tres puestos, y el primero es el que mas se mira) y una columna
-- booleana no guarda orden. Ademas asi el limite de tres vive en un solo sitio.
--
-- VACIO SIGUE SIENDO AUTOMATICO: un restaurante que nunca entre aqui sigue
-- viendo su pagina llena, igual que hoy. Y si el dueño elige uno solo, los otros
-- dos puestos se llenan solos.

alter table tenants add column if not exists web_destacados jsonb not null default '[]'::jsonb;

comment on column tenants.web_destacados is
  'Los ids de los productos destacados de la pagina, EN ORDEN, maximo 3. '
  'Lista vacia = se escogen solos (el plato mas caro con foto de cada categoria).';


-- Y fn_web_publica la devuelve (ver el repo para la version completa).
