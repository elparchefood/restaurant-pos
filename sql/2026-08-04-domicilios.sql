-- ═══════════════════════════════════════════════════════════════════════════
-- DOMICILIOS — los dos datos que le faltaban al pedido
-- ───────────────────────────────────────────────────────────────────────────
-- Regla de oro de Sergio, que no cambia: EL DOMICILIO NUNCA SE SUMA A VENTAS.
--
-- Hasta hoy la caja daba por hecho DOS cosas de todo domicilio:
--   · que el domiciliario era EXTERNO  -> el valor del domi es un canje: entra
--     con el pago del cliente y sale cuando se le paga al domiciliario, sin
--     quedar registrado en ningun lado.
--   · que ese pago al domiciliario fue en EFECTIVO.
-- Con domiciliario PROPIO las dos son falsas: esa plata SI es del negocio y hay
-- que informarla aparte, no netearla contra el efectivo.
--
-- Estas dos columnas dejan decirlo en vez de suponerlo. El valor por defecto es
-- lo que hace hoy el sistema, asi que nada cambia de comportamiento hasta que
-- alguien lo marque.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.pos_orders
  add column if not exists domi_courier text not null default 'externo',
  add column if not exists domi_pago    text not null default 'efectivo';

do $$ begin
  alter table public.pos_orders add constraint pos_orders_domi_courier_check
    check (domi_courier = any (array['externo','interno']));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.pos_orders add constraint pos_orders_domi_pago_check
    check (domi_pago = any (array['efectivo','transferencia']));
exception when duplicate_object then null; end $$;

comment on column public.pos_orders.domi_courier is
  'externo = domiciliario de plataforma o particular: el valor del domi es un canje y no se registra. interno = domiciliario propio: esa plata es del negocio y va en la linea informativa "Domicilios (internos)".';
comment on column public.pos_orders.domi_pago is
  'Como se le pago al domiciliario. Solo importa cuando es externo: si fue en efectivo, ese efectivo salio de la caja y se descuenta del esperado; si fue por transferencia, no toca la caja.';

-- El cierre de caja consulta por sucursal, dia y domicilio: que no recorra todo.
create index if not exists ix_orders_domi_cierre
  on public.pos_orders (branch_id, created_at)
  where delivery_fee > 0;
