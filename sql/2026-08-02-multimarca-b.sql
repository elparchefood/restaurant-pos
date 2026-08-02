-- ═══════════════════════════════════════════════════════════════════════
-- MULTI-MARCA — Fase 1b: corregir el modelo y agregar lo que falta
--
-- CORRECCIÓN DE UN ERROR MÍO. En la fase 1 creé `pos_marca_sucursal` (N a N)
-- pensando en un food court: varias marcas compartiendo un local y una caja.
-- El modelo de Sergio es otro y lo explicó claro:
--
--   Una SUCURSAL pertenece a UNA marca. A una persona se le asignan una o
--   varias sucursales DENTRO de su marca. Entre marcas no se comparte nada,
--   ni siquiera la vista de informes.
--
-- Eso ya lo resuelve `branches.brand_id`, que existe desde el principio.
-- Dejar la tabla N a N crea DOS fuentes de verdad sobre qué marca opera
-- dónde, y eso termina en datos mezclados. Se elimina.
--
-- (Un food court con dos marcas en la misma dirección se modela como dos
-- sucursales, una por marca, con la misma dirección. Cada una con su caja.)
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1) La carta efectiva, ahora colgando de branches.brand_id ─────────
create or replace view public.v_carta_sucursal as
select
  p.id                                   as product_id,
  s.id                                   as branch_id,
  p.brand_id,
  br.name                                as marca,
  p.name,
  p.category_id,
  coalesce(ps.precio, p.price)           as precio,
  coalesce(ps.activo, p.available, true) as activo,
  (ps.precio is not null)                as precio_ajustado,
  p.price                                as precio_base
from public.pos_products p
join public.brands   br on br.id = p.brand_id
join public.branches s  on s.brand_id = p.brand_id
left join public.pos_producto_sucursal ps
       on ps.product_id = p.id and ps.branch_id = s.id;

drop table if exists public.pos_marca_sucursal;

-- ── 2) Los roles son POR MARCA ────────────────────────────────────────
-- "Sólo se va a poder asignar roles dentro de una marca". Sin esta columna
-- los roles de una marca aparecerían en la otra.
alter table public.pos_roles add column if not exists brand_id uuid references public.brands(id);
comment on column public.pos_roles.brand_id is
  'Marca dueña del rol. Los roles de una marca y otra son independientes y jamás se mezclan.';

update public.pos_roles r
   set brand_id = b.id
  from public.brands b
 where b.tenant_id = r.tenant_id and r.brand_id is null;

-- ── 3) El dominio de correo de cada marca ─────────────────────────────
-- El gerente escribe el usuario ("sergioabadia") y el sistema completa
-- "@elparchefood.cobrapos.app". Se guarda en la marca, no se deriva del
-- nombre al vuelo: si mañana se renombra la marca, los logins existentes
-- no se pueden romper.
--
-- POR QUÉ LLEVA `cobrapos.app` Y NO SOLO `elparchefood.com`: el correo es
-- único en TODO el sistema de acceso, no por restaurante. Dos clientes
-- distintos con un restaurante llamado igual generarían el mismo dominio y
-- el segundo no podría crear a sus empleados. Con el sufijo propio eso no
-- puede pasar. El empleado nunca lo ve: en el login solo escribe su usuario.
alter table public.brands add column if not exists email_domain text;
comment on column public.brands.email_domain is
  'Dominio para los logins de esta marca (ej. elparchefood.cobrapos.app). Solo identificador, no es un buzón real. Editable.';

update public.brands
   set email_domain = regexp_replace(
         translate(lower(name), 'áéíóúñü', 'aeiounu'),
         '[^a-z0-9]', '', 'g') || '.cobrapos.app'
 where email_domain is null;

create unique index if not exists ux_brands_email_domain on public.brands(email_domain);

-- ── 4) Los límites de cada plan, en la base y no en el código ─────────
-- Así Sergio puede cambiar un límite sin que nadie toque código, que es la
-- regla de "nada quemado".
create table if not exists public.pos_planes (
  plan            text primary key,
  nombre          text not null,
  max_marcas      integer,   -- NULL = sin límite
  max_sucursales  integer,
  max_usuarios    integer,
  mensajes_ia     integer not null default 0,
  dian_incluidos  integer not null default 0,
  chat_ia         boolean not null default false,
  puntos          boolean not null default false,
  admin_whatsapp  boolean not null default false,
  orden           integer not null default 0
);
comment on table public.pos_planes is
  'Límites de cada plan comercial. Vive en la base para poder ajustarlo sin tocar código.';

insert into public.pos_planes
  (plan, nombre, max_marcas, max_sucursales, max_usuarios, mensajes_ia, dian_incluidos, chat_ia, puntos, admin_whatsapp, orden)
values
  ('starter', 'Starter', 1,    1,    5,        0,     0, false, false, false, 1),
  ('pro',     'Pro',     2,    null, 15,    5000,  1000, true,  false, false, 2),
  ('premium', 'Premium', null, null, null, 20000,  3000, true,  true,  true,  3)
on conflict (plan) do update set
  nombre = excluded.nombre, max_marcas = excluded.max_marcas,
  max_sucursales = excluded.max_sucursales, max_usuarios = excluded.max_usuarios,
  mensajes_ia = excluded.mensajes_ia, dian_incluidos = excluded.dian_incluidos,
  chat_ia = excluded.chat_ia, puntos = excluded.puntos,
  admin_whatsapp = excluded.admin_whatsapp, orden = excluded.orden;

-- ── 5) Permisos ───────────────────────────────────────────────────────
grant select on public.pos_planes to authenticated, service_role;
grant select on public.v_carta_sucursal to authenticated, service_role;
