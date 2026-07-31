-- ═══════════════════════════════════════════════════════════════
-- Parte 4: red de seguridad para el descuento de inventario.
--
-- PROBLEMA: el descuento se disparaba SOLO al marcar el ítem como enviado a
-- cocina (kitchen_printed_at). Pero esa marca la pone la impresión de la
-- comanda, y hay ventas que nunca pasan por ahí: una gaseosa que no va a
-- cocina, un cobro adelantado, o cuando no se imprimió. Resultado: se vendía
-- y el inventario no bajaba (21 de 48 ítems de salón en una semana).
--
-- SOLUCIÓN: se mantiene el descuento al enviar a cocina (es inmediato, que es
-- lo que se quería), y se agrega un segundo momento — al COBRAR el pedido —
-- que descuenta lo que haya quedado sin descontar.
-- No hay riesgo de descontar dos veces: fn_iv_consumir_item ya ignora los
-- ítems que tienen un movimiento de venta vigente.
-- ═══════════════════════════════════════════════════════════════

-- 1) Al cobrar el pedido: descontar todo lo que falte.
CREATE OR REPLACE FUNCTION trg_iv_orden_pagada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE r RECORD;
BEGIN
  IF NEW.status IN ('paid', 'completed')
     AND COALESCE(OLD.status, '') IS DISTINCT FROM NEW.status THEN
    FOR r IN SELECT id FROM pos_order_items WHERE order_id = NEW.id LOOP
      PERFORM fn_iv_consumir_item(r.id);   -- idempotente
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_iv_orden_pagada ON pos_orders;
CREATE TRIGGER trg_iv_orden_pagada
AFTER UPDATE ON pos_orders
FOR EACH ROW EXECUTE FUNCTION trg_iv_orden_pagada();

-- 2) Un ítem que se agrega a un pedido YA cobrado también descuenta
--    (si no, se colaría por la rendija entre el cobro y el ítem nuevo).
CREATE OR REPLACE FUNCTION trg_iv_item_cocina()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE est text;
BEGIN
  -- Se acaba de marcar como enviado a cocina
  IF NEW.kitchen_printed_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.kitchen_printed_at IS NULL) THEN
    PERFORM fn_iv_consumir_item(NEW.id);
    RETURN NEW;
  END IF;

  -- Ya estaba enviado y le cambiaron la cantidad o la selección → reajustar
  IF TG_OP = 'UPDATE' AND NEW.kitchen_printed_at IS NOT NULL
     AND OLD.kitchen_printed_at IS NOT NULL
     AND (NEW.quantity IS DISTINCT FROM OLD.quantity
          OR NEW.selections IS DISTINCT FROM OLD.selections) THEN
    PERFORM fn_iv_devolver_item(NEW.id, 'ajuste');
    PERFORM fn_iv_consumir_item(NEW.id);
    RETURN NEW;
  END IF;

  -- Nunca fue a cocina, pero el pedido ya está cobrado → descontar igual.
  SELECT status INTO est FROM pos_orders WHERE id = NEW.order_id;
  IF est IN ('paid', 'completed') THEN
    PERFORM fn_iv_consumir_item(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;
