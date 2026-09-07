/*  ══ EL LECTOR NUEVO, CORRIENDO A LA SOMBRA ══════════════════════════════

    PASO 1 del plan que Sergio aprobo: el lector nuevo corre EN PARALELO, no
    decide nada, y solo queda anotado cuando NO coincide con el actual. Con
    unas noches de servicio real se sabe si de verdad gana, y entonces se le
    da el mando — o no.

    ESTO NO ES UNA FUNCION DEL PRODUCTO. Es una tabla de medicion, temporal.
    Cuando se decida, se borra. Nadie la ve, no aparece en ninguna pantalla y
    no cambia el comportamiento de nada.

    Se guarda en una tabla y no en el registro porque los registros de las
    funciones duran horas y esto hay que mirarlo durante varias noches.       */

create table if not exists pos_lector_sombra (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  tenant_id     uuid,
  conversation_id uuid,
  texto         text,          -- lo que escribio el cliente, tal cual
  eligio_viejo  text,          -- el plato que escogio el sistema de hoy
  eligio_nuevo  text,          -- el que escogeria el lector nuevo
  candidatos    text,          -- si el nuevo NO se decide, entre cuales dudaba
  coinciden     boolean,
  ms            integer        -- cuanto tardo el lector nuevo
);

comment on table pos_lector_sombra is
  'MEDICION TEMPORAL (7-sep-2026). El lector de productos nuevo corriendo en '
  'paralelo al actual, sin decidir nada. Solo se escriben las veces que NO '
  'coinciden. Se borra cuando se decida si el nuevo toma el mando.';

create index if not exists ix_lector_sombra_fecha on pos_lector_sombra (created_at desc);

/*  Nadie la lee desde el navegador: la escribe el servidor y la consulto yo.
    Sin politicas de lectura, que es lo mas seguro para una tabla de trabajo. */
alter table pos_lector_sombra enable row level security;
