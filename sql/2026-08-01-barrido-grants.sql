-- Chequeo: tablas de la app sin los permisos que necesita.
-- Las Edge Functions entran como service_role; la pantalla como authenticated.
-- La RLS sigue filtrando por tenant: el GRANT solo abre la puerta.
WITH t AS (
  SELECT c.relname AS tabla FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r'
    AND (c.relname LIKE 'pos\_%' OR c.relname LIKE 'iv\_%' OR c.relname LIKE 'chat\_%'
         OR c.relname IN ('ia_config','branches','tenants'))
), g AS (
  SELECT table_name, grantee, array_agg(privilege_type) p
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND grantee IN ('authenticated','service_role')
  GROUP BY 1,2
)
SELECT t.tabla,
  COALESCE((SELECT 'SELECT' = ANY(p) FROM g WHERE g.table_name=t.tabla AND grantee='authenticated'), false) AS app_ok,
  COALESCE((SELECT 'SELECT' = ANY(p) FROM g WHERE g.table_name=t.tabla AND grantee='service_role'), false) AS funciones_ok
FROM t ORDER BY 2,3,1;

-- Al crear una tabla nueva, SIEMPRE los dos roles:
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.<tabla> TO authenticated, service_role;
