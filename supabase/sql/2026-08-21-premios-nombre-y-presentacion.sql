-- ══════════════════════════════════════════════════════════════════════
--  PREMIOS: EL NOMBRE Y LA PRESENTACION  (21-ago-2026)
--
--  Dos problemas del mismo origen, encontrados al agregar la hamburguesa
--  DOBLE CARNE como premio:
--
--  1. Al reclamarla, el domicilio se quedaba "calculando..." PARA SIEMPRE.
--     La pantalla de premios guardaba la palabra "Único" como nombre de la
--     presentacion. Pero "Único" es solo el ROTULO que se enseña cuando la
--     presentacion no tiene nombre — no es su nombre. El servidor la
--     buscaba por ese nombre, no la encontraba, respondia error, y la
--     pagina del cliente (que solo pinta el total si la respuesta viene
--     bien) se quedaba girando sin decir nada.
--
--  2. Por lo mismo, en pantalla salia "DOBLE CARNE · Único".
--
--  Aqui va el arreglo del NOMBRE. El de la busqueda va en `web-pedido`
--  (ahora manda `pres_id`, que es exacto) y el de no volver a guardar el
--  rotulo va en `configuracion-puntos.js`.
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_web_puntos_catalogo(p_slug text)
 RETURNS TABLE(id uuid, nombre text, descripcion text, puntos integer, dinero integer, foto text, tipo text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_tenant uuid;
begin
  select t.id into v_tenant from tenants t
   where lower(t.slug) = lower(regexp_replace(coalesce(p_slug,''), '[^a-zA-Z0-9]', '', 'g'))
     and coalesce(t.web_activa,false) = true
   limit 1;
  if v_tenant is null then return; end if;

  return query
  /* El catalogo no guarda el nombre: apunta al producto o al combo. Asi, si el
     restaurante le cambia el nombre a un plato, cambia tambien en los canjes. */
  select k.id,
         /* EL NOMBRE SE ARMA COMO EN LA COMANDA (regla de Sergio, 21-ago):
            primero el tamaño, y si el producto no tiene tamaños, el nombre de
            la categoria. Despues el producto.

            Antes salia "DOBLE CARNE · Único": "Único" es el rotulo que enseña
            la pantalla cuando la presentacion no tiene nombre, y se habia
            guardado como si fuera su nombre. Y "DOBLE CARNE" a secas no dice
            si es hamburguesa, sandwich o perro — que es justo el motivo por el
            que la comanda lleva la categoria. */
         (coalesce(nullif(k.pres_nombre,''), c.name, '')
            || case when coalesce(nullif(k.pres_nombre,''), c.name, '') <> ''
                    then ' · ' else '' end
            || p.name)::text,
         coalesce(p.description,'')::text,
         k.puntos::int,
         coalesce(k.dinero,0)::int,
         nullif(coalesce(p.photo_url, p.image_url),'')::text,
         'producto'::text
    from pos_puntos_catalogo k
    join pos_products p on p.id = k.product_id
    left join pos_categories c on c.id = p.category_id
   where k.tenant_id = v_tenant
     and coalesce(k.activo, true) = true
     -- Un premio que apunta a algo que ya no se vende no se puede entregar.
     and coalesce(p.available, true) = true

  union all

  /* Para un combo NO se pega el "pres_nombre": seria "Combo Sandwich · Combo
     completo". Dos premios del mismo combo se distinguen solos por lo que
     cuestan (1500 pts, o 1000 pts + $20.000). */
  select k.id,
         co.name::text,
         coalesce(co.description,'')::text,
         k.puntos::int,
         coalesce(k.dinero,0)::int,
         nullif(co.photo_url,'')::text,
         'combo'::text
    from pos_puntos_catalogo k
    join pos_combos co on co.id = k.combo_id
   where k.tenant_id = v_tenant
     and coalesce(k.activo, true) = true
     and coalesce(co.active, true) = true

  order by 4, 5;
end;
$function$
;
