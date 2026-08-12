/* EL DUEÑO, marcado de forma explicita.
   ------------------------------------------------------------------
   Regla de Sergio: "el gerente NO es un rol. Es el dueño del restaurante, la
   cuenta con la que se registro, y por eso tiene acceso a todo sin tener rol."

   Hasta hoy eso funcionaba POR CASUALIDAD: pos-perms buscaba el rol 'gerente'
   en pos_roles, no lo encontraba (los roles se llaman Administrador, Cajero,
   Mesero...) y caia en su red de seguridad, que abre todo. O sea: el dueño
   tenia acceso total porque el sistema NO lo reconocia. La misma puerta se
   abria para cualquier rol mal escrito.

   NO se reutiliza `is_authorized_admin`: ese campo significa OTRA cosa (tiene
   el PIN para autorizar descuentos) y confundirlo ya costo un agujero — ver
   DICCIONARIO-ACCESOS.md. Se crea una marca propia.
   ------------------------------------------------------------------ */

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.tenants.owner_user_id IS
  'El DUEÑO: la cuenta con la que se registro el restaurante. Tiene acceso total por serlo, sin rol asignado. No confundir con user_profiles.role=admin (admin de la plataforma) ni con pos_users.is_authorized_admin (el del PIN de descuentos).';

/* Relleno: 1) el usuario que quedo del registro; 2) si no hay, el usuario cuyo
   id coincide con el del tenant (asi se creo la cuenta de El Parche). */
UPDATE public.tenants t
   SET owner_user_id = COALESCE(
     (SELECT r.user_id FROM public.pos_registrations r
       WHERE r.tenant_id = t.id AND r.user_id IS NOT NULL
       ORDER BY r.created_at LIMIT 1),
     (SELECT u.id FROM auth.users u WHERE u.id = t.id)
   )
 WHERE t.owner_user_id IS NULL;

/* ¿Quien esta entrando es el dueño de SU restaurante?
   SECURITY DEFINER por lo mismo que current_tenant_id(): tiene que poder leer
   tenants sin que la politica de esa tabla lo mande a llamarse a si mismo. */
CREATE OR REPLACE FUNCTION public.es_dueno()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants t
     WHERE t.owner_user_id = auth.uid()
  )
$$;

REVOKE ALL ON FUNCTION public.es_dueno() FROM public;
GRANT EXECUTE ON FUNCTION public.es_dueno() TO authenticated, service_role;

/* Que el dueño de un restaurante nuevo quede marcado solo. */
CREATE OR REPLACE FUNCTION public.pos_marcar_dueno()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  if new.owner_user_id is null and new.id is not null then
    new.owner_user_id := (select u.id from auth.users u where u.id = new.id);
  end if;
  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_tenant_dueno ON public.tenants;
CREATE TRIGGER trg_tenant_dueno BEFORE INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.pos_marcar_dueno();
