/*  Verificación automática del pago de una suscripción — 29-ago-2026

    Sergio: «una vez la persona haga la transferencia subirá ahí su comprobante
    y el sistema de verificación de pagos que ya tenemos se va a encargar de
    verificar ese pago».

    El motor ya existe y funciona (es el que confirma las transferencias de los
    clientes de un restaurante). Lo que NO existía es una verificación para la
    PLATAFORMA: las tres funciones actuales leen el buzón de un restaurante
    (`ia_config` por `branch_id`) y no saben leer el de Cobra
    (`plataforma_correo`).

    Estas columnas guardan qué pasó con cada intento. Sirven para dos cosas:

      1. Que Sergio vea en la consola POR QUÉ una solicitud sigue pendiente —
         «no llegó el correo del banco», «el monto no coincide» — en vez de
         una fila muda esperando.

      2. Poner un tope de intentos. La verificación la dispara la pantalla de
         registro, que es pública: sin tope, alguien podría llamarla en bucle y
         gastar el saldo de lectura de comprobantes. Tres intentos por
         solicitud son de sobra para un caso legítimo.
*/

alter table pos_registrations
  add column if not exists verif_intentos int not null default 0,
  add column if not exists verif_at       timestamptz,
  add column if not exists verif_detalle  text,
  /*  Lo que el lector sacó del comprobante: monto, fecha, hora, banco. Se
      guarda aunque la verificación falle — es justo lo que Sergio necesita
      mirar para decidir a mano.  */
  add column if not exists verif_extraido jsonb;

comment on column pos_registrations.verif_intentos is
  'Cuántas veces se intentó verificar el pago automáticamente. Tope: 3.';
comment on column pos_registrations.verif_detalle is
  'En palabras, por qué no se pudo verificar. Se le muestra a Sergio en la consola.';
