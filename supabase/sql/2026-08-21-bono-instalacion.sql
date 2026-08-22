-- ══════════════════════════════════════════════════════════════════════
--  BONO DE BIENVENIDA POR INSTALAR LA APP  (21-ago-2026, pedido de Sergio)
--
--  "Cuando se registren y ya tengan la aplicacion en su pantalla de
--  inicio —no cuando la abran desde el navegador— se les acredita un
--  bono de $5.000 por ser nuevos, por acabar de instalarla."
--
--  La deteccion ya existe: cada entrada reporta si vino de la app
--  instalada o del navegador. El bono lo otorga `web-acceso` la PRIMERA
--  vez que ve a un cliente entrar desde la app instalada.
-- ══════════════════════════════════════════════════════════════════════

-- ── El monto lo decide cada restaurante. 0 = apagado. ─────────────────
--  Cobra es multi-restaurante: la funcion es para todos, el numero es de
--  cada uno. El Parche arranca en $5.000 (numero de Sergio).
alter table tenants add column if not exists web_bono_instalacion bigint not null default 0;

comment on column tenants.web_bono_instalacion is
  'Saldo de regalo la primera vez que un cliente entra desde la app INSTALADA en su pantalla de inicio. 0 = apagado. Lo otorga web-acceso, una sola vez por cliente (indice ux_bono_instalacion_una_vez).';

update tenants set web_bono_instalacion = 5000
 where id = '0c78c799-bebb-4fe7-9bf6-c10062eaea7e';

-- ── EL MOTIVO NUEVO ENTRA A LA LISTA PERMITIDA ────────────────────────
--  pos_saldo_mov solo acepta motivos de una lista cerrada (bien: nada de
--  motivos inventados). La primera prueba de punta a punta fallo justo
--  aqui: el candado rechazaba 'bono_instalacion' y el bono no se
--  acreditaba. Se amplia la lista, no se quita el candado.
alter table pos_saldo_mov drop constraint pos_saldo_mov_motivo_check;
alter table pos_saldo_mov add constraint pos_saldo_mov_motivo_check
  check (motivo = any (array['recarga','bono_recarga','consumo','ajuste','anulacion','regalo','bono_instalacion']));

-- ── UNA SOLA VEZ POR CLIENTE, GARANTIZADO POR LA BASE ─────────────────
--  El chequeo "¿ya lo tiene?" del servidor puede correr dos veces a la
--  vez (dos pestañas, un reintento por mala señal). Este indice hace que
--  el segundo abono NO PUEDA existir: fn_saldo_mover es una sola
--  transaccion, asi que si este insert choca, el saldo tampoco se toca.
--  Con plata, el candado va en la base, no en el codigo.
create unique index if not exists ux_bono_instalacion_una_vez
  on pos_saldo_mov (tenant_id, cliente_id)
  where motivo = 'bono_instalacion';
