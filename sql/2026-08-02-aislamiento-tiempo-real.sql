-- ═══════════════════════════════════════════════════════════════════════
-- EL TIEMPO REAL SE CAYÓ CON EL AISLAMIENTO — y por qué
--
-- Síntoma (reportado por Sergio): los mensajes de WhatsApp llegaban a la base
-- pero no aparecían solos en Cobra; había que recargar la página.
--
-- LA CAUSA: las políticas del aislamiento se crearon `for all TO AUTHENTICATED`.
-- El motor de tiempo real de Supabase evalúa los permisos con OTRO rol, así que
-- para él la tabla no tenía ninguna política aplicable y no entregaba nada.
-- Las políticas viejas (`allow_all`) eran para TODOS los roles, por eso el
-- tiempo real funcionaba antes.
--
-- EL ARREGLO: recrearlas sin restringir el rol. El aislamiento NO se debilita:
--   · La condición sigue siendo `current_tenant_id() = tenant_id`.
--   · Para un usuario de otro restaurante da falso → 0 filas.
--   · Para `anon` (sin sesión) `current_tenant_id()` no resuelve → 0 filas.
--   · Para el rol del servidor (`service_role`) RLS ni siquiera se aplica, así
--     que las Edge Functions siguen igual.
--
-- Verificado después del cambio: El Parche ve todo lo suyo (1.725 mensajes, 137
-- pedidos…) y un usuario de otro tenant ve **0 en las 8 tablas probadas**.
--
-- REGLA PARA LA PRÓXIMA VEZ: no restringir por rol en políticas de tablas que
-- se publican en tiempo real, salvo que se compruebe que el motor las respeta.
-- ═══════════════════════════════════════════════════════════════════════

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
    'pos_tables', 'pos_wa_listas', 'iv_movimientos', 'chat_ai_queue'
  ] loop
    execute format('drop policy if exists aislar_%I on public.%I', t, t);
    execute format(
      'create policy aislar_%I on public.%I for all
         using (current_tenant_id() = tenant_id)
         with check (current_tenant_id() = tenant_id)', t, t);
  end loop;
end $$;

drop policy if exists aislar_pos_gerente_ops on public.pos_gerente_ops;
create policy aislar_pos_gerente_ops on public.pos_gerente_ops for all
  using (branch_id in (select id from public.branches where tenant_id = current_tenant_id()))
  with check (branch_id in (select id from public.branches where tenant_id = current_tenant_id()));

drop policy if exists leer_planes on public.pos_planes;
create policy leer_planes on public.pos_planes for select using (true);
