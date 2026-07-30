-- ═══════════════════════════════════════════════════════════════
-- Parte 2: disparadores automáticos
--   · Al marcarse kitchen_printed_at (enviado a cocina) → descontar
--   · Al anular el pedido (status='cancelled')          → devolver
--   · Al borrar un ítem ya enviado                      → devolver
--   · Si cambia la cantidad de un ítem ya enviado       → reajustar
-- ═══════════════════════════════════════════════════════════════

-- 1) Ítem enviado a cocina → consumir. Cantidad cambiada → devolver y re-consumir.
CREATE OR REPLACE FUNCTION trg_iv_item_cocina()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
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
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_iv_item_cocina ON pos_order_items;
CREATE TRIGGER trg_iv_item_cocina
AFTER INSERT OR UPDATE ON pos_order_items
FOR EACH ROW EXECUTE FUNCTION trg_iv_item_cocina();

-- 2) Ítem borrado (quitado de la comanda) → devolver lo que había consumido.
CREATE OR REPLACE FUNCTION trg_iv_item_borrado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM fn_iv_devolver_item(OLD.id, 'eliminado');
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_iv_item_borrado ON pos_order_items;
CREATE TRIGGER trg_iv_item_borrado
BEFORE DELETE ON pos_order_items
FOR EACH ROW EXECUTE FUNCTION trg_iv_item_borrado();

-- 3) Pedido anulado → devolver TODO su inventario.
--    Si se reactiva (deja de estar cancelled) → volver a consumir.
CREATE OR REPLACE FUNCTION trg_iv_orden_anulada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE r RECORD;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    FOR r IN SELECT id FROM pos_order_items WHERE order_id = NEW.id LOOP
      PERFORM fn_iv_devolver_item(r.id, 'anulacion');
    END LOOP;
  ELSIF OLD.status = 'cancelled' AND NEW.status IS DISTINCT FROM 'cancelled' THEN
    FOR r IN SELECT id FROM pos_order_items WHERE order_id = NEW.id AND kitchen_printed_at IS NOT NULL LOOP
      PERFORM fn_iv_consumir_item(r.id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_iv_orden_anulada ON pos_orders;
CREATE TRIGGER trg_iv_orden_anulada
AFTER UPDATE ON pos_orders
FOR EACH ROW EXECUTE FUNCTION trg_iv_orden_anulada();

-- 4) Pedido borrado por completo → devolver (por si acaso; los ítems caen en cascada).
CREATE OR REPLACE FUNCTION trg_iv_orden_borrada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM pos_order_items WHERE order_id = OLD.id LOOP
    PERFORM fn_iv_devolver_item(r.id, 'eliminado');
  END LOOP;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_iv_orden_borrada ON pos_orders;
CREATE TRIGGER trg_iv_orden_borrada
BEFORE DELETE ON pos_orders
FOR EACH ROW EXECUTE FUNCTION trg_iv_orden_borrada();
