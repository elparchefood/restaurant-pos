-- Contador de frases fijas repetidas (para no decirle tres veces lo mismo a un
-- cliente y pasarlo a una persona a la segunda).
--
-- Va en su PROPIA columna y no dentro de pending_order_data: ese campo se
-- reescribe entero varias veces por mensaje con el estado del pedido y se
-- llevaba la cuenta por delante.
alter table chat_conversations
  add column if not exists bucles jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
