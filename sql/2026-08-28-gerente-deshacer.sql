/*  PODER DESHACER LO QUE APLICÓ UNA FACTURA.

    Sergio, 28-ago-2026. Hoy, si una factura entra mal, hay que corregir insumo
    por insumo — y para eso primero hay que darse cuenta de cuáles quedaron mal.
    Con un botón de deshacer, lo peor que puede pasar es un toque.

    Ya se guardaba el `stock_antes` de cada cambio, que es la mitad del trabajo.
    Faltaban tres cosas: el precio (una factura también lo cambia), y un
    identificador para saber qué cambios entraron JUNTOS — si no, deshacer
    tendría que adivinar dónde empieza y dónde termina una factura.          */
alter table pos_gerente_ops
  add column if not exists lote          uuid,
  add column if not exists precio_antes  numeric,
  add column if not exists precio_despues numeric,
  add column if not exists deshecho_at   timestamptz;

comment on column pos_gerente_ops.lote is
  'Los cambios que entraron juntos (una factura). Deshacer revierte el lote entero.';

create index if not exists ix_gerente_ops_lote on pos_gerente_ops (lote);
