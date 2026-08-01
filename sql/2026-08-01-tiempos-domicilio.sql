
-- Cuanto duro un domicilio en CADA estado. Mismo criterio que pos_mesa_tiempos:
-- el reloj de la tarjeta se reinicia en cada cambio y aqui quedan los tramos
-- cerrados para poder ver el desglose y sacar promedios despues.
CREATE TABLE IF NOT EXISTS pos_domi_tiempos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid,
  branch_id  uuid,
  order_id   uuid,
  estado     text NOT NULL,
  desde      timestamptz NOT NULL,
  hasta      timestamptz NOT NULL,
  segundos   int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pos_domi_tiempos_order ON pos_domi_tiempos (order_id, desde);
CREATE INDEX IF NOT EXISTS pos_domi_tiempos_branch ON pos_domi_tiempos (branch_id, created_at DESC);
ALTER TABLE pos_domi_tiempos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pos_domi_tiempos_tenant ON pos_domi_tiempos;
CREATE POLICY pos_domi_tiempos_tenant ON pos_domi_tiempos FOR ALL
  USING (current_tenant_id() = tenant_id) WITH CHECK (current_tenant_id() = tenant_id);
-- Las Edge Functions entran como service_role (leccion de pos_wa_envios).
GRANT SELECT, INSERT, UPDATE, DELETE ON pos_domi_tiempos TO authenticated, service_role;
