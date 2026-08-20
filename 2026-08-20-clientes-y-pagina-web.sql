-- 2026-08-20 · Separar Clientes (lo ven todos) de Mi página web (solo la plataforma)
--
-- POR QUÉ:
-- La pantalla de Clientes mezclaba dos cosas que no son la misma. Los datos de
-- clientes los ve cualquier restaurante que use Cobra. El saldo, las recargas y
-- los usuarios registrados en la app solo existen si hay página de clientes, y
-- hoy esa función no se le vende a nadie. Quedan en módulos aparte.
--
-- Este archivo agrega lo único que faltaba en la base:
--   1. fn_puntos_regalar  → dar puntos a mano (el gemelo de fn_puntos_consumir).
--   2. fn_web_usuarios    → toda la actividad de un registrado en la app, en una
--                           sola consulta en vez de cuatro desde el navegador.
--   3. fn_web_embudo      → cuántos pidieron código, cuántos llegaron a
--                           registrarse, cuántos activaron avisos y cuántos ya
--                           pidieron.

-- ─────────────────────────────────────────────────────────────────────
-- 1 · DAR PUNTOS A MANO
-- ─────────────────────────────────────────────────────────────────────
-- Espejo exacto de fn_puntos_consumir: misma normalización del teléfono (es la
-- llave real de los puntos, no el cliente_id) y mismo libro de movimientos. El
-- tipo 'regalo' es lo que después permite separarlos de los que la persona ganó
-- comprando; si entraran como 'acumulacion' quedarían indistinguibles.
create or replace function public.fn_puntos_regalar(
  p_tenant   uuid,
  p_branch   uuid,
  p_telefono text,
  p_puntos   integer,
  p_detalle  text,
  p_quien    text
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_tel   text;
  v_id    uuid;
  v_saldo int;
begin
  if p_puntos is null or p_puntos <= 0 then
    raise exception 'PUNTOS_INVALIDOS';
  end if;

  v_tel := regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g');
  if length(v_tel) = 12 and left(v_tel, 2) = '57' then
    v_tel := substring(v_tel from 3);
  end if;
  if length(v_tel) < 7 then
    raise exception 'TELEFONO_INVALIDO';
  end if;

  -- pos_puntos no tiene índice único por (tenant, teléfono), así que no se puede
  -- usar `on conflict`: se busca con bloqueo y se crea la fila si no existía.
  select id, puntos into v_id, v_saldo
    from pos_puntos
   where tenant_id = p_tenant and telefono = v_tel
   for update;

  if v_id is null then
    insert into pos_puntos (tenant_id, branch_id, telefono, puntos)
    values (p_tenant, p_branch, v_tel, 0)
    returning id, puntos into v_id, v_saldo;
  end if;

  update pos_puntos
     set puntos = puntos + p_puntos, updated_at = now()
   where id = v_id;

  insert into pos_puntos_movimientos
    (tenant_id, branch_id, telefono, tipo, puntos, saldo_despues, detalle, quien)
  values
    (p_tenant, p_branch, v_tel, 'regalo', p_puntos, v_saldo + p_puntos, p_detalle, p_quien);

  return v_saldo + p_puntos;
end;
$fn$;

-- ─────────────────────────────────────────────────────────────────────
-- 2 · LOS REGISTRADOS EN LA APP, CON SU ACTIVIDAD
-- ─────────────────────────────────────────────────────────────────────
-- Una fila por persona que YA se registró (tiene credencial). Trae de una vez lo
-- que la pantalla necesita para no salir a la base cuatro veces por usuario.
create or replace function public.fn_web_usuarios(p_tenant uuid)
returns table (
  cliente_id  uuid,
  nombre      text,
  telefono    text,
  alta        timestamptz,
  entradas    integer,
  ultimo      timestamptz,
  avisos      integer,
  saldo       bigint,
  recargado   bigint,
  puntos      integer,
  pedidos_app integer,
  pedidos     integer
)
language sql
security definer
set search_path to 'public'
as $fn$
  select
    cr.cliente_id,
    c.nombre,
    c.telefono,
    cr.alta_at,
    (select count(*)::int          from pos_web_sesiones s
      where s.cliente_id = cr.cliente_id and s.tenant_id = p_tenant),
    (select max(s.ultimo_uso)      from pos_web_sesiones s
      where s.cliente_id = cr.cliente_id and s.tenant_id = p_tenant),
    (select count(*)::int          from pos_web_push w
      where w.cliente_id = cr.cliente_id and w.tenant_id = p_tenant),
    coalesce((select x.saldo from pos_saldo x
      where x.cliente_id = cr.cliente_id and x.tenant_id = p_tenant), 0)::bigint,
    coalesce((select sum(m.monto) from pos_saldo_mov m
      where m.cliente_id = cr.cliente_id and m.tenant_id = p_tenant
        and m.motivo = 'recarga'), 0)::bigint,
    coalesce((select p.puntos from pos_puntos p
      where p.tenant_id = p_tenant
        and p.telefono = regexp_replace(coalesce(c.telefono, ''), '[^0-9]', '', 'g')), 0)::int,
    -- Solo los que entraron por la página. `origen` lo empezó a marcar
    -- web-pedido el 20-ago; antes de esa fecha nadie había pedido por ahí.
    (select count(*)::int from pos_orders o
      where o.cliente_id = cr.cliente_id and o.tenant_id = p_tenant
        and o.origen = 'web' and o.status <> 'cancelled'),
    (select count(*)::int from pos_orders o
      where o.cliente_id = cr.cliente_id and o.tenant_id = p_tenant
        and o.status <> 'cancelled')
  from pos_web_credenciales cr
  join pos_clientes c on c.id = cr.cliente_id
 where cr.tenant_id = p_tenant
 order by cr.alta_at desc;
$fn$;

-- ─────────────────────────────────────────────────────────────────────
-- 3 · EL EMBUDO DE LA APP
-- ─────────────────────────────────────────────────────────────────────
-- Dónde se cae la gente: pidió el código → se registró → activó avisos → pidió.
-- Sin esto no hay forma de saber si el problema es que no llegan o que llegan y
-- no terminan; a Sandra le pasó lo segundo tres veces antes del SMS.
create or replace function public.fn_web_embudo(p_tenant uuid)
returns table (
  codigos     integer,
  pidieron    integer,
  registrados integer,
  con_avisos  integer,
  con_pedido  integer
)
language sql
security definer
set search_path to 'public'
as $fn$
  select
    (select count(*)::int                    from pos_web_codigos k where k.tenant_id = p_tenant),
    (select count(distinct k.telefono)::int  from pos_web_codigos k where k.tenant_id = p_tenant),
    (select count(*)::int                    from pos_web_credenciales cr where cr.tenant_id = p_tenant),
    (select count(distinct w.cliente_id)::int from pos_web_push w where w.tenant_id = p_tenant),
    (select count(distinct o.cliente_id)::int from pos_orders o
      where o.tenant_id = p_tenant and o.origen = 'web' and o.status <> 'cancelled');
$fn$;

-- ─────────────────────────────────────────────────────────────────────
-- PERMISOS
-- ─────────────────────────────────────────────────────────────────────
-- Sin esto las funciones existen pero PostgREST responde 404: es la trampa que
-- ya nos costó una tarde con las tablas creadas por la API de administración.
grant execute on function public.fn_puntos_regalar(uuid, uuid, text, integer, text, text) to anon, authenticated, service_role;
grant execute on function public.fn_web_usuarios(uuid)  to anon, authenticated, service_role;
grant execute on function public.fn_web_embudo(uuid)    to anon, authenticated, service_role;

notify pgrst, 'reload schema';
