/*  UNA TARJETA PUEDE EXISTIR SIN DUEÑO
    ──────────────────────────────────────────────────────────────────────
    Decisión de Sergio en el plan: se entregan **tarjetas sin asignar**. El
    cliente la acerca a su celular, se registra, y en ese momento pasa a ser
    suya. El cajero no hace nada.

    Pero `telefono` era obligatorio, así que una tarjeta solo podía existir
    en la base cuando ya tenía dueño. Y eso dejaba un agujero:

    **el candado contra repetir un código no protegía a las tarjetas sin
    asignar.** El contador se guarda en la ficha de la tarjeta; sin ficha,
    no hay contador que comparar, y un toque repetido pasaba como bueno.
    Comprobado: el mismo toque, mandado dos veces, entraba las dos.

    Ahora la ficha se crea en el PRIMER toque auténtico, sin dueño. Desde
    ese momento el contador queda vigilado, aunque nadie la haya reclamado.  */

alter table public.pos_tarjetas alter column telefono drop not null;

comment on column public.pos_tarjetas.telefono is
  'El dueno de la tarjeta. NULL = todavia no es de nadie: existe, se le vigila el contador, y se asigna cuando alguien la registre.';

do $guarda$
begin
  if (select is_nullable from information_schema.columns
       where table_name = 'pos_tarjetas' and column_name = 'telefono') <> 'YES' then
    raise exception 'la tarjeta sigue exigiendo dueno';
  end if;
end
$guarda$;
