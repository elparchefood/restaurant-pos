-- ══════════════════════════════════════════════════════════════════════
--  DOMICILIARIOS — lo que Cobra necesita para alimentar su app
--  (21-ago-2026, reglas de Sergio en PLAN-APP-DOMICILIARIO.md)
--
--  Nada de esto cambia como funciona Cobra hoy: todo lo nuevo nace con el
--  valor que reproduce el comportamiento actual.
-- ══════════════════════════════════════════════════════════════════════

-- ── 1. Datos del domiciliario (OPCIONALES) ────────────────────────────
--  Regla de Sergio: obligatorio solo el nombre y las credenciales. Estos
--  se dejan disponibles por si un restaurante los quiere llenar; vacios
--  si no. En un accidente o un reclamo, saber que moto era vale oro.
alter table pos_users add column if not exists documento text;
alter table pos_users add column if not exists vehiculo  text;
alter table pos_users add column if not exists placa     text;

-- ── 2. El dinero: interruptor EN EL ROL ───────────────────────────────
--  'por_pedido' = el domiciliario entrega la plata de cada pedido al
--                 volver; entra como una venta normal (lo de hoy).
--  'al_final'   = trae todo al terminar el turno. La venta se cuenta
--                 IGUAL, pero la caja tiene que informar cuanto efectivo
--                 lleva encima y debe entregar.
alter table pos_roles add column if not exists domi_dinero text
  not null default 'por_pedido'
  check (domi_dinero in ('por_pedido','al_final'));

-- ── 3. Las empresas de domicilio externo ──────────────────────────────
--  NADA de "Rapid" escrito a fuego: es la que usa El Parche hoy, mañana
--  puede ser otra y cada restaurante usara la suya. Es SOLO informativo:
--  sirve para saber con quien se fue el domicilio, no cambia ningun
--  calculo.
create table if not exists pos_domi_empresas (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  nombre     text not null,
  telefono   text,
  activa     boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists ux_domi_empresa_nombre
  on pos_domi_empresas (tenant_id, lower(nombre));

alter table pos_domi_empresas enable row level security;
drop policy if exists domi_empresas_tenant on pos_domi_empresas;
create policy domi_empresas_tenant on pos_domi_empresas
  using (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid);
grant select, insert, update, delete on pos_domi_empresas to authenticated;
revoke all on pos_domi_empresas from anon;

-- ── 4. A QUIEN se le asigno el pedido ─────────────────────────────────
--  `domiciliario` ya existia pero guarda el NOMBRE en texto: con eso la
--  app no puede responder "cuales pedidos son mios" sin equivocarse (dos
--  Juanes, un nombre mal escrito, un cambio de nombre). El id si es
--  estable. El texto se conserva: lo leen pantallas que ya existen.
alter table pos_orders add column if not exists domiciliario_id uuid;
alter table pos_orders add column if not exists domi_empresa_id uuid;

--  El indice que de verdad usa la app: "mis pedidos de hoy".
create index if not exists ix_orders_domiciliario
  on pos_orders (domiciliario_id, delivery_status)
  where domiciliario_id is not null;

-- ── 5. Donde cae la ubicacion que manda la app ────────────────────────
create table if not exists pos_domi_ubicaciones (
  id              bigint generated always as identity primary key,
  tenant_id       uuid not null,
  domiciliario_id uuid not null,
  order_id        uuid,
  lat             double precision not null,
  lng             double precision not null,
  created_at      timestamptz not null default now()
);
create index if not exists ix_domi_ubic_reciente
  on pos_domi_ubicaciones (domiciliario_id, created_at desc);

alter table pos_domi_ubicaciones enable row level security;
drop policy if exists domi_ubic_tenant on pos_domi_ubicaciones;
create policy domi_ubic_tenant on pos_domi_ubicaciones
  using (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid);
grant select, insert on pos_domi_ubicaciones to authenticated;
revoke all on pos_domi_ubicaciones from anon;

--  La marca de "ya entrego esa plata en caja".  La columna va ANTES de la funcion que la usa.
alter table pos_orders add column if not exists domi_entregado_caja boolean not null default false;

-- ── 6. EL EFECTIVO QUE LLEVA ENCIMA CADA DOMICILIARIO ─────────────────
--  Solo cuenta el de los roles marcados 'al_final': los de 'por_pedido'
--  entregan al volver y su plata ya esta en la caja.
--  Se cuenta lo ENTREGADO y cobrado en efectivo desde que abrio la caja,
--  que es el mismo corte que usa el arqueo.
create or replace function fn_domi_efectivo_pendiente(p_branch uuid, p_desde timestamptz default null)
returns table (
  domiciliario_id uuid,
  nombre          text,
  pedidos         bigint,
  efectivo        numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select u.id, u.name, count(o.id),
         coalesce(sum(coalesce(o.total,0) + coalesce(o.delivery_fee,0)), 0)
    from pos_orders o
    join pos_users  u on u.id = o.domiciliario_id
    left join pos_roles r on r.id = u.role_id
   where o.branch_id = p_branch
     and o.delivery_status = 'entregado'
     and coalesce(o.domi_entregado_caja, false) = false
     and lower(coalesce(o.payment_method, 'efectivo')) like '%efectivo%'
     and coalesce(r.domi_dinero, 'por_pedido') = 'al_final'
     and (p_desde is null or o.delivered_at >= p_desde)
   group by u.id, u.name
   having count(o.id) > 0;
$function$;

revoke all on function fn_domi_efectivo_pendiente(uuid, timestamptz) from public;
grant execute on function fn_domi_efectivo_pendiente(uuid, timestamptz) to authenticated, service_role;
