/* pos_producto_sucursal tenia RLS ACTIVADA y NINGUNA politica: en Postgres eso
   significa cerrada del todo — ni leer ni escribir. La tabla existia desde la
   fase 1 de multi-marca pero nunca se uso desde la app, asi que no se noto.
   Ahora que pos-carta.js la lee y escribe, necesita su politica.

   Mismo patron que el resto: aislada por cliente con current_tenant_id(), que
   desde el 12-ago lee de la BASE y no del token. */
DROP POLICY IF EXISTS aislar_pos_producto_sucursal ON public.pos_producto_sucursal;
CREATE POLICY aislar_pos_producto_sucursal ON public.pos_producto_sucursal
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
