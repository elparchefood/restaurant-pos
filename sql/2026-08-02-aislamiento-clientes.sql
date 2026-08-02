-- ═══════════════════════════════════════════════════════════════════════
-- AISLAMIENTO ENTRE CLIENTES — el arreglo más importante antes de vender
--
-- EL PROBLEMA (medido 2026-08-02):
-- 22 tablas tienen una política `qual = true` que deja pasar TODO. En varias
-- convive con la política correcta que filtra por cliente — pero PostgreSQL
-- SUMA las políticas permisivas con un OR, así que la abierta gana siempre y
-- la que aísla no sirve para nada.
--
-- Hoy no se nota porque solo hay un cliente. **Esto no se rompe con 100
-- clientes: se rompe con el cliente número 2.** Ese día, cualquier empleado
-- del segundo restaurante podría leer las ventas, los clientes y los chats
-- del primero.
--
-- LA LLAVE: `current_tenant_id()` lee `user_metadata.tenant_id` del token.
-- Verificado que los dos usuarios existentes lo llevan correcto, así que
-- ninguno pierde acceso a lo suyo.
--
-- LO QUE NO SE TOCA, Y POR QUÉ:
--   · `pos_registrations` → "publico puede registrarse" es INSERT y es
--     intencional: sin ella nadie podría crear su cuenta.
--   · `pos_bases` → "bases_insert" ya valida el tenant en su WITH CHECK.
--   · `mypass_vault` → NO es del POS. Es una bóveda de contraseñas de otro
--     proyecto que comparte este Supabase. Tocarla podría romper esa app.
--     ⚠️ QUEDA ABIERTA Y HAY QUE REVISARLA APARTE.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Tablas que se aíslan por su propia columna tenant_id ──────────────
do $$
declare t text;
begin
  foreach t in array array[
    'chat_channels', 'chat_conversations', 'chat_messages',
    'ia_config', 'iv_facturas_pendientes', 'iv_insumo_alias',
    'pos_bases', 'pos_cash_moves', 'pos_categories',
    'pos_domi_aprendidos', 'pos_mesa_tiempos', 'pos_niveles_config',
    'pos_order_items', 'pos_orders', 'pos_products',
    'pos_reservations', 'pos_sessions', 'pos_shifts',
    'pos_tables', 'pos_wa_listas'
  ] loop
    execute format('drop policy if exists aislar_%I on public.%I', t, t);
    execute format(
      'create policy aislar_%I on public.%I for all to authenticated
         using (current_tenant_id() = tenant_id)
         with check (current_tenant_id() = tenant_id)', t, t);
  end loop;
end $$;

-- ── `pos_gerente_ops` no tiene tenant_id: se aísla por su sucursal ────
drop policy if exists aislar_pos_gerente_ops on public.pos_gerente_ops;
create policy aislar_pos_gerente_ops on public.pos_gerente_ops for all to authenticated
  using (branch_id in (select id from public.branches where tenant_id = current_tenant_id()))
  with check (branch_id in (select id from public.branches where tenant_id = current_tenant_id()));

-- ── Recién ahora se quitan las abiertas ───────────────────────────────
-- Se hace DESPUÉS de crear las de reemplazo: si se quitaran primero, entre
-- una sentencia y la otra nadie podría leer nada.
drop policy if exists chat_channels_open          on public.chat_channels;
drop policy if exists chat_conversations_open     on public.chat_conversations;
drop policy if exists chat_messages_open          on public.chat_messages;
drop policy if exists ia_config_open              on public.ia_config;
drop policy if exists fact_pend_all               on public.iv_facturas_pendientes;
drop policy if exists alias_all                   on public.iv_insumo_alias;
drop policy if exists allow_all                   on public.pos_bases;
drop policy if exists allow_all                   on public.pos_cash_moves;
drop policy if exists allow_all                   on public.pos_categories;
drop policy if exists domi_apr_all                on public.pos_domi_aprendidos;
drop policy if exists gerente_ops_all             on public.pos_gerente_ops;
drop policy if exists mesa_tiempos_all            on public.pos_mesa_tiempos;
drop policy if exists niveles_all                 on public.pos_niveles_config;
drop policy if exists allow_all                   on public.pos_order_items;
drop policy if exists allow_all                   on public.pos_orders;
drop policy if exists allow_all                   on public.pos_products;
drop policy if exists allow_all_pos_reservations  on public.pos_reservations;
drop policy if exists allow_all                   on public.pos_sessions;
drop policy if exists shift_all                   on public.pos_shifts;
drop policy if exists allow_all                   on public.pos_tables;
drop policy if exists wa_listas_all               on public.pos_wa_listas;

-- Las Edge Functions entran como `service_role`, que se salta RLS por
-- diseño: el bot y los procesos del servidor siguen funcionando igual.
