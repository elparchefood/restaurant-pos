-- =============================================
-- MIGRACIÓN 18: Configuración del Asistente IA
-- =============================================

CREATE TABLE IF NOT EXISTS ia_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     UUID NOT NULL REFERENCES branches(id)  ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
  activo        BOOLEAN DEFAULT true,
  perfil        JSONB   DEFAULT '{"nombre":"","descripcion":"","fotoUrl":null}',
  tono          TEXT    DEFAULT 'cercano' CHECK (tono IN ('cercano','neutral','formal')),
  instrucciones TEXT    DEFAULT '',
  vocabulario   JSONB   DEFAULT '{"usar":[],"evitar":""}',
  faq           JSONB   DEFAULT '[]',
  negocio       TEXT    DEFAULT '',
  voz           JSONB   DEFAULT '{"activa":false,"porcentajeVoz":30,"voiceId":"valentina"}',
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (branch_id)
);

ALTER TABLE ia_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "ia_config_open" ON ia_config FOR ALL USING (true) WITH CHECK (true);
