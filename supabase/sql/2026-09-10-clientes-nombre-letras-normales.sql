-- ════════════════════════════════════════════════════════════════════
--  EL NOMBRE DEL CLIENTE, CON LETRAS NORMALES (10-sep-2026, en pleno turno)
--
--  Sergio: "tengo un cliente que se llama Cameron Ruiz... no aparece por
--  ningun lado, ni para escoger al cliente ni en la lista de clientes, pero
--  en la tarjeta del chat si aparece con sus puntos".
--
--  El nombre venia de WhatsApp escrito con letras "de adorno":
--  "ℭ𝔞𝔪𝔢𝔯𝔬𝔫 ℜ𝔲𝔦𝔷". Se ven como letras, pero son OTROS caracteres
--  (el bloque matematico de Unicode): escribir "cameron" en cualquier
--  buscador no los encuentra nunca.
--
--  NFKC los convierte en las letras de siempre ("Cameron Ruiz") sin tocar
--  tildes, eñes ni emojis. Se hace AQUI, en la base, para que de igual por
--  donde llegue el cliente: el chat, Paco, la carta, Ventas o a mano.
--  (El nombre en la conversacion del chat se deja como lo escribio la
--  persona: ese es su nombre de WhatsApp.)
-- ════════════════════════════════════════════════════════════════════

create or replace function public.fn_cliente_nombre_normal()
returns trigger language plpgsql as $$
begin
  if new.nombre is not null and new.nombre <> normalize(new.nombre, NFKC) then
    new.nombre := normalize(new.nombre, NFKC);
  end if;
  return new;
end $$;

drop trigger if exists tg_cliente_nombre_normal on public.pos_clientes;
create trigger tg_cliente_nombre_normal
  before insert or update of nombre on public.pos_clientes
  for each row execute function public.fn_cliente_nombre_normal();

--  Los que ya estaban (el 10-sep solo era Cameron Ruiz, ya corregida a mano).
update public.pos_clientes set nombre = normalize(nombre, NFKC)
 where nombre is not null and nombre <> normalize(nombre, NFKC);
