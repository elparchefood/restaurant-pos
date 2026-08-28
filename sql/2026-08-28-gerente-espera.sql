/*  LO QUE EL BOT LE PIDIÓ AL GERENTE Y TODAVÍA NO LLEGA.

    Con botones aparece un problema que con texto no existía: si el bot
    pregunta «¿cuántos galones?», el «2» que llega después no significa nada
    por sí solo. Hay que recordar de qué se estaba hablando.

    Una fila por gerente y sede, que se pisa cada vez: no es un historial, es
    una nota de «voy por aquí». Se borra al usarla, y si queda colgada,
    caduca sola — un dato viejo haciendo creer que se preguntó algo hace una
    hora es peor que no tener nada.                                        */
create table if not exists pos_gerente_espera (
  branch_id  uuid not null,
  telefono   text not null,
  dato       text not null,
  creado_at  timestamptz not null default now(),
  primary key (branch_id, telefono)
);
alter table pos_gerente_espera enable row level security;

comment on column pos_gerente_espera.dato is
  'Qué se está esperando. Ej: cant:<insumo_id> = la cantidad de ese insumo.';
