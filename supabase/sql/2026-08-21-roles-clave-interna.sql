-- ======================================================================
--  ROLES: NOMBRE INTERNO vs NOMBRE VISIBLE  (21-ago-2026)
--
--  REGLA DE SERGIO: "cualquier elemento debe tener un nombre interno; el
--  nombre interno siempre es el mismo, asi el sistema sabe que es cajera,
--  que es mesera, que es domiciliario. Otra cosa muy diferente es el
--  nombre para mostrar: eso es lo que puede modificar el dueno".
--
--  HOY NO EXISTE ESA SEPARACION y eso causa bugs reales:
--
--  1) `pos-perms.js` busca los permisos comparando el NOMBRE del rol:
--         if (rows[i].name.toLowerCase() === role)
--     Osea que si el dueno renombra "Cajero" a "Cajera de mostrador",
--     TODOS sus cajeros se quedan sin permisos al instante. Y renombrar
--     es precisamente lo que Cobra le ofrece hacer.
--
--  2) `mesero-login.js` manda a cada quien a su pantalla con una tabla
--     escrita a mano: mesero/cajera/admin/cocina. Los roles que Cobra
--     siembra se llaman Cajero, Cocinero y Domiciliario: NINGUNO de esos
--     tres esta en la tabla, asi que a esas personas la app les dice
--     "tu rol no tiene una pantalla asignada" y las saca.
--
--  3) `system_role` quedo en false hasta para Administrador en los 4
--     restaurantes que existen, asi que el rol de administrador se podia
--     borrar y dejar el restaurante sin nadie que entre a todo.
--
--  La solucion es una columna `clave`, que NO se muestra y NO se edita.
--  `name` queda libre para que el dueno lo llame como quiera.
-- ======================================================================

alter table pos_roles add column if not exists clave text;

comment on column pos_roles.clave is
  'Nombre INTERNO e inmutable: admin | cajero | mesero | cocina | domiciliario. Es por donde el sistema reconoce el rol. NULL = rol propio del restaurante. Nunca se muestra ni se deja editar: para eso esta name.';
comment on column pos_roles.name is
  'Nombre VISIBLE. El dueno lo cambia cuando quiera; no afecta a nada.';

-- ── Ponerle clave a los roles que ya existen ──────────────────────────
--  Solo al PRIMERO de cada grupo (por fecha de creacion): si un
--  restaurante tiene "Cajero" y "Cajera" como dos roles distintos, uno se
--  queda sin clave y sigue funcionando como rol propio. Nadie pierde nada.
with candidatos as (
  select id, tenant_id, created_at,
         case
           when lower(btrim(name)) in ('administrador','admin','gerente','propietario') then 'admin'
           when lower(btrim(name)) in ('cajero','cajera','caja')                        then 'cajero'
           when lower(btrim(name)) in ('mesero','mesera')                               then 'mesero'
           when lower(btrim(name)) in ('cocinero','cocinera','cocina','chef')            then 'cocina'
           when lower(btrim(name)) in ('domiciliario','domiciliaria','repartidor','repartidora') then 'domiciliario'
         end as k
    from pos_roles
   where clave is null
), rankeados as (
  select id, k,
         row_number() over (partition by tenant_id, k order by created_at, id) as n
    from candidatos
   where k is not null
)
update pos_roles p set clave = r.k
  from rankeados r
 where p.id = r.id and r.n = 1;

--  Que no puedan existir dos "el domiciliario" en el mismo restaurante.
create unique index if not exists ux_pos_roles_clave
  on pos_roles (tenant_id, clave) where clave is not null;

-- ── Los 5 roles del sistema NO se borran (pero SI se renombran) ───────
update pos_roles set system_role = true  where clave is not null;
update pos_roles set system_role = false where clave is null;

comment on column pos_roles.system_role is
  'true = rol que siembra Cobra. NO se puede borrar (dejaria al restaurante sin quien entre), pero SI se puede renombrar y cambiarle los permisos.';

-- ── Que los restaurantes NUEVOS nazcan con la clave puesta ────────────
create or replace function pos_sembrar_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into pos_roles (tenant_id, clave, name, color, system_role, perms) values
    (new.id, 'admin',        'Administrador', '#5B6BFF', true, array[]::text[]),
    (new.id, 'cajero',       'Cajero',        '#16A34A', true, array['ventas.ver','pedidos.crear','pedidos.cobrar','caja.abrir','caja.cerrar','caja.movimientos','historial.ver']::text[]),
    (new.id, 'mesero',       'Mesero',        '#F59E0B', true, array['ventas.ver','pedidos.crear','mesas.gestionar']::text[]),
    (new.id, 'cocina',       'Cocinero',      '#EF4444', true, array['cocina.ver','pedidos.estado','inventario.ver']::text[]),
    (new.id, 'domiciliario', 'Domiciliario',  '#0EA5E9', true, array['domicilios.ver','domicilios.estado']::text[])
  on conflict do nothing;
  return new;
end;
$function$;

-- ── Al restaurante que le falte alguno de los 5, se le crea ───────────
--  Antes el respaldo era "si no tiene NINGUN rol": a un restaurante al
--  que le faltara solo el de domiciliario se quedaba sin el para siempre.
insert into pos_roles (tenant_id, clave, name, color, system_role, perms)
select t.id, r.clave, r.name, r.color, true, r.perms
  from tenants t
  cross join (values
    ('admin',        'Administrador', '#5B6BFF', array[]::text[]),
    ('cajero',       'Cajero',        '#16A34A', array['ventas.ver','pedidos.crear','pedidos.cobrar','caja.abrir','caja.cerrar','caja.movimientos','historial.ver']::text[]),
    ('mesero',       'Mesero',        '#F59E0B', array['ventas.ver','pedidos.crear','mesas.gestionar']::text[]),
    ('cocina',       'Cocinero',      '#EF4444', array['cocina.ver','pedidos.estado','inventario.ver']::text[]),
    ('domiciliario', 'Domiciliario',  '#0EA5E9', array['domicilios.ver','domicilios.estado']::text[])
  ) as r(clave, name, color, perms)
 where not exists (
   select 1 from pos_roles p where p.tenant_id = t.id and p.clave = r.clave
 );

-- ── Nadie puede borrar un rol del sistema, ni por error ni por la API ──
--  La pantalla lo va a esconder, pero la pantalla no es la que manda.
create or replace function fn_no_borrar_rol_sistema()
returns trigger
language plpgsql
as $function$
begin
  if old.system_role then
    raise exception 'El rol "%" es del sistema y no se puede eliminar. Si no lo usas, renombralo o quitale los permisos.', old.name
      using errcode = 'check_violation';
  end if;
  return old;
end;
$function$;

drop trigger if exists trg_no_borrar_rol_sistema on pos_roles;
create trigger trg_no_borrar_rol_sistema
  before delete on pos_roles
  for each row execute function fn_no_borrar_rol_sistema();

-- ── La clave es inmutable: ni renombrando ni por descuido ─────────────
create or replace function fn_clave_rol_inmutable()
returns trigger
language plpgsql
as $function$
begin
  if old.clave is not null and new.clave is distinct from old.clave then
    new.clave := old.clave;          -- se ignora en silencio, no se rompe
  end if;
  new.system_role := (new.clave is not null);
  return new;
end;
$function$;

drop trigger if exists trg_clave_rol_inmutable on pos_roles;
create trigger trg_clave_rol_inmutable
  before update on pos_roles
  for each row execute function fn_clave_rol_inmutable();
