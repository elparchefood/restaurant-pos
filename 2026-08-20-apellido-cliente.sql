-- 2026-08-20 · El apellido del cliente
--
-- Sergio: "la app no pide apellido, debe pedir apellido en el registro inicial
-- y tambien se puede cambiar en el perfil".
--
-- POR QUE `nombre` SIGUE SIENDO EL NOMBRE COMPLETO:
-- Veinte archivos del sistema leen `pos_clientes.nombre` — la comanda que se
-- imprime en cocina, Paco, los informes, el buscador del POS, los avisos. Si
-- `nombre` pasara a ser solo el nombre de pila, el apellido dejaria de verse en
-- todos esos sitios salvo que se toquen los veinte, y bastaria olvidar uno para
-- que el mismo cliente saliera con apellido en una pantalla y sin el en otra.
--
-- Asi que `nombre` guarda "Sergio Abadia" —y todo el sistema gana el apellido
-- sin tocar una sola linea— y `apellido` guarda "Abadia" aparte, para poder
-- volver a separarlos al editar sin adivinar donde parte un nombre compuesto
-- ("Jose Antonio Muñoz" no se parte por el primer espacio).
--
-- Es un dato derivado a proposito. Quien edite el nombre desde el POS puede
-- dejar `apellido` viejo; se recompone solo la proxima vez que el cliente lo
-- edite desde su perfil.

alter table public.pos_clientes add column if not exists apellido text;

comment on column public.pos_clientes.apellido is
  'Solo el apellido. `nombre` sigue teniendo el nombre completo, que es lo que lee todo el sistema.';
