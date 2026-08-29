/*  Unir mesas — 29-ago-2026

    Sergio: «hay personas que unen las mesas para comer todos juntos». Al unir
    dos mesas quedan con el mismo estado y los mismos productos: son UNA.

    Cómo se representa: un pedido sigue teniendo UNA sola mesa (`table_id`), la
    principal — la que se tocó primero. Las demás se marcan con el mismo
    `grupo_id`. Así:

      · No se toca nada de cómo funciona un pedido hoy. Un pedido de una mesa
        sola es exactamente lo que era: `grupo_id` en blanco.
      · No hay pedidos partidos ni totales que sumar entre mesas.
      · Para saber "¿con quién está unida esta?" basta mirar quién comparte el
        `grupo_id`, y eso las pantallas ya lo tienen a mano porque cargan todas
        las mesas de la sede.

    La principal es la que lleva `current_order_id`. Las acompañantes lo llevan
    también (para que tocarlas abra la misma cuenta) pero NO son dueñas del
    pedido: `pos_orders.table_id` apunta solo a la principal.  */

alter table pos_tables add column if not exists grupo_id text;

/*  Solo se indexan las unidas. Las mesas sueltas —que son casi todas, siempre—
    no ocupan sitio en el índice.  */
create index if not exists pos_tables_grupo_idx
  on pos_tables (grupo_id)
  where grupo_id is not null;

comment on column pos_tables.grupo_id is
  'Mesas unidas: todas las del grupo comparten este valor. NULL = mesa suelta. La principal es la que pos_orders.table_id apunta.';
