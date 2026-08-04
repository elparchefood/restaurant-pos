-- La carta que ve un visitante sin sesión, y su catálogo de puntos.
--
-- Igual que con los datos del restaurante: la tabla de productos no se abre al
-- público (ahí están los costos, los insumos y los productos de TODOS los
-- restaurantes). Se abre una rendija que devuelve solo lo que hay que enseñarle
-- a un comensal: qué hay, cómo se llama, cuánto cuesta y su foto.
--
-- Y solo de restaurantes con la página publicada.

-- ─────────────────────────────────────────────────────────────────────
-- LA CARTA
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_web_carta(p_slug text)
RETURNS TABLE (categoria text, orden int, productos jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT id INTO v_tenant FROM tenants
   WHERE lower(slug) = lower(regexp_replace(coalesce(p_slug,''), '[^a-zA-Z0-9]', '', 'g'))
     AND coalesce(web_activa,false) = true
     AND coalesce(status,'active') = 'active'
   LIMIT 1;
  IF v_tenant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT c.name::text AS categoria,
         coalesce(c.sort_order, 999)::int AS orden,
         jsonb_agg(
           jsonb_build_object(
             'id', p.id,
             'nombre', p.name,
             'descripcion', coalesce(p.description, ''),
             'precio', p.price,
             'foto', coalesce(nullif(p.photo_url, ''), nullif(p.image_url, '')),
             -- Las presentaciones traen su propio precio (Personal / Familiar).
             -- Se limpian: al cliente no le sirve el id interno.
             'presentaciones', coalesce((
               SELECT jsonb_agg(jsonb_build_object('nombre', x->>'name', 'precio', (x->>'price')::numeric))
                 FROM jsonb_array_elements(coalesce(p.presentations, '[]'::jsonb)) x
                WHERE coalesce(x->>'name','') <> ''
             ), '[]'::jsonb)
           )
           ORDER BY coalesce(p.sort_order, 999), p.name
         ) AS productos
    FROM pos_products p
    JOIN pos_categories c ON c.id = p.category_id
   WHERE p.tenant_id = v_tenant
     AND coalesce(p.available, true) = true
   GROUP BY c.name, c.sort_order
   ORDER BY coalesce(c.sort_order, 999), c.name;
END;
$$;

REVOKE ALL ON FUNCTION fn_web_carta(text) FROM public;
GRANT EXECUTE ON FUNCTION fn_web_carta(text) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- EL CATÁLOGO DE PUNTOS
-- ─────────────────────────────────────────────────────────────────────
-- Se muestra SIEMPRE completo, incluso lo que el cliente todavía no alcanza:
-- ver la distancia es lo que hace que vuelva. Nunca "todavía no puedes redimir
-- nada" — eso solo desanima.
CREATE OR REPLACE FUNCTION fn_web_puntos_catalogo(p_slug text)
RETURNS TABLE (id uuid, nombre text, descripcion text, costo numeric, foto text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT t.id INTO v_tenant FROM tenants t
   WHERE lower(t.slug) = lower(regexp_replace(coalesce(p_slug,''), '[^a-zA-Z0-9]', '', 'g'))
     AND coalesce(t.web_activa,false) = true
   LIMIT 1;
  IF v_tenant IS NULL THEN RETURN; END IF;

  /* El catálogo no guarda el nombre: apunta al producto del menú. Así, si el
     restaurante le cambia el nombre a un plato, cambia también en los canjes. */
  RETURN QUERY
  SELECT k.id,
         (p.name || coalesce(' · ' || nullif(k.pres_nombre,''), ''))::text AS nombre,
         coalesce(p.description,'')::text AS descripcion,
         k.puntos::numeric,
         nullif(coalesce(p.photo_url, p.image_url),'')::text AS foto
    FROM pos_puntos_catalogo k
    JOIN pos_products p ON p.id = k.product_id
   WHERE k.tenant_id = v_tenant
     AND coalesce(k.activo, true) = true
   ORDER BY k.puntos;
END;
$$;

REVOKE ALL ON FUNCTION fn_web_puntos_catalogo(text) FROM public;
GRANT EXECUTE ON FUNCTION fn_web_puntos_catalogo(text) TO anon, authenticated, service_role;
