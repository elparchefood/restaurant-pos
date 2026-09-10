-- ════════════════════════════════════════════════════════════════════
--  LA VOZ DE LA COCINA — LAS INSTALACIONES (10-sep-2026)
--
--  Sergio: "vas solo en el plan Pro, con posibilidad en el futuro de
--  colocarlo en el plan Premium junto con lo de marketing. Deja todas las
--  instalaciones cuadradas de una vez para que en el futuro podamos colocar
--  mas voces y no tengamos que desarmar nada: que las voces las podamos
--  traer de varios sitios — archivos hechos por nosotros mismos, ElevenLabs,
--  de muchas partes — y que puedan engancharse, conectarse".
--
--  Y es para TODOS los restaurantes de Cobra (no para El Parche): la voz
--  va por la cuenta de Cobra, como los mapas, con tope de costo.
--
--  LAS PIEZAS:
--    · pos_voces        el CATALOGO. Cada voz dice de donde viene
--                       (`proveedor`) y como se le habla (`config`).
--                       Agregar una voz = agregar una fila.
--    · pos_voz_uso      cuanto gasto cada restaurante al mes, por proveedor.
--    · pos_voz_memoria  audios ya hechos: la misma frase no se paga dos
--                       veces (el archivo va en el deposito privado `voz`).
--    · fn_voz_consumir  el contador con DOS topes (del restaurante y de
--                       Cobra). Solo lo llama el servidor.
--    · 'voz_cocina'     la funcion del plan: Pro y Premium. Pasarla solo a
--                       Premium mañana = quitarla de la lista de Pro.
--  El puerto es UNO: la Edge Function `voz`. Cada proveedor es un enchufe
--  dentro de ella (google, elevenlabs, azure, archivo).
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.pos_voces (
  id           text primary key,                 -- 'google-es-us-neural2-a'
  nombre       text not null,                    -- lo que ve el dueño
  proveedor    text not null,                    -- google | elevenlabs | azure | archivo | ...
  config       jsonb not null default '{}'::jsonb,
  activa       boolean not null default true,
  por_defecto  boolean not null default false,
  orden        integer not null default 100,
  notas        text,
  created_at   timestamptz not null default now()
);
--  Una sola voz por defecto en todo Cobra.
create unique index if not exists pos_voces_un_defecto on public.pos_voces (por_defecto) where por_defecto;
alter table public.pos_voces enable row level security;
drop policy if exists pos_voces_leer on public.pos_voces;
--  El catalogo no guarda llaves (esas viven en los secretos del servidor):
--  cualquiera con sesion lo puede leer para escoger. Escribir, solo Cobra.
create policy pos_voces_leer on public.pos_voces for select to authenticated using (true);
grant select on public.pos_voces to authenticated;

create table if not exists public.pos_voz_uso (
  tenant_id      uuid    not null,
  mes            text    not null,                -- 'YYYY-MM', hora de Bogota
  proveedor      text    not null,
  caracteres     bigint  not null default 0,      -- lo que se le pago al proveedor
  llamadas       integer not null default 0,
  desde_memoria  integer not null default 0,      -- frases que salieron gratis
  primary key (tenant_id, mes, proveedor)
);
alter table public.pos_voz_uso enable row level security;
drop policy if exists pos_voz_uso_leer on public.pos_voz_uso;
create policy pos_voz_uso_leer on public.pos_voz_uso for select to authenticated
  using (tenant_id = public.current_tenant_id());
grant select on public.pos_voz_uso to authenticated;

create table if not exists public.pos_voz_memoria (
  clave          text primary key,                -- sha256(voz|proveedor|config|texto)
  voz_id         text not null,
  texto          text not null,
  ruta           text not null,                   -- objeto en el deposito `voz`
  bytes          integer,
  usos           integer not null default 0,
  created_at     timestamptz not null default now(),
  ultimo_uso_at  timestamptz
);
--  Sin reglas: solo el servidor (service role) la toca.
alter table public.pos_voz_memoria enable row level security;

--  EL CONTADOR. `00000000-...` es la fila de TODO Cobra (el tope global),
--  igual que en los mapas. Se cuentan CARACTERES: es lo que cobran todos
--  los proveedores. El candado de fila evita que dos llamadas a la vez lean
--  el mismo numero y las dos crean que quedaba cupo.
create or replace function public.fn_voz_consumir(
  p_tenant uuid, p_proveedor text, p_caracteres integer,
  p_tope_restaurante bigint, p_tope_global bigint)
