
/* UNA FILA POR INSUMO Y SEDE, con el "cuanto hay" ya resuelto segun el modo
   de la marca. Existe para que las pantallas no repitan cada una la misma
   decision: ya iban cuatro sitios calculandolo por su cuenta (inventario,
   pos-stock, dashboard, informes) y ese es exactamente el camino por el que
   dos pantallas acaban diciendo cosas distintas.

   Una pantalla ahora solo pregunta: dame los insumos de ESTA sede.

   security_invoker: la vista aplica el RLS de quien pregunta, no el de quien
   la creo. Sin esto seria un agujero: cualquiera veria los insumos de todos. */
DROP VIEW IF EXISTS public.v_iv_insumos_sede;
CREATE VIEW public.v_iv_insumos_sede WITH (security_invoker = true) AS
SELECT
  i.id                       AS id,          -- para las pantallas que ya lo llaman asi
  i.id                       AS insumo_id,
  b.id                       AS branch_id,
  i.tenant_id, i.brand_id,
  i.nombre, i.categoria, i.cat_color, i.prep_requerido,
  i.buy_unit, i.use_unit, i.precio, i.conversion, i.min_stock, i.activo,
  i.control_manual, i.sub_inventario, i.vender_bodega, i.aviso_bodega, i.merma_activa,
  m.inventario_modo,
  COALESCE(e.stock, 0)::numeric(10,3) AS stock,
  COALESCE(e.stock_servicio, 0)       AS stock_servicio,
  COALESCE(e.agotado_manual, false)   AS agotado_manual
FROM public.iv_insumos i
JOIN public.brands   m ON m.id = i.brand_id
JOIN public.branches b ON b.brand_id = i.brand_id
LEFT JOIN public.iv_existencias e
       ON e.insumo_id = i.id
      AND e.branch_id IS NOT DISTINCT FROM
          (CASE WHEN m.inventario_modo = 'sucursal' THEN b.id ELSE NULL END);

GRANT SELECT ON public.v_iv_insumos_sede TO authenticated, anon;

/* Comprobacion: para El Parche debe dar una fila por insumo (tiene 1 sede) y
   el mismo stock que hoy. */
SELECT count(*) AS filas,
       count(DISTINCT insumo_id) AS insumos,
       count(*) FILTER (WHERE v.stock <> COALESCE(i.stock,0)) AS stock_distinto
FROM public.v_iv_insumos_sede v
JOIN public.iv_insumos i ON i.id = v.insumo_id
JOIN public.tenants t ON t.id = v.tenant_id
WHERE t.name ILIKE 'elparche%';
