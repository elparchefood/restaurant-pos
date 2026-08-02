-- ═══════════════════════════════════════════════════════════════════════
-- MULTI-MARCA — Fase 1: la base
--
-- Decisión de Sergio (2026-08-02): la carta es de la MARCA, con ajustes por
-- local. Es decir: una marca tiene su carta y esa carta viaja a todos los
-- locales donde la marca opere; cada local puede cambiarle el precio a un
-- producto o desactivarlo, sin tocar la carta de la marca.
--
-- REGLA DE PRECEDENCIA (esto es lo que había que decidir y queda escrito):
--   El ajuste del local MANDA cuando existe.
--   Si el local no tiene fila de ajuste, o la tiene con precio NULL,
--   se aplica el precio base de la marca.
-- Un ajuste nunca se "hereda" hacia atrás: cambiar el precio base de la
-- marca NO pisa los locales que ya tienen ajuste propio.
--
-- Caso que esto habilita (food court): varias marcas en UN local, con UNA
-- caja. Por eso marca↔sucursal es N a N, no la relación 1 a 1 de hoy.
--
-- TODO ES ADITIVO. Ninguna columna se borra y `pos_products.branch_id` se
-- queda donde está: hoy lo usan 48 tablas y media aplicación. El sistema
-- sigue funcionando igual mientras la lectura no se cambie.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1) Qué marcas operan en cada local ────────────────────────────────
-- Hoy `branches.brand_id` amarra un local a UNA marca. En un food court son
-- varias, así que la relación vive en su propia tabla. `branches.brand_id`
-- se conserva como la marca principal del local (y para no romper nada).
create table if not exists public.pos_marca_sucursal (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  brand_id    uuid not null references public.brands(id)   on delete cascade,
  branch_id   uuid not null references public.branches(id) on delete cascade,
  activa      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (brand_id, branch_id)
);
comment on table public.pos_marca_sucursal is
  'Qué marcas operan en cada local. N a N: un food court tiene varias marcas en un mismo local con una sola caja.';

-- Las marcas que ya existen quedan operando en su local de siempre.
insert into public.pos_marca_sucursal (tenant_id, brand_id, branch_id)
select b.tenant_id, b.brand_id, b.id
  from public.branches b
 where b.brand_id is not null
on conflict (brand_id, branch_id) do nothing;

-- ── 2) La carta es de la marca ────────────────────────────────────────
alter table public.pos_products  add column if not exists brand_id uuid references public.brands(id);
alter table public.pos_categories add column if not exists brand_id uuid references public.brands(id);

comment on column public.pos_products.brand_id is
  'Dueña de la carta. El precio de aquí es el BASE; cada local puede ajustarlo en pos_producto_sucursal.';

-- Los 53 productos actuales pasan a ser de la marca de su local.
update public.pos_products p
   set brand_id = b.brand_id
  from public.branches b
 where b.id = p.branch_id and p.brand_id is null and b.brand_id is not null;

update public.pos_categories c
   set brand_id = b.brand_id
  from public.branches b
 where b.id = c.branch_id and c.brand_id is null and b.brand_id is not null;

-- ── 3) El ajuste por local ────────────────────────────────────────────
-- Una fila SOLO cuando el local se aparta de la carta de la marca. Sin fila
-- = manda la marca. Así no hay que duplicar 53 productos por local para
-- cambiarle el precio a uno.
create table if not exists public.pos_producto_sucursal (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  product_id  uuid not null references public.pos_products(id) on delete cascade,
  branch_id   uuid not null references public.branches(id)     on delete cascade,
  precio      numeric,          -- NULL = no se ajusta el precio, manda la marca
  activo      boolean,          -- NULL = no se ajusta, manda la marca
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (product_id, branch_id)
);
comment on table public.pos_producto_sucursal is
  'Ajustes de un local sobre la carta de su marca. Solo existe fila cuando el local se aparta. NULL en una columna = ese dato no se ajusta y manda el de la marca.';

-- ── 4) Cada pedido sabe de qué marca es ───────────────────────────────
-- Sin esto no se puede separar la venta por marca en el cierre de caja, que
-- es justo lo que un food court necesita para repartir la plata.
alter table public.pos_orders add column if not exists brand_id uuid references public.brands(id);
comment on column public.pos_orders.brand_id is
  'Marca a la que pertenece la venta. Se usa para separar ventas por marca en el cierre de caja.';

update public.pos_orders o
   set brand_id = b.brand_id
  from public.branches b
 where b.id = o.branch_id and o.brand_id is null and b.brand_id is not null;

-- ── 5) Cada cocina es de su marca ─────────────────────────────────────
-- En un food court cada marca tiene su cocina: la comanda tiene que salir
-- por la impresora de SU marca, no por la del vecino.
alter table public.pos_printers add column if not exists brand_id uuid references public.brands(id);
comment on column public.pos_printers.brand_id is
  'Marca dueña de esta impresora. NULL = sirve a todas las marcas del local (caso de una sola marca).';

-- ── 6) El menú EFECTIVO de un local ───────────────────────────────────
-- Un solo sitio que resuelve la precedencia, para que ninguna pantalla la
-- reimplemente a su manera y terminen cobrando precios distintos.
create or replace view public.v_carta_sucursal as
select
  p.id                                   as product_id,
  ms.branch_id,
  p.brand_id,
  br.name                                as marca,
  p.name,
  p.category_id,
  coalesce(ps.precio, p.price)           as precio,
  coalesce(ps.activo, p.available, true) as activo,
  (ps.precio is not null)                as precio_ajustado,
  p.price                                as precio_base
from public.pos_products p
join public.brands br             on br.id = p.brand_id
join public.pos_marca_sucursal ms on ms.brand_id = p.brand_id and ms.activa
left join public.pos_producto_sucursal ps
       on ps.product_id = p.id and ps.branch_id = ms.branch_id;

comment on view public.v_carta_sucursal is
  'La carta que de verdad ve un local: la de sus marcas, con los ajustes del local ya aplicados. El precio de aquí es el que se cobra.';

-- ── 7) Permisos ───────────────────────────────────────────────────────
-- Las pantallas entran como `authenticated` y las Edge Functions como
-- `service_role`. Olvidar esto ya reventó dos veces en pleno servicio.
grant select, insert, update, delete on public.pos_marca_sucursal    to authenticated, service_role;
grant select, insert, update, delete on public.pos_producto_sucursal to authenticated, service_role;
grant select on public.v_carta_sucursal to authenticated, service_role;

-- ── 8) Índices para lo que se consulta a cada rato ────────────────────
create index if not exists ix_prod_brand   on public.pos_products(brand_id);
create index if not exists ix_ms_branch    on public.pos_marca_sucursal(branch_id);
create index if not exists ix_ps_branch    on public.pos_producto_sucursal(branch_id);
create index if not exists ix_orders_brand on public.pos_orders(brand_id);
