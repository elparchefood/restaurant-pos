-- ═══════════════════════════════════════════════════════════════════════════
-- El mapa del domiciliario va en el plan Pro
-- Sergio, 26-ago-2026
--
-- Se considero crear un plan Premium para meterlo ahi y se descarto: un tercer
-- plan hace mas dificil vender, y Pro ya tiene 100k de margen sobre Starter —
-- de sobra para absorber los ~29k/mes que cuesta el mapa por restaurante.
--
-- Ademas Pro ya vende "App del domiciliario (Android)", asi que el mapa cae
-- ahi de forma natural y le da a Pro su mejor argumento de venta: hoy se vende
-- por IA y multi-sucursal, cosas que un restaurante pequeno no siente,
-- mientras que "tu domiciliario ve el mapa y la ruta" se entiende en tres
-- segundos.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. La funcion, en Pro y en Premium (que es el plan interno de El Parche).
update pos_planes
   set funciones = (
         select array_agg(distinct x)
           from unnest(coalesce(funciones, array[]::text[]) || array['mapa']) as x
       )
 where plan in ('pro', 'premium')
   and not ('mapa' = any(coalesce(funciones, array[]::text[])));

-- 2. Y se dice en la lista de beneficios, que es lo que ve quien va a comprar.
update pos_planes
   set beneficios = (
         select array_agg(b order by orden)
           from (
             select b, orden from unnest(beneficios) with ordinality as t(b, orden)
             union all
             select 'Mapa y ruta hasta la casa del cliente', 3.5
           ) z
       )
 where plan = 'pro'
   and not exists (
         select 1 from unnest(beneficios) b
          where b ilike '%mapa%');
