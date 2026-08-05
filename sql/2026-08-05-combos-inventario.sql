-- ═══════════════════════════════════════════════════════════════════════════
-- INVENTARIO — que un COMBO también descuente
-- ───────────────────────────────────────────────────────────────────────────
-- La función descontaba mirando `it.product_id`. Un combo no tiene producto:
-- es un envoltorio con varios adentro. Al venderlo no habría descontado NADA,
-- y el stock se habría ido desviando en silencio — que es justo lo que Sergio
-- señaló cuando dijo que un combo con productos inventados no sirve.
--
-- El cambio es UNA capa nueva, `objetivos`: la lista de (producto, tamaño,
-- variantes, cantidad) a descontar. Para un item normal es una sola fila, la
-- de siempre. Para un combo es una por cada cosa que lleva, multiplicada por
-- cuántos combos se vendieron.
--
-- Todo lo demás se deja intacto A PROPÓSITO: las tres redes de seguridad para
-- adivinar la presentación, el sub-inventario, la alerta de "tiene receta y no
-- descontó". Cada una está ahí por un problema real que ya pasó.
-- ═══════════════════════════════════════════════════════════════════════════

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
  v_es_combo  boolean;
  rec         RECORD;
  need_buy    numeric;   -- total a descontar, en buy_unit
  de_servicio numeric;   -- cuánto sale de "en servicio"
  de_bodega   numeric;   -- cuánto sale de bodega
  disp_serv   numeric;
  v_lineas    int := 0;
