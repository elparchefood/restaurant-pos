-- ══════════════════════════════════════════════════════════════════════
--  TOPE GLOBAL DE COBRA  (21-ago-2026)
--
--  Con una sola llave para todos los restaurantes, el tope por
--  restaurante NO alcanza: veinte restaurantes portandose bien pueden
--  sumar una cuenta que nadie miro. Este es el freno de Cobra sobre SU
--  propia tarjeta.
--
--  Se lleva en la misma tabla, con un tenant "de la casa" (todo ceros)
--  que no es ningun restaurante.
-- ══════════════════════════════════════════════════════════════════════
create or replace function fn_mapas_consumir_global(p_sku text, p_tope integer)
returns table (permitido boolean, usado integer, tope integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_todos uuid := '00000000-0000-0000-0000-000000000000';
  v_mes text := to_char(now() at time zone 'America/Bogota', 'YYYY-MM');
  v_n integer;
begin
  insert into pos_mapas_uso (tenant_id, mes, sku, n)
  values (v_todos, v_mes, p_sku, 0)
  on conflict (tenant_id, mes, sku) do nothing;

  select u.n into v_n from pos_mapas_uso u
   where u.tenant_id = v_todos and u.mes = v_mes and u.sku = p_sku
     for update;

  if v_n + 1 > p_tope then
    return query select false, v_n, p_tope;
    return;
  end if;

  update pos_mapas_uso u set n = u.n + 1
   where u.tenant_id = v_todos and u.mes = v_mes and u.sku = p_sku
   returning u.n into v_n;

  return query select true, v_n, p_tope;
end;
$function$;

revoke all on function fn_mapas_consumir_global(text, integer) from public;
grant execute on function fn_mapas_consumir_global(text, integer) to service_role;

-- Como va el gasto de Cobra en total (para mirarlo cuando haga falta)
create or replace function fn_mapas_global_estado()
returns table (sku text, n integer)
language sql stable security definer set search_path to 'public'
as $function$
  select u.sku, u.n from pos_mapas_uso u
   where u.tenant_id = '00000000-0000-0000-0000-000000000000'
     and u.mes = to_char(now() at time zone 'America/Bogota', 'YYYY-MM');
$function$;
revoke all on function fn_mapas_global_estado() from public;
grant execute on function fn_mapas_global_estado() to service_role;
