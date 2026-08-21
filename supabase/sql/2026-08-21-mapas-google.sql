-- ══════════════════════════════════════════════════════════════════════
--  MAPAS DE GOOGLE — cada restaurante conecta SU cuenta  (21-ago-2026)
--
--  DECISION DE SERGIO: el mapa es de Google, y cada restaurante lo paga
--  con SU tarjeta. Asi Cobra no carga con el costo de nadie.
--
--  PRECIOS VERIFICADOS HOY (cambian: volver a mirarlos antes de prometer
--  nada). Google retiro el credito de 200 USD/mes en marzo de 2025 y
--  ahora cada API tiene su propio cupo gratis, que NO se comparte:
--      Geocodificacion  10.000/mes gratis, luego 5 USD por mil
--      Mapa estatico    10.000/mes gratis, luego 2 USD por mil
--      Mapa dinamico    10.000/mes gratis, luego 7 USD por mil
--
--  Por eso Cobra usa el MAPA ESTATICO y le dibuja los puntos encima:
--  es el mas barato y ademas deja la llave del lado del servidor. Y la
--  geocodificacion se guarda para siempre: una direccion se le pregunta
--  a Google UNA sola vez en la vida.
-- ══════════════════════════════════════════════════════════════════════

-- ── 1. LA LLAVE DE CADA RESTAURANTE ───────────────────────────────────
--  Va CIFRADA, y ademas la tabla no se puede leer desde el navegador.
--  Si la llave se filtra, el consumo se lo cobran al restaurante: no es
--  un dato mas de configuracion, es su tarjeta.
create table if not exists pos_mapas_config (
  tenant_id      uuid primary key references tenants(id) on delete cascade,
  clave_cifrada  text,
  clave_pista    text,        -- los ultimos 4 caracteres, para que reconozca cual puso
  activo         boolean not null default false,
  tope_mes       integer not null default 9000,   -- se frena ANTES de los 10.000 gratis
  conectada_at   timestamptz,
  ultimo_error   text,
  updated_at     timestamptz not null default now()
);

comment on table pos_mapas_config is
  'La llave de Google Maps de cada restaurante, cifrada. NO se lee desde el navegador: solo la Edge Function `mapa` con service_role.';
comment on column pos_mapas_config.tope_mes is
  'Cuantas llamadas se permiten al mes antes de frenar. Por defecto 9.000, debajo de las 10.000 gratis de Google: un dueno de restaurante no puede descubrir un cobro por algo que hizo el sistema.';

alter table pos_mapas_config enable row level security;
--  Sin politicas: nadie con el rol del navegador entra. Solo service_role,
--  que se salta RLS por definicion.
revoke all on pos_mapas_config from anon, authenticated;

-- ── 2. EL CONTADOR DEL MES ────────────────────────────────────────────
create table if not exists pos_mapas_uso (
  tenant_id  uuid not null,
  mes        text not null,          -- 'AAAA-MM'
  sku        text not null,          -- 'geocoding' | 'static'
  n          integer not null default 0,
  primary key (tenant_id, mes, sku)
);
revoke all on pos_mapas_uso from anon, authenticated;

-- ── 3. LAS DIRECCIONES YA UBICADAS ────────────────────────────────────
--  A Google se le pregunta UNA sola vez por direccion, y la respuesta se
--  guarda para siempre. Un restaurante reparte a las mismas casas todos
--  los dias: sin esta tabla se pagaria la misma pregunta mil veces.
--
--  Se guarda por DIRECCION, no por cliente: uno pide a la casa y a la
--  oficina, y son dos puntos distintos.
create table if not exists pos_direcciones_geo (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null,
  clave       text not null,     -- la direccion normalizada, es por donde se busca
  direccion   text,
  barrio      text,
  lat         double precision not null,
  lng         double precision not null,
  --  De donde salio el punto, de mas confiable a menos:
  --    'domiciliario' = lo marco su celular en la puerta del cliente
  --    'cliente'      = el cliente mando su ubicacion por WhatsApp
  --    'google'       = lo calculo Google a partir del texto
  origen      text not null default 'google',
  veces       integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, clave)
);
create index if not exists ix_direcciones_geo_tenant
  on pos_direcciones_geo (tenant_id);

alter table pos_direcciones_geo enable row level security;
drop policy if exists direcciones_geo_tenant on pos_direcciones_geo;
create policy direcciones_geo_tenant on pos_direcciones_geo
  using (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid);
grant select, insert, update on pos_direcciones_geo to authenticated;
revoke all on pos_direcciones_geo from anon;

