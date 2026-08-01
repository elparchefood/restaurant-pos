
-- Consumir puntos de forma segura. Mismo criterio que fn_credito_consumir:
-- SELECT ... FOR UPDATE para que dos cajas cobrandole al mismo cliente a la vez
-- no puedan gastar los mismos puntos dos veces.
CREATE OR REPLACE FUNCTION fn_puntos_consumir(
  p_tenant   uuid,
  p_branch   uuid,
  p_telefono text,
  p_puntos   int,
  p_order    uuid,
  p_detalle  text,
  p_quien    text
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tel   text;
  v_saldo int;
BEGIN
  IF p_puntos IS NULL OR p_puntos <= 0 THEN
    RAISE EXCEPTION 'PUNTOS_INVALIDOS';
  END IF;

  -- El telefono es la llave: se normaliza igual que en award_loyalty_points.
  v_tel := regexp_replace(coalesce(p_telefono,''), '\D', '', 'g');
  IF length(v_tel) = 12 AND left(v_tel,2) = '57' THEN v_tel := substring(v_tel from 3); END IF;
  IF length(v_tel) < 7 THEN RAISE EXCEPTION 'TELEFONO_INVALIDO'; END IF;

  SELECT puntos INTO v_saldo FROM pos_puntos
   WHERE tenant_id = p_tenant AND telefono = v_tel FOR UPDATE;

  IF v_saldo IS NULL THEN v_saldo := 0; END IF;
  IF v_saldo < p_puntos THEN
    -- El modal necesita las cifras para explicarle al cajero.
    RAISE EXCEPTION 'PUNTOS_INSUFICIENTES|%|%', v_saldo, p_puntos;
  END IF;

  UPDATE pos_puntos SET puntos = puntos - p_puntos, updated_at = now()
   WHERE tenant_id = p_tenant AND telefono = v_tel;

  INSERT INTO pos_puntos_movimientos
    (tenant_id, branch_id, telefono, tipo, puntos, saldo_despues, order_id, detalle, quien)
  VALUES (p_tenant, p_branch, v_tel, 'canje', -p_puntos, v_saldo - p_puntos, p_order, p_detalle, p_quien);

  RETURN v_saldo - p_puntos;
END;
$$;
GRANT EXECUTE ON FUNCTION fn_puntos_consumir(uuid,uuid,text,int,uuid,text,text) TO authenticated, service_role;

-- Devolver puntos (si se anula el pedido). Nunca deja el movimiento sin rastro.
CREATE OR REPLACE FUNCTION fn_puntos_devolver(p_order uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE mv RECORD; v_saldo int;
BEGIN
  FOR mv IN SELECT * FROM pos_puntos_movimientos
             WHERE order_id = p_order AND tipo = 'canje' LOOP
    UPDATE pos_puntos SET puntos = puntos - mv.puntos, updated_at = now()
     WHERE tenant_id = mv.tenant_id AND telefono = mv.telefono
     RETURNING puntos INTO v_saldo;
    INSERT INTO pos_puntos_movimientos
      (tenant_id, branch_id, telefono, tipo, puntos, saldo_despues, order_id, detalle, quien)
    VALUES (mv.tenant_id, mv.branch_id, mv.telefono, 'ajuste', -mv.puntos, v_saldo, p_order,
            coalesce(p_motivo,'devolucion de canje'), 'sistema');
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION fn_puntos_devolver(uuid,text) TO authenticated, service_role;
