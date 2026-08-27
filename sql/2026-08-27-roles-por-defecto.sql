-- ═══════════════════════════════════════════════════════════════════════════
-- Los roles que siembra Cobra vienen listos para trabajar
-- Sergio, 27-ago-2026
--
-- Sergio abrió una mesa desde la tablet y le pidió el PIN. La causa inmediata
-- era otra (había entrado con la cuenta de cocina), pero al mirar los permisos
-- que Cobra siembra apareció lo de fondo: llegan a medias. Un Cajero no podía
-- mandar a cocina. Un Domiciliario no podía cobrar — que es, literalmente, lo
-- único que hace en la puerta. Un Mesero no podía ver la carta.
--
-- El dueño de un restaurante no es administrador de sistemas. Si crea el
-- usuario y no toca nada más, tiene que funcionar. Quitar es una decisión que
-- él toma; tener que agregar para que algo básico ande, no.
--
-- LA LÍNEA: lo que mueve plata HACIA ABAJO queda por fuera de todos.
-- Descuentos, anular pedidos y anular pagos son la vía clásica por la que se
-- va la plata de un restaurante. Para eso está el PIN del dueño: nada se
-- esconde, se pide permiso en el momento.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Los restaurantes nuevos nacen bien ─────────────────────────────────
create or replace function public.pos_sembrar_roles()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into pos_roles (tenant_id, clave, name, color, system_role, perms) values
    --  El administrador NO lleva lista: su clave le da acceso total.
    (new.id, 'admin', 'Administrador', '#5B6BFF', true, array[]::text[]),

    --  El cajero es quien abre y cierra el turno, cobra y atiende lo que
    --  entre por donde entre. Le falta a propósito descuentos y anulaciones.
    (new.id, 'cajero', 'Cajero', '#16A34A', true, array[
      'pedidos.crear','pedidos.cocina','pedidos.cobrar','pedidos.reabrir','cocina.ver',
      'caja.abrir','caja.cerrar','caja.movimientos',
      'catalogo.ver','ventas.ver','reservas.gestionar','domicilios.gestionar'
    ]::text[]),

    --  El mesero toma y manda. No cobra: para eso está la caja. Ve la carta
    --  porque sin la carta no puede tomar un pedido.
    (new.id, 'mesero', 'Mesero', '#F59E0B', true, array[
      'pedidos.crear','pedidos.cocina','cocina.ver','catalogo.ver','reservas.gestionar'
    ]::text[]),

    --  El cocinero ve la pantalla y marca lo que va saliendo.
    (new.id, 'cocina', 'Cocinero', '#EF4444', true, array[
      'pedidos.cocina','cocina.ver','catalogo.ver'
    ]::text[]),

    --  El domiciliario COBRA en la puerta. Sin ese permiso, la app le pide el
    --  PIN del dueño en la calle a las diez de la noche.
    (new.id, 'domiciliario', 'Domiciliario', '#0EA5E9', true, array[
      'domicilios.gestionar','pedidos.cobrar','catalogo.ver'
    ]::text[])
  on conflict do nothing;
  return new;
end;
$function$;

-- ── 2. Y los que ya existen se ponen al día ───────────────────────────────
--
-- Solo se AGREGA lo que falta; nunca se quita nada. Si un dueño le retiró un
-- permiso a un rol a propósito, esto se lo devolvería — por eso no se toca
-- ningún rol que el dueño haya creado él (`system_role = false`), solo los
-- cinco que siembra Cobra, que existen justamente para venir listos.
with base(clave, perms) as (values
  ('cajero', array['pedidos.crear','pedidos.cocina','pedidos.cobrar','pedidos.reabrir','cocina.ver',
                   'caja.abrir','caja.cerrar','caja.movimientos',
                   'catalogo.ver','ventas.ver','reservas.gestionar','domicilios.gestionar']::text[]),
  ('mesero', array['pedidos.crear','pedidos.cocina','cocina.ver','catalogo.ver','reservas.gestionar']::text[]),
  ('cocina', array['pedidos.cocina','cocina.ver','catalogo.ver']::text[]),
  ('domiciliario', array['domicilios.gestionar','pedidos.cobrar','catalogo.ver']::text[])
)
update pos_roles r
   set perms = (
         select array_agg(distinct x)
           from unnest(coalesce(r.perms, array[]::text[]) || b.perms) as x
       )
  from base b
 where r.clave = b.clave
   and r.system_role is true
   and not (r.perms @> b.perms);
