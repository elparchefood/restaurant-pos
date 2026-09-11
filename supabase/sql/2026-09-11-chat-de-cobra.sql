-- ═══════════════════════════════════════════════════════════════════════════
--  EL CHAT DE COBRA (11-sep-2026) — punto 4 de PLAN-7-SEP-PENDIENTES.md
--
--  Sergio contesta a los interesados en Cobra desde SU consola, por el
--  WhatsApp, Instagram y Facebook DE COBRA (no los de El Parche), con un
--  asistente propio que vende el sistema (no es Paco).
--
--  Como se hace sin construir otro Chat IA: Cobra es un RESTAURANTE INTERNO
--  (`tenants.es_plataforma = true`) con sus cuentas conectadas como las de
--  cualquiera. Asi el webhook, la bandeja y el envio sirven igual. Lo que
--  cambia: su asistente es otro cerebro (`chat-cobra`, marcado en
--  `ia_config.perfil.cerebro = 'cobra'`), no aparece como cliente (no tiene
--  solicitud ni vencimiento) y solo el admin de plataforma ve su bandeja.
-- ═══════════════════════════════════════════════════════════════════════════

alter table tenants add column if not exists es_plataforma boolean not null default false;

do $$
declare t uuid; b uuid; s uuid;
begin
  select id into t from tenants where es_plataforma limit 1;
  if t is null then
    insert into tenants (name, email, plan, status, es_plataforma)
      values ('Cobra POS', 'sergio@cobrapos.app', 'pro', 'active', true) returning id into t;
  end if;
  select id into b from brands where tenant_id = t limit 1;
  if b is null then
    insert into brands (tenant_id, name) values (t, 'Cobra POS') returning id into b;
  end if;
  select id into s from branches where tenant_id = t limit 1;
  if s is null then
    insert into branches (tenant_id, brand_id, name) values (t, b, 'Ventas') returning id into s;
  end if;
  if not exists (select 1 from ia_config where branch_id = s) then
    insert into ia_config (branch_id, tenant_id, activo, delay_segundos, modo_asistente, perfil)
      values (s, t, true, 4, 'on', jsonb_build_object('cerebro', 'cobra', 'nombre', ''));
  end if;
end $$;

create or replace function fn_tenant_plataforma() returns uuid
language sql stable security definer set search_path = public as $$
  select id from tenants where es_plataforma limit 1
$$;

--  La bandeja de Cobra la LEE el admin de plataforma desde su consola (y el
--  tiempo real le llega por estas mismas politicas). Solo lectura y solo las
--  filas del restaurante interno: todo lo que escribe va por `chat-cobra`,
--  que comprueba el rol en el servidor. chat_channels NO: lleva tokens.
drop policy if exists plataforma_lee_chat_cobra on chat_conversations;
create policy plataforma_lee_chat_cobra on chat_conversations for select
  using (es_admin_plataforma() and tenant_id = fn_tenant_plataforma());

drop policy if exists plataforma_lee_chat_cobra on chat_messages;
create policy plataforma_lee_chat_cobra on chat_messages for select
  using (es_admin_plataforma() and tenant_id = fn_tenant_plataforma());

--  La demo que agenda un interesado por el chat: queda en la misma lista de
--  Videollamadas, enlazada a su conversacion.
alter table plataforma_llamadas
  add column if not exists origen text not null default 'restaurante',
  add column if not exists conversation_id uuid;
