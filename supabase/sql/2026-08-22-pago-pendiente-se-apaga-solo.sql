-- ══════════════════════════════════════════════════════════════════════
--  "PAGOS POR CONFIRMAR" SE APAGA SOLO CUANDO EL PEDIDO YA SE COBRO
--  (22-ago-2026, reportado por Sergio)
--
--  "Estos dos chats quedaron ahí como pendientes, y si toco confirmar el
--   pedido se crea de nuevo. ¿Cómo los quito?"
--
--  LO QUE PASABA. `chat_conversations.pago_pendiente` solo se apagaba por
--  DOS caminos: el propio Paco (delay-reply) y el botón de confirmar dentro
--  del chat. Si el pago llegaba por otra cuenta y Sergio hacía el pedido y lo
--  cobraba POR FUERA del chat —en caja, en pagos—, nadie apagaba la marca.
--  El chat quedaba en "Pagos por confirmar" para siempre, ofreciendo un botón
--  que habría creado el pedido OTRA VEZ.
--
--  Es el mismo patrón de las recargas del 21-ago: una marca que sobrevive al
--  trabajo ya hecho, y un botón que duplica. La lección es la misma: el
--  candado va en la BASE, no en cada pantalla que cobra.
--
--  EL ARREGLO. Un disparador sobre pos_orders: en cuanto un pedido queda
--  pagado o cerrado, se apaga la marca de SU conversación. Cubre todos los
--  caminos —caja, pantalla de pagos, verificación automática, el chat— y los
--  que se agreguen mañana, sin que nadie tenga que acordarse.
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.fn_apagar_pago_pendiente()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  /* Solo cuando ACABA de quedar cobrado. Comparar con el estado anterior
     evita reescribir la conversacion en cada toque del pedido. */
  if (new.status in ('paid', 'cancelled') and coalesce(old.status, '') is distinct from new.status)
     or (new.closed_at is not null and old.closed_at is null) then
    update chat_conversations
       set pago_pendiente = false,
           recordar_at    = null   -- y no seguir recordandole el comprobante
     where order_id = new.id
       and pago_pendiente = true;
  end if;
  return new;
end $fn$;

drop trigger if exists tg_apagar_pago_pendiente on pos_orders;
create trigger tg_apagar_pago_pendiente
  after update on pos_orders
  for each row execute function public.fn_apagar_pago_pendiente();

-- ── Reparar los que ya estaban colgados ───────────────────────────────
--  Solo los que tienen un pedido REALMENTE cobrado detras. Los que de verdad
--  esperan un comprobante NO se tocan: esos si son trabajo pendiente.
update chat_conversations c
   set pago_pendiente = false, recordar_at = null
  from pos_orders o
 where c.pago_pendiente = true
   and o.id = c.order_id
   and (o.status in ('paid', 'cancelled') or o.closed_at is not null);

notify pgrst, 'reload schema';
