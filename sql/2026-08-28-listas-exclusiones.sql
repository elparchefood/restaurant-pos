-- ═══════════════════════════════════════════════════════════════════════════
-- Listas de envío: los mismos criterios, también para EXCLUIR
-- Sergio, 28-ago-2026
--
--   "Aparte de hacer filtros, también hacer excepciones. Yo puedo hacer una
--    lista de muchas personas y luego excluir a todas las que ya tienen la app
--    instalada. Todos los filtros que ya existen, de manera de exclusión."
--
-- Un filtro dice a quién SÍ. Una exclusión dice a quién NO, y no es lo mismo
-- puesto al revés: "con pedidos, menos los que ya tienen la app" no se puede
-- decir con un solo filtro por más filtros que haya.
--
-- ⚠️ Y LO IMPORTANTE DE COMO ESTA HECHO: el criterio se define UNA vez, en
-- `fn_wa_criterio`, y lo usan los dos lados. Escribir las veinte condiciones
-- dos veces —una para incluir y otra para excluir— es garantizar que algún día
-- "filtrar instalada" y "excluir instalada" digan cosas distintas, y que nadie
-- se entere hasta que una campaña salga mal.
--
-- Ya pasó algo así aquí mismo: la pantalla ofrecía "hace más de 60 días que no
-- piden" y el servidor armaba la lista con 30. Todo el que llevara entre 31 y
-- 59 días recibía un mensaje que en pantalla no aparecía. Se corrige a 60, que
-- es lo que dice —y promete— la pantalla.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. El criterio, en un solo sitio ──────────────────────────────────────
create or replace function public.fn_wa_criterio(
  p_criterio      text,
  p_ya_escribio   boolean,
  p_guardado      boolean,
  p_n_pedidos     integer,
  p_tiene_nombre  boolean,
  p_registrado    boolean,
  p_instalada     boolean,
  p_puntos        numeric,
  p_saldo         numeric,
  p_ultimo_pedido timestamptz,
  p_plataforma    text
) returns boolean
language sql
immutable
as $$
  select case p_criterio
    when 'todos'                 then true
    when 'no_escribio'           then not coalesce(p_ya_escribio, false)
    when 'escribio'              then coalesce(p_ya_escribio, false)
    when 'guardado'              then coalesce(p_guardado, false)
    when 'pedidos'               then coalesce(p_n_pedidos, 0) > 0
    when 'sin_nombre'            then not coalesce(p_tiene_nombre, false)
    when 'registrado'            then coalesce(p_registrado, false)
    when 'puntos'                then coalesce(p_puntos, 0) > 0
    when 'saldo'                 then coalesce(p_saldo, 0) > 0
    when 'una_vez'               then coalesce(p_n_pedidos, 0) = 1
    when 'sin_pedidos'           then coalesce(p_n_pedidos, 0) = 0
    when 'frecuentes'            then coalesce(p_n_pedidos, 0) >= 3
    --  Perdido es quien YA compró y lleva más de 60 días sin volver. Quien
    --  nunca compró no está perdido: nunca lo tuviste.
    when 'perdidos'              then coalesce(p_n_pedidos, 0) > 0
                                  and p_ultimo_pedido is not null
                                  and p_ultimo_pedido < now() - interval '60 days'
    when 'registrado_sin_app'    then coalesce(p_registrado, false) and not coalesce(p_instalada, false)
    when 'sin_app_iphone'        then coalesce(p_registrado, false) and not coalesce(p_instalada, false) and p_plataforma = 'ios'
    when 'sin_app_android'       then coalesce(p_registrado, false) and not coalesce(p_instalada, false) and p_plataforma = 'android'
    when 'sin_app_sin_dato'      then coalesce(p_registrado, false) and not coalesce(p_instalada, false) and p_plataforma is null
    when 'instalada'             then coalesce(p_instalada, false)
    when 'instalada_sin_pedidos' then coalesce(p_instalada, false) and coalesce(p_n_pedidos, 0) = 0
    when 'escribio_sin_pedido'   then coalesce(p_ya_escribio, false) and coalesce(p_n_pedidos, 0) = 0
    else false
  end;
$$;

-- ── 1b. Y saber si un criterio existe, sin repetir la lista de nombres ────
--
-- Se pregunta por la misma funcion en vez de mantener un `in (...)` aparte:
-- ese `in` ya se habia quedado corto una vez y dejaba pasar nombres que la
-- funcion no entiende.
create or replace function public.fn_wa_criterio_existe(p_criterio text)
returns boolean
language sql
immutable
as $$
  select p_criterio in (
    'todos','no_escribio','escribio','guardado','pedidos','sin_nombre',
    'registrado','puntos','saldo','una_vez','sin_pedidos','frecuentes',
    'perdidos','registrado_sin_app','sin_app_iphone','sin_app_android',
    'sin_app_sin_dato','instalada','instalada_sin_pedidos','escribio_sin_pedido'
  );
