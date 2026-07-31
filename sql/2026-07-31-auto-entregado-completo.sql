-- ═══════════════════════════════════════════════════════════════
-- Auto-entregado de domicilios (corrección)
--
-- PROBLEMA: el trabajo automático marcaba SOLO `estado='entregado'`. La
-- pantalla de Ventas lee `delivery_status`, que quedaba en 'camino', así que
-- los pedidos se veían "En camino" para siempre. Y como `delivered_at` seguía
-- vacío, el cierre de caja los contaba como pendientes y no dejaba cerrar.
--
-- AHORA hace lo mismo que cuando se marca a mano: escribe los tres campos y
-- aplica la etiqueta de "Entregado" en el chat (quitando las de los otros
-- estados). No envía mensaje al cliente porque la config de 'entregado' no
-- tiene mensaje — si algún día se le pone uno, hay que dispararlo desde aquí.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION auto_entregar_domicilios()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r          RECORD;
  cfg        jsonb;
  etq_nueva  text;
  etq_todas  text[];
  conv       RECORD;
  labels_new jsonb;
BEGIN
  FOR r IN
    SELECT o.id, o.branch_id, c.estados_config AS cfg
    FROM pos_orders o
    JOIN ia_config c ON c.branch_id = o.branch_id
    WHERE o.estado = 'en_camino'
      AND lower(o.channel) = 'domicilio'
      AND COALESCE(o.status, '') <> 'cancelled'
      AND o.estado_at IS NOT NULL
      AND o.estado_at < now() - (COALESCE((c.estados_config->>'auto_entregado_min')::int, 30) || ' minutes')::interval
  LOOP
    -- 1) El pedido: los TRES campos, como lo hace 'cambiar-estado'.
    UPDATE pos_orders
       SET estado          = 'entregado',
           estado_at       = now(),
           delivery_status = 'entregado',
           delivered_at    = COALESCE(delivered_at, now())
     WHERE id = r.id;

    -- 2) La etiqueta del chat: se quitan las de los otros estados y queda la
    --    de "Entregado" (si está configurada).
    cfg := COALESCE(r.cfg, '{}'::jsonb) -> 'domicilio';
    etq_nueva := NULLIF(cfg -> 'entregado' ->> 'etiqueta', '');
    etq_todas := ARRAY(
      SELECT x FROM (
        SELECT cfg -> 'en_preparacion' ->> 'etiqueta' AS x
        UNION ALL SELECT cfg -> 'listo'     ->> 'etiqueta'
        UNION ALL SELECT cfg -> 'en_camino' ->> 'etiqueta'
        UNION ALL SELECT cfg -> 'entregado' ->> 'etiqueta'
      ) t WHERE x IS NOT NULL AND x <> ''
    );

    FOR conv IN SELECT id, labels FROM chat_conversations WHERE order_id = r.id LOOP
      labels_new := COALESCE(
        (SELECT jsonb_agg(v) FROM jsonb_array_elements_text(COALESCE(conv.labels, '[]'::jsonb)) v
          WHERE v <> ALL(etq_todas)),
        '[]'::jsonb);
      IF etq_nueva IS NOT NULL AND NOT (labels_new @> to_jsonb(ARRAY[etq_nueva])) THEN
        labels_new := labels_new || to_jsonb(ARRAY[etq_nueva]);
      END IF;
      IF labels_new IS DISTINCT FROM COALESCE(conv.labels, '[]'::jsonb) THEN
        UPDATE chat_conversations SET labels = labels_new WHERE id = conv.id;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- Reparar los que quedaron a medias con la versión vieja: estado='entregado'
-- pero delivery_status/delivered_at sin actualizar.
UPDATE pos_orders
   SET delivery_status = 'entregado',
       delivered_at    = COALESCE(delivered_at, estado_at, now())
 WHERE lower(channel) = 'domicilio'
   AND estado = 'entregado'
   AND (delivery_status IS DISTINCT FROM 'entregado' OR delivered_at IS NULL)
   AND COALESCE(status, '') <> 'cancelled';
