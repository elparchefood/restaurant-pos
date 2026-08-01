CREATE OR REPLACE FUNCTION public.fn_iv_consumir_item(p_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  it          pos_order_items%ROWTYPE;
  ord_status  text;
  v_pres_name text;
  v_pres_id   text;
  v_var_ids   text[];
  rec         RECORD;
  need_buy    numeric;   -- total a descontar, en buy_unit
  de_servicio numeric;   -- cuánto sale de "en servicio"
  de_bodega   numeric;   -- cuánto sale de bodega
  disp_serv   numeric;
BEGIN
  SELECT * INTO it FROM pos_order_items WHERE id = p_item_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM iv_movimientos WHERE item_id = p_item_id AND motivo = 'venta' AND NOT reversed) THEN
    RETURN;
  END IF;

  SELECT status INTO ord_status FROM pos_orders WHERE id = it.order_id;
  IF ord_status = 'cancelled' THEN RETURN; END IF;

  v_pres_name := it.selections->>'pres';

  -- La presentacion se guarda en el pedido por NOMBRE y aqui hay que volverla
  -- id. Se compara sin mayusculas ni espacios sobrantes.
  SELECT elem->>'id' INTO v_pres_id
  FROM pos_products p, jsonb_array_elements(COALESCE(p.presentations, '[]'::jsonb)) elem
  WHERE p.id = it.product_id
    AND lower(btrim(COALESCE(elem->>'name',''))) = lower(btrim(COALESCE(v_pres_name,'')))
  LIMIT 1;

  /* RED DE SEGURIDAD: los perros, hamburguesas y sandwiches tienen UNA sola
     presentacion y su nombre esta VACIO, asi que por nombre nunca se podia
     emparejar; v_pres_id quedaba NULL, la receta no encontraba su cantidad y
     el producto NO DESCONTABA NADA. Es el motivo de que Pan perro, Salchicha
     Perro, Jamon, Pan Hamburguesa y Pan Sandwich no se movieran NUNCA.
     Si el producto tiene una sola presentacion no hay ambiguedad posible: esa
     es. (Con dos o mas se deja en NULL a proposito: adivinar cual se vendio
     descontaria el insumo equivocado.) */
  IF v_pres_id IS NULL THEN
    SELECT elem->>'id' INTO v_pres_id
    FROM pos_products p, jsonb_array_elements(COALESCE(p.presentations, '[]'::jsonb)) elem
    WHERE p.id = it.product_id
      AND jsonb_array_length(COALESCE(p.presentations, '[]'::jsonb)) = 1
    LIMIT 1;
  END IF;

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
                      -- La columna vieja 'cantidad' SOLO vale para recetas
                      -- antiguas sin mapa por presentacion. Si el mapa existe
                      -- y no incluye la presentacion vendida, esta linea es de
                      -- OTRA presentacion y no debe descontar nada.
                      CASE WHEN r.cantidades IS NULL OR r.cantidades = '{}'::jsonb
                           THEN r.cantidad ELSE 0 END,
                      0) * it.quantity AS use_qty
      FROM iv_recetas r
      WHERE r.product_id = it.product_id
        AND r.mod_option_id IS NULL
        AND (r.variant_option_id IS NULL OR r.variant_option_id = ANY(v_var_ids))
    ),
    mod_lines AS (
      SELECT r.insumo_id,
             COALESCE((r.cantidades->'_'->>'q')::numeric,
                      CASE WHEN r.cantidades IS NULL OR r.cantidades = '{}'::jsonb
                           THEN r.cantidad ELSE 0 END, 0)
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
    SELECT a.insumo_id, a.use_qty, i.conversion, i.sub_inventario,
           i.vender_bodega, COALESCE(i.stock_servicio,0) AS servicio
    FROM agg a JOIN iv_insumos i ON i.id = a.insumo_id
  LOOP
    need_buy := rec.use_qty / GREATEST(COALESCE(rec.conversion, 1), 0.0000001);

    IF NOT rec.sub_inventario THEN
      -- Insumo normal: todo sale del stock único.
      UPDATE iv_insumos SET stock = COALESCE(stock,0) - need_buy, updated_at = now()
      WHERE id = rec.insumo_id;
      INSERT INTO iv_movimientos(tenant_id,branch_id,insumo_id,delta,campo,motivo,order_id,item_id)
      VALUES (it.tenant_id, it.branch_id, rec.insumo_id, -need_buy, 'stock', 'venta', it.order_id, it.id);

    ELSE
      -- Sub-inventario: primero lo que haya EN SERVICIO (nevera).
      disp_serv   := GREATEST(rec.servicio, 0);
      de_servicio := LEAST(need_buy, disp_serv);
      de_bodega   := need_buy - de_servicio;
      IF de_bodega < 0.000000001 THEN de_bodega := 0; END IF;   -- residuo de redondeo

      -- Si NO se permite vender de bodega, todo se carga a servicio
      -- (queda en negativo = sobreventa visible, no se toca la bodega).
      IF NOT COALESCE(rec.vender_bodega, false) THEN
        de_servicio := need_buy;
        de_bodega   := 0;
      END IF;

      IF abs(de_servicio) > 0.000000001 THEN
        UPDATE iv_insumos SET stock_servicio = COALESCE(stock_servicio,0) - de_servicio, updated_at = now()
        WHERE id = rec.insumo_id;
        INSERT INTO iv_movimientos(tenant_id,branch_id,insumo_id,delta,campo,motivo,order_id,item_id)
        VALUES (it.tenant_id, it.branch_id, rec.insumo_id, -de_servicio, 'servicio', 'venta', it.order_id, it.id);
      END IF;

      -- El faltante sale de BODEGA (el usuario lo aceptó en el aviso).
      IF de_bodega > 0 THEN
        UPDATE iv_insumos SET stock = COALESCE(stock,0) - de_bodega, updated_at = now()
        WHERE id = rec.insumo_id;
        INSERT INTO iv_movimientos(tenant_id,branch_id,insumo_id,delta,campo,motivo,order_id,item_id)
        VALUES (it.tenant_id, it.branch_id, rec.insumo_id, -de_bodega, 'stock', 'venta', it.order_id, it.id);
      END IF;
    END IF;
  END LOOP;
END;
$function$
