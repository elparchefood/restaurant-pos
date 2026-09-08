-- ═══════════════════════════════════════════════════════════════════════════
--  EL PRECIO DE UNA SUSCRIPCIÓN — UN SOLO SITIO (7-sep-2026)
--
--  Por qué existe esta función: el cobro automático de Wompi necesita saber
--  cuánto cobrarle a un restaurante, y ese número YA se calcula dentro de
--  `provision`. Copiarlo habría sido la segunda vez que se copia — la primera
--  fue la página de venta, que cotizaba trimestral −7% y anual −15% cuando
--  aquí se cobra −10% y −20%. El cliente veía un precio y pagaba otro.
--
--  Así que el número vive aquí, en la base, y quien lo necesite lo pide.
--
--  ⚠️ EL ORDEN DE LOS DESCUENTOS NO ES CASUAL. Primero el de volumen por
--  sucursales, y el del periodo sobre ese total ya descontado. Lo decidió
--  Sergio y así está en los términos. Invertirlo da el mismo número solo por
--  casualidad matemática: el día que un descuento deje de ser porcentual, no.
--
--  Devuelve el BRUTO (sin descontar el saldo a favor). Quién aplica el saldo y
--  cuánto es decisión de quien cobra, porque el saldo se consume y eso hay que
--  registrarlo — no puede pasar dentro de un cálculo.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function fn_precio_suscripcion(p_tenant uuid, p_periodo text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan        text;
  v_base        numeric;
  v_sucursales  integer;
  v_tier        numeric;
  v_meses       integer;
  v_off         numeric;
begin
  select plan into v_plan from tenants where id = p_tenant;
  if v_plan is null then return null; end if;

  select precio into v_base from pos_planes where plan = v_plan;
  if v_base is null then return null; end if;

  --  Al menos una: un restaurante sin sucursales registradas sigue pagando su
  --  plan. Devolver 0 aquí sería regalarle el mes por un dato que falta.
  select greatest(1, count(*)) into v_sucursales from branches where tenant_id = p_tenant;

  v_tier := case when v_sucursales >= 8 then 0.30
                 when v_sucursales >= 4 then 0.20
                 when v_sucursales >= 2 then 0.10
                 else 0 end;

  case p_periodo
    when 'mensual'    then v_meses := 1;  v_off := 0;
    when 'trimestral' then v_meses := 3;  v_off := 0.10;
    when 'anual'      then v_meses := 12; v_off := 0.20;
    else return null;
  end case;

  return round(v_base * (1 - v_tier) * v_sucursales * v_meses * (1 - v_off));
end;
$$;

revoke all on function fn_precio_suscripcion(uuid, text) from public, anon;
grant execute on function fn_precio_suscripcion(uuid, text) to service_role, authenticated;

comment on function fn_precio_suscripcion(uuid, text) is
  'Precio bruto de la suscripcion de un restaurante para un periodo. Fuente unica: '
  'la usa el cobro automatico de Wompi. `provision` todavia lleva su propia copia '
  'identica (comprobado 90/90 el 7-sep) y debe pasar a llamar a esta.';