BEGIN
  SELECT * INTO it FROM pos_order_items WHERE id = p_item_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM iv_movimientos WHERE item_id = p_item_id AND motivo = 'venta' AND NOT reversed) THEN
    RETURN;
  END IF;

  SELECT status INTO ord_status FROM pos_orders WHERE id = it.order_id;
  IF ord_status = 'cancelled' THEN RETURN; END IF;

  v_es_combo := COALESCE(it.selections ? 'combo_id', false);

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

  /* TERCERA RED: hay pedidos guardados SIN el campo 'pres' (paso el 21 y el 25
     de julio con productos de dos tamanos). El nombre del item si lo trae
     ("Personal - Premium - Mixta"), asi que se deduce de ahi. Se exige que el
     nombre de la presentacion aparezca completo en el nombre del item. */
  IF v_pres_id IS NULL THEN
    SELECT elem->>'id' INTO v_pres_id
    FROM pos_products p, jsonb_array_elements(COALESCE(p.presentations, '[]'::jsonb)) elem
    WHERE p.id = it.product_id
      AND btrim(COALESCE(elem->>'name','')) <> ''
      AND lower(COALESCE(it.product_name,'')) LIKE '%' || lower(btrim(elem->>'name')) || '%'
    LIMIT 1;
  END IF;

  v_var_ids := ARRAY(
    SELECT (val->>'id')
    FROM jsonb_each(COALESCE(it.selections->'vars', '{}'::jsonb)) AS e(key, val)
    WHERE val ? 'id'
  );

  FOR rec IN
    /* LOS OBJETIVOS A DESCONTAR.
       Item normal  -> una sola fila: el producto del item, con lo que se
                       averiguo arriba.
       Combo        -> una fila por cada cosa que lleva. El combo guarda el
                       pres_id y las variantes DIRECTO (no por nombre), asi que
                       no hace falta adivinar nada: quedaron decididos al
                       armarlo en el catalogo.
       La cantidad se multiplica por it.quantity: dos combos que llevan dos
       gaseosas cada uno son cuatro gaseosas. */
    WITH objetivos AS (
      SELECT (t->>'product_id')::uuid AS pid,
             /* MISMA RED DE SEGURIDAD que para un producto suelto: si el combo
                no trae pres_id y el producto tiene UNA sola presentacion, esa
                es. Pasa con los perros, hamburguesas y sandwiches, que tienen
                una presentacion con el nombre VACIO. Sin esto la receta no
                encuentra su cantidad y el combo no descuenta nada -- que es
                justo el bug que se tardo semanas en ver con los perros. */
             COALESCE(NULLIF(t->>'pres_id',''), (
               SELECT elem->>'id'
               FROM pos_products p2, jsonb_array_elements(COALESCE(p2.presentations,'[]'::jsonb)) elem
               WHERE p2.id = (t->>'product_id')::uuid
                 AND jsonb_array_length(COALESCE(p2.presentations,'[]'::jsonb)) = 1
               LIMIT 1)) AS presid,
             ARRAY(SELECT v FROM jsonb_each_text(COALESCE(t->'variantes','{}'::jsonb)) AS ev(k,v)) AS varids,
             COALESCE(NULLIF(t->>'cantidad','')::numeric, 1) * it.quantity AS qty
      FROM jsonb_array_elements(COALESCE(it.selections->'combo_items','[]'::jsonb)) t
      WHERE v_es_combo AND (t->>'product_id') IS NOT NULL

      UNION ALL

      SELECT it.product_id, v_pres_id, v_var_ids, it.quantity::numeric
      WHERE NOT v_es_combo AND it.product_id IS NOT NULL
    ),
    base_lines AS (
      SELECT r.insumo_id,
             COALESCE((r.cantidades->o.presid->>'q')::numeric,
                      (r.cantidades->'_'->>'q')::numeric,
                      -- La columna vieja 'cantidad' SOLO vale para recetas
                      -- antiguas sin mapa por presentacion. Si el mapa existe
                      -- y no incluye la presentacion vendida, esta linea es de
                      -- OTRA presentacion y no debe descontar nada.
                      CASE WHEN r.cantidades IS NULL OR r.cantidades = '{}'::jsonb
                           THEN r.cantidad ELSE 0 END,
                      0) * o.qty AS use_qty
      FROM objetivos o
      JOIN iv_recetas r ON r.product_id = o.pid
      WHERE r.mod_option_id IS NULL
        AND (r.variant_option_id IS NULL OR r.variant_option_id = ANY(o.varids))
    ),
    /* Las adiciones son del ITEM, no de cada producto de adentro: un combo no
       lleva adiciones (todo quedo decidido al armarlo), asi que esta parte
       sigue igual que siempre. */
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
    v_lineas := v_lineas + 1;
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

  /* NO FALLAR EN SILENCIO. Que los perros no descontaran nada paso inadvertido
     semanas porque el sistema no se quejaba: simplemente no escribia nada.
     Si un producto TIENE receta y aun asi no movio un solo insumo, queda
     registrado para que se vea en Inventario en vez de perderse.
     Vale igual para los combos: si ninguno de sus productos descontó, se avisa.
     Un combo que no descuenta es peor que un producto que no descuenta, porque
     se lleva varios insumos por delante de una sola vez. */
  IF v_lineas = 0 AND EXISTS (
      SELECT 1 FROM iv_recetas r
      WHERE r.product_id = it.product_id
         OR (v_es_combo AND r.product_id IN (
              SELECT (t->>'product_id')::uuid
              FROM jsonb_array_elements(COALESCE(it.selections->'combo_items','[]'::jsonb)) t
              WHERE (t->>'product_id') IS NOT NULL))
  ) THEN
    INSERT INTO iv_consumo_alertas(tenant_id, branch_id, order_id, item_id, product_id,
                                   product_name, pres_guardada, detalle)
    VALUES (it.tenant_id, it.branch_id, it.order_id, it.id, it.product_id,
            it.product_name, it.selections->>'pres',
            CASE WHEN v_es_combo
                 THEN 'El COMBO tiene productos con receta pero no descontó ningún insumo'
                 ELSE 'El producto tiene receta pero no descontó ningún insumo' END)
    ON CONFLICT (item_id) DO NOTHING;
  END IF;
END;
$function$;
