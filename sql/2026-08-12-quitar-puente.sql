/* ══════════════════════════════════════════════════════════════════════
   QUITAR EL PUENTE.

   `iv_existencias` pasa a ser la unica verdad. Hasta ahora las funciones
   escribian TAMBIEN en `iv_insumos.stock` por si algo seguia leyendo de ahi.
   Ya no queda nadie: se reviso pantalla por pantalla y funcion por funcion.

   Las columnas viejas NO se borran: se renombran. Si se me escapo un lector,
   con la columna borrada o renombrada FALLA A GRITOS — y un error se ve. Si
   la dejara quieta, ese lector mostraria un numero congelado para siempre sin
   que nadie se entere, que es justo lo que no se puede permitir con plata.
   Los datos quedan ahi por si hay que mirar atras.
   ══════════════════════════════════════════════════════════════════════ */

-- ── 1. Abrir conteo: lo esperado sale de las existencias de ESA sede ──
/* Ademas leia `i.branch_id = p_branch`: en una sucursal nueva el conteo habria
   salido VACIO, y un conteo vacio se cierra sin ajustar nada. */
CREATE OR REPLACE FUNCTION public.fn_iv_abrir_conteo(
  p_tenant uuid, p_branch uuid, p_categoria text DEFAULT NULL::text, p_quien text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE v_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM iv_conteos WHERE branch_id = p_branch AND estado = 'abierto') THEN
    RAISE EXCEPTION 'Ya hay un conteo abierto. Cierralo o anulalo antes de empezar otro.';
  END IF;

  INSERT INTO iv_conteos (tenant_id, branch_id, categoria, abierto_por)
  VALUES (p_tenant, p_branch, nullif(btrim(coalesce(p_categoria,'')), ''), p_quien)
  RETURNING id INTO v_id;

  INSERT INTO iv_conteo_lineas (conteo_id, insumo_id, esperado, costo_unit)
  SELECT v_id, v.insumo_id,
         coalesce(v.stock,0) + CASE WHEN v.sub_inventario THEN coalesce(v.stock_servicio,0) ELSE 0 END,
         coalesce(v.precio,0)
    FROM v_iv_insumos_sede v
   WHERE v.branch_id = p_branch
     AND v.activo IS NOT FALSE
     AND (p_categoria IS NULL OR btrim(p_categoria) = '' OR v.categoria = p_categoria);

  RETURN v_id;
END;
$function$;

-- ── 2. Fuera el espejo ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_iv_mover_existencia(
  p_tenant uuid, p_insumo uuid, p_branch uuid, p_campo text, p_delta numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF p_campo = 'servicio' THEN
    INSERT INTO iv_existencias (tenant_id, insumo_id, branch_id, stock_servicio)
    VALUES (p_tenant, p_insumo, p_branch, p_delta)
    ON CONFLICT (insumo_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET stock_servicio = COALESCE(iv_existencias.stock_servicio,0) + p_delta,
                  updated_at = now();
  ELSE
    INSERT INTO iv_existencias (tenant_id, insumo_id, branch_id, stock)
    VALUES (p_tenant, p_insumo, p_branch, p_delta)
    ON CONFLICT (insumo_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET stock = COALESCE(iv_existencias.stock,0) + p_delta,
                  updated_at = now();
  END IF;
END;
$fn$;

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
END;
$fn$;

-- ── 3. Las columnas viejas, a la vista pero fuera de juego ────────────
ALTER TABLE public.iv_insumos RENAME COLUMN stock          TO stock_migrado_no_usar;
ALTER TABLE public.iv_insumos RENAME COLUMN stock_servicio TO stock_servicio_migrado_no_usar;
ALTER TABLE public.iv_insumos RENAME COLUMN agotado_manual TO agotado_migrado_no_usar;

COMMENT ON COLUMN public.iv_insumos.stock_migrado_no_usar IS
  'MIGRADO el 12-ago-2026 a iv_existencias. No leer ni escribir: se queda congelado. Renombrada a proposito para que cualquier codigo viejo falle a gritos en vez de mostrar un numero viejo en silencio.';

-- ── 4. Comprobacion ───────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM public.iv_existencias)                                   AS existencias,
  (SELECT count(*) FROM public.v_iv_insumos_sede)                                AS filas_vista,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name='iv_insumos' AND column_name IN ('stock','stock_servicio','agotado_manual')) AS columnas_viejas_que_quedan;
