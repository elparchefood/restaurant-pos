-- ══════════════════════════════════════════════════════════════════════
--  EL CHAT DEBE MOSTRAR LO QUE LE LLEGÓ AL CLIENTE  (22-ago-2026)
--
--  Sergio: *"todo en el chat en el Front debe verse tal cual lo recibe la
--  persona. Cuando enviamos botones nosotros lo vemos de manera diferente."*
--
--  LO QUE PASABA. Paco manda a Meta un mensaje con forma —una ubicación, un
--  botón, una foto— pero al guardarlo en la base lo APLANABA a texto:
--
--    ubicación → "Estamos ubicados en Cra 9B # 63 n58 📍"   (y el mapa se perdía)
--    botón     → "Ver la carta\n\n[Ver la carta] https://…"  (y el botón se perdía)
--    QR        → "[imagen] https://…"                        (y la foto se perdía)
--
--  El cliente SÍ recibía el mapa y el botón; la bandeja no tenía con qué
--  dibujarlos, porque esa información nunca se guardó. No era un problema de
--  pintado: era que el dato no existía.
--
--  LA COLUMNA. `payload` guarda QUÉ RECIBIÓ LA PERSONA, ya traducido al canal
--  por el que salió. Eso importa: en Instagram un mapa llega como enlace y un
--  botón llega como texto, así que ahí el payload dice "enlace", no "mapa".
--  Pintar un mapa bonito en un chat de Instagram sería mentirle a Sergio sobre
--  lo que vio el cliente — justo lo que pidió arreglar.
--
--  Formas que se guardan (el front las dibuja en chat-ia.js):
--    {"tipo":"ubicacion","lat":…,"lng":…,"nombre":…,"direccion":…}
--    {"tipo":"botones","texto":…,"botones":[{"titulo":…,"url":…}]}
--    {"tipo":"respuestas_rapidas","texto":…,"opciones":[…]}
--    {"tipo":"texto","texto":…}
--
--  Es jsonb y no columnas sueltas porque cada canal inventa formas nuevas
--  (carruseles, listas, encuestas) y no se va a migrar la tabla cada vez.
-- ══════════════════════════════════════════════════════════════════════

alter table public.chat_messages
  add column if not exists payload jsonb;

comment on column public.chat_messages.payload is
  'Lo que el cliente recibió de verdad, ya traducido al canal. Lo escribe '
  'delay-reply (loQueRecibio) y lo dibuja chat-ia.js. Null = mensaje de texto '
  'normal, se pinta con body como siempre.';

notify pgrst, 'reload schema';
