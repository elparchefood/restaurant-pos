-- "No es un barrio": lo que el dueño rechaza queda MARCADO, no borrado.
-- Borrarlo no servia: la misma frase volvia a la lista en cuanto otro cliente
-- escribia algo parecido. Las tres puertas que aprenden barrios (delay-reply,
-- web-acceso y la campana) miran esta columna.
alter table pos_domi_aprendidos
  add column if not exists descartado boolean not null default false;

-- Solo se consultan los pendientes; el indice parcial es el que se usa siempre.
create index if not exists ix_domi_aprend_pend
  on pos_domi_aprendidos (branch_id) where descartado = false;

notify pgrst, 'reload schema';
