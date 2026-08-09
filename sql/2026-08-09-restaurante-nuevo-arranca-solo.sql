-- ═══════════════════════════════════════════════════════════════════════════
-- Un restaurante nuevo tiene que poder trabajar desde el minuto uno
-- ───────────────────────────────────────────────────────────────────────────
-- Comprobado antes de escribir esto, comparando un restaurante de prueba
-- contra El Parche:
--
--   pos_roles  -> 0   (ninguno: no se puede asignar un rol a un empleado)
--   ia_config  -> 0   (ninguna: y aqui esta el problema de verdad)
--
-- Sin la fila de `ia_config`, las SIETE pantallas que guardan ahi hacen un
-- UPDATE sobre algo que no existe: cambian 0 filas, no dan error, y la
-- pantalla dice "Guardado". Probado de verdad sobre el restaurante de prueba:
-- 0 filas afectadas, cero quejas. El dueno agrega Nequi, guarda, ve el visto
-- bueno, y al dia siguiente no esta.
--
-- Se arregla EN LA BASE y no en cada pantalla: son siete sitios distintos, y
-- repartir la misma regla en siete lugares es exactamente el error que ya
-- costo el menu lateral, las respuestas rapidas y los metodos de pago.
--
-- Los dos automatismos solo se disparan al CREAR: no tocan ni una fila que ya
-- exista. Y no se tragan errores — si algo falla, falla a la vista, que es la
-- leccion del trigger de puntos que estuvo cinco dias callado.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Cada sucursal nace con su fila de configuracion ─────────────────────
create or replace function pos_sembrar_ia_config()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into ia_config (branch_id, tenant_id)
  values (new.id, new.tenant_id)
  on conflict (branch_id) do nothing;   -- si ya la tiene, no se pisa nada
  return new;
end;
$$;

drop trigger if exists trg_branch_ia_config on branches;
create trigger trg_branch_ia_config
  after insert on branches
  for each row execute function pos_sembrar_ia_config();

-- ── 2) Cada restaurante nace con sus roles ─────────────────────────────────
-- Los permisos son los mismos que usa El Parche hoy. El Administrador va como
-- `system_role` para que nunca se quede sin permisos aunque le borren la lista.
create or replace function pos_sembrar_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into pos_roles (tenant_id, name, color, system_role, perms) values
    (new.id, 'Administrador', '#5B6BFF', true,  array[]::text[]),
    (new.id, 'Cajero',        '#16A34A', false, array['ventas.ver','pedidos.crear','pedidos.cobrar','caja.abrir','caja.cerrar','caja.movimientos','historial.ver']::text[]),
    (new.id, 'Mesero',        '#F59E0B', false, array['ventas.ver','pedidos.crear','mesas.gestionar']::text[]),
    (new.id, 'Cocinero',      '#EF4444', false, array['cocina.ver','pedidos.estado','inventario.ver']::text[]),
    (new.id, 'Domiciliario',  '#0EA5E9', false, array['domicilios.ver','domicilios.estado']::text[]);
  return new;
end;
$$;

drop trigger if exists trg_tenant_roles on tenants;
create trigger trg_tenant_roles
  after insert on tenants
  for each row execute function pos_sembrar_roles();

-- ── 3) Las sucursales que ya existen sin su fila ───────────────────────────
insert into ia_config (branch_id, tenant_id)
select b.id, b.tenant_id
from branches b
left join ia_config c on c.branch_id = b.id
where c.id is null
on conflict (branch_id) do nothing;

-- ── 4) Los restaurantes que ya existen sin roles ───────────────────────────
insert into pos_roles (tenant_id, name, color, system_role, perms)
select t.id, r.name, r.color, r.system_role, r.perms
from tenants t
cross join (values
    ('Administrador', '#5B6BFF', true,  array[]::text[]),
    ('Cajero',        '#16A34A', false, array['ventas.ver','pedidos.crear','pedidos.cobrar','caja.abrir','caja.cerrar','caja.movimientos','historial.ver']::text[]),
    ('Mesero',        '#F59E0B', false, array['ventas.ver','pedidos.crear','mesas.gestionar']::text[]),
    ('Cocinero',      '#EF4444', false, array['cocina.ver','pedidos.estado','inventario.ver']::text[]),
    ('Domiciliario',  '#0EA5E9', false, array['domicilios.ver','domicilios.estado']::text[])
  ) as r(name, color, system_role, perms)
where not exists (select 1 from pos_roles p where p.tenant_id = t.id);
