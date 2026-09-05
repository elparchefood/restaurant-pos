/*  EL PLAN Y LAS MARCAS NO SON ASUNTO DE TODO EL MUNDO
    ──────────────────────────────────────────────────────────────────────
    Sergio, 5-sep-2026: «la opcion para crear sucursal y para crear marca
    solo exclusivamente debe salirle al gerente, es decir la persona que
    creo la cuenta en Cobra. Esa informacion no le debe salir a personas
    que tengan un rol».

    Hasta hoy el bloque del menu de usuario —plan contratado CON SU PRECIO,
    cambiar de marca, cambiar de sede, crear marca, crear sucursal— se
    pintaba para cualquiera que abriera el Escritorio. Un mesero veia
    cuanto paga su jefe por Cobra.

    ── QUIEN LO VE ─────────────────────────────────────────────────────
    El dueño siempre (`es_dueno()`), y cualquier rol que tenga concedido
    `cuenta.plan`. Este SQL se lo da a los roles de administrador que ya
    existen, porque Sergio pidio que lo trajeran de fabrica — y desde la
    pantalla de Usuarios y roles el dueño puede quitarselo cuando quiera.

    No se le da a NINGUN otro rol: ni cajero, ni mesero, ni cocina, ni
    domiciliario, ni a los roles propios que haya creado cada restaurante.

    ── POR QUE HACE FALTA ESTE UPDATE ──────────────────────────────────
    Un permiso que no esta en la lista del rol no se concede. Si esto no
    corriera, el administrador se quedaria sin ver el bloque el dia que el
    dueño le revise los permisos y guarde — que es justo cuando nadie
    entenderia por que desaparecio.                                      */

update pos_roles
   set perms = (
         select array_agg(distinct p order by p)
           from unnest(coalesce(perms, '{}') || array['cuenta.plan']) as p
       )
 where clave = 'admin'
   and not (coalesce(perms, '{}') @> array['cuenta.plan']);

/*  ── QUE ESTO SE HAYA HECHO DE VERDAD ────────────────────────────────
    Un update que no toma ninguna fila no avisa. Y de paso se comprueba lo
    contrario: que NO se le colo a nadie mas.                            */
do $guarda$
declare
  n_admin_sin int;
  n_otros     int;
begin
  select count(*) into n_admin_sin
    from pos_roles
   where clave = 'admin'
     and not (coalesce(perms, '{}') @> array['cuenta.plan']);
  if n_admin_sin > 0 then
    raise exception 'quedaron % roles de administrador sin cuenta.plan', n_admin_sin;
  end if;

  select count(*) into n_otros
    from pos_roles
   where coalesce(clave, '') <> 'admin'
     and coalesce(perms, '{}') @> array['cuenta.plan'];
  if n_otros > 0 then
    raise exception 'cuenta.plan se le dio a % roles que no son administrador', n_otros;
  end if;
end
$guarda$;

/*  ── Y LOS RESTAURANTES QUE TODAVIA NO EXISTEN ───────────────────────
    `pos_sembrar_roles` siembra al administrador con la lista VACIA, con
    esta nota: «El administrador NO lleva lista: su clave le da acceso
    total». Era verdad hasta hoy.

    Ahora hay un permiso que el administrador SI puede perder, y uno que
    no esta en la lista no se concede. Sin este cambio, el administrador
    de cada restaurante nuevo naceria sin ver el plan ni las sedes — y
    Sergio pidio que lo trajera de fabrica.

    Se reescribe la funcion ENTERA a proposito: cambiar solo esa linea
    desde fuera no se puede, y copiar el resto tal cual deja a la vista
    que no se toco nada mas.                                            */
create or replace function public.pos_sembrar_roles()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $sembrar$
begin
  insert into pos_roles (tenant_id, clave, name, color, system_role, perms) values
    --  El administrador tiene acceso total por su clave. La lista solo lleva
    --  lo que SI se le puede quitar: hoy, ver el plan y las sedes.
    (new.id, 'admin', 'Administrador', '#5B6BFF', true, array[
      'cuenta.plan'
    ]::text[]),

    --  El cajero es quien abre y cierra el turno, cobra y atiende lo que
    --  entre por donde entre. Le falta a proposito descuentos y anulaciones.
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
$sembrar$;

do $guarda2$
begin
  if position('cuenta.plan' in pg_get_functiondef(
       (select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'pos_sembrar_roles'))) = 0 then
    raise exception 'la siembra de roles no quedo con cuenta.plan';
  end if;
end
$guarda2$;
