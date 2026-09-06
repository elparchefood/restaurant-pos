-- ══ FICHAS DE PRUEBA: SE USAN IGUAL, PERO NO CUENTAN ══════════════════════
--
-- Sergio, 6-sep-2026: *"lo de Linda cuentalo como saldo real, yo lo asumo; lo
-- mio dejalo como saldo de prueba. Que quede normal, que se pueda usar normal,
-- pero no lo cuentes dentro de las cuentas — igual yo no lo voy a usar"*.
--
-- POR QUE HACE FALTA: de los $703.500 que hay en billeteras, $581.000 son de
-- la ficha de Sergio probando el sistema. El 83%. Sin esta marca, la pantalla
-- de Billetera abriria diciendo "debes $648.500 en comida" cuando la deuda
-- real con clientes son $122.500.
--
-- Y el daño no es que el numero este mal una vez: es que ENSEÑA A DESCONFIAR
-- del informe. Un dueño que ve una cifra que sabe falsa deja de mirarla, y
-- desde ahi la pantalla no sirve aunque despues se arregle.
--
-- QUE NO HACE: no bloquea nada. El saldo se usa igual — se puede recargar,
-- pagar y consultar como cualquiera. Lo unico que cambia es que los informes
-- de la billetera la saltan.
--
-- ⚠️ La billetera es SOLO de El Parche, no se vende con Cobra. Esta marca no
-- es una funcion de producto: es para que las cuentas de Sergio esten bien.
-- Ver la nota de los planes en la memoria.

alter table public.pos_clientes
  add column if not exists es_prueba boolean not null default false;

comment on column public.pos_clientes.es_prueba is
  'Ficha del propio dueño para probar. Funciona igual en todo; los informes de '
  'billetera y puntos la saltan para que no infle las cuentas.';

-- Para que los informes filtren sin recorrer la tabla entera. Parcial: las de
-- prueba son cuatro gatos y es lo unico que hay que encontrar rapido.
create index if not exists ix_clientes_prueba
  on public.pos_clientes (tenant_id) where es_prueba;

-- ── LA GUARDA ─────────────────────────────────────────────────────────────
do $guarda$
declare n int;
begin
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='pos_clientes' and column_name='es_prueba';
  if n <> 1 then raise exception 'no se creo pos_clientes.es_prueba'; end if;

  --  Nadie puede quedar marcado por accidente: la columna nace apagada.
  select count(*) into n from public.pos_clientes where es_prueba;
  if n <> 0 then raise exception 'la columna nacio con % fichas marcadas; deberia ser 0', n; end if;

  select count(*) into n from pg_indexes
   where schemaname='public' and indexname='ix_clientes_prueba';
  if n <> 1 then raise exception 'falta el indice de fichas de prueba'; end if;

  raise notice 'pos_clientes.es_prueba lista, apagada para todos';
end
$guarda$;
