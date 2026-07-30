-- ═══════════════════════════════════════════════════════════════
-- Descuento automático de inventario al vender (enviar a cocina)
-- Parte 1: tabla de movimientos + funciones (SIN triggers todavía)
-- ═══════════════════════════════════════════════════════════════

-- Ledger de movimientos de inventario (auditoría + devolución exacta).
-- delta en buy_unit: negativo = consumo por venta; positivo = devolución/entrada.
CREATE TABLE IF NOT EXISTS iv_movimientos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid,
  branch_id  uuid,
  insumo_id  uuid NOT NULL,
  delta      numeric NOT NULL,
  campo      text NOT NULL DEFAULT 'stock',   -- 'stock' | 'servicio'
  motivo     text NOT NULL,                    -- 'venta','anulacion','eliminado','ajuste'
  order_id   uuid,
  item_id    uuid,
  reversed   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_iv_mov_item_activo ON iv_movimientos(item_id) WHERE NOT reversed;
CREATE INDEX IF NOT EXISTS ix_iv_mov_insumo ON iv_movimientos(insumo_id);
CREATE INDEX IF NOT EXISTS ix_iv_mov_order  ON iv_movimientos(order_id);

ALTER TABLE iv_movimientos ENABLE ROW LEVEL SECURITY;

-- ── Consumir el inventario de un ítem (al enviarse a cocina) ──────────
CREATE OR REPLACE FUNCTION fn_iv_consumir_item(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  it          pos_order_items%ROWTYPE;
  ord_status  text;
  v_pres_name text;
  v_pres_id   text;
  v_var_ids   text[];
  rec         RECORD;
  delta_buy   numeric;
  campo       text;
BEGIN
  SELECT * INTO it FROM pos_order_items WHERE id = p_item_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Idempotencia: si ya tiene venta vigente, no volver a descontar.
  IF EXISTS (SELECT 1 FROM iv_movimientos WHERE item_id = p_item_id AND motivo = 'venta' AND NOT reversed) THEN
    RETURN;
  END IF;

  SELECT status INTO ord_status FROM pos_orders WHERE id = it.order_id;
  IF ord_status = 'cancelled' THEN RETURN; END IF;

  -- Presentación elegida: el ítem guarda el NOMBRE; lo resolvemos al id.
  v_pres_name := it.selections->>'pres';
  SELECT elem->>'id' INTO v_pres_id
  FROM pos_products p, jsonb_array_elements(COALESCE(p.presentations, '[]'::jsonb)) elem
  WHERE p.id = it.product_id AND elem->>'name' = v_pres_name
  LIMIT 1;

  -- Ids de las opciones de variante elegidas (sabor/tipo).
  v_var_ids := ARRAY(
    SELECT (val->>'id')
    FROM jsonb_each(COALESCE(it.selections->'vars', '{}'::jsonb)) AS e(key, val)
    WHERE val ? 'id'
  );

  FOR rec IN
    WITH base_lines AS (
      SELECT r.insumo_id,
             COALESCE((r.cantidades->v_pres_id->>'q')::numeric,
                      (r.cantidades->'_'->>'q')::numeric,
                      r.cantidad, 0) * it.quantity AS use_qty
      FROM iv_recetas r
      WHERE r.product_id = it.product_id
        AND r.mod_option_id IS NULL
        AND (r.variant_option_id IS NULL OR r.variant_option_id = ANY(v_var_ids))
    ),
    mod_lines AS (
      SELECT r.insumo_id,
             COALESCE((r.cantidades->'_'->>'q')::numeric, r.cantidad, 0)
             * COALESCE((m.val->>'qty')::numeric, 1) * it.quantity AS use_qty
      FROM jsonb_each(COALESCE(it.selections->'mods', '{}'::jsonb)) AS m(key, val)
      JOIN iv_recetas r ON r.mod_option_id = m.key
    ),
    agg AS (
      SELECT insumo_id, SUM(use_qty) AS use_qty
      FROM (SELECT * FROM base_lines UNION ALL SELECT * FROM mod_lines) x
      GROUP BY insumo_id
      HAVING SUM(use_qty) > 0
    )
    SELECT a.insumo_id, a.use_qty, i.conversion, i.sub_inventario
    FROM agg a JOIN iv_insumos i ON i.id = a.insumo_id
  LOOP
    -- La receta está en use_unit; el stock en buy_unit → convertir.
    delta_buy := rec.use_qty / GREATEST(COALESCE(rec.conversion, 1), 0.0000001);
    campo     := CASE WHEN rec.sub_inventario THEN 'servicio' ELSE 'stock' END;

    IF rec.sub_inventario THEN
      UPDATE iv_insumos SET stock_servicio = COALESCE(stock_servicio, 0) - delta_buy, updated_at = now()
      WHERE id = rec.insumo_id;
    ELSE
      UPDATE iv_insumos SET stock = COALESCE(stock, 0) - delta_buy, updated_at = now()
      WHERE id = rec.insumo_id;
    END IF;

    INSERT INTO iv_movimientos(tenant_id, branch_id, insumo_id, delta, campo, motivo, order_id, item_id)
    VALUES (it.tenant_id, it.branch_id, rec.insumo_id, -delta_buy, campo, 'venta', it.order_id, it.id);
  END LOOP;
END;
$$;

-- ── Devolver el inventario de un ítem (anulación / borrado / ajuste) ──
CREATE OR REPLACE FUNCTION fn_iv_devolver_item(p_item_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE mv RECORD;
BEGIN
  FOR mv IN
    SELECT * FROM iv_movimientos WHERE item_id = p_item_id AND motivo = 'venta' AND NOT reversed
  LOOP
    -- mv.delta es negativo (consumo); restarlo = sumarlo de vuelta.
    IF mv.campo = 'servicio' THEN
      UPDATE iv_insumos SET stock_servicio = COALESCE(stock_servicio, 0) - mv.delta, updated_at = now()
      WHERE id = mv.insumo_id;
    ELSE
      UPDATE iv_insumos SET stock = COALESCE(stock, 0) - mv.delta, updated_at = now()
      WHERE id = mv.insumo_id;
    END IF;

    UPDATE iv_movimientos SET reversed = true WHERE id = mv.id;

    INSERT INTO iv_movimientos(tenant_id, branch_id, insumo_id, delta, campo, motivo, order_id, item_id, reversed)
    VALUES (mv.tenant_id, mv.branch_id, mv.insumo_id, -mv.delta, mv.campo, p_motivo, mv.order_id, mv.item_id, true);
  END LOOP;
END;
$$;
