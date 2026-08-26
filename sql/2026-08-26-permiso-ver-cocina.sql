-- ═══════════════════════════════════════════════════════════════════════════
-- «Ver la pantalla de cocina» pasa a ser un permiso de verdad
-- Sergio, 26-ago-2026
--
-- Hasta hoy la pantalla de cocina no estaba protegida por nada: cualquiera con
-- cuenta podia abrirla, y el menu lateral le mostraba la entrada a todo el
-- mundo. Ahora existe `cocina.ver` y el dueño decide que rol la ve.
--
-- POR QUE ESTE ARCHIVO ES OBLIGATORIO ANTES DE DESPLEGAR:
-- ninguno de los 20 roles que existen hoy tiene el permiso. Si se sube el
-- candado sin correr esto, TODOS los restaurantes se quedan sin pantalla de
-- cocina — El Parche incluido, en pleno servicio.
--
-- Lo que hace no es abrir nada: deja las cosas EXACTAMENTE como estan hoy
-- (hoy todos pueden), y de ahi en adelante el dueño quita donde quiera.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Los roles que YA EXISTEN conservan el acceso que tienen hoy.
update pos_roles
   set perms = array_append(coalesce(perms, array[]::text[]), 'cocina.ver')
 where not ('cocina.ver' = any(coalesce(perms, array[]::text[])));

-- 2. Los restaurantes NUEVOS nacen con el permiso donde corresponde.
--    Sin esto, cada restaurante que se registre tendria un cocinero incapaz de
--    abrir su propia pantalla — y nadie sabria por que.
--    El Administrador va con perms vacio a proposito: su acceso sale de la
--    clave 'admin', no de la lista.
create or replace function public.pos_sembrar_roles()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into pos_roles (tenant_id, clave, name, color, system_role, perms) values
    (new.id, 'admin',        'Administrador', '#5B6BFF', true, array[]::text[]),
    (new.id, 'cajero',       'Cajero',        '#16A34A', true, array['ventas.ver','pedidos.crear','pedidos.cocina','pedidos.cobrar','caja.abrir','caja.cerrar','caja.movimientos']::text[]),
    (new.id, 'mesero',       'Mesero',        '#F59E0B', true, array['ventas.ver','pedidos.crear','pedidos.cocina']::text[]),
    (new.id, 'cocina',       'Cocinero',      '#EF4444', true, array['pedidos.cocina','catalogo.ver','cocina.ver']::text[]),
    (new.id, 'domiciliario', 'Domiciliario',  '#0EA5E9', true, array['domicilios.gestionar']::text[])
  on conflict do nothing;
  return new;
end;
$function$;
