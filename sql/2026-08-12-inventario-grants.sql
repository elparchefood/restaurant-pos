
/* Una tabla nueva NO hereda los permisos de las demas: RLS decide QUE FILAS
   ve cada quien, pero el GRANT decide si puede tocar la tabla siquiera. Sin
   esto la consulta anidada moria con "permission denied" y la pantalla de
   Inventario mostraba CERO insumos — con los 44 intactos en la base. */
GRANT SELECT, INSERT, UPDATE, DELETE ON public.iv_existencias TO authenticated;
GRANT SELECT ON public.iv_existencias TO anon;
GRANT EXECUTE ON FUNCTION public.fn_iv_fijar_existencia(uuid, uuid, numeric, numeric, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_iv_mover_existencia(uuid, uuid, uuid, text, numeric) TO authenticated;

SELECT grantee, string_agg(privilege_type, ',') AS permisos
FROM information_schema.role_table_grants
WHERE table_name = 'iv_existencias' AND grantee IN ('authenticated','anon')
GROUP BY grantee;
