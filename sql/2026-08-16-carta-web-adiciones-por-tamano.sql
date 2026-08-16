-- ══════ LAS ADICIONES SON LAS DE SU TAMAÑO ══════
-- Caso real (16-ago): en la página, una Premium FAMILIAR llegaba al paso de
-- adiciones y ofrecía "Adiciones Personales" — el grupo del otro tamaño, con
-- otros precios. El producto guarda en `mod_group_pres` qué grupo va con qué
-- presentación ({grupo: [pres_id]}), pero fn_web_carta devolvía TODOS los
-- grupos de `mod_group_ids` sin ese mapa, así que la página no tenía con qué
-- filtrar.
--
-- Aquí se agregan dos datos que faltaban:
--   · el `id` de cada presentación (antes solo iban nombre y precio)
--   · el `pres` de cada grupo de modificadores: a qué presentaciones aplica.
--     Vacío = aplica a todas (productos de un solo tamaño, salsas comunes...).
CREATE OR REPLACE FUNCTION public.fn_web_carta(p_slug text)
 RETURNS TABLE(categoria text, orden int, productos jsonb)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_tenant uuid;
begin
  select id into v_tenant from tenants
   where lower(slug) = lower(regexp_replace(coalesce(p_slug,''), '[^a-zA-Z0-9]', '', 'g'))
     and coalesce(web_activa,false) = true and coalesce(status,'active') = 'active'
   limit 1;
  if v_tenant is null then return; end if;

  return query
  select c.name::text, coalesce(c.sort_order, 999)::int,
         jsonb_agg(
           jsonb_build_object(
             'id', p.id, 'nombre', p.name,
             'descripcion', coalesce(p.description, ''),
             'precio', p.price,
             'foto', coalesce(nullif(p.photo_url, ''), nullif(p.image_url, '')),
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
             -- Los modificadores (adiciones, salsas...) viven en su propia tabla
             -- y el producto solo guarda los ids. Se resuelven aqui para que la
             -- pagina no tenga que ir a buscarlos uno por uno.
             'modificadores', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'nombre', mg.name,
                        'regla', coalesce(mg.rule, 'opcional'),
                        'varias', coalesce(mg.multi, false),
                        -- A QUE TAMAÑOS APLICA. Vacio = a todos.
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
   where p.tenant_id = v_tenant and coalesce(p.available, true) = true
   group by c.name, c.sort_order
   order by coalesce(c.sort_order, 999), c.name;
end
$function$;
