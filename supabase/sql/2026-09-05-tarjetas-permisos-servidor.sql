/*  EL SERVIDOR NO PODIA LEER LAS TARJETAS
    ──────────────────────────────────────────────────────────────────────
    `pos_tarjetas` se creó con permisos para `authenticated` —la pantalla—
    pero no para `service_role`, que es con el que corre la función que
    valida un toque. Resultado: la función devolvía 500 justo después de
    comprobar la firma, al ir a mirar el contador.

    Es el mismo tropiezo de siempre: **GRANT y POLÍTICA son cosas
    distintas.** La tabla tenía su política de tenant y parecía correcta,
    pero sin el GRANT no se puede leer ni una fila.

    El servidor necesita:
      · SELECT para mirar el último contador,
      · UPDATE para guardarlo,
      · INSERT para la tarjeta que se registra sola cuando un cliente
        acerca una que todavía no es de nadie.

    No se le da DELETE: borrar una tarjeta es cosa de una persona en la
    pantalla, no de una función automática.                               */

grant select, insert, update on public.pos_tarjetas to service_role;

do $guarda$
declare faltan text;
begin
  select string_agg(p, ', ') into faltan
    from unnest(array['SELECT','INSERT','UPDATE']) p
   where not exists (
     select 1 from information_schema.role_table_grants
      where table_name = 'pos_tarjetas' and grantee = 'service_role'
        and privilege_type = p);
  if faltan is not null then
    raise exception 'al servidor le siguen faltando permisos: %', faltan;
  end if;
end
$guarda$;
