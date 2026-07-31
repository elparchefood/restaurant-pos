-- ══════════════ CRÉDITOS ══════════════
-- Definición de Sergio (2026-07-31):
--   "El sistema igual no dejará cerrar la caja si no está pago, pero se pagará
--    con créditos. Y esos créditos son los que cada dueño de restaurante les
--    podrá dar a clientes o empleados."
--
-- O sea: el crédito es un MÉTODO DE PAGO, no un pedido a medio pagar. El pedido
-- queda pagado y la caja cuadra; la deuda vive en la PERSONA, no en el pedido.
-- Por eso no se llama "fiado" en ninguna parte.

CREATE TABLE IF NOT EXISTS pos_creditos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid,
  branch_id   uuid,
  tipo        text NOT NULL CHECK (tipo IN ('cliente','empleado')),
  -- Cliente: se enlaza a su ficha (ahí viven sus datos y su historial).
  cliente_id  uuid REFERENCES pos_clientes(id) ON DELETE SET NULL,
  -- Empleado: se guarda suelto; no todos los empleados son usuarios del sistema.
  nombre      text NOT NULL,
  telefono    text,
  documento   text,
  cupo        numeric NOT NULL DEFAULT 0,   -- límite que le asignó el administrador
  saldo       numeric NOT NULL DEFAULT 0,   -- lo que debe HOY
  activo      boolean NOT NULL DEFAULT true,
  notas       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN pos_creditos.cupo  IS 'Límite asignado por el administrador. Solo él lo cambia, desde Configuración.';
COMMENT ON COLUMN pos_creditos.saldo IS 'Deuda actual. Sube al consumir, baja al abonar. Lo mantienen las funciones, nunca la app.';

