
-- ══════════ ANULAR UN PEDIDO DEVUELVE LOS PUNTOS ══════════
-- Hay SEIS sitios distintos que anulan pedidos (caja, domicilios, ventas x3,
-- tomar-pedido). Parchear los seis dejaria la puerta abierta al septimo, asi
-- que esto vive en la base: pase por donde pase, se revierte.
ALTER TABLE pos_puntos_movimientos ADD COLUMN IF NOT EXISTS revertido boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION fn_puntos_revertir_pedido(p_order uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE mv RECORD; v_saldo int;
BEGIN
  FOR mv IN SELECT * FROM pos_puntos_movimientos
             WHERE order_id = p_order AND NOT revertido AND tipo IN ('canje','acumulacion')
  LOOP
    -- Se aplica el movimiento AL REVES: si fue canje (-300) se devuelven 300;
    -- si fue acumulacion (+35) se quitan los 35 que nunca debio ganar.
    UPDATE pos_puntos SET puntos = GREATEST(0, puntos - mv.puntos), updated_at = now()
     WHERE tenant_id = mv.tenant_id AND telefono = mv.telefono
     RETURNING puntos INTO v_saldo;

    UPDATE pos_puntos_movimientos SET revertido = true WHERE id = mv.id;

    INSERT INTO pos_puntos_movimientos
      (tenant_id, branch_id, telefono, tipo, puntos, saldo_despues, order_id, detalle, quien, revertido)
    VALUES (mv.tenant_id, mv.branch_id, mv.telefono, 'ajuste', -mv.puntos, v_saldo, p_order,
            coalesce(p_motivo,'pedido anulado'), 'sistema', true);
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION fn_puntos_revertir_pedido(uuid,text) TO authenticated, service_role;

-- Se dispara sola al anular, venga de donde venga.
CREATE OR REPLACE FUNCTION trg_puntos_al_anular() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'cancelled' AND COALESCE(OLD.status,'') <> 'cancelled' THEN
    BEGIN
      PERFORM fn_puntos_revertir_pedido(NEW.id, 'pedido anulado');
    EXCEPTION WHEN OTHERS THEN NULL;   -- anular nunca puede fallar por los puntos
    END;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_puntos_anular ON pos_orders;
CREATE TRIGGER trg_puntos_anular AFTER UPDATE ON pos_orders
  FOR EACH ROW EXECUTE FUNCTION trg_puntos_al_anular();
