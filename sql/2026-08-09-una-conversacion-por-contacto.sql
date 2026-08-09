-- ═══════════════════════════════════════════════════════════════════════════
-- Un contacto, UNA conversacion — el candado que faltaba
-- ───────────────────────────────────────────────────────────────────────────
-- Sergio escribio "Hola" desde Instagram y le llegaron DOS conversaciones
-- iguales. La causa, medida en la base: las dos se crearon con 84
-- MILISEGUNDOS de diferencia.
--
--   21:46:58.387636  conversacion A  (0 mensajes)
--   21:46:58.471574  conversacion B  (1 mensaje)
--
-- Meta entrego el mismo aviso dos veces —lo hace, y hay que contar con ello—.
-- El codigo hacia "busco la conversacion; si no existe, la creo": los dos
-- avisos buscaron a la vez, ninguno la encontro, y los dos la crearon. El
-- mensaje si quedo una sola vez porque `chat_messages.external_id` YA tiene su
-- indice unico; la conversacion no lo tenia.
--
-- Esto no se arregla con codigo mas listo: dos procesos a la vez siempre van a
-- poder colarse entre el "busco" y el "creo". Se arregla en la base, que es el
-- unico sitio donde se puede garantizar.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) La duplicada vacia se va; la que tiene el mensaje se queda ──────────
delete from chat_conversations c
 where c.channel <> 'whatsapp'
   and not exists (select 1 from chat_messages m where m.conversation_id = c.id)
   and exists (
     select 1 from chat_conversations o
      where o.branch_id = c.branch_id
        and o.channel = c.channel
        and o.contact_handle = c.contact_handle
        and o.id <> c.id
        and exists (select 1 from chat_messages m2 where m2.conversation_id = o.id)
   );

-- ── 2) El candado ─────────────────────────────────────────────────────────
-- Vale para los tres canales: WhatsApp tiene el mismo hueco, solo que sus
-- mensajes llegan mas espaciados y no le habia tocado todavia.
create unique index if not exists ux_chat_conv_contacto
  on chat_conversations (branch_id, channel, contact_handle);
