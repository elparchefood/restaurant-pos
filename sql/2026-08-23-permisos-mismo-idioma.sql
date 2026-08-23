-- ═══════════════════════════════════════════════════════════════════════════
--  Los roles y las pantallas hablando el MISMO idioma  (23-ago-2026)
-- ───────────────────────────────────────────────────────────────────────────
--  Hallado en la auditoría de multimarca y permisos que pidió Sergio.
--
--  Cobra le siembra 5 roles a cada restaurante nuevo. Se comprobaron uno por
--  uno los permisos que traen contra los que el sistema REALMENTE comprueba
--  (`posRequirePin` / `posGuard` / `posHasPerm` en todo el proyecto), y ocho
--  no existían en ninguna pantalla:
--
--      cocina.ver · pedidos.estado · inventario.ver · historial.ver
--      informes.ver · mesas.gestionar · domicilios.ver · domicilios.estado
--
--  Un permiso que nadie comprueba no abre nada. Traducido a lo que le pasa a
--  un restaurante que se registre hoy:
--
--    · COCINERO — sus tres permisos son de esos ocho. O sea que el rol no le
--      abre NADA: cada pantalla con candado le pide el PIN del administrador.
--      El cocinero no puede ni mandar a cocina.
--    · DOMICILIARIO — sus dos permisos son de esos ocho, y la pantalla de
--      domicilios pide `domicilios.gestionar`, que no tiene. Mismo resultado.
--    · CAJERO y MESERO sí funcionan: sus permisos sí están en el idioma bueno
--      (por eso nunca se notó — son los dos únicos que se han usado).
--
--  Y hay un segundo efecto, más callado: la pantalla de roles solo dibuja
--  casillas para los 23 permisos que conoce. Al guardar escribe lo que estén
--  marcado, así que el día que el dueño entre a tocar CUALQUIER rol, los ocho
--  desconocidos desaparecen sin avisar.
--
--  ARREGLO: se traduce cada permiso muerto al vivo que abre esa misma puerta.
--  Nadie pierde acceso —es el mismo sitio, con el nombre que sí se comprueba—
--  y la pantalla de roles pasa a mostrar la verdad completa.
--
--  Se traduce fila por fila y no se reemplaza el rol entero: si el dueño ya
--  personalizó sus permisos, se le respetan todos los demás.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Los roles que ya existen ────────────────────────────────────────────
--  El array se rearma quitando repetidos: un rol que tuviera `historial.ver`
--  y `ventas.ver` a la vez no puede terminar con `ventas.ver` dos veces.
update pos_roles r
   set perms = sub.nuevos
  from (
    select p.id,
           array(
             select distinct case x
               when 'cocina.ver'        then 'pedidos.cocina'
               when 'pedidos.estado'    then 'pedidos.cocina'
               when 'inventario.ver'    then 'catalogo.ver'
               when 'historial.ver'     then 'ventas.ver'
               when 'informes.ver'      then 'ventas.ver'
               when 'mesas.gestionar'   then 'pedidos.crear'
               when 'domicilios.ver'    then 'domicilios.gestionar'
               when 'domicilios.estado' then 'domicilios.gestionar'
               else x
             end
               from unnest(p.perms) as x
           ) as nuevos
      from pos_roles p
     where p.perms && array['cocina.ver','pedidos.estado','inventario.ver',
                            'historial.ver','informes.ver','mesas.gestionar',
                            'domicilios.ver','domicilios.estado']::text[]
  ) as sub
 where r.id = sub.id;

-- ── 2) Que los restaurantes NUEVOS nazcan hablando el idioma bueno ─────────
--  Se conserva todo lo demás del trigger tal cual (clave interna, colores,
--  system_role, on conflict do nothing): lo único que cambia son los permisos.
create or replace function pos_sembrar_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into pos_roles (tenant_id, clave, name, color, system_role, perms) values
    (new.id, 'admin',        'Administrador', '#5B6BFF', true, array[]::text[]),
    (new.id, 'cajero',       'Cajero',        '#16A34A', true, array['ventas.ver','pedidos.crear','pedidos.cocina','pedidos.cobrar','caja.abrir','caja.cerrar','caja.movimientos']::text[]),
    (new.id, 'mesero',       'Mesero',        '#F59E0B', true, array['ventas.ver','pedidos.crear','pedidos.cocina']::text[]),
    (new.id, 'cocina',       'Cocinero',      '#EF4444', true, array['pedidos.cocina','catalogo.ver']::text[]),
    (new.id, 'domiciliario', 'Domiciliario',  '#0EA5E9', true, array['domicilios.gestionar']::text[])
  on conflict do nothing;
  return new;
end;
$function$;

-- ── 3) Comprobación ────────────────────────────────────────────────────────
--  Si queda un solo permiso muerto en cualquier rol, esto falla a la vista en
--  vez de dejarlo pasar callado.
do $$
declare n int;
begin
  select count(*) into n from pos_roles
   where perms && array['cocina.ver','pedidos.estado','inventario.ver',
                        'historial.ver','informes.ver','mesas.gestionar',
                        'domicilios.ver','domicilios.estado']::text[];
  if n > 0 then
    raise exception 'Quedaron % roles con permisos que ninguna pantalla comprueba', n;
  end if;
end $$;
