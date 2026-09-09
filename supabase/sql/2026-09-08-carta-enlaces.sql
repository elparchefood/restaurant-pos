-- ═══════════════════════════════════════════════════════════════════════════
--  EL ENLACE DE LA CARTA
--
--  Cuando alguien pide la carta por WhatsApp, Paco le manda un boton. Ese
--  boton abre una pagina donde escoge sus productos, y lo que escoja acaba en
--  el `pedido_borrador` de su conversacion — el mismo que Paco ya entiende.
--
--  ── POR QUE UNA MESA Y NO UNA FIRMA ────────────────────────────────────────
--  El enlace podria ir firmado con una llave, pero entonces no se puede
--  revocar ni caducar de verdad: quien tenga el enlace entra hasta que expire
--  la firma. Guardandolo aqui, el enlace se puede apagar en cualquier momento,
--  se marca cuando se usa, y se sabe de que conversacion es.
--
--  ── LO QUE PROTEGE ─────────────────────────────────────────────────────────
--  El `token` ES el secreto. Con el se sabe de que restaurante, de que
--  conversacion y de que telefono se trata — asi que si fuera adivinable,
--  cualquiera podria dejar un pedido a nombre de otro numero, y ese pedido
--  entra a la cocina. Por eso lo genera el servidor con `gen_random_bytes` y
--  nunca sale nada mas en la URL: ni el telefono, ni el tenant.
--
--  ⚠️ NADIE LEE ESTA MESA DESDE EL NAVEGADOR. Solo la funcion `carta` con la
--  llave de servicio. Se revoca a mano porque Supabase concede permisos por
--  defecto a `authenticated` en cada mesa nueva — ya nos paso con las mesas de
--  Wompi y nadie se dio cuenta hasta que se reviso.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists pos_carta_links (
  token       text primary key,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  branch_id   uuid,
  conv_id     uuid not null references chat_conversations(id) on delete cascade,
  telefono    text not null,
  --  'nuevo' la primera vez; 'correccion' cuando vuelve a entrar a cambiar.
  --  La pagina lo usa para saber si dice "Hacer mi pedido" o "Guardar los
  --  cambios", y para abrir con el pedido ya cargado.
  motivo      text not null default 'nuevo',
  creado_at   timestamptz not null default now(),
  --  Caduca. Un enlace eterno es un enlace que alguien encuentra en un chat
  --  viejo y usa para pedir a nombre de otro.
  expira_at   timestamptz not null default now() + interval '2 hours',
  --  Se marca al enviar el pedido: el mismo enlace no sirve dos veces, asi que
  --  recargar la pagina no puede duplicar un pedido.
  usado_at    timestamptz
);

create index if not exists ix_carta_links_conv on pos_carta_links (conv_id, creado_at desc);

alter table pos_carta_links enable row level security;

--  Sin politicas: nadie entra por PostgREST. Solo la funcion, con service_role.
revoke all on pos_carta_links from anon;
revoke all on pos_carta_links from authenticated;
grant select, insert, update on pos_carta_links to service_role;

-- ── Crear un enlace ────────────────────────────────────────────────────────
--  Se hace aqui y no en el codigo para que el token salga SIEMPRE del mismo
--  sitio y con la misma fuerza. 32 bytes al azar en base64url: adivinarlo no
--  es una posibilidad practica.
create or replace function fn_carta_link(
  p_conv uuid,
  p_motivo text default 'nuevo',
  p_minutos int default 120
) returns text
language plpgsql
security definer
--  `extensions` va en el camino porque ahi vive pgcrypto (gen_random_bytes).
--  Con solo `public` la funcion no lo encuentra y revienta al crear el token.
set search_path = public, extensions
as $$
declare
  v_tok text;
  v_conv record;
begin
  select id, tenant_id, branch_id, contact_handle
    into v_conv
    from chat_conversations
   where id = p_conv;
  if not found then
    raise exception 'esa conversacion no existe';
  end if;

  --  base64url: sin +, / ni = para que el enlace no se rompa al copiarlo
  v_tok := translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_');

  insert into pos_carta_links (token, tenant_id, branch_id, conv_id, telefono, motivo, expira_at)
  values (v_tok, v_conv.tenant_id, v_conv.branch_id, v_conv.id,
          coalesce(v_conv.contact_handle, ''), coalesce(p_motivo, 'nuevo'),
          now() + make_interval(mins => greatest(5, coalesce(p_minutos, 120))));

  return v_tok;
end;
$$;

revoke all on function fn_carta_link(uuid, text, int) from public;
revoke all on function fn_carta_link(uuid, text, int) from anon;
revoke all on function fn_carta_link(uuid, text, int) from authenticated;
grant execute on function fn_carta_link(uuid, text, int) to service_role;

-- ── Barrer los que ya no sirven ────────────────────────────────────────────
--  Un enlace usado o vencido no tiene por que seguir guardado: es una llave
--  que ya no abre nada.
create or replace function fn_carta_links_barrer() returns int
language sql
security definer
set search_path = public
as $$
  with fuera as (
    delete from pos_carta_links
     where expira_at < now() - interval '1 day'
        or (usado_at is not null and usado_at < now() - interval '1 day')
    returning 1
  ) select count(*)::int from fuera;
$$;

revoke all on function fn_carta_links_barrer() from public;
grant execute on function fn_carta_links_barrer() to service_role;

-- ── Que categorias salen en la carta publica ───────────────────────────────
--  El Parche tiene una categoria "Adiciones" con 15 productos: dentro del POS
--  tiene todo el sentido, pero en la carta del cliente estorba, porque las
--  adiciones ya aparecen DENTRO de cada plato.
--
--  La tentacion era esconderla por su nombre. Eso seria una regla de El Parche
--  escrita en el codigo de un producto que se vende a otros restaurantes —
--  donde una categoria llamada "Adiciones" puede ser perfectamente pedible.
--  Asi que lo decide el restaurante, con una bandera.
alter table pos_categories add column if not exists oculta_carta boolean not null default false;

comment on column pos_categories.oculta_carta is
  'true = no aparece en la carta que abre el cliente desde WhatsApp. Sigue viva en el POS.';
