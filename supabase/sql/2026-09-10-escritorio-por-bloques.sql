-- ════════════════════════════════════════════════════════════════════
--  EL ESCRITORIO POR BLOQUES (10-sep-2026)
--
--  Sergio: "le podemos conceder permiso a alguien para que vea el dashboard
--  ... pero activar y desactivar cierta informacion: que alguien vea la
--  facturacion, que alguien no vea el inventario, que alguien no vea el
--  desglose por metodo de pago. Si le desactivamos toda la informacion,
--  queda el saludo y ya".
--
--  dashboard.ver ("Entrar al Escritorio") abre la pantalla y el menu. Lo que
--  se VE va por cinco permisos ESTRICTOS (_ESTRICTOS en pos-perms.js):
--    ventas.totales        cuanto vende el negocio (todo lo que es plata)
--    escritorio.pagos      el desglose por metodo de pago
--    escritorio.actividad  la actividad del dia, sin pesos
--    escritorio.inventario alertas de stock e "Inventario rapido"
--    escritorio.clientes   clientes y calificaciones
--  Aprobado: el Administrador los trae marcados (se le pueden quitar); los
--  demas roles, ninguno. El dueno los tiene siempre.
-- ════════════════════════════════════════════════════════════════════

update pos_roles r
   set perms = (select array_agg(distinct x order by x)
                  from unnest(coalesce(r.perms, '{}'::text[]) || array[
                    'ventas.totales','escritorio.pagos','escritorio.actividad',
                    'escritorio.inventario','escritorio.clientes']::text[]) x)
 where r.clave = 'admin';

create or replace function public.pos_sembrar_roles()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into pos_roles (tenant_id, clave, name, color, system_role, perms) values
    --  El administrador tiene acceso total por su clave. La lista solo lleva
    --  lo que SI se le puede quitar: ver el plan y las sedes, cuanto gastan
    --  los clientes, y lo que ve en el Escritorio (10-sep-2026).
    (new.id, 'admin', 'Administrador', '#5B6BFF', true, array[
      'cuenta.plan','clientes.gasto',
      'ventas.totales','escritorio.pagos','escritorio.actividad',
      'escritorio.inventario','escritorio.clientes'
    ]::text[]),

    --  El cajero es quien abre y cierra el turno, cobra y atiende lo que
    --  entre por donde entre. Le falta a proposito descuentos y anulaciones.
    --  Y NO ve cuanto gastan los clientes: en Clientes ve sus puntos y lo
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

--  Guardas: todo Administrador con los cinco, y ningun otro rol de fabrica
--  con alguno.
do $$
begin
  if exists (select 1 from pos_roles where clave = 'admin'
               and not (perms @> array['ventas.totales','escritorio.pagos','escritorio.actividad',
                                       'escritorio.inventario','escritorio.clientes']::text[])) then
    raise exception 'quedo un Administrador sin los permisos del Escritorio';
  end if;
  if exists (select 1 from pos_roles where clave in ('cajero','mesero','cocina','domiciliario')
               and perms && array['ventas.totales','escritorio.pagos','escritorio.actividad',
                                  'escritorio.inventario','escritorio.clientes']::text[]) then
    raise exception 'un rol de fabrica que no es Administrador quedo con permisos del Escritorio';
  end if;
end $$;
