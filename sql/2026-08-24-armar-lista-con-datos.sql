-- ═══════════════════════════════════════════════════════════════════════════
--  LA LISTA SE ARMABA SIN LOS DATOS DE LA PLANTILLA  (24-ago-2026)
-- ───────────────────────────────────────────────────────────────────────────
--  Sergio: los 28 de "Registrados No Instalaron" llevaban horas en cola sin
--  salir. Le dio a Detener y volver a enviar, y siguieron igual.
--
--  Dos cosas distintas los frenaban:
--
--    1. Los telefonos. Al recuperar esos contactos yo los guarde con 10
--       digitos y sin indicativo (`3006825554` en vez de `+573006825554`).
--       Corregido aparte, en la lista Y en la cola, que guarda su propia copia.
--
--    2. ESTA. `fn_wa_armar_lista` mete las filas en la cola SIN `params`, o
--       sea sin los datos que la plantilla necesita para armar el mensaje.
--       `instalacion_app` lleva un hueco para el nombre del cliente, y sin el
--       `wa-enviar-lista` frena todo antes de mandar:
--
--         "La plantilla instalacion_app necesita 1 dato y esta lista no los
--          tiene. No se envio nada."
--
--       Y hace bien en frenar: mandarlo igual le llegaria a 28 personas como
--       "Hola , instala la app" — o Meta lo rechazaria y se gastarian 28
--       intentos del limite diario.
--
--       Esto NO era culpa de los contactos recuperados: cualquier lista con
--       una plantilla que lleve variables se habria quedado igual de atascada.
--
--  ── DE DONDE SALE CADA DATO ─────────────────────────────────────────────
--  `ia_config.plantillas_vars` ya dice que necesita cada plantilla:
--      instalacion_app  -> ["nombre_cliente"]
--      puntos_app       -> ["puntos_total"]
--  Aqui se traduce cada nombre a una columna de `v_wa_contactos`. Si aparece
--  uno que no se sabe traducir, se manda cadena vacia en vez de fallar: es
--  preferible un hueco a que la lista entera no salga.
-- ═══════════════════════════════════════════════════════════════════════════

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
  v_buscar   text;
  v_soloenv  boolean;
  v_plant    text;
  v_antes    int;
  v_nuevos   int;
  v_vars     jsonb;      -- que datos pide la plantilla, en orden
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

  --  Los datos que pide ESTA plantilla, en el orden en que van los {{1}},{{2}}…
  select coalesce(c.plantillas_vars -> v_plant, '[]'::jsonb)
    into v_vars
    from ia_config c
   where c.branch_id = v_l.branch_id
   limit 1;
  v_vars := coalesce(v_vars, '[]'::jsonb);

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
       and (not v_soloenv or (not c.en_lista_negra and not c.no_atender))
       and (v_buscar = '' or lower(coalesce(c.etiqueta,'')) like '%'||v_buscar||'%'
                          or c.tel10 like '%'||v_buscar||'%')
       and (
         v_filtro = 'todos'
         or (v_filtro = 'no_escribio'          and not c.ya_escribio)
         or (v_filtro = 'escribio'              and c.ya_escribio)
         or (v_filtro = 'guardado'              and c.guardado)
         or (v_filtro = 'pedidos'               and coalesce(c.n_pedidos,0) > 0)
         or (v_filtro = 'sin_nombre'            and not c.tiene_nombre)
         or (v_filtro = 'registrado'            and c.registrado_app)
         or (v_filtro = 'puntos'                and coalesce(c.puntos,0) > 0)
         or (v_filtro = 'saldo'                 and coalesce(c.saldo,0) > 0)
         or (v_filtro = 'una_vez'               and coalesce(c.n_pedidos,0) = 1)
         or (v_filtro = 'sin_pedidos'           and coalesce(c.n_pedidos,0) = 0)
         or (v_filtro = 'perdidos'              and coalesce(c.n_pedidos,0) > 0
                                                and c.ultimo_pedido < now() - interval '30 days')
         or (v_filtro = 'registrado_sin_app'    and c.registrado_app and not c.instalada_app)
         or (v_filtro = 'instalada'             and c.instalada_app)
         or (v_filtro = 'instalada_sin_pedidos' and c.instalada_app and coalesce(c.n_pedidos,0) = 0)
         or (v_filtro = 'escribio_sin_pedido'   and c.ya_escribio and coalesce(c.n_pedidos,0) = 0)
         or (v_filtro = 'frecuentes'            and coalesce(c.n_pedidos,0) >= 3)
         or (v_filtro = 'sin_app_iphone'        and c.registrado_app and not c.instalada_app and c.plataforma_app = 'ios')
         or (v_filtro = 'sin_app_android'       and c.registrado_app and not c.instalada_app and c.plataforma_app = 'android')
         or (v_filtro = 'sin_app_sin_dato'      and c.registrado_app and not c.instalada_app and c.plataforma_app is null)
       )
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
           /*  LOS DATOS DE LA PLANTILLA, en el orden que ella los pide.
               Cada nombre se traduce a una columna del contacto. Uno que no se
               sepa traducir sale como cadena vacia: mejor un hueco que una
               lista entera que no arranca. */
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

comment on function public.fn_wa_armar_lista(uuid) is
  'Arma la cola de una lista de envio. Llena `params` con los datos que pide la plantilla segun ia_config.plantillas_vars: sin eso, cualquier plantilla con variables se queda en cola para siempre y wa-enviar-lista la frena antes de mandar.';

-- ── Rellenar los que YA estaban en cola sin datos ──────────────────────────
--  Los 28 de Sergio ya estan encolados; rearmar la lista no los toca porque la
--  funcion salta los telefonos que ya existen. Se les pone el dato aqui.
update pos_wa_envios e
   set params = jsonb_build_array(coalesce(nullif(btrim(e.etiqueta), ''), 'Hola'))
 where e.estado = 'pendiente'
   and e.params is null
   and e.plantilla = 'instalacion_app';
