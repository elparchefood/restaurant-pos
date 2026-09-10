-- ════════════════════════════════════════════════════════════════════
--  QUIÉN VE CUÁNTO GASTAN LOS CLIENTES (10-sep-2026)
--
--  Sergio: el cajero necesita ver los PUNTOS de un cliente en la pantalla
--  de Clientes (para decírselos cuando pregunta), pero no la facturación:
--  lo gastado, el promedio ni el valor de sus pedidos, "a menos que se le
--  otorgue el permiso".
--
--  Lo decide EL SERVIDOR, no la pantalla: si quien pregunta no tiene el
--  permiso, esas cifras salen vacías y la pantalla simplemente no las
--  dibuja. Esconderlas solo en la pantalla no sirve: la plata viajaba igual
--  al computador del cajero.
-- ════════════════════════════════════════════════════════════════════

--  ¿Esta persona es de este restaurante? El dueño, o un usuario activo suyo.
--  Hasta hoy fn_clientes_resumen no lo preguntaba: le entregaba el resumen
--  de cualquier restaurante a quien le pasara su id.
create or replace function public.fn_soy_del_restaurante(p_tenant uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select auth.uid() is not null and p_tenant is not null and (
    exists (select 1 from tenants t
             where t.id = p_tenant and t.owner_user_id = auth.uid())
    or exists (select 1 from pos_users pu
                where pu.tenant_id = p_tenant
                  and (pu.auth_user_id = auth.uid() or pu.id = auth.uid())
                  and coalesce(pu.active, true))
  )
$$;

--  ¿Tiene ESTE permiso, de verdad? — la versión del servidor de
--  posPermEstricto (pos-nucleo.js).
--
--  "Estricto" quiere decir que el Administrador NO lo tiene por serlo: solo
--  si su rol lo trae marcado, porque el dueño se lo puede quitar. El dueño
--  sí lo tiene siempre. Y un rol que no se reconoce NO lo tiene: aquí
--  equivocarse para el lado de "no" solo esconde unas cifras, nunca impide
--  vender.
--
--  Resuelve en el mismo orden que la pantalla: dueño → rol en esa sede →
--  rol de su ficha. De la ficha se lee role_id (lo escribe Configuración al
--  asignar el rol) y si no hay, el texto del rol con la misma tabla de
--  nombres viejos de pos-nucleo.js (_ALIAS_ROL). No se lee la metadata de la
--  sesión: esa la puede reescribir el propio usuario.
create or replace function public.fn_permiso_estricto(p_tenant uuid, p_permiso text, p_sede uuid default null)
returns boolean
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_perms   text[];
  v_role    text;
  v_role_id uuid;
  v_clave   text;
begin
  if auth.uid() is null or p_tenant is null or p_permiso is null then
    return false;
  end if;

  -- 1. El dueño no pierde nada nunca.
  if exists (select 1 from tenants t where t.id = p_tenant and t.owner_user_id = auth.uid()) then
    return true;
  end if;

  -- 2. Su rol en esa sede, si se lo asignaron por sede.
  if p_sede is not null then
    select pr.perms into v_perms
      from pos_usuario_sucursal us
      join pos_roles pr on pr.id = us.role_id
     where us.user_id = auth.uid() and us.branch_id = p_sede and pr.tenant_id = p_tenant
     limit 1;
    if found then
      return p_permiso = any(coalesce(v_perms, '{}'::text[]));
    end if;
  end if;

  -- 3. El rol de su ficha en este restaurante.
  select pu.role_id, lower(trim(coalesce(pu.role, '')))
    into v_role_id, v_role
    from pos_users pu
   where pu.tenant_id = p_tenant
     and (pu.auth_user_id = auth.uid() or pu.id = auth.uid())
     and coalesce(pu.active, true)
   order by (pu.auth_user_id = auth.uid()) desc nulls last
   limit 1;
  if not found then
    return false;
  end if;

  if v_role_id is not null then
    select pr.perms into v_perms
      from pos_roles pr where pr.id = v_role_id and pr.tenant_id = p_tenant;
    if found then
      return p_permiso = any(coalesce(v_perms, '{}'::text[]));
    end if;
  end if;

  v_clave := case v_role
    when 'admin' then 'admin'   when 'administrador' then 'admin' when 'gerente' then 'admin'
    when 'propietario' then 'admin' when 'dueno' then 'admin'
    when 'cajero' then 'cajero' when 'cajera' then 'cajero' when 'caja' then 'cajero'
    when 'mesero' then 'mesero' when 'mesera' then 'mesero'
    when 'cocina' then 'cocina' when 'cocinero' then 'cocina' when 'cocinera' then 'cocina' when 'chef' then 'cocina'
    when 'domiciliario' then 'domiciliario' when 'domiciliaria' then 'domiciliario'
    when 'repartidor' then 'domiciliario'   when 'repartidora' then 'domiciliario'
    else null end;

  select pr.perms into v_perms
    from pos_roles pr
   where pr.tenant_id = p_tenant
     and ((v_clave is not null and pr.clave = v_clave)
          or (v_clave is null and lower(trim(pr.name)) = v_role))
   limit 1;
  if found then
    return p_permiso = any(coalesce(v_perms, '{}'::text[]));
  end if;

  return false;
end
$$;

--  El resumen de Clientes. Cambia en tres cosas:
--   · Solo contesta a alguien DE ese restaurante (antes, a cualquiera).
--   · Sin el permiso `clientes.gasto`, lo gastado, el promedio y lo
--     recargado salen VACÍOS (null). Los puntos, el saldo de la billetera,
--     cuántos pedidos y el último siguen igual.
--   · Sin el permiso, el orden es por nombre: ordenar por gasto dejaría ver
--     quién gasta más aunque no se vea cuánto.
--  p_sede es opcional para que la pantalla vieja, que no la manda, siga
--  funcionando mientras se actualiza.
drop function if exists public.fn_clientes_resumen(uuid);
create function public.fn_clientes_resumen(p_tenant uuid, p_sede uuid default null)
returns table(id uuid, nombre text, telefono text, barrio text, puntos integer, saldo bigint,
              pedidos integer, gastado bigint, promedio bigint, ultimo timestamp with time zone,
              recargado bigint, recargas integer, redimido integer)
language sql stable security definer
set search_path to 'public'
as $$
  with yo as (
    select public.fn_soy_del_restaurante(p_tenant)                       as es,
           public.fn_permiso_estricto(p_tenant, 'clientes.gasto', p_sede) as ve
  )
  select c.id, c.nombre, c.telefono, c.barrio,
         coalesce(pt.puntos, 0)::int,
         coalesce(sa.saldo, 0)::bigint,
         coalesce(o.n, 0)::int,
         case when yo.ve then coalesce(o.total, 0)::bigint end,
         case when yo.ve then
           case when coalesce(o.n,0) > 0 then (o.total / o.n)::bigint else 0::bigint end
         end,
         o.ultimo,
         case when yo.ve then coalesce(rc.total, 0)::bigint end,
         case when yo.ve then coalesce(rc.n, 0)::int end,
         coalesce(rd.puntos, 0)::int
    from yo
    cross join pos_clientes c
    -- Los puntos viven por telefono, no por id de cliente.
    left join pos_puntos pt
           on pt.tenant_id = c.tenant_id
          and pos_tel10(pt.telefono) = pos_tel10(c.telefono)
    left join pos_saldo sa on sa.cliente_id = c.id
    left join lateral (
      select count(*) n,
             sum(coalesce(x.total_final, x.total, 0) + coalesce(x.delivery_fee, 0)) total,
             max(x.created_at) ultimo
        from pos_orders x
       where x.cliente_id = c.id and x.status = 'paid'
    ) o on true
    left join lateral (
      -- Solo el dinero REAL recargado: el bono es cupo regalado, no plata.
      select count(*) n, sum(m.monto) total
        from pos_saldo_mov m
       where m.cliente_id = c.id and m.motivo = 'recarga'
    ) rc on true
    left join lateral (
      select coalesce(sum(-v.puntos), 0) puntos
        from pos_puntos_movimientos v
       where pos_tel10(v.telefono) = pos_tel10(c.telefono)
         and v.tenant_id = c.tenant_id
         and v.puntos < 0 and coalesce(v.revertido, false) = false
    ) rd on true
   where yo.es and c.tenant_id = p_tenant
   order by case when yo.ve then coalesce(o.total, 0) end desc nulls last, c.nombre;
$$;

--  Los mismos accesos que tenía la función vieja: nadie sin sesión.
revoke all on function public.fn_clientes_resumen(uuid, uuid) from public, anon;
grant execute on function public.fn_clientes_resumen(uuid, uuid) to authenticated, service_role;
revoke all on function public.fn_soy_del_restaurante(uuid) from public, anon;
grant execute on function public.fn_soy_del_restaurante(uuid) to authenticated, service_role;
revoke all on function public.fn_permiso_estricto(uuid, text, uuid) from public, anon;
grant execute on function public.fn_permiso_estricto(uuid, text, uuid) to authenticated, service_role;

--  A todos los Administradores de hoy se les marca, para que a ellos no les
--  cambie nada. El dueño de cada restaurante se lo puede quitar.
update pos_roles
   set perms = array_append(coalesce(perms, '{}'::text[]), 'clientes.gasto')
 where clave = 'admin'
   and not ('clientes.gasto' = any(coalesce(perms, '{}'::text[])));

--  Y los restaurantes nuevos lo traen de fábrica en el Administrador.
create or replace function public.pos_sembrar_roles()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into pos_roles (tenant_id, clave, name, color, system_role, perms) values
    --  El administrador tiene acceso total por su clave. La lista solo lleva
    --  lo que SI se le puede quitar: ver el plan y las sedes, y cuánto
    --  gastan los clientes.
    (new.id, 'admin', 'Administrador', '#5B6BFF', true, array[
      'cuenta.plan','clientes.gasto'
    ]::text[]),

    --  El cajero es quien abre y cierra el turno, cobra y atiende lo que
    --  entre por donde entre. Le falta a proposito descuentos y anulaciones.
    --  Y NO ve cuánto gastan los clientes: en Clientes ve sus puntos y lo
    --  que pidieron, sin la plata (Sergio, 10-sep-2026).
    (new.id, 'cajero', 'Cajero', '#16A34A', true, array[
      'pedidos.crear','pedidos.cocina','pedidos.cobrar','pedidos.reabrir','cocina.ver',
      'caja.abrir','caja.cerrar','caja.movimientos',
      'catalogo.ver','ventas.ver','reservas.gestionar','domicilios.gestionar'
    ]::text[]),

    --  El mesero toma y manda. No cobra: para eso esta la caja. Ve la carta
    --  porque sin la carta no puede tomar un pedido.
    (new.id, 'mesero', 'Mesero', '#F59E0B', true, array[
      'pedidos.crear','pedidos.cocina','cocina.ver','catalogo.ver','reservas.gestionar'
    ]::text[]),

    --  El cocinero ve la pantalla y marca lo que va saliendo.
    (new.id, 'cocina', 'Cocinero', '#EF4444', true, array[
      'pedidos.cocina','cocina.ver','catalogo.ver'
    ]::text[]),

    --  El domiciliario COBRA en la puerta. Sin ese permiso, la app le pide el
    --  PIN del dueNo en la calle a las diez de la noche.
    (new.id, 'domiciliario', 'Domiciliario', '#0EA5E9', true, array[
      'domicilios.gestionar','pedidos.cobrar','catalogo.ver'
    ]::text[])
  on conflict do nothing;
  return new;
end;
$function$;
