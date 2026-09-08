-- ═══════════════════════════════════════════════════════════════════════════
--  EL PRECIO DE QUIEN TODAVÍA NO ES CLIENTE (7-sep-2026)
--
--  ⚠️ POR QUÉ ESTO NO PODÍA QUEDARSE COMO ESTABA.
--
--  `pos_registrations.monto_total` lo manda el NAVEGADOR: la pantalla de
--  registro calcula el precio y lo envía. Hoy eso no es grave porque una
--  persona mira la solicitud antes de aprobarla, y vería que alguien pide un
--  plan Pro diciendo que cuesta mil pesos.
--
--  Pero el pago en línea aprueba SOLO. En cuanto el cobro sea automático, ese
--  número deja de ser un dato y pasa a ser una puerta: quien lo cambie se
--  lleva el plan que quiera por lo que quiera.
--
--  Así que el precio de un registro se calcula aquí, con el plan y las
--  sucursales que pidió, y NUNCA con lo que mandó su pantalla.
--
--  Se parte en dos para no tener dos fórmulas: `fn_precio_calcular` hace la
--  cuenta, y las dos que ya existían la llaman.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function fn_precio_calcular(p_plan text, p_sucursales integer, p_periodo text)
returns integer
language plpgsql
immutable
as $$
declare
  v_base  numeric;
  v_suc   integer;
  v_tier  numeric;
  v_meses integer;
  v_off   numeric;
begin
  select precio into v_base from pos_planes where plan = p_plan;
  if v_base is null then return null; end if;

  --  Al menos una: un registro sin sucursales sigue pagando su plan.
  v_suc := greatest(1, coalesce(p_sucursales, 1));

  --  ⚠️ EL ORDEN NO ES CASUAL: primero el descuento por volumen, y el del
  --  periodo sobre ese total ya descontado. Lo decidió Sergio y así está en
  --  los términos. Invertirlo da el mismo número solo por casualidad
  --  matemática: el día que un descuento deje de ser porcentual, no.
  v_tier := case when v_suc >= 8 then 0.30
                 when v_suc >= 4 then 0.20
                 when v_suc >= 2 then 0.10
                 else 0 end;

  case p_periodo
    when 'mensual'    then v_meses := 1;  v_off := 0;
    when 'trimestral' then v_meses := 3;  v_off := 0.10;
    when 'anual'      then v_meses := 12; v_off := 0.20;
    else return null;
  end case;

  return round(v_base * (1 - v_tier) * v_suc * v_meses * (1 - v_off));
end;
$$;

--  La de siempre, ahora sin su propia copia de la cuenta.
create or replace function fn_precio_suscripcion(p_tenant uuid, p_periodo text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_suc  integer;
begin
  select plan into v_plan from tenants where id = p_tenant;
  if v_plan is null then return null; end if;
  select greatest(1, count(*)) into v_suc from branches where tenant_id = p_tenant;
  return fn_precio_calcular(v_plan, v_suc, p_periodo);
end;
$$;

--  Y la de un registro que todavía no tiene restaurante.
create or replace function fn_precio_registro(p_registro uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
begin
  select plan, sucursales, billing into r from pos_registrations where id = p_registro;
  if not found then return null; end if;
  return fn_precio_calcular(r.plan, r.sucursales, coalesce(r.billing, 'mensual'));
end;
$$;

revoke all on function fn_precio_calcular(text, integer, text)  from public, anon;
revoke all on function fn_precio_registro(uuid)                 from public, anon;
grant execute on function fn_precio_calcular(text, integer, text) to service_role, authenticated;
grant execute on function fn_precio_registro(uuid)                to service_role, authenticated;

comment on function fn_precio_calcular(text, integer, text) is
  'La cuenta del precio, en un solo sitio. La usan fn_precio_suscripcion (por restaurante) '
  'y fn_precio_registro (por solicitud). Comprobado 90/90 contra provision el 7-sep.';
comment on function fn_precio_registro(uuid) is
  'Precio de una solicitud de registro SEGUN SU PLAN, no segun el monto que mando el '
  'navegador: ese campo se puede cambiar desde la pantalla y el pago en linea aprueba solo.';
