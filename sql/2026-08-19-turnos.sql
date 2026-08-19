-- ═══════════════════════════════════════════════════════════════════════════
-- TURNOS DE CONSUMO — lo que de verdad se gasta, contra lo que dice la receta
--
-- Idea de Sergio (18-ago): hay insumos imposibles de controlar por receta (el
-- maiz, el ripio, las salsas) porque la mano de quien sirve manda mas que el
-- papel. Se abre turno diciendo con cuanto se empieza, se cierra diciendo con
-- cuanto se termina, y el sistema despeja cuanto se gasto DE VERDAD en cada
-- plato — y recomienda la porcion real, por producto y por presentacion.
-- ═══════════════════════════════════════════════════════════════════════════

-- Que insumos entran al turno. No tiene sentido pesar 41 cosas cada noche.
alter table iv_insumos add column if not exists turno_control boolean not null default false;

create table if not exists iv_turnos (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  branch_id    uuid not null,
  estado       text not null default 'abierto',   -- abierto | cerrado | descartado
  abierto_en   timestamptz not null default now(),
  cerrado_en   timestamptz,
  abierto_por  text,          -- telefono del gerente
  cerrado_por  text,
  nota         text
);
create index if not exists ix_turnos_abierto on iv_turnos (branch_id, estado, abierto_en desc);

create table if not exists iv_turno_lineas (
  id          uuid primary key default gen_random_uuid(),
  turno_id    uuid not null references iv_turnos(id) on delete cascade,
  insumo_id   uuid not null,
  -- Todo en UNIDAD DE COMPRA, igual que el resto del inventario.
  inicio      numeric,        -- lo que habia al abrir
  fin         numeric,        -- lo que quedo al cerrar
  repuesto    numeric not null default 0,  -- lo que entro durante el turno
  teorico     numeric,        -- lo que decian las recetas de lo vendido
  real_gasto  numeric,        -- inicio + repuesto - fin
  unique (turno_id, insumo_id)
);

-- Cada vez que se acepta una recomendacion queda el rastro: de cuanto a
-- cuanto, por que turno, y quien lo aprobo. Sin esto no hay como devolverse.
create table if not exists iv_receta_ajustes (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  branch_id    uuid,
  turno_id     uuid references iv_turnos(id) on delete set null,
  receta_id    uuid not null,
  insumo_id    uuid not null,
  product_id   uuid,
  presentacion text,          -- id de la presentacion dentro de `cantidades`
  cantidad_antes numeric,
  cantidad_nueva numeric,
  motivo       text,          -- 'turno' | 'manual'
  aprobado_por text,
  created_at   timestamptz not null default now()
);
create index if not exists ix_receta_ajustes_turno on iv_receta_ajustes (turno_id);

grant select, insert, update, delete on iv_turnos, iv_turno_lineas, iv_receta_ajustes to service_role, authenticated;

alter table iv_turnos          enable row level security;
alter table iv_turno_lineas    enable row level security;
alter table iv_receta_ajustes  enable row level security;

drop policy if exists turnos_tenant on iv_turnos;
create policy turnos_tenant on iv_turnos for all
  using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());

drop policy if exists turno_lineas_tenant on iv_turno_lineas;
create policy turno_lineas_tenant on iv_turno_lineas for all
  using (exists (select 1 from iv_turnos t where t.id = turno_id and t.tenant_id = current_tenant_id()))
  with check (exists (select 1 from iv_turnos t where t.id = turno_id and t.tenant_id = current_tenant_id()));

drop policy if exists receta_ajustes_tenant on iv_receta_ajustes;
create policy receta_ajustes_tenant on iv_receta_ajustes for all
  using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());

notify pgrst, 'reload schema';