-- Un cliente no puede tener dos créditos abiertos.
CREATE UNIQUE INDEX IF NOT EXISTS pos_creditos_cliente_uniq
  ON pos_creditos (cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pos_creditos_branch ON pos_creditos (branch_id, tipo, activo);

-- Cada movimiento queda registrado: sin esto, un saldo es un número sin respaldo.
CREATE TABLE IF NOT EXISTS pos_credito_movimientos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid,
  branch_id   uuid,
  credito_id  uuid NOT NULL REFERENCES pos_creditos(id) ON DELETE CASCADE,
  tipo        text NOT NULL CHECK (tipo IN ('consumo','abono','ajuste')),
  monto       numeric NOT NULL,             -- siempre positivo; el 'tipo' dice si suma o resta
  saldo_despues numeric,                    -- foto del saldo tras el movimiento
  order_id    uuid,                         -- consumo: qué pedido lo generó
  session_id  uuid,                         -- abono: a qué turno de caja entró
  metodo      text,                         -- abono: efectivo, transferencia…
  nota        text,
  registrado_por text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pos_credito_mov_credito ON pos_credito_movimientos (credito_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pos_credito_mov_sesion  ON pos_credito_movimientos (session_id) WHERE session_id IS NOT NULL;

ALTER TABLE pos_creditos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_credito_movimientos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pos_creditos_tenant ON pos_creditos;
CREATE POLICY pos_creditos_tenant ON pos_creditos FOR ALL
  USING (current_tenant_id() = tenant_id) WITH CHECK (current_tenant_id() = tenant_id);
DROP POLICY IF EXISTS pos_credito_mov_tenant ON pos_credito_movimientos;
CREATE POLICY pos_credito_mov_tenant ON pos_credito_movimientos FOR ALL
  USING (current_tenant_id() = tenant_id) WITH CHECK (current_tenant_id() = tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON pos_creditos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pos_credito_movimientos TO authenticated;

-- ── CONSUMIR: pagar un pedido con crédito ──────────────────────────────
-- Valida el cupo ANTES de tocar nada. Si no alcanza, falla y el cobro muestra
-- "crédito insuficiente"; solo el administrador puede ampliar el cupo desde
-- Configuración. Sin esto, el cupo sería un adorno.
CREATE OR REPLACE FUNCTION fn_credito_consumir(
  p_credito uuid, p_monto numeric, p_order uuid DEFAULT NULL,
  p_quien text DEFAULT NULL, p_nota text DEFAULT NULL
) RETURNS TABLE (saldo numeric, disponible numeric)
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE c RECORD; v_nuevo numeric;
BEGIN
  IF coalesce(p_monto,0) <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor que cero'; END IF;

  -- FOR UPDATE: dos cajas cobrando al tiempo al mismo cliente no pueden pasarse
  -- del cupo. Sin el bloqueo, ambas leerían el mismo saldo viejo.
  SELECT * INTO c FROM pos_creditos WHERE id = p_credito FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ese crédito no existe'; END IF;
  IF NOT c.activo THEN RAISE EXCEPTION 'Ese crédito está desactivado'; END IF;

  v_nuevo := coalesce(c.saldo,0) + p_monto;
  IF v_nuevo > coalesce(c.cupo,0) THEN
    RAISE EXCEPTION 'CREDITO_INSUFICIENTE|%|%|%',
      coalesce(c.cupo,0) - coalesce(c.saldo,0), coalesce(c.cupo,0), coalesce(c.saldo,0);
  END IF;

  UPDATE pos_creditos SET saldo = v_nuevo, updated_at = now() WHERE id = p_credito;
  INSERT INTO pos_credito_movimientos
    (tenant_id, branch_id, credito_id, tipo, monto, saldo_despues, order_id, nota, registrado_por)
  VALUES (c.tenant_id, c.branch_id, p_credito, 'consumo', p_monto, v_nuevo, p_order, p_nota, p_quien);

  saldo := v_nuevo; disponible := coalesce(c.cupo,0) - v_nuevo;
  RETURN NEXT;
END;
$fn$;

-- ── ABONAR: el cliente paga parte de su deuda ──────────────────────────
-- Entra a la caja del turno abierto: si no, el arqueo no cuadra.
CREATE OR REPLACE FUNCTION fn_credito_abonar(
  p_credito uuid, p_monto numeric, p_metodo text DEFAULT 'efectivo',
  p_session uuid DEFAULT NULL, p_quien text DEFAULT NULL, p_nota text DEFAULT NULL
) RETURNS TABLE (saldo numeric, disponible numeric, sobrante numeric)
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE c RECORD; v_aplica numeric; v_nuevo numeric;
BEGIN
  IF coalesce(p_monto,0) <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor que cero'; END IF;
  SELECT * INTO c FROM pos_creditos WHERE id = p_credito FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ese crédito no existe'; END IF;

  -- Nunca dejar el saldo en negativo: si abona de más, el exceso se devuelve
  -- como vuelto, no queda como "saldo a favor" (eso sería otra función).
  v_aplica := least(p_monto, coalesce(c.saldo,0));
  IF v_aplica <= 0 THEN RAISE EXCEPTION 'Esta persona no debe nada'; END IF;
  v_nuevo := coalesce(c.saldo,0) - v_aplica;

  UPDATE pos_creditos SET saldo = v_nuevo, updated_at = now() WHERE id = p_credito;
  INSERT INTO pos_credito_movimientos
    (tenant_id, branch_id, credito_id, tipo, monto, saldo_despues, session_id, metodo, nota, registrado_por)
  VALUES (c.tenant_id, c.branch_id, p_credito, 'abono', v_aplica, v_nuevo, p_session, p_metodo, p_nota, p_quien);

  saldo := v_nuevo; disponible := coalesce(c.cupo,0) - v_nuevo; sobrante := p_monto - v_aplica;
  RETURN NEXT;
END;
$fn$;

GRANT EXECUTE ON FUNCTION fn_credito_consumir(uuid, numeric, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_credito_abonar(uuid, numeric, text, uuid, text, text) TO authenticated, service_role;

-- Vista para las pantallas: saldo, disponible y cuándo fue el último movimiento.
CREATE OR REPLACE VIEW v_creditos AS
SELECT c.*,
       (coalesce(c.cupo,0) - coalesce(c.saldo,0)) AS disponible,
       (SELECT max(m.created_at) FROM pos_credito_movimientos m WHERE m.credito_id = c.id) AS ultimo_mov
  FROM pos_creditos c;
ALTER VIEW v_creditos SET (security_invoker = true);
GRANT SELECT ON v_creditos TO authenticated;
