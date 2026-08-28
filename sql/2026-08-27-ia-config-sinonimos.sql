/*  LA COLUMNA QUE FALTABA: `ia_config.sinonimos_categoria`.

    Los sinonimos de categoria por restaurante se dieron por CERRADOS el
    23-ago-2026. La pantalla estaba, el motor de Paco los leia, todo el codigo
    existia... y la columna no. Nunca se creo.

    Resultado: `ia_config` NO tenia donde guardarlos, y como la pantalla guarda
    la fila entera de una vez, el fallo no se quedaba en su rincon —
    TUMBABA EL GUARDADO COMPLETO del asistente. Sergio no podia cambiar ni una
    coma en toda la pantalla: cualquier cosa que tocara moria con
    «Could not find the 'sinonimos_categoria' column».

    Dos lecciones, y la segunda es la cara:

    1. Una funcion no esta hecha hasta que su migracion CORRIO. El codigo
       subido y la base sin tocar se ven exactamente igual que "hecho" hasta
       que alguien la usa.
    2. Guardar la fila entera hace que el fallo de UN campo se lleve por
       delante los otros cuarenta. Ahi es donde un detalle olvidado deja de
       ser un detalle.                                                      */
alter table ia_config
  add column if not exists sinonimos_categoria jsonb not null default '{}'::jsonb;

comment on column ia_config.sinonimos_categoria is
  'Como llama ESTE restaurante a cada categoria de la carta. Lo lee delay-reply para entender al cliente.';
