/* ROL POR SUCURSAL — "cajero en una y mesero en otra".
   ------------------------------------------------------------------
   Regla de Sergio: una persona puede tener acceso a varias sucursales de SU
   marca, y en cada una puede tener un rol distinto. Hasta hoy `pos_users`
   guardaba UN solo `role_id` para toda la persona, asi que el rol era el mismo
   en todas partes.

   El DUEÑO no entra aqui: tiene acceso total por ser dueño, sin rol (ver
   DICCIONARIO-ACCESOS.md).

   Es ADITIVO: no se borra `pos_users.role_id` ni `sucursales`. Mientras no haya
   fila en esta tabla, todo sigue funcionando como antes.
   ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS public.pos_usuario_sucursal (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  user_id    uuid NOT NULL,   -- el id de auth.users
  branch_id  uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  role_id    uuid REFERENCES public.pos_roles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, branch_id)
);

COMMENT ON TABLE public.pos_usuario_sucursal IS
  'Quien trabaja en que sucursal y CON QUE ROL. Una persona puede ser cajero en una sucursal y mesero en otra. El dueño no necesita filas aqui.';

/* GRANT antes que las politicas: Postgres pide el permiso de TABLA primero, y
   olvidarlo ya reventó dos veces en pleno servicio. */
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_usuario_sucursal TO authenticated;
GRANT ALL ON public.pos_usuario_sucursal TO service_role;

ALTER TABLE public.pos_usuario_sucursal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aislar_pos_usuario_sucursal ON public.pos_usuario_sucursal;
CREATE POLICY aislar_pos_usuario_sucursal ON public.pos_usuario_sucursal
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE INDEX IF NOT EXISTS ix_usuario_sucursal_user ON public.pos_usuario_sucursal (user_id, branch_id);

/* Relleno con lo que ya existe: cada empleado (no dueño) en cada una de sus
   sucursales, con el rol que tiene hoy. */
INSERT INTO public.pos_usuario_sucursal (tenant_id, user_id, branch_id, role_id)
SELECT pu.tenant_id,
       COALESCE(pu.auth_user_id, pu.id) AS user_id,
       b.id AS branch_id,
       COALESCE(pu.role_id, (SELECT pr.id FROM pos_roles pr
                              WHERE pr.tenant_id = pu.tenant_id
                                AND lower(pr.name) = lower(pu.role) LIMIT 1))
FROM public.pos_users pu
JOIN public.tenants t ON t.id = pu.tenant_id
CROSS JOIN LATERAL (
  SELECT unnest(
    ARRAY(SELECT DISTINCT x FROM unnest(
      COALESCE(pu.sucursales, ARRAY[]::text[]) || ARRAY[pu.branch_id::text]
    ) AS x WHERE x IS NOT NULL)
  )::uuid AS id
) b
WHERE COALESCE(pu.auth_user_id, pu.id) IS DISTINCT FROM t.owner_user_id   -- el dueño no
  AND EXISTS (SELECT 1 FROM public.branches br WHERE br.id = b.id)
ON CONFLICT (user_id, branch_id) DO NOTHING;

/* Los permisos de ESTE usuario en ESTA sucursal.
   Devuelve NULL si no hay fila: la app entonces sigue por el camino de antes,
   asi nadie se queda encerrado durante la transicion. */
CREATE OR REPLACE FUNCTION public.permisos_en_sucursal(p_branch uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pr.perms
    FROM public.pos_usuario_sucursal us
    JOIN public.pos_roles pr ON pr.id = us.role_id
   WHERE us.user_id = auth.uid()
     AND us.branch_id = p_branch
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.permisos_en_sucursal(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.permisos_en_sucursal(uuid) TO authenticated, service_role;
