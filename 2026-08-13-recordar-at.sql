-- ═══════════════════════════════════════════════════════════════════════
-- CADA CONVERSACIÓN CARGA SU PROPIA ALARMA
--
-- Antes el vigilante recorría TODAS las conversaciones cada 5 minutos para
-- descartarlas una por una (Seq Scan sobre 193 filas para devolver 0). Con
-- 193 no se nota; con 40.000 sí.
--
-- Ahora la hora de vencimiento vive en la conversación y el índice solo
-- guarda las que tienen una alarma puesta —que son un puñado en el peor
-- día—. La consulta deja de recorrer nada: devuelve cero filas hasta que de
-- verdad hay algo vencido, tengas 200 conversaciones o 200.000.
-- ═══════════════════════════════════════════════════════════════════════

alter table chat_conversations
  add column if not exists recordar_at timestamptz;

comment on column chat_conversations.recordar_at is
  'Cuándo vence la espera del comprobante. NULL = sin alarma. Lo pone delay-reply al encender pago_pendiente y lo apaga cuando el comprobante llega o el pedido se resuelve.';

-- Índice PARCIAL: solo indexa las que tienen alarma puesta. Un índice
-- completo guardaría 193 filas para consultar 2.
create index if not exists ix_conv_recordar_at
  on chat_conversations (recordar_at)
  where recordar_at is not null;
