/*  EL RASTRO DE LO QUE SE HABLA CON EL BOT DE INVENTARIO.

    Sergio, 28-ago-2026: *«luego ya me empezó a decir "no pude procesar eso"
    infinitamente»*. Y no se pudo saber por qué: los registros del servidor
    dicen que TODAS esas llamadas salieron bien (200), y ahí se acaba la pista.
    Lo que no queda en ningún lado es QUÉ escribió él y QUÉ le contestó el bot.

    Sin eso, la única forma de investigar es pedirle que lo repita — o sea,
    pedirle que vuelva a tener el problema. Con esto, la próxima vez que pase
    se mira y ya. Ver [[feedback_rastro_antes_que_adivinar]].

    Se guarda en la fila que YA existía para no repetir mensajes: cada mensaje
    del gerente pasa por aquí una sola vez, así que es el sitio natural.

    ⚠️ Son mensajes de los dueños y sus gerentes sobre su propio inventario —
    no de clientes. Aun así la tabla no la lee nadie desde el navegador: no
    tiene políticas de lectura, igual que antes.                            */
alter table pos_gerente_procesados
  add column if not exists creado_at timestamptz not null default now(),
  add column if not exists branch_id uuid,
  add column if not exists telefono  text,
  add column if not exists tipo      text,
  add column if not exists mensaje   text,
  add column if not exists respuesta text,
  add column if not exists ruta      text;

comment on column pos_gerente_procesados.ruta is
  'Quién contestó: factura, gerente, o el saludo de "solo entiendo texto y fotos".';

create index if not exists ix_gerente_procesados_fecha
  on pos_gerente_procesados (creado_at desc);
