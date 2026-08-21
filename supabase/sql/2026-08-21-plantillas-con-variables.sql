-- ══════════════════════════════════════════════════════════════════════
--  LAS PLANTILLAS CON VARIABLES NO SE PODIAN ENVIAR  (21-ago-2026)
--
--  Sergio mando la plantilla `puntos_app` a 95 personas y fallaron LAS 95.
--  Meta devolvio siempre lo mismo:
--
--      (#132000) number of localizable_params (0)
--                does not match the expected number of params (1)
--
--  La plantilla dice "Tienes {{1}} Puntos en total" y Cobra la mandaba sin
--  ese dato. La otra campana (1.380 mensajes) funciono solo porque su
--  plantilla no tiene variables — el problema llevaba ahi desde siempre,
--  esperando a la primera plantilla que si tuviera.
--
--  Aqui se guarda, POR PERSONA, con que se rellena cada variable.
-- ══════════════════════════════════════════════════════════════════════

alter table pos_wa_envios add column if not exists params jsonb;

comment on column pos_wa_envios.params is
  'Con que se rellenan las variables de la plantilla, en orden: ["131"] llena {{1}}. Nulo = la plantilla no tiene variables.';

-- ── Armar la lista guardando tambien el valor de cada variable ────────
create or replace function fn_wa_armar_lista(p_lista uuid)
returns table(agregados integer, ya_estaban integer, total integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  v_soloenv := coalesce((v_f->>'solo_enviables')::boolean, true);
  v_plant   := coalesce(v_f->>'plantilla', '');

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
             when 'perdidos'    then c.n_pedidos > 0
                                     and c.ultimo_pedido is not null
                                     and c.ultimo_pedido < now() - interval '60 days'
             else true
           end
  ),
  unicos as (
    select distinct on (tel10) tel10, telefono, etiqueta, puntos, saldo
      from elegibles where tel10 is not null and length(tel10) = 10
     order by tel10, etiqueta nulls last
  ),
  nuevos as (
    insert into pos_wa_envios
      (tenant_id, branch_id, lista_id, plantilla, idioma, telefono, etiqueta, estado, orden, params)
    select v_l.tenant_id, v_l.branch_id, p_lista, v_plant, 'es',
           u.telefono, u.etiqueta, 'pendiente',
           row_number() over (order by u.etiqueta nulls last, u.tel10),
           /* CON QUE SE RELLENA LA VARIABLE DE LA PLANTILLA.
              Va por el filtro de la lista, que es lo que de verdad dice de
              que trata la campana: una lista "con puntos" manda los puntos,
              una "con saldo" manda el saldo. Las demas no llevan variable.
              Los numeros van con separador de miles, como los ve el
              cliente en la app: 1.250 y no 1250. */
           case v_filtro
             when 'puntos' then jsonb_build_array(
                    to_char(coalesce(u.puntos,0), 'FM999G999G999'))
             when 'saldo'  then jsonb_build_array(
                    to_char(coalesce(u.saldo,0),  'FM999G999G999'))
             else null
           end
      from unicos u
     where not exists (
       select 1 from pos_wa_envios e
        where e.lista_id = p_lista
          and regexp_replace(e.telefono, '\D', '', 'g') like '%'||u.tel10
     )
    returning 1
  )
  select count(*) into v_nuevos from nuevos;

  return query
    select v_nuevos,
           v_antes,
           (select count(*)::int from pos_wa_envios where lista_id = p_lista);
end;
$function$;
