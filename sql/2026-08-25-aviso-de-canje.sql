-- ═══════════════════════════════════════════════════════════════════════════
--  AVISARLE AL CLIENTE QUE REDIMIÓ SUS PUNTOS  (25-ago-2026)
-- ───────────────────────────────────────────────────────────────────────────
--  Sergio, la noche del 24: Sandra redimió 100 puntos por una salsa —el primer
--  canje real del sistema— y no le llegó nada. Pidió que al finalizar el pago
--  le llegue **WhatsApp y SMS** diciendo qué redimió, cuántos puntos usó y
--  cuántos le quedan.
--
--  ── POR QUÉ HACEN FALTA COLUMNAS NUEVAS ─────────────────────────────────
--  `aviso` ya existe, pero cuenta la historia de UN solo canal: el de
--  WhatsApp. Ahora son dos, y son independientes de verdad:
--
--    · el de WhatsApp necesita una plantilla aprobada por Meta, y hoy no hay
--      ninguna para canjes;
--    · el SMS sale igual, sin depender de Meta.
--
--  Con una sola columna, marcar el WhatsApp como "apagado" daría por cerrada
--  la fila y el SMS no saldría nunca. Por eso el SMS lleva su propio registro.
--
--  ── POR QUÉ NO SE REUSA `aviso` CON OTRO VALOR ──────────────────────────
--  Porque entonces "enviado" significaría cosas distintas según el día, y el
--  que mire la tabla dentro de un mes no podría saber si el cliente recibió
--  uno, otro, o los dos. Dos canales, dos columnas.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.pos_puntos_movimientos
  add column if not exists aviso_sms       text,
  add column if not exists aviso_sms_error text,
  add column if not exists aviso_sms_at    timestamptz;

comment on column public.pos_puntos_movimientos.aviso is
  'Estado del aviso por WHATSAPP: null=pendiente, enviando, enviado, apagado, fallido, vencido. Solo habla de WhatsApp; el SMS lleva su propia columna porque uno depende de una plantilla de Meta y el otro no.';

comment on column public.pos_puntos_movimientos.aviso_sms is
  'Estado del aviso por SMS (Twilio): null=pendiente, enviado, apagado, fallido, vencido. Independiente de `aviso`: sin plantilla aprobada el WhatsApp queda apagado y el SMS igual sale.';

-- ── Los canjes que ya existen no se avisan hacia atrás ─────────────────────
--  Mismo criterio que se usó al encender el aviso de puntos ganados: avisar
--  un canje de ayer confunde más de lo que suma. Solo se avisan los NUEVOS.
--  Hoy esto alcanza a un solo movimiento —el de Sandra— y a ese sí queremos
--  que le llegue, así que se deja pendiente a propósito: es de hace minutos.
update public.pos_puntos_movimientos
   set aviso = 'vencido', aviso_sms = 'vencido'
 where tipo = 'canje'
   and aviso is null
   and created_at < now() - interval '2 hours';

-- ── El índice del barrido ──────────────────────────────────────────────────
--  `aviso-puntos` corre cada 2 minutos y busca filas pendientes. Sin índice,
--  cada pasada recorre la tabla entera; hoy son 276 filas y no se nota, pero
--  crece con cada compra de cada restaurante.
create index if not exists ix_puntos_mov_pendientes
  on public.pos_puntos_movimientos (created_at)
  where aviso is null or aviso_sms is null;
