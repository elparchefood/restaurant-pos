/* ══════════════════════════════════════════════════════════════════════
   LAS TRES QUE FALTABAN: conteo, devolucion y merma.

   Se quedaron escribiendo `iv_insumos.stock` cuando el resto ya usaba
   `iv_existencias`. Como la pantalla ya lee la tabla nueva, una merma se
   registraba y la pantalla seguia mostrando el numero de ANTES. No daba
   error: daba un numero viejo, que es peor.
   ══════════════════════════════════════════════════════════════════════ */

/* En que fila cae el movimiento de una sede: la bolsa comun de la marca
   (modo global) o la de esa sucursal. Una sola definicion para todas. */
CREATE OR REPLACE FUNCTION public.fn_iv_sede_existencia(p_branch uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT CASE WHEN m.inventario_modo = 'sucursal' THEN b.id ELSE NULL END
  FROM public.branches b JOIN public.brands m ON m.id = b.brand_id
  WHERE b.id = p_branch
$fn$;

-- ── 1. Cerrar conteo fisico ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_iv_cerrar_conteo(p_conteo uuid, p_quien text DEFAULT NULL::text)
RETURNS TABLE(ajustados integer, faltante numeric, sobrante numeric)
LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE c RECORD; l RECORD; v_n int := 0; v_falta numeric := 0; v_sobra numeric := 0; v_dif numeric;
BEGIN
  SELECT * INTO c FROM iv_conteos WHERE id = p_conteo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ese conteo no existe'; END IF;
  IF c.estado <> 'abierto' THEN RAISE EXCEPTION 'Ese conteo ya esta cerrado'; END IF;

  FOR l IN SELECT * FROM iv_conteo_lineas WHERE conteo_id = p_conteo AND contado IS NOT NULL LOOP
    v_dif := l.contado - l.esperado;
    UPDATE iv_conteo_lineas
       SET diferencia = v_dif, valor_dif = v_dif * coalesce(l.costo_unit,0)
     WHERE id = l.id;

    IF v_dif <> 0 THEN
      v_n := v_n + 1;
      IF v_dif < 0 THEN v_falta := v_falta + abs(v_dif * coalesce(l.costo_unit,0));
      ELSE               v_sobra := v_sobra + (v_dif * coalesce(l.costo_unit,0)); END IF;

      -- El ajuste va SIEMPRE contra la bodega (`stock`). Lo que esta en servicio
      -- no se toca: repartir la diferencia entre los dos niveles seria inventar
      -- de donde salio.
      PERFORM fn_iv_mover_existencia(c.tenant_id, l.insumo_id,
                                     fn_iv_sede_existencia(c.branch_id), 'stock', v_dif);

      INSERT INTO iv_movimientos (tenant_id, branch_id, insumo_id, delta, campo, motivo)
      VALUES (c.tenant_id, c.branch_id, l.insumo_id, v_dif, 'stock', 'conteo fisico');
    END IF;
  END LOOP;

  UPDATE iv_conteos
     SET estado = 'cerrado', cerrado_por = p_quien, closed_at = now(),
         n_items = (SELECT count(*) FROM iv_conteo_lineas WHERE conteo_id = p_conteo AND contado IS NOT NULL),
         n_diferencias = v_n, valor_faltante = v_falta, valor_sobrante = v_sobra
   WHERE id = p_conteo;

  ajustados := v_n; faltante := v_falta; sobrante := v_sobra;
  RETURN NEXT;
END;
$function$;

-- ── 2. Devolver un item (anulacion) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_iv_devolver_item(p_item_id uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE mv RECORD;
BEGIN
  FOR mv IN
    SELECT * FROM iv_movimientos WHERE item_id = p_item_id AND motivo = 'venta' AND NOT reversed
  LOOP
    /* mv.delta es negativo (consumo); restarlo = sumarlo de vuelta.
       Se devuelve a la MISMA sede que lo consumio: mv.branch_id. */
    PERFORM fn_iv_mover_existencia(mv.tenant_id, mv.insumo_id,
                                   fn_iv_sede_existencia(mv.branch_id),
                                   CASE WHEN mv.campo = 'servicio' THEN 'servicio' ELSE 'stock' END,
                                   -mv.delta);

    UPDATE iv_movimientos SET reversed = true WHERE id = mv.id;

    INSERT INTO iv_movimientos(tenant_id, branch_id, insumo_id, delta, campo, motivo, order_id, item_id, reversed)
    VALUES (mv.tenant_id, mv.branch_id, mv.insumo_id, -mv.delta, mv.campo, p_motivo, mv.order_id, mv.item_id, true);
  END LOOP;
END;
$function$;

-- ── 3. Registrar merma ────────────────────────────────────────────────
/* Ahora recibe la SEDE. Antes usaba la del insumo, que con el inventario por
   marca es la sucursal que lo creo: una merma registrada en la sede B habria
   descontado de la A. */
CREATE OR REPLACE FUNCTION public.fn_iv_registrar_merma(
  p_insumo uuid, p_cantidad numeric, p_campo text, p_motivo text,
  p_nota text DEFAULT NULL::text, p_quien text DEFAULT NULL::text,
  p_branch uuid DEFAULT NULL::uuid)
RETURNS TABLE(merma_id uuid, stock_nuevo numeric, costo numeric)
LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  ins RECORD; ex RECORD; v_campo text; v_disp numeric; v_qty numeric;
  v_costo numeric; v_id uuid; v_branch uuid; v_sede uuid;
BEGIN
  IF coalesce(p_cantidad, 0) <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor que cero'; END IF;

  SELECT * INTO ins FROM iv_insumos WHERE id = p_insumo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insumo no encontrado'; END IF;
  IF NOT coalesce(ins.merma_activa, false) THEN
    RAISE EXCEPTION 'Este insumo no tiene la merma activada';
  END IF;

  v_branch := COALESCE(p_branch, ins.branch_id);
  v_sede   := fn_iv_sede_existencia(v_branch);

  SELECT * INTO ex FROM iv_existencias
   WHERE insumo_id = p_insumo AND branch_id IS NOT DISTINCT FROM v_sede;

  -- Solo los insumos con sub-inventario tienen "en servicio"; el resto todo
  -- sale de la bodega.
  v_campo := CASE WHEN p_campo = 'stock_servicio' AND coalesce(ins.sub_inventario, false)
                  THEN 'stock_servicio' ELSE 'stock' END;
  v_disp := CASE WHEN v_campo = 'stock_servicio' THEN coalesce(ex.stock_servicio, 0)
                 ELSE coalesce(ex.stock, 0) END;

  -- Nunca dejar el stock en negativo: si se boto mas de lo que el sistema creia
  -- que habia, el sobrante es un problema de conteo, no de merma.
  v_qty := least(p_cantidad, greatest(v_disp, 0));
  IF v_qty <= 0 THEN RAISE EXCEPTION 'No hay existencias para descontar'; END IF;

  v_costo := v_qty * coalesce(ins.precio, 0);   -- cantidad en compra x precio de compra

  PERFORM fn_iv_mover_existencia(ins.tenant_id, p_insumo, v_sede,
            CASE WHEN v_campo = 'stock_servicio' THEN 'servicio' ELSE 'stock' END, -v_qty);

  SELECT CASE WHEN v_campo = 'stock_servicio' THEN stock_servicio ELSE stock END
    INTO stock_nuevo
  FROM iv_existencias WHERE insumo_id = p_insumo AND branch_id IS NOT DISTINCT FROM v_sede;

  INSERT INTO iv_merma (tenant_id, branch_id, insumo_id, cantidad, campo, motivo, nota, costo, registrado_por)
  VALUES (ins.tenant_id, v_branch, p_insumo, v_qty, v_campo, p_motivo, p_nota, v_costo, p_quien)
  RETURNING id INTO v_id;

  -- Al kardex, para que el paloteo pueda separar lo que se boto de lo que no
  -- se explica.
  INSERT INTO iv_movimientos (tenant_id, branch_id, insumo_id, delta, campo, motivo)
  VALUES (ins.tenant_id, v_branch, p_insumo, -v_qty, v_campo, 'merma');

  merma_id := v_id; costo := v_costo;
  RETURN NEXT;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_iv_sede_existencia(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_iv_registrar_merma(uuid, numeric, text, text, text, text, uuid) TO authenticated;
