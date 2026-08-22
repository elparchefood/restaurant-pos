-- 2026-08-21 · fn_wa_armar_lista aprende los filtros nuevos
--
-- Los filtros viven en DOS sitios: la pantalla (para ver y contar) y esta
-- función (para llenar la cola al enviar). Al agregar los filtros de la app
-- instalada había que enseñárselos también aquí.
--
-- Y un arreglo de seguridad que apareció al revisarla: el CASE terminaba en
-- `else true`, así que un filtro que la función no conociera le habría
-- enviado la plantilla a TODOS los contactos, en silencio. Ahora un filtro
-- desconocido frena con error — mejor un envío que no sale que 1.400
-- mensajes que no debían salir.

create or replace function public.fn_wa_armar_lista(p_lista uuid)
returns table (agregados integer, ya_estaban integer, total integer)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_l        record;
  v_f        jsonb;
  v_filtro   text;
  v_buscar   text;
  v_soloenv  boolean;
  v_plant    text;
  v_antes    int;
  v_nuevos   int;
begin
  select * into v_l from pos_wa_listas where id = p_lista;
  if v_l is null then
    raise exception 'LISTA_NO_EXISTE';
  end if;

  v_f       := coalesce(v_l.filtros, '{}'::jsonb);
  v_filtro  := coalesce(v_f->>'filtro', 'todos');
  v_buscar  := lower(btrim(coalesce(v_f->>'buscar', '')));
  -- Por defecto NO se le escribe a la lista negra. Tiene que ser explícito.
  v_soloenv := coalesce((v_f->>'solo_enviables')::boolean, true);
  v_plant    := coalesce(v_f->>'plantilla', '');

  -- El freno de los filtros desconocidos (ver cabecera).
  if v_filtro not in ('todos','no_escribio','escribio','guardado','pedidos',
                      'sin_nombre','registrado','puntos','saldo','una_vez',
                      'sin_pedidos','perdidos','registrado_sin_app','instalada',
                      'instalada_sin_pedidos','escribio_sin_pedido','frecuentes',
                      'sin_app_iphone','sin_app_android','sin_app_sin_dato') then
    raise exception 'FILTRO_DESCONOCIDO: %', v_filtro;
  end if;

  select count(*) into v_antes from pos_wa_envios where lista_id = p_lista;

  with elegibles as (
    select c.*
      from v_wa_contactos c
     where c.branch_id = v_l.branch_id
       and (not v_soloenv or (not c.no_atender and not c.en_lista_negra))
       and (v_buscar = '' or lower(coalesce(c.etiqueta,'')) like '%'||v_buscar||'%'
            or regexp_replace(coalesce(c.telefono,''), '\D', '', 'g') like '%'||regexp_replace(v_buscar, '\D', '', 'g')||'%')
       and case v_filtro
             when 'todos'       then true
             when 'no_escribio' then not c.ya_escribio
             when 'escribio'    then c.ya_escribio
             when 'guardado'    then c.guardado
             when 'pedidos'     then c.n_pedidos > 0
             when 'sin_nombre'  then not c.tiene_nombre
             when 'registrado'  then c.registrado_app
             when 'puntos'      then c.puntos > 0
             when 'saldo'       then c.saldo > 0
             when 'una_vez'     then c.n_pedidos = 1
             when 'sin_pedidos' then c.n_pedidos = 0
             -- Perdido es quien YA compró y lleva más de 60 días sin volver.
             -- Quien nunca compró no está perdido: nunca lo tuviste.
             when 'perdidos'    then c.n_pedidos > 0
                                     and c.ultimo_pedido is not null
                                     and c.ultimo_pedido < now() - interval '60 days'
             -- Los de la campaña de la app (21-ago): mismas reglas que la pantalla.
             when 'registrado_sin_app'    then c.registrado_app and not c.instalada_app
             when 'instalada'             then c.instalada_app
             when 'instalada_sin_pedidos' then c.instalada_app and c.n_pedidos = 0
             when 'escribio_sin_pedido'   then c.ya_escribio and c.n_pedidos = 0
             when 'frecuentes'            then c.n_pedidos >= 3
             -- Reparto por aparato de 'registrado_sin_app', sin traslapes:
             -- video de iPhone, video de Android o la plantilla general.
             when 'sin_app_iphone'   then c.registrado_app and not c.instalada_app and c.plataforma_app = 'ios'
             when 'sin_app_android'  then c.registrado_app and not c.instalada_app and c.plataforma_app = 'android'
             when 'sin_app_sin_dato' then c.registrado_app and not c.instalada_app and c.plataforma_app is null
             else false   -- inalcanzable por el freno de arriba; false por si acaso
           end
  ),
  /* Un mismo número puede estar dos veces en los contactos (con indicativo y
     sin él). Se manda UNA sola vez: recibir la misma promoción dos veces es la
     forma más rápida de que alguien bloquee el número. */
  unicos as (
    select distinct on (tel10) tel10, telefono, etiqueta
      from elegibles where tel10 is not null and length(tel10) = 10
     order by tel10, etiqueta nulls last
  ),
  nuevos as (
    insert into pos_wa_envios
      (tenant_id, branch_id, lista_id, plantilla, idioma, telefono, etiqueta, estado, orden)
    select v_l.tenant_id, v_l.branch_id, p_lista, v_plant, 'es',
           u.telefono, u.etiqueta, 'pendiente',
           row_number() over (order by u.etiqueta nulls last, u.tel10)
      from unicos u
     where not exists (
       select 1 from pos_wa_envios e
        where e.lista_id = p_lista
          and right(regexp_replace(e.telefono, '\D', '', 'g'), 10) = u.tel10
     )
    returning 1
  )
  select count(*)::int into v_nuevos from nuevos;

  return query
    select v_nuevos,
           v_antes,
           (select count(*)::int from pos_wa_envios where lista_id = p_lista);
end;
$fn$;

grant execute on function public.fn_wa_armar_lista(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
