-- El catalogo de puntos de la pagina de clientes, completo y honesto (16-ago).
--
-- Dos errores, no uno:
--
--   1. LOS COMBOS NO SALIAN. La funcion solo unia con pos_products, y un premio
--      puede apuntar a un producto O a un combo. De los 4 premios de El Parche,
--      2 son combos: se caian en silencio y la pagina mostraba dos bebidas.
--
--   2. EL COSTO LLEGABA CON OTRO NOMBRE. La funcion devolvia la columna como
--      "costo" y la pagina leia "puntos". Como no existia, todo premio valia 0
--      puntos, y con 0 puntos TODO el mundo "ya lo puede pedir". A nadie le
--      alcanzaba: el que mas puntos tiene lleva 175 y el premio mas barato vale
--      400. Ademas "dinero" (el premio que se paga con puntos MAS plata) nunca
--      se devolvia, asi que el combo de 1000 pts + $20.000 se veia gratis.
--
-- Se devuelven los nombres que la pagina ya leia: puntos y dinero.

drop function if exists public.fn_web_puntos_catalogo(text);

create function public.fn_web_puntos_catalogo(p_slug text)
returns table(id uuid, nombre text, descripcion text, puntos integer,
              dinero integer, foto text, tipo text)
language plpgsql stable security definer set search_path to 'public'
as $function$
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
         (p.name || coalesce(' · ' || nullif(k.pres_nombre,''), ''))::text,
         coalesce(p.description,'')::text,
         k.puntos::int,
         coalesce(k.dinero,0)::int,
         nullif(coalesce(p.photo_url, p.image_url),'')::text,
         'producto'::text
    from pos_puntos_catalogo k
    join pos_products p on p.id = k.product_id
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
$function$;

grant execute on function public.fn_web_puntos_catalogo(text) to anon, authenticated;
