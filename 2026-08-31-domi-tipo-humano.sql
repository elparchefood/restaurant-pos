/*  Lo que una PERSONA dijo que es este lugar, desde el banner del chat.

    Manda sobre lo que Paco deduzca: no es otra deduccion compitiendo con la
    suya, es alguien que conoce el barrio diciendo un hecho.

    Nace del caso de Alejandra (30-ago-2026): Sergio marco "conjunto" en el
    banner y Paco siguio pidiendo el barrio, porque esa marca solo servia para
    archivar el lugar en la lista correcta — para la PROXIMA vez, no para la
    conversacion en curso.

    'conjunto' | 'barrio' | null (nadie lo ha dicho todavia).               */
alter table chat_conversations
  add column if not exists domi_tipo_humano text;

alter table chat_conversations
  drop constraint if exists chat_conv_domi_tipo_humano_chk;

alter table chat_conversations
  add constraint chat_conv_domi_tipo_humano_chk
  check (domi_tipo_humano is null or domi_tipo_humano in ('conjunto','barrio'));

comment on column chat_conversations.domi_tipo_humano is
  'Lo que Sergio marco en el banner: conjunto o barrio. Manda sobre lo que deduzca Paco.';
