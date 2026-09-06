-- ══ PUNTOS POR MENCIONARNOS EN UNA HISTORIA ════════════════════════════════
--
-- Sergio, 6-sep-2026. La regla la puso el:
--   · 5 puntos por historia, SIN tope de cuantas
--   · se acreditan cuando la historia CUMPLE sus 24 horas
--   · si la borra antes, no hay puntos: "tiene que dejar que se venza"
--
-- ── COMO SE SABE SI LA BORRO ──────────────────────────────────────────────
-- Meta NO avisa cuando alguien borra una historia. Lo unico que hay es el
-- enlace de la mencion. Se midio con una historia de verdad ese mismo dia:
--
--     13:32  200  video/mp4     <- viva
--     13:33  200
--     13:34  200
--     13:35  200
--     13:36  404                <- Sergio la borro
--
-- Viva responde 200; borrada, 404 en menos de un minuto. Con eso la regla se
-- resuelve mirando el reloj, sin que Meta tenga que avisar nada.
--
-- ── POR QUE TRES REVISIONES Y NO UNA ──────────────────────────────────────
-- Con una sola consulta a las 23 h no se distingue "la borro" de "el enlace
-- de Meta caduco solo", y le quitariamos los puntos a quien hizo todo bien.
-- Con tres (1 h, 12 h, 23 h) el patron se delata: si TODAS mueren a la misma
-- edad, es el enlace y no la gente. Solo se comprobo que aguanta 4 minutos;
-- que aguante 23 h es justo lo que estas revisiones van a averiguar.
--
-- ── LA TABLA YA EXISTIA ───────────────────────────────────────────────────
-- `pos_historias` estaba creada de un plan anterior, VACIA y sin que ningun
-- codigo la nombrara. No se borra: se amplia. Y su candado
-- `ux_historias_unica (tenant_id, red, historia_id)` se deja tal cual — es
-- mejor que el que yo iba a poner, porque incluye la red: una historia de
-- Instagram y una de TikTok con el mismo id no se pisan.

alter table public.pos_historias
  add column if not exists branch_id       uuid,
  add column if not exists conversation_id uuid,
  add column if not exists media_url       text,
  add column if not exists revisiones      jsonb not null default '[]'::jsonb,
  add column if not exists estado          text  not null default 'vigilando',
  add column if not exists acreditada_at   timestamptz,
  add column if not exists nota            text;

comment on column public.pos_historias.estado is
  'vigilando · acreditada · borrada · sin_cliente · error';
comment on column public.pos_historias.revisiones is
  'Cada consulta al enlace: [{cuando, edad_h, codigo}]. Es el rastro que permite '
  'saber si un 404 fue la persona borrando o el enlace de Meta caducando solo.';

-- Para que el reloj encuentre en un salto las que le toca revisar.
create index if not exists ix_historias_vigilando
  on public.pos_historias (estado, creado) where estado = 'vigilando';

-- ── PERMISOS ──────────────────────────────────────────────────────────────
-- ⚠️ GRANT y POLITICA son cosas distintas. La tabla ya traia las dos bien
-- puestas; se reafirman por si acaso, que sale gratis y es el fallo que mas
-- veces nos ha costado horas (pos_facturas, pos_tarjetas).
grant select on public.pos_historias to authenticated;
grant select, insert, update on public.pos_historias to service_role;

-- ── LA GUARDA ─────────────────────────────────────────────────────────────
do $guarda$
declare
  n int;
begin
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='pos_historias'
     and column_name in ('estado','revisiones','media_url','conversation_id','branch_id','acreditada_at','nota');
  if n <> 7 then raise exception 'faltan columnas nuevas en pos_historias (hay %)', n; end if;

  if not has_table_privilege('service_role', 'public.pos_historias', 'INSERT') then
    raise exception 'service_role no puede INSERTar en pos_historias';
  end if;
  if not has_table_privilege('service_role', 'public.pos_historias', 'UPDATE') then
    raise exception 'service_role no puede ACTUALIZAR pos_historias';
  end if;

  select count(*) into n from pg_indexes
   where schemaname='public' and indexname='ux_historias_unica';
  if n <> 1 then raise exception 'se perdio el candado contra pagar dos veces la misma historia'; end if;

  select count(*) into n from pg_indexes
   where schemaname='public' and indexname='ix_historias_vigilando';
  if n <> 1 then raise exception 'falta el indice que usa el reloj'; end if;

  select count(*) into n from pg_policies
   where schemaname='public' and tablename='pos_historias';
  if n < 1 then raise exception 'pos_historias quedo sin politica de tenant'; end if;

  raise notice 'pos_historias ampliada: columnas, permisos, candado e indice — todo en su sitio';
end
$guarda$;
