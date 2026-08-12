/* La identidad deja de salir del token y sale de la BASE.
   ------------------------------------------------------------------
   PROBLEMA: current_tenant_id() leia auth.jwt()->'user_metadata'->>'tenant_id',
   y se comprobo en la app real que un usuario PUEDE reescribir su propia
   metadata (sb.auth.updateUser({data:{...}}) devuelve exito). De esa funcion
   cuelga todo el aislamiento entre clientes: el candado estaba guardado del
   lado del que quiere abrirlo.

   ARREGLO: el tenant sale de pos_users, que el usuario no puede escribir.

   POR QUE SECURITY DEFINER: pos_users tiene la politica
   `tenant_pos_users USING (current_tenant_id() = tenant_id)`. Si la funcion
   leyera esa tabla como el usuario, se llamaria a si misma en bucle infinito.
   Como DEFINER corre con permisos de postgres (dueño de la tabla) y se salta
   RLS -- relforcerowsecurity esta en false. Es el mismo patron que ya usa
   es_admin_plataforma().

   POR QUE SIGUE EL COALESCE a auth.uid(): un usuario recien registrado todavia
   no tiene fila en pos_users. Devolverle su propio uid lo deja viendo NADA
   (ninguna fila tiene ese tenant), que es lo correcto y no lo bloquea con un
   error. Lo que NO se hace nunca es volver a caer en la metadata.

   DOS CONVENCIONES: hay usuarios cuya fila casa por `id` y otros por
   `auth_user_id`. Se aceptan las dos, con preferencia por auth_user_id.
   ------------------------------------------------------------------ */
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT pu.tenant_id
       FROM public.pos_users pu
      WHERE pu.auth_user_id = auth.uid()
         OR pu.id = auth.uid()
      ORDER BY (pu.auth_user_id = auth.uid()) DESC NULLS LAST
      LIMIT 1),
    auth.uid()
  )
$$;

REVOKE ALL ON FUNCTION public.current_tenant_id() FROM public;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated, service_role;
