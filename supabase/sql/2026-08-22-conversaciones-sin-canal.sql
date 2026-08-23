-- ══════════════════════════════════════════════════════════════════════
--  CONVERSACIONES SIN CANAL: NO SE PODIA ESCRIBIR (22-ago-2026, URGENTE)
--
--  Sergio, 9:04pm: "no están saliendo los mensajes para este número".
--  El error del front era "Channel not found": la conversación de Daniel
--  (y otras 30 de WhatsApp) tenían channel_id NULO, y meta-send busca el
--  token del canal por ese id. Sin canal, no hay token, no hay envío.
--
--  Y lo grave: el front guarda el mensaje ANTES de enviarlo, así que esas
--  burbujas de las 8:52 quedaron como "enviadas" sin haber salido nunca.
--
--  Se repara enlazando cada conversación huérfana con el canal de SU
--  restaurante y SU tipo (whatsapp con whatsapp, etc.). Vale para todos
--  los tenants, no solo El Parche.
-- ══════════════════════════════════════════════════════════════════════
update chat_conversations c
   set channel_id = ch.id
  from chat_channels ch
 where c.channel_id is null
   and ch.tenant_id = c.tenant_id
   and ch.channel   = c.channel;

-- Verificación: cuántas quedaron sin canal (deben ser 0 en los canales
-- que existen; si un tenant no tiene canal de ese tipo, quedan como están)
select c.channel, count(*) as siguen_sin_canal
  from chat_conversations c
 where c.channel_id is null
 group by 1;