returns table(permitido boolean, usado bigint, tope bigint, global boolean)
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_todos uuid := '00000000-0000-0000-0000-000000000000';
  v_mes   text := to_char(now() at time zone 'America/Bogota', 'YYYY-MM');
  v_g     bigint;
  v_t     bigint;
begin
  insert into pos_voz_uso (tenant_id, mes, proveedor) values (v_todos, v_mes, p_proveedor)
    on conflict (tenant_id, mes, proveedor) do nothing;
  insert into pos_voz_uso (tenant_id, mes, proveedor) values (p_tenant, v_mes, p_proveedor)
    on conflict (tenant_id, mes, proveedor) do nothing;
  select u.caracteres into v_g from pos_voz_uso u
   where u.tenant_id = v_todos and u.mes = v_mes and u.proveedor = p_proveedor for update;
  select u.caracteres into v_t from pos_voz_uso u
   where u.tenant_id = p_tenant and u.mes = v_mes and u.proveedor = p_proveedor for update;
  if v_g + p_caracteres > p_tope_global then
    return query select false, v_g, p_tope_global, true; return;
  end if;
  if v_t + p_caracteres > p_tope_restaurante then
    return query select false, v_t, p_tope_restaurante, false; return;
  end if;
  update pos_voz_uso set caracteres = caracteres + p_caracteres, llamadas = llamadas + 1
   where tenant_id = v_todos and mes = v_mes and proveedor = p_proveedor;
  update pos_voz_uso set caracteres = caracteres + p_caracteres, llamadas = llamadas + 1
   where tenant_id = p_tenant and mes = v_mes and proveedor = p_proveedor
   returning caracteres into v_t;
  return query select true, v_t, p_tope_restaurante, false;
end $$;

--  Una frase que salio de la memoria: no cuesta, pero se cuenta.
create or replace function public.fn_voz_desde_memoria(p_tenant uuid, p_proveedor text)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_mes text := to_char(now() at time zone 'America/Bogota', 'YYYY-MM');
begin
  insert into pos_voz_uso (tenant_id, mes, proveedor, desde_memoria) values (p_tenant, v_mes, p_proveedor, 1)
    on conflict (tenant_id, mes, proveedor) do update set desde_memoria = pos_voz_uso.desde_memoria + 1;
end $$;

--  El proveedor fallo (o no esta conectado): lo contado se devuelve, a los
--  dos contadores, porque nadie cobro por ese audio.
create or replace function public.fn_voz_devolver(p_tenant uuid, p_proveedor text, p_caracteres integer)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_mes text := to_char(now() at time zone 'America/Bogota', 'YYYY-MM');
begin
  update pos_voz_uso set caracteres = greatest(0, caracteres - p_caracteres), llamadas = greatest(0, llamadas - 1)
   where mes = v_mes and proveedor = p_proveedor
     and tenant_id in (p_tenant, '00000000-0000-0000-0000-000000000000'::uuid);
end $$;

revoke all on function public.fn_voz_devolver(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.fn_voz_devolver(uuid, text, integer) to service_role;
revoke all on function public.fn_voz_consumir(uuid, text, integer, bigint, bigint) from public, anon, authenticated;
grant execute on function public.fn_voz_consumir(uuid, text, integer, bigint, bigint) to service_role;
revoke all on function public.fn_voz_desde_memoria(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_voz_desde_memoria(uuid, text) to service_role;

--  El deposito de los audios: PRIVADO. Nadie baja un audio directo; el
--  servidor lo lee y se lo entrega a quien tenga sesion y plan.
insert into storage.buckets (id, name, public) values ('voz', 'voz', false)
  on conflict (id) do nothing;

--  La funcion del plan: Pro y Premium.
update pos_planes set funciones = array_append(funciones, 'voz_cocina')
 where plan in ('pro', 'premium') and not ('voz_cocina' = any(funciones));

--  Guardas.
do $$
begin
  if not exists (select 1 from pos_planes where plan = 'pro' and 'voz_cocina' = any(funciones)) then
    raise exception 'el plan Pro quedo sin voz_cocina';
  end if;
  if exists (select 1 from pos_planes where plan = 'starter' and 'voz_cocina' = any(funciones)) then
    raise exception 'la voz se colo en Starter';
  end if;
end $$;
