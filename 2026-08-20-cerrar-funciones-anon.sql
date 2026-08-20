-- 2026-08-20 · Cerrar las funciones que un desconocido podía ejecutar
--
-- LO QUE SE ENCONTRÓ, revisando si la app se puede lanzar. La llave `anon` va
-- escrita en el JavaScript de la página: es pública por diseño, cualquiera la
-- lee abriendo la consola del navegador. Y 58 funciones tenían permiso de
-- ejecución para `anon`, casi todas `SECURITY DEFINER` — es decir, se saltan la
-- seguridad por fila a propósito.
--
-- Se comprobó que era explotable de verdad, no en teoría: llamando desde fuera,
-- sin ninguna sesión, `fn_puntos_regalar` DEVOLVIÓ 1 y el punto quedó guardado.
-- (Se revirtió de inmediato.) Con `fn_saldo_mover` la llamada llegó a insertar
-- y solo la frenó una restricción del motivo. Entre las expuestas también
-- estaban `pos_marcar_dueno`, `fn_credito_abonar` y las de inventario.
--
-- POR QUÉ PASÓ. El patrón `grant execute ... to anon, authenticated,
-- service_role` se fue copiando de una migración a la siguiente sin preguntarse
-- si `anon` hacía falta. Yo mismo lo repetí hoy con `fn_puntos_regalar`.
--
-- LA REGLA QUE QUEDA: `anon` solo para lo que un visitante SIN CUENTA necesita
-- —la carta, las promos, los datos públicos del restaurante y el catálogo de
-- premios—. Todo lo demás va por `authenticated` (el POS, con empleado dentro)
-- o por `service_role` (las Edge Functions, que validan la sesión del cliente
-- antes de tocar nada).
--
-- NO ROMPE NADA, y se verificó pantalla por pantalla:
--   · la app de clientes solo llama 4 funciones, las 4 de la lista blanca;
--   · el POS entra como `authenticated`, que conserva sus permisos;
--   · las Edge Functions usan `service_role`, que también los conserva.

-- OJO: el permiso NO venía de `anon`, venía de **PUBLIC**. PostgreSQL le da
-- EXECUTE a PUBLIC en toda función nueva, y `anon` hereda de ahí. Revocar solo
-- de `anon` no quitaba nada — la primera pasada no cambió ni un permiso.
-- Hay que revocar de PUBLIC y devolverles el permiso explícito a los dos roles
-- que sí lo necesitan: `authenticated` (el POS) y `service_role` (las Edge
-- Functions).

do $$
declare
  f record;
  blanca text[] := array[
    'fn_web_carta',           -- la carta que ve cualquiera
    'fn_web_promos',          -- las promociones del inicio
    'fn_web_publica',         -- los datos públicos del restaurante
    'fn_web_puntos_catalogo', -- los premios, que se ven sin haber entrado
    'fn_web_estado'           -- si está abierto ahora
  ];
begin
  for f in
    select p.oid::regprocedure as firma, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and not (p.proname = any(blanca))
  loop
    execute format('revoke execute on function %s from public', f.firma);
    execute format('revoke execute on function %s from anon',   f.firma);
    execute format('grant  execute on function %s to authenticated', f.firma);
    execute format('grant  execute on function %s to service_role',  f.firma);
  end loop;

  -- Las públicas: se les deja PUBLIC, que es justo lo que necesitan.
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.proname = any(blanca)
  loop
    execute format('grant execute on function %s to anon, authenticated, service_role', f.firma);
  end loop;
end $$;
