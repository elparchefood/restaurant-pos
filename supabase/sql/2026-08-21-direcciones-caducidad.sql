-- ══════════════════════════════════════════════════════════════════════
--  DIRECCIONES: LO QUE SE PUEDE GUARDAR Y POR CUANTO TIEMPO
--  (21-ago-2026, despues de leer las condiciones de Google)
--
--  Las condiciones de Google Maps Platform permiten guardar las
--  coordenadas que EL calcula por 30 dias corridos, no mas. Los
--  `place_id` si se pueden guardar para siempre.
--
--  PERO: las coordenadas que ponemos NOSOTROS no son de Google y no
--  tienen limite ninguno:
--     · el celular del domiciliario parado en la puerta del cliente
--     · la ubicacion que el cliente manda por WhatsApp
--
--  O sea que la caducidad es SOLO para lo que vino de Google. Y esto
--  refuerza algo que ya era cierto: cada entrega hace el mapa mas
--  barato, porque reemplaza un punto alquilado por uno propio.
-- ══════════════════════════════════════════════════════════════════════

alter table pos_direcciones_geo add column if not exists place_id text;
alter table pos_direcciones_geo add column if not exists exactitud text;
alter table pos_direcciones_geo add column if not exists vence_at timestamptz;
alter table pos_direcciones_geo add column if not exists canonica text;

comment on column pos_direcciones_geo.vence_at is
  'Solo para origen=google: a los 30 dias hay que volver a preguntar. Las condiciones de Google no dejan guardar SUS coordenadas mas tiempo. Los puntos propios (domiciliario, cliente) tienen vence_at nulo: son nuestros y no caducan.';
comment on column pos_direcciones_geo.place_id is
  'El identificador de Google. Este SI se puede guardar para siempre.';
comment on column pos_direcciones_geo.canonica is
  'La direccion ya ordenada como Google la entiende mejor: "Carrera 9B # 63 Norte-58".';

-- Lo que ya estaba guardado de Google arranca su cuenta desde hoy.
update pos_direcciones_geo
   set vence_at = now() + interval '30 days'
 where origen = 'google' and vence_at is null;

-- ── Guardar respetando la jerarquia Y la caducidad ────────────────────
create or replace function fn_direccion_guardar(
  p_tenant uuid, p_clave text, p_direccion text, p_barrio text,
  p_lat double precision, p_lng double precision, p_origen text,
  p_place_id text default null, p_exactitud text default null,
  p_canonica text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  --  De menos a mas confiable. 'google_aprox' es cuando Google NO
  --  encontro la casa y devolvio el centro del barrio o del pueblo: sirve
  --  para hacerse una idea, pero no para mandar a nadie ahi.
  v_rank_nuevo int := case p_origen
                        when 'domiciliario' then 4 when 'cliente' then 3
                        when 'google' then 2 else 1 end;
  v_rank_viejo int;
  --  Solo lo de Google caduca. Lo nuestro no.
  v_vence timestamptz := case when p_origen like 'google%'
                              then now() + interval '30 days' else null end;
begin
  select case g.origen
           when 'domiciliario' then 4 when 'cliente' then 3
           when 'google' then 2 else 1 end
    into v_rank_viejo
    from pos_direcciones_geo g
   where g.tenant_id = p_tenant and g.clave = p_clave;

  if v_rank_viejo is null then
    insert into pos_direcciones_geo (tenant_id, clave, direccion, barrio, lat, lng,
                                     origen, place_id, exactitud, canonica, vence_at)
    values (p_tenant, p_clave, p_direccion, p_barrio, p_lat, p_lng,
            p_origen, p_place_id, p_exactitud, p_canonica, v_vence);
  elsif v_rank_nuevo >= v_rank_viejo then
    update pos_direcciones_geo
       set lat = p_lat, lng = p_lng, origen = p_origen,
           direccion  = coalesce(p_direccion, direccion),
           barrio     = coalesce(p_barrio, barrio),
           place_id   = coalesce(p_place_id, place_id),
           exactitud  = coalesce(p_exactitud, exactitud),
           canonica   = coalesce(p_canonica, canonica),
           vence_at   = v_vence,
           veces = veces + 1, updated_at = now()
     where tenant_id = p_tenant and clave = p_clave;
  else
    update pos_direcciones_geo set veces = veces + 1
     where tenant_id = p_tenant and clave = p_clave;
  end if;
end;
$function$;

revoke all on function fn_direccion_guardar(uuid, text, text, text, double precision, double precision, text, text, text, text) from public;
grant execute on function fn_direccion_guardar(uuid, text, text, text, double precision, double precision, text, text, text, text) to authenticated, service_role;

-- ── Borrar lo de Google que ya caduco ─────────────────────────────────
--  El place_id se conserva (ese si se puede) para poder volver a
--  preguntar sin gastar una busqueda completa.
create or replace function fn_direcciones_caducar()
returns integer
language sql
security definer
set search_path to 'public'
as $function$
  with borradas as (
    delete from pos_direcciones_geo
     where origen like 'google%' and vence_at is not null and vence_at < now()
    returning 1
  ) select count(*)::int from borradas;
$function$;

revoke all on function fn_direcciones_caducar() from public;
grant execute on function fn_direcciones_caducar() to service_role;
