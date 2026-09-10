-- ════════════════════════════════════════════════════════════════════
--  EL CAJERO NO ENTRA A PRODUCTOS POR DEFECTO (10-sep-2026)
--
--  Sergio: "el cajero tampoco debe tener acceso a la pestaña Productos;
--  déjalo desactivado a menos que alguien se lo active, pero por defecto
--  debe estar desactivado".
--
--  El permiso que abre Productos es `catalogo.ver` — y SOLO eso: medido el
--  10-sep, ninguna pantalla de venta ni ninguna función del servidor lo
--  pide (solo `catalogo-productos.html` y el mapa PANTALLAS de
--  pos-nucleo.js). Quitárselo al cajero no le impide vender.
--
--  Se le quita al Cajero de los restaurantes que ya existen y a los que
--  nazcan. El dueño se lo puede volver a marcar en Usuarios y roles.
-- ════════════════════════════════════════════════════════════════════

update pos_roles
   set perms = array_remove(perms, 'catalogo.ver')
 where clave = 'cajero'
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
    --  Tampoco entra a Productos (`catalogo.ver`): para vender no hace falta,
    --  y se le puede activar (Sergio, 10-sep-2026).
    (new.id, 'cajero', 'Cajero', '#16A34A', true, array[
      'pedidos.crear','pedidos.cocina','pedidos.cobrar','pedidos.reabrir','cocina.ver',
      'caja.abrir','caja.cerrar','caja.movimientos',
      'ventas.ver','reservas.gestionar','domicilios.gestionar'
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

--  Guarda: si algún cajero quedó con el permiso, que reviente.
do $$
begin
  if exists (select 1 from pos_roles where clave = 'cajero' and 'catalogo.ver' = any(perms)) then
    raise exception 'quedó un cajero con catalogo.ver';
  end if;
end $$;