$$;

-- ── 2. Armar la lista: filtro para incluir, lista de criterios para excluir ─
create or replace function public.fn_wa_armar_lista(p_lista uuid)
returns table(agregados integer, ya_estaban integer, total integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_l        record;
  v_f        jsonb;
  v_filtro   text;
  v_exc      jsonb;
  v_buscar   text;
  v_soloenv  boolean;
  v_plant    text;
  v_antes    int;
  v_nuevos   int;
  v_vars     jsonb;
begin
  select * into v_l from pos_wa_listas where id = p_lista;
  if v_l is null then
    raise exception 'LISTA_NO_EXISTE';
  end if;

  v_f       := coalesce(v_l.filtros, '{}'::jsonb);
  v_filtro  := coalesce(v_f->>'filtro', 'todos');
  --  Las exclusiones son una lista: se pueden apilar varias.
  v_exc     := case when jsonb_typeof(v_f->'excluir') = 'array'
                    then v_f->'excluir' else '[]'::jsonb end;
  v_buscar  := lower(btrim(coalesce(v_f->>'buscar', '')));
  v_soloenv := coalesce((v_f->>'solo_enviables')::boolean, true);
  v_plant   := coalesce(v_f->>'plantilla', '');

  select coalesce(c.plantillas_vars -> v_plant, '[]'::jsonb)
    into v_vars
    from ia_config c
   where c.branch_id = v_l.branch_id
   limit 1;
  v_vars := coalesce(v_vars, '[]'::jsonb);

  /*  Un criterio que no se reconoce se RECHAZA en vez de tratarse como falso.
      Tratarlo como falso dejaría la lista silenciosamente vacía —o peor, sin
      excluir a nadie— y quien la mandó creería que hizo lo que pidió. */
  if not fn_wa_criterio_existe(v_filtro) then
    raise exception 'FILTRO_DESCONOCIDO: %', v_filtro;
  end if;
  if exists (select 1 from jsonb_array_elements_text(v_exc) x(k)
              where not fn_wa_criterio_existe(x.k)) then
    raise exception 'EXCLUSION_DESCONOCIDA';
  end if;

  select count(*) into v_antes from pos_wa_envios where lista_id = p_lista;

  with elegibles as (
    select c.*
      from v_wa_contactos c
     where c.branch_id = v_l.branch_id
       and (not v_soloenv or (not c.en_lista_negra and not c.no_atender))
       and (v_buscar = '' or lower(coalesce(c.etiqueta,'')) like '%'||v_buscar||'%'
                          or c.tel10 like '%'||v_buscar||'%')
       and fn_wa_criterio(v_filtro, c.ya_escribio, c.guardado, c.n_pedidos,
                          c.tiene_nombre, c.registrado_app, c.instalada_app,
                          c.puntos, c.saldo, c.ultimo_pedido, c.plataforma_app)
       --  Y FUERA LOS EXCLUIDOS. Basta con cumplir UNA exclusión para quedar
       --  fuera: si el dueño dijo "estos no", no hay medias tintas.
       and not exists (
             select 1 from jsonb_array_elements_text(v_exc) x(k)
              where fn_wa_criterio(x.k, c.ya_escribio, c.guardado, c.n_pedidos,
                                   c.tiene_nombre, c.registrado_app, c.instalada_app,
                                   c.puntos, c.saldo, c.ultimo_pedido, c.plataforma_app))
  ),
  unicos as (
    select distinct on (tel10) * from elegibles order by tel10, created_at
  ),
  nuevos as (
    insert into pos_wa_envios
      (tenant_id, branch_id, lista_id, plantilla, idioma, telefono, etiqueta, estado, orden, params)
    select v_l.tenant_id, v_l.branch_id, p_lista, v_plant, 'es',
           u.telefono, u.etiqueta, 'pendiente',
           row_number() over (order by u.etiqueta nulls last, u.tel10),
           (select coalesce(jsonb_agg(
                     case v.nombre
                       when 'nombre_cliente' then to_jsonb(coalesce(nullif(btrim(u.etiqueta),''), 'Hola'))
                       when 'nombre'         then to_jsonb(coalesce(nullif(btrim(u.etiqueta),''), 'Hola'))
                       when 'puntos_total'   then to_jsonb(coalesce(u.puntos,0)::text)
                       when 'puntos'         then to_jsonb(coalesce(u.puntos,0)::text)
                       when 'saldo'          then to_jsonb(coalesce(u.saldo,0)::text)
                       when 'negocio'        then to_jsonb(coalesce(
                                                  (select b.name from brands b
                                                    where b.tenant_id = v_l.tenant_id
                                                    order by b.created_at limit 1), ''))
                       else to_jsonb(''::text)
                     end
                     order by v.orden), '[]'::jsonb)
              from jsonb_array_elements_text(v_vars) with ordinality as v(nombre, orden))
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
$function$;
