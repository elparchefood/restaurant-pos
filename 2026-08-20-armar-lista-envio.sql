-- 2026-08-20 · Armar los destinatarios de una lista
--
-- EL HUECO. Se podían crear listas y se podía enviar, pero NADIE llenaba la
-- cola de destinatarios: `pos_wa_envios` solo se leía y se actualizaba. Los
-- 1.381 de la única campaña que existía los metí yo desde el servidor, así que
-- el hueco estuvo tapado hasta que Sergio quiso hacer la suya.
--
-- Esta función es la pieza que faltaba: lee los filtros guardados en la lista y
-- mete en la cola a los que cumplen, en estado 'pendiente'. De ahí en adelante
-- el reloj que ya existe se encarga de mandarlos por tandas.
--
-- SE PUEDE LLAMAR VARIAS VECES sin miedo: no vuelve a meter a quien ya está en
-- esa lista. Así, si el dueño arma hoy y mañana entran contactos nuevos, vuelve
-- a armar y solo se agregan los nuevos.

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
             else true
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