-- ── 4. CONSUMIR UNA LLAMADA, CON TOPE ─────────────────────────────────
--  Suma y responde si se puede o no, en una sola operacion: dos pedidos
--  al mismo tiempo no pueden colarse los dos por el ultimo cupo.
create or replace function fn_mapas_consumir(p_tenant uuid, p_sku text, p_n integer default 1)
returns table (permitido boolean, usado integer, tope integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tope integer;
  v_mes  text := to_char(now() at time zone 'America/Bogota', 'YYYY-MM');
  v_n    integer;
begin
  select coalesce(c.tope_mes, 9000) into v_tope
    from pos_mapas_config c where c.tenant_id = p_tenant;
  if v_tope is null then v_tope := 9000; end if;

  insert into pos_mapas_uso (tenant_id, mes, sku, n)
  values (p_tenant, v_mes, p_sku, 0)
  on conflict (tenant_id, mes, sku) do nothing;

  --  El candado de la fila evita que dos llamadas simultaneas lean el
  --  mismo numero y las dos crean que quedaba cupo.
  select u.n into v_n from pos_mapas_uso u
   where u.tenant_id = p_tenant and u.mes = v_mes and u.sku = p_sku
     for update;

  if v_n + p_n > v_tope then
    return query select false, v_n, v_tope;
    return;
  end if;

  update pos_mapas_uso u set n = u.n + p_n
   where u.tenant_id = p_tenant and u.mes = v_mes and u.sku = p_sku
   returning u.n into v_n;

  return query select true, v_n, v_tope;
end;
$function$;

revoke all on function fn_mapas_consumir(uuid, text, integer) from public;
grant execute on function fn_mapas_consumir(uuid, text, integer) to service_role;

-- ── 5. COMO VA EL MES ─────────────────────────────────────────────────
--  Esta SI la puede ver el dueno: es su consumo. Nunca devuelve la llave.
create or replace function fn_mapas_estado(p_tenant uuid)
returns table (
  activo    boolean,
  pista     text,
  tope      integer,
  geocoding integer,
  estatico  integer,
  error     text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    coalesce(c.activo, false),
    c.clave_pista,
    coalesce(c.tope_mes, 9000),
    coalesce((select u.n from pos_mapas_uso u
               where u.tenant_id = p_tenant and u.sku = 'geocoding'
                 and u.mes = to_char(now() at time zone 'America/Bogota', 'YYYY-MM')), 0),
    coalesce((select u.n from pos_mapas_uso u
               where u.tenant_id = p_tenant and u.sku = 'static'
                 and u.mes = to_char(now() at time zone 'America/Bogota', 'YYYY-MM')), 0),
    c.ultimo_error
  from (select 1) x
  left join pos_mapas_config c on c.tenant_id = p_tenant;
$function$;

revoke all on function fn_mapas_estado(uuid) from public;
grant execute on function fn_mapas_estado(uuid) to authenticated, service_role;

-- ── 6. GUARDAR UN PUNTO QUE NO COSTO NADA ─────────────────────────────
--  El punto que marca el domiciliario al entregar, o el que manda el
--  cliente por WhatsApp, valen MAS que el de Google y son gratis. Este
--  procedimiento respeta esa jerarquia: un punto de Google nunca pisa
--  uno puesto por una persona que estaba parada en la puerta.
create or replace function fn_direccion_guardar(
  p_tenant uuid, p_clave text, p_direccion text, p_barrio text,
  p_lat double precision, p_lng double precision, p_origen text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rank_nuevo int := case p_origen when 'domiciliario' then 3 when 'cliente' then 2 else 1 end;
  v_rank_viejo int;
begin
  select case g.origen when 'domiciliario' then 3 when 'cliente' then 2 else 1 end
    into v_rank_viejo
    from pos_direcciones_geo g
   where g.tenant_id = p_tenant and g.clave = p_clave;

  if v_rank_viejo is null then
    insert into pos_direcciones_geo (tenant_id, clave, direccion, barrio, lat, lng, origen)
    values (p_tenant, p_clave, p_direccion, p_barrio, p_lat, p_lng, p_origen);
  elsif v_rank_nuevo >= v_rank_viejo then
    update pos_direcciones_geo
       set lat = p_lat, lng = p_lng, origen = p_origen,
           direccion = coalesce(p_direccion, direccion),
           barrio = coalesce(p_barrio, barrio),
           veces = veces + 1, updated_at = now()
     where tenant_id = p_tenant and clave = p_clave;
  else
    update pos_direcciones_geo set veces = veces + 1
     where tenant_id = p_tenant and clave = p_clave;
  end if;
end;
$function$;

revoke all on function fn_direccion_guardar(uuid, text, text, text, double precision, double precision, text) from public;
grant execute on function fn_direccion_guardar(uuid, text, text, text, double precision, double precision, text) to authenticated, service_role;

-- ── 7. CAMBIAR EL TOPE (lo hace el dueno desde la pantalla) ───────────
--  El tope SI se puede escribir desde el navegador: es un numero suyo, no
--  un secreto. La llave no: esa solo la toca la Edge Function.
--  El restaurante se saca del TOKEN, no de lo que mande la pantalla: si no,
--  cualquiera podria dejar sin mapa a otro restaurante cambiando un numero.
create or replace function fn_mapas_tope(p_tenant uuid, p_tope integer)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v integer := greatest(100, least(10000, coalesce(p_tope, 9000)));
begin
  if p_tenant is distinct from (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid then
    raise exception 'No puedes cambiar la configuracion de otro restaurante';
  end if;
  insert into pos_mapas_config (tenant_id, tope_mes) values (p_tenant, v)
  on conflict (tenant_id) do update set tope_mes = v, updated_at = now();
  return v;
end;
$function$;

revoke all on function fn_mapas_tope(uuid, integer) from public;
grant execute on function fn_mapas_tope(uuid, integer) to authenticated;
