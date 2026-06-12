-- =============================================
-- MIGRACIÓN: Chat IA — Bandeja Omnicanal
-- Fecha: 2026-06-11
-- Ejecutar en: Supabase > SQL Editor
-- =============================================

-- ── 1. CANALES CONECTADOS ────────────────────────────────────────
-- Registro de qué canales (WhatsApp, Instagram, etc.) tiene cada sucursal conectados
CREATE TABLE IF NOT EXISTS chat_channels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
  branch_id     UUID NOT NULL REFERENCES branches(id)  ON DELETE CASCADE,
  channel       TEXT NOT NULL CHECK (channel IN ('whatsapp','instagram','facebook','tiktok')),
  display_name  TEXT,                          -- ej. "WhatsApp Business El Parche"
  handle        TEXT,                          -- número de teléfono o @handle
  connected     BOOLEAN DEFAULT TRUE,
  meta          JSONB DEFAULT '{}',            -- tokens, webhook_url, etc.
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (branch_id, channel)
);

-- ── 2. CONVERSACIONES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_conversations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
  branch_id     UUID NOT NULL REFERENCES branches(id)  ON DELETE CASCADE,
  channel       TEXT NOT NULL CHECK (channel IN ('whatsapp','instagram','facebook','tiktok')),
  channel_id    UUID REFERENCES chat_channels(id),
  -- datos del contacto
  contact_name  TEXT,                          -- nombre del cliente o null
  contact_handle TEXT NOT NULL,               -- teléfono, @handle o ID externo
  contact_avatar_tint INT DEFAULT 0,          -- 0-6, índice de paleta de tinte
  -- estado
  status        TEXT DEFAULT 'open' CHECK (status IN ('open','pending','resolved','archived')),
  unread_count  INT DEFAULT 0,
  is_online     BOOLEAN DEFAULT FALSE,
  -- último mensaje (desnormalizado para la lista)
  last_message  TEXT,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  last_sender   TEXT DEFAULT 'contact' CHECK (last_sender IN ('contact','agent')),
  last_read     BOOLEAN DEFAULT FALSE,        -- si el último mensaje saliente fue leído
  -- orden de pedido vinculado (opcional)
  order_id      UUID REFERENCES pos_orders(id) ON DELETE SET NULL,
  -- meta
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- índices de búsqueda frecuente
CREATE INDEX IF NOT EXISTS idx_chat_conv_branch      ON chat_conversations(branch_id);
CREATE INDEX IF NOT EXISTS idx_chat_conv_channel     ON chat_conversations(branch_id, channel);
CREATE INDEX IF NOT EXISTS idx_chat_conv_status      ON chat_conversations(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_conv_last_msg    ON chat_conversations(branch_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conv_contact     ON chat_conversations(branch_id, contact_handle);

-- ── 3. MENSAJES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  -- dirección: 'in' = cliente→negocio, 'out' = negocio→cliente
  direction       TEXT NOT NULL CHECK (direction IN ('in','out')),
  body            TEXT,                         -- texto del mensaje
  media_url       TEXT,                         -- URL imagen/audio/video
  media_type      TEXT,                         -- 'image','audio','video','document'
  -- estado de entrega (solo mensajes salientes)
  delivery_status TEXT DEFAULT 'sent' CHECK (delivery_status IN ('sending','sent','delivered','read','failed')),
  -- agente que envió (si direction='out')
  agent_id        UUID REFERENCES pos_users(id) ON DELETE SET NULL,
  external_id     TEXT,                         -- ID del mensaje en la plataforma externa
  sent_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_msg_conv ON chat_messages(conversation_id, sent_at);

-- ── 4. TRIGGER: actualizar last_message en conversación ──────────
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE chat_conversations SET
    last_message     = CASE WHEN NEW.media_url IS NOT NULL THEN '[Imagen]' ELSE NEW.body END,
    last_message_at  = NEW.sent_at,
    last_sender      = CASE NEW.direction WHEN 'in' THEN 'contact' ELSE 'agent' END,
    unread_count     = CASE WHEN NEW.direction = 'in' THEN unread_count + 1 ELSE unread_count END,
    updated_at       = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_last_message ON chat_messages;
CREATE TRIGGER trg_update_last_message
  AFTER INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();

-- ── 5. RLS ───────────────────────────────────────────────────────
ALTER TABLE chat_channels       ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages       ENABLE ROW LEVEL SECURITY;

-- Política dev: acceso total (ajustar con auth.uid() en producción)
CREATE POLICY IF NOT EXISTS "chat_channels_open"       ON chat_channels       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "chat_conversations_open"  ON chat_conversations  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "chat_messages_open"       ON chat_messages       FOR ALL USING (true) WITH CHECK (true);

-- ── 6. DATOS DE PRUEBA ───────────────────────────────────────────
-- Insertar solo si hay un tenant y branch existentes
DO $$
DECLARE
  v_tenant UUID;
  v_branch UUID;
BEGIN
  SELECT id INTO v_tenant FROM tenants LIMIT 1;
  SELECT id INTO v_branch FROM branches WHERE tenant_id = v_tenant LIMIT 1;

  IF v_tenant IS NULL OR v_branch IS NULL THEN
    RAISE NOTICE 'No hay tenant/branch — omitiendo datos de prueba';
    RETURN;
  END IF;

  -- Canales
  INSERT INTO chat_channels (tenant_id, branch_id, channel, display_name, handle, connected) VALUES
    (v_tenant, v_branch, 'whatsapp',  'WhatsApp Business', '+57 310 000 0001', true),
    (v_tenant, v_branch, 'instagram', 'Instagram',          '@elparchefood',   true),
    (v_tenant, v_branch, 'facebook',  'Facebook',           'El Parche Food',  true),
    (v_tenant, v_branch, 'tiktok',    'TikTok',             '@elparchefood',   true)
  ON CONFLICT (branch_id, channel) DO NOTHING;

  -- Conversaciones de ejemplo
  INSERT INTO chat_conversations
    (tenant_id, branch_id, channel, contact_name, contact_handle, contact_avatar_tint,
     status, unread_count, is_online, last_message, last_message_at, last_sender)
  VALUES
    (v_tenant, v_branch, 'whatsapp',  'Alejandro Díaz',  '+57 312 884 0192', 0, 'open', 0, true,  'Con carne y tocineta por favor', NOW() - INTERVAL '5 min',  'contact'),
    (v_tenant, v_branch, 'instagram', 'Laura Gómez',     '@lauragomez',      1, 'open', 2, false, '¿Tienen la promo de hamburguesas hoy? 🍔', NOW() - INTERVAL '29 min', 'contact'),
    (v_tenant, v_branch, 'facebook',  'Carlos Ramírez',  'carlos.ramirez',   2, 'open', 1, false, 'Quiero el Combo El Parche x2', NOW() - INTERVAL '52 min', 'contact'),
    (v_tenant, v_branch, 'tiktok',    null,              '@parche_lover',    3, 'open', 4, true,  'Vi su video 🔥 ¿aún tienen salchipapa premium?', NOW() - INTERVAL '75 min', 'contact'),
    (v_tenant, v_branch, 'whatsapp',  'Sofía Restrepo',  '+57 311 234 5678', 5, 'open', 0, false, '¿Cuánto demora el domicilio a Laureles?', NOW() - INTERVAL '2 hours', 'contact')
  ON CONFLICT DO NOTHING;

END $$;
