/* Cerrar el agujero: 12 politicas seguian leyendo el TOKEN.
   ------------------------------------------------------------------
   La entrada 105 creo las politicas `aislar_*` con current_tenant_id(), pero
   dejo VIVAS las viejas que leen auth.jwt()->'user_metadata'->>'tenant_id'.
   PostgreSQL SUMA las politicas permisivas con OR: basta que UNA abra para que
   pase todo. Comprobado en la app real el 12-ago: la cuenta demo, cambiandose
   el tenant en su propia metadata, paso de ver 8 productos a ver 61 (los 53 de
   El Parche). Pedidos y chats SI estaban bloqueados; productos no.

   Ahora que current_tenant_id() lee de pos_users (no del token), basta con que
   TODAS las politicas usen esa funcion.

   Se usa ALTER POLICY y no DROP+CREATE: cambiar la expresion en el sitio no
   deja ni un instante sin politica.
   ------------------------------------------------------------------ */

ALTER POLICY tenant_branches            ON public.branches
  USING (current_tenant_id() = tenant_id) WITH CHECK (current_tenant_id() = tenant_id);

ALTER POLICY tenant_brands              ON public.brands
  USING (current_tenant_id() = tenant_id) WITH CHECK (current_tenant_id() = tenant_id);

ALTER POLICY read_iv_insumos            ON public.iv_insumos
  USING (current_tenant_id() = tenant_id);

ALTER POLICY read_iv_recetas            ON public.iv_recetas
  USING (current_tenant_id() = tenant_id);

ALTER POLICY owner_categories           ON public.pos_categories
  USING (current_tenant_id() = tenant_id) WITH CHECK (current_tenant_id() = tenant_id);

ALTER POLICY owner_combos               ON public.pos_combos
  USING (current_tenant_id() = tenant_id) WITH CHECK (current_tenant_id() = tenant_id);

ALTER POLICY owner_modifier_groups      ON public.pos_modifier_groups
  USING (current_tenant_id() = tenant_id) WITH CHECK (current_tenant_id() = tenant_id);

ALTER POLICY owner_products             ON public.pos_products
  USING (current_tenant_id() = tenant_id) WITH CHECK (current_tenant_id() = tenant_id);

ALTER POLICY read_puntos                ON public.pos_puntos
  USING (current_tenant_id() = tenant_id);

ALTER POLICY aislar_pos_reservation_waitlist ON public.pos_reservation_waitlist
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

/* pos_roles tenia ademas `tenant_id = auth.uid()`, que solo funcionaba para
   Sergio (su id de usuario coincide con el id de su tenant por como se creo la
   cuenta). Para Monica, la mesera, NINGUNA de las tres condiciones se cumplia:
   no podia leer pos_roles, pos-perms no encontraba su rol y caia en el
   fail-open -> le daba TODOS los permisos. current_tenant_id() ya cubre el caso
   de Sergio con su COALESCE a auth.uid(). */
ALTER POLICY tenant_pos_roles           ON public.pos_roles
  USING (current_tenant_id() = tenant_id) WITH CHECK (current_tenant_id() = tenant_id);

ALTER POLICY owner_tenant_lee           ON public.tenants
  USING (id = current_tenant_id());
