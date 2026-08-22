-- ══════════════════════════════════════════════════════════════════════
--  LAS REDES DEL CLIENTE EN SU FICHA  (22-ago-2026, pedido de Sergio)
--
--  "Al capturar el número de la persona se va a vincular con un cliente
--   existente o se va a crear uno nuevo si ese número no existe todavía. Y se
--   va a vincular la cuenta de Instagram con el número: en la información del
--   cliente va a decir este es el número, este es el Instagram o el Facebook."
--
--  Hasta hoy `pos_clientes` no tenía dónde guardarlo. El teléfono es la
--  llave del cliente en todo Cobra (puntos, saldo, pedidos), así que las
--  redes se cuelgan de él y no al revés.
--
--  Se guardan DOS cosas por red, y las dos hacen falta:
--    · el ID que le da Meta  -> es lo que llega en cada mensaje, y es lo
--      único con lo que se puede reconocer a quien escribe.
--    · el @usuario           -> es lo que un humano entiende al ver la ficha.
--      Puede cambiar (la gente se cambia el @); el id no.
-- ══════════════════════════════════════════════════════════════════════

alter table pos_clientes
  add column if not exists instagram_id      text,
  add column if not exists instagram_usuario text,
  add column if not exists facebook_id       text,
  add column if not exists facebook_nombre   text;

comment on column pos_clientes.instagram_id is
  'ID que Meta le da a esta persona en Instagram. Es lo que llega en cada mensaje: con esto se reconoce quien escribe. No cambia aunque cambie el @.';
comment on column pos_clientes.facebook_id is
  'Lo mismo para Messenger. OJO: el id de una misma persona es DISTINTO en Instagram y en Messenger — son dos cuentas para Meta.';

-- ── Un id de red pertenece a UN solo cliente ──────────────────────────
--  Sin esto, dos fichas podrian reclamar el mismo Instagram y el chat
--  unificado no sabria a cual pegarse. Es parcial (where not null) para que
--  los miles de clientes sin redes no estorben.
create unique index if not exists ux_cliente_instagram
  on pos_clientes (tenant_id, instagram_id) where instagram_id is not null;
create unique index if not exists ux_cliente_facebook
  on pos_clientes (tenant_id, facebook_id) where facebook_id is not null;

--  Para encontrar rapido al cliente por su red cuando llega un mensaje.
create index if not exists ix_cliente_ig on pos_clientes (instagram_id) where instagram_id is not null;
create index if not exists ix_cliente_fb on pos_clientes (facebook_id)  where facebook_id  is not null;

-- ── La conversacion sabe de que cliente es ────────────────────────────
--  Es el puente del chat unificado: WhatsApp, Instagram y Messenger de la
--  MISMA persona apuntan al mismo cliente, y por ahi se alternan.
alter table chat_conversations
  add column if not exists cliente_id uuid references pos_clientes(id) on delete set null;

create index if not exists ix_conv_cliente on chat_conversations (cliente_id) where cliente_id is not null;

comment on column chat_conversations.cliente_id is
  'A que cliente pertenece esta conversacion. Lo que hermana los chats de WhatsApp, Instagram y Messenger de una misma persona.';

-- ── Vincular una red a un cliente, en un solo golpe ───────────────────
/*  Se hace en la base y no en el servidor porque son dos cosas que tienen
    que pasar juntas o no pasar: encontrar/crear el cliente por su TELEFONO y
    pegarle la red. Si se hicieran por separado y algo fallara en medio,
    quedaria un cliente sin red o una red sin dueño.

    Devuelve el cliente, diga lo que diga: quien llama necesita saber a quien
    quedo pegada la conversacion.                                          */
