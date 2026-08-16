-- "Que ve el cliente": los 5 interruptores de la pantalla Mi pagina web (16-ago).
--
-- Una columna jsonb y no cinco columnas booleanas: la lista va a crecer (ya
-- estan pedidos los destacados y la publicidad), y cada seccion nueva de la
-- pagina seria una migracion mas. Con un jsonb se agrega una llave y ya.
--
-- LO QUE FALTA MANDA: si una llave no esta, se muestra. Al reves, el dia que se
-- agregue una seccion nueva quedaria apagada para todos los restaurantes que ya
-- existen, sin que nadie la hubiera apagado.

alter table tenants add column if not exists web_visible jsonb not null default '{}'::jsonb;

comment on column tenants.web_visible is
  'Que secciones ve el cliente en la pagina: {"puntos":true,"canje":true,'
  '"nivel":true,"saldo":true,"carta":true}. Lo que falte se considera ENCENDIDO.';
