-- ═══════════════════════════════════════════════════════════════════════════
--  LAS CONVERSACIONES DE COBRA EN LA CONSOLA (11-sep-2026)
--
--  Sergio: el chat de la consola tiene que ser EXACTAMENTE la pantalla de
--  Chat IA de los restaurantes — y "no debes tocar, modificar ni dañar nada de
--  lo que ya existe con los restaurantes".
--
--  Por eso la consola abre la MISMA pantalla (consola-chat.html la trae tal
--  cual) apuntando al restaurante interno de Cobra. Esa pantalla lee y escribe
--  las tablas del chat con la sesion de Sergio, cuyo restaurante es El Parche:
--  las politicas de hoy (current_tenant_id() = tenant_id) no le dejan tocar
--  las filas de Cobra.
--
--  Aqui SOLO SE AGREGAN politicas. Las de los restaurantes no se tocan. Las
--  nuevas valen para UNA cuenta (admin de plataforma) y UN restaurante (el
--  interno de Cobra). Van escritas con (select ...) para que Postgres las
--  calcule UNA vez por consulta y no por fila: a un restaurante no le cuestan
--  nada.
-- ═══════════════════════════════════════════════════════════════════════════

--  Las de solo lectura del primer intento pasan a ser de lectura y escritura.
drop policy if exists plataforma_lee_chat_cobra on chat_conversations;
drop policy if exists plataforma_lee_chat_cobra on chat_messages;

do $$
declare t text;
begin
  foreach t in array array['chat_conversations', 'chat_messages', 'chat_channels',
                           'ia_config', 'pos_clientes', 'pos_wa_contactos'] loop
    execute format('drop policy if exists plataforma_chat_cobra on %I', t);
    execute format(
      'create policy plataforma_chat_cobra on %I for all
         using (tenant_id = (select fn_tenant_plataforma()) and (select es_admin_plataforma()))
         with check (tenant_id = (select fn_tenant_plataforma()) and (select es_admin_plataforma()))', t);
  end loop;
end $$;

--  La sede: el chat la lee para saber donde esta. Solo lectura.
drop policy if exists plataforma_ve_sede_cobra on branches;
create policy plataforma_ve_sede_cobra on branches for select
  using (tenant_id = (select fn_tenant_plataforma()) and (select es_admin_plataforma()));
