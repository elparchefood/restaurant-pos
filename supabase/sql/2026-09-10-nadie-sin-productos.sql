-- ════════════════════════════════════════════════════════════════════
--  NINGUN ROL ENTRA A PRODUCTOS POR DEFECTO (10-sep-2026)
--
--  Sergio, después de quitárselo al Cajero: "sí, quítaselo también a
--  mesero, cocinero y domiciliario".
--
--  `catalogo.ver` SOLO abre la pestaña Productos (medido el 10-sep: ninguna
--  pantalla de venta, de cocina ni de domicilios lo pide, ni el servidor).
--  La siembra decía que el mesero lo necesitaba "porque sin la carta no
--  puede tomar un pedido" — no era cierto.
--
--  El Administrador no se toca: tiene acceso total por su clave.
-- ════════════════════════════════════════════════════════════════════

update pos_roles
   set perms = array_remove(perms, 'catalogo.ver')
 where clave in ('mesero', 'cocina', 'domiciliario')
   and 'catalogo.ver' = any(coalesce(perms, '{}'::text[]));

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
      'ventas.ver','reservas.gestionar','domicilios.gestionar'
    ]::text[]),

    --  El mesero toma y manda. No cobra: para eso esta la caja.
    (new.id, 'mesero', 'Mesero', '#F59E0B', true, array[
      'pedidos.crear','pedidos.cocina','cocina.ver','reservas.gestionar'
    ]::text[]),

    --  El cocinero ve la pantalla y marca lo que va saliendo.
    (new.id, 'cocina', 'Cocinero', '#EF4444', true, array[
      'pedidos.cocina','cocina.ver'
    ]::text[]),

    --  El domiciliario COBRA en la puerta. Sin ese permiso, la app le pide el
    --  PIN del dueNo en la calle a las diez de la noche.
    (new.id, 'domiciliario', 'Domiciliario', '#0EA5E9', true, array[
      'domicilios.gestionar','pedidos.cobrar'
    ]::text[])
  on conflict do nothing;
  return new;
end;
$function$;

--  NINGÚN rol entra a Productos por defecto: ni en la siembra ni en los que
--  ya existen (salvo el Administrador, que lo tiene todo por su clave).
--  Nota: `catalogo.ver` ya no aparece en ninguna lista de la siembra.
do $$
begin
  if exists (select 1 from pos_roles
              where clave in ('cajero','mesero','cocina','domiciliario')
                and 'catalogo.ver' = any(perms)) then
    raise exception 'quedó un rol de fábrica con catalogo.ver';
  end if;
end $$;