create or replace function public.fn_cliente_vincular_red(
  p_tenant   uuid,
  p_telefono text,
  p_red      text,          -- 'instagram' | 'facebook'
  p_red_id   text,
  p_usuario  text default null,
  p_nombre   text default null,
  p_branch   uuid default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_tel  text;
  v_id   uuid;
begin
  --  El telefono, como lo guarda todo Cobra: 10 digitos, sin indicativo.
  v_tel := right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 10);
  if length(v_tel) < 10 then raise exception 'TELEFONO_INVALIDO: %', p_telefono; end if;
  if p_red not in ('instagram', 'facebook') then raise exception 'RED_INVALIDA: %', p_red; end if;

  --  ¿Ya existe por telefono? Se compara por los ultimos 10 digitos porque
  --  los numeros entran de mil formas (con 57, con espacios, con guiones).
  select id into v_id from pos_clientes
   where tenant_id = p_tenant
     and right(regexp_replace(coalesce(telefono, ''), '\D', '', 'g'), 10) = v_tel
   order by created_at limit 1;

  if v_id is null then
    insert into pos_clientes (tenant_id, branch_id, nombre, telefono)
    values (p_tenant, p_branch, coalesce(nullif(btrim(p_nombre), ''), 'Cliente'), v_tel)
    returning id into v_id;
  end if;

  /*  Se pega la red. Si ese id de red ya estaba en OTRA ficha, el indice
      unico lo impide: mejor fallar y revisarlo que repartir la misma cuenta
      entre dos clientes. El nombre solo se rellena si estaba vacio — el que
      el cliente dio a mano manda sobre el de la red. */
  if p_red = 'instagram' then
    update pos_clientes
       set instagram_id      = p_red_id,
           instagram_usuario = coalesce(nullif(btrim(p_usuario), ''), instagram_usuario),
           nombre            = case when coalesce(btrim(nombre), '') in ('', 'Cliente')
                                    then coalesce(nullif(btrim(p_nombre), ''), nombre)
                                    else nombre end,
           updated_at        = now()
     where id = v_id;
  else
    update pos_clientes
       set facebook_id     = p_red_id,
           facebook_nombre = coalesce(nullif(btrim(p_usuario), ''), nullif(btrim(p_nombre), ''), facebook_nombre),
           nombre          = case when coalesce(btrim(nombre), '') in ('', 'Cliente')
                                  then coalesce(nullif(btrim(p_nombre), ''), nombre)
                                  else nombre end,
           updated_at      = now()
     where id = v_id;
  end if;

  /*  Todas las conversaciones de esa persona quedan apuntando al mismo
      cliente: las de la red que acaba de dar su numero Y las de WhatsApp que
      ya existieran con ese telefono. Eso es lo que hermana los chats. */
  update chat_conversations
     set cliente_id = v_id
   where tenant_id = p_tenant
     and cliente_id is distinct from v_id
     and (
       (channel = p_red and contact_handle = p_red_id)
       or (channel = 'whatsapp'
           and right(regexp_replace(coalesce(contact_handle, ''), '\D', '', 'g'), 10) = v_tel)
     );

  return v_id;
end $fn$;

grant execute on function public.fn_cliente_vincular_red(uuid, text, text, text, text, text, uuid)
  to anon, authenticated, service_role;

-- ── Emparejar lo que YA existe ────────────────────────────────────────
--  Las conversaciones de WhatsApp que ya tienen su cliente por telefono
--  quedan enlazadas de una vez, para que el chat unificado sirva desde el
--  primer dia y no solo con los clientes nuevos.
update chat_conversations c
   set cliente_id = cl.id
  from pos_clientes cl
 where c.cliente_id is null
   and c.channel = 'whatsapp'
   and cl.tenant_id = c.tenant_id
   and length(right(regexp_replace(coalesce(c.contact_handle, ''), '\D', '', 'g'), 10)) = 10
   and right(regexp_replace(coalesce(cl.telefono, ''), '\D', '', 'g'), 10)
     = right(regexp_replace(coalesce(c.contact_handle, ''), '\D', '', 'g'), 10);

notify pgrst, 'reload schema';
