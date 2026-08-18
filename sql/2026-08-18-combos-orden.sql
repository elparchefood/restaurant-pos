-- Arrastrar la tarjeta "Combos" en la pantalla de Categorias.
--
-- Su puesto vive en tenants.web_combos_orden, pero el dueño solo puede LEER la
-- tabla `tenants` (el PLAN vive ahi: con permiso de escritura cualquiera se
-- subia a Premium desde la consola del navegador — ver entrada del 3-ago).
-- Esta funcion deja cambiar ESE campo y nada mas, y solo del propio negocio.
create or replace function fn_set_combos_orden(p_orden int)
returns int
language plpgsql
security definer
set search_path = public
as $fn$
declare v_t uuid; v_n int;
begin
  v_t := current_tenant_id();
  if v_t is null then raise exception 'sin tenant'; end if;
  v_n := greatest(0, least(coalesce(p_orden,0), 200));
  update tenants set web_combos_orden = v_n where id = v_t;
  return v_n;
end;
$fn$;

revoke all on function fn_set_combos_orden(int) from public;
grant execute on function fn_set_combos_orden(int) to authenticated;

notify pgrst, 'reload schema';

-- Y el desempate del puesto de Combos dentro de la carta del cliente:
CREATE OR REPLACE FUNCTION public.fn_web_carta(p_slug text)
 RETURNS TABLE(categoria text, orden integer, productos jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_tenant uuid; v_top uuid; v_combos int;
begin
  select id into v_tenant from tenants
   where lower(slug) = lower(regexp_replace(coalesce(p_slug,''), '[^a-zA-Z0-9]', '', 'g'))
     and coalesce(web_activa,false) = true and coalesce(status,'active') = 'active'
   limit 1;
  if v_tenant is null then return; end if;

  select coalesce(web_combos_orden, 0) into v_combos from tenants where id = v_tenant;

  /* EL MAS PEDIDO DE VERDAD (16-ago). La medalla dorada no se pone a mano:
     es el producto con mas unidades vendidas en los ultimos 60 dias. Se busca
     UNA vez para todo el restaurante. Se piden al menos 10 unidades: con tres
     ventas, "el mas pedido" no significa nada. */
  select i.product_id into v_top
    from pos_order_items i join pos_orders o on o.id = i.order_id
   where o.tenant_id = v_tenant
     and o.created_at > now() - interval '60 days'
     and coalesce(o.status, '') <> 'cancelled'
     and i.product_id is not null
   group by i.product_id
  having sum(i.quantity) >= 10
   order by sum(i.quantity) desc
   limit 1;

  return query
  /* ── LOS COMBOS, COMO UNA CATEGORIA MAS (17-ago) ──────────────────────
     Se les da forma de producto, igual que hace pos-combos.js en las
     pantallas de venta: mismo prefijo "combo:" en el id, sin presentaciones,
     sin variables y sin adiciones — todo eso ya quedo decidido al armarlo.
     Un solo formato para los dos lados; dos habrian sido dos verdades.

     Solo salen los que apuntan a productos de verdad: los del formato viejo
     (items de texto libre) no se pueden preparar ni descontar del inventario,
     asi que tampoco se venden por la pagina.

     La descripcion, si el dueNo no escribio una, es lo que trae el combo. El
     cliente no puede decidir a ciegas: "Combo Sandwich" no dice nada. */
  /* EL DESEMPATE VA EN EL NUMERO, no en el ORDER BY: un UNION no acepta
     expresiones ahi. Las categorias ocupan los pares (1->2, 2->4, 3->6) y
     Combos el impar siguiente a su puesto: con puesto 2 sale 5, o sea entre la
     segunda (4) y la tercera (6). Con puesto 0 sale 1, antes de todas. Asi el
     mismo numero da siempre el mismo sitio; antes, en un empate, decidia el
     nombre de la categoria. Este `orden` solo sirve para ordenar: la pagina
     del cliente no lo lee. */
  select 'Combos'::text, (v_combos * 2 + 1)::int,
         jsonb_agg(jsonb_build_object(
           'id', 'combo:' || c.id,
           'nombre', c.name,
           'descripcion', coalesce(nullif(c.description, ''), (
             select string_agg(
                      case when coalesce((e.v->>'cantidad')::int, 1) > 1
                           then (e.v->>'cantidad') || 'x ' || coalesce(e.v->>'nombre', '?')
                           else coalesce(e.v->>'nombre', '?') end, ' + ' order by e.n)
               from jsonb_array_elements(c.items) with ordinality e(v, n)
           ), ''),
           'precio', c.price,
           'foto', nullif(c.photo_url, ''),
           'medalla', null,
           'presentaciones', '[]'::jsonb,
           'variables', '[]'::jsonb,
           'modificadores', '[]'::jsonb
         ) order by c.name)
    from pos_combos c
   where c.tenant_id = v_tenant
     and coalesce(c.active, true) = true
     and jsonb_typeof(c.items) = 'array'
     and jsonb_array_length(c.items) > 0
     and not exists (
       select 1 from jsonb_array_elements(c.items) x
        where coalesce(x->>'product_id', '') = ''
     )
  having count(*) > 0

  union all

  select c.name::text, (coalesce(c.sort_order, 999) * 2)::int,
         jsonb_agg(
           jsonb_build_object(
             'id', p.id, 'nombre', p.name,
             'descripcion', coalesce(p.description, ''),
             'precio', p.price,
             'foto', coalesce(nullif(p.photo_url, ''), nullif(p.image_url, '')),
             'medalla', coalesce(nullif(p.medalla, ''),
                                 case when p.id = v_top then 'mas_pedido' end),
             -- El monto de "ahorras"; en las demas medallas no se mira.
             'medalla_valor', p.medalla_valor,
             -- La tarjeta ancha que rompe la cuadricula.
             'grande', coalesce(p.carta_grande, false),
             -- Hoy no hay: sale en gris y no se puede pedir.
             'agotado', coalesce(p.agotado, false),
             'presentaciones', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', x->>'id',
                        'nombre', x->>'name',
                        'precio', (x->>'price')::numeric))
                 from jsonb_array_elements(coalesce(p.presentations, '[]'::jsonb)) x
                where coalesce(x->>'name','') <> ''
             ), '[]'::jsonb),
             'variables', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'nombre', g->>'name',
                        'opciones', coalesce((
                          select jsonb_agg(jsonb_build_object(
                                   'nombre', o->>'name',
                                   'precio', nullif(o->>'price','')::numeric,
                                   'precios', coalesce(o->'prices', '[]'::jsonb)))
                            from jsonb_array_elements(coalesce(g->'options','[]'::jsonb)) o
                           where coalesce(o->>'name','') <> ''
                        ), '[]'::jsonb)))
                 from jsonb_array_elements(coalesce(p.variables, '[]'::jsonb)) g
                where coalesce(g->>'name','') <> ''
             ), '[]'::jsonb),
             'modificadores', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'nombre', mg.name,
                        'regla', coalesce(mg.rule, 'opcional'),
                        'varias', coalesce(mg.multi, false),
                        'pres', coalesce(p.mod_group_pres -> mg.id::text, '[]'::jsonb),
                        'opciones', coalesce((
                          select jsonb_agg(jsonb_build_object(
                                   'nombre', o->>'name',
                                   'precio', coalesce(nullif(o->>'price','')::numeric, 0)))
                            from jsonb_array_elements(coalesce(mg.options, '[]'::jsonb)) o
                           where coalesce(o->>'name','') <> ''
                        ), '[]'::jsonb)))
                 from pos_modifier_groups mg
                where mg.tenant_id = v_tenant
                  and mg.id::text = any(
                        select jsonb_array_elements_text(coalesce(to_jsonb(p.mod_group_ids), '[]'::jsonb)))
             ), '[]'::jsonb)
           ) order by coalesce(p.sort_order, 999), p.name)
    from pos_products p join pos_categories c on c.id = p.category_id
   /* Los AGOTADOS ya no se esconden: entran a la carta y la pagina los pinta
      en gris. Lo que sigue fuera es lo que el dueNo quito de la venta
      (available=false) — eso no es "hoy no hay", es "ya no lo vendo". */
   where p.tenant_id = v_tenant and coalesce(p.available, true) = true
   group by c.name, c.sort_order

   order by 2, 1;
end
$function$

