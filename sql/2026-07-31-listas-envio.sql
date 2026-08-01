-- ══════════════ LISTAS DE ENVÍO DE PLANTILLAS ══════════════
-- Meta limita a 250 conversaciones iniciadas por el negocio cada 24 h
-- (TIER_250, verificado 2026-07-31). Con 1.382 contactos son ~6 días, así que
-- NO basta con "una lista": hace falta una COLA con estado, para saber a quién
-- ya se le escribió y poder retomar mañana sin repetir ni saltarse a nadie.

CREATE TABLE IF NOT EXISTS pos_wa_envios (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid,
  branch_id    uuid,
  lista_id     uuid REFERENCES pos_wa_listas(id) ON DELETE CASCADE,
  plantilla    text NOT NULL,
  idioma       text NOT NULL DEFAULT 'es',
  telefono     text NOT NULL,
  etiqueta     text,                       -- el nombre con el que está guardado
  -- pendiente → enviado → (entregado | leido | respondio) | fallido | omitido
  estado       text NOT NULL DEFAULT 'pendiente',
  orden        int,                        -- prioridad de envío
  wa_message_id text,
  error        text,
  intentos     int NOT NULL DEFAULT 0,
  enviado_at   timestamptz,
  respondio_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Nadie puede recibir la misma plantilla dos veces en la misma lista.
CREATE UNIQUE INDEX IF NOT EXISTS pos_wa_envios_uniq
  ON pos_wa_envios (lista_id, right(regexp_replace(telefono,'\D','','g'), 10));
CREATE INDEX IF NOT EXISTS pos_wa_envios_cola ON pos_wa_envios (lista_id, estado, orden);
CREATE INDEX IF NOT EXISTS pos_wa_envios_branch ON pos_wa_envios (branch_id, created_at DESC);

ALTER TABLE pos_wa_envios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pos_wa_envios_tenant ON pos_wa_envios;
CREATE POLICY pos_wa_envios_tenant ON pos_wa_envios FOR ALL
  USING (current_tenant_id() = tenant_id) WITH CHECK (current_tenant_id() = tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON pos_wa_envios TO authenticated;

-- Cuánto se ha enviado en las últimas 24 h, para no pasarse del límite de Meta.
CREATE OR REPLACE FUNCTION fn_wa_enviados_24h(p_branch uuid)
RETURNS int LANGUAGE sql STABLE AS $$
  SELECT count(*)::int FROM pos_wa_envios
   WHERE branch_id = p_branch AND estado <> 'pendiente' AND estado <> 'omitido'
     AND enviado_at > now() - interval '24 hours';
$$;
GRANT EXECUTE ON FUNCTION fn_wa_enviados_24h(uuid) TO authenticated, service_role;
