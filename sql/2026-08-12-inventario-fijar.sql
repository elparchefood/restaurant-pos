
/* Fijar la existencia de un insumo en una sede (o en la bolsa comun de la
   marca). Los botones de Inventario guardan valores ABSOLUTOS ("queda en 12"),
   no restas, asi que no sirve fn_iv_mover_existencia.

   Va en la base y no en la pantalla porque el indice unico es sobre una
   EXPRESION (COALESCE del branch) y el upsert del cliente no sabe apuntar a
   eso: desde la pantalla habria tocado hacer "intenta actualizar, si no
   inserta", que con dos cajas guardando a la vez crea dos filas.

   Los campos en NULL no se tocan. */
CREATE OR REPLACE FUNCTION public.fn_iv_fijar_existencia(
  p_insumo uuid, p_branch uuid,
  p_stock numeric DEFAULT NULL, p_servicio numeric DEFAULT NULL,
  p_agotado boolean DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM iv_insumos WHERE id = p_insumo;
  IF v_tenant IS NULL THEN RETURN; END IF;

  INSERT INTO iv_existencias (tenant_id, insumo_id, branch_id, stock, stock_servicio, agotado_manual)
  VALUES (v_tenant, p_insumo, p_branch,
          COALESCE(p_stock,0), COALESCE(p_servicio,0), COALESCE(p_agotado,false))
  ON CONFLICT (insumo_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET
    stock          = COALESCE(p_stock,    iv_existencias.stock),
    stock_servicio = COALESCE(p_servicio, iv_existencias.stock_servicio),
    agotado_manual = COALESCE(p_agotado,  iv_existencias.agotado_manual),
    updated_at     = now();

  /* Puente temporal, igual que en fn_iv_mover_existencia: se quita cuando ya
     nada lea iv_insumos.stock. */
  IF p_branch IS NULL THEN
    UPDATE iv_insumos SET
      stock          = COALESCE(p_stock,    stock),
      stock_servicio = COALESCE(p_servicio, stock_servicio),
      agotado_manual = COALESCE(p_agotado,  agotado_manual),
      updated_at     = now()
    WHERE id = p_insumo;
  END IF;
END;
$fn$;
