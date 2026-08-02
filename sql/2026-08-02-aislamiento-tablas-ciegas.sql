-- ═══════════════════════════════════════════════════════════════════════
-- TABLAS QUE NEGABAN TODO — hallado en el barrido posterior al aislamiento
--
-- Tras cerrar las 22 políticas abiertas se revisaron TODAS las tablas
-- comparando lo que hay contra lo que ve un usuario real. Aparecieron cuatro
-- con la seguridad activa y NINGUNA política, que es "negar todo":
--
--   · iv_movimientos (540 filas)  ← lo leen Inventario e Informes.
--       NO era culpa del aislamiento de hoy: ya venía así. El kardex llevaba
--       tiempo invisible para esas dos pantallas.
--   · chat_ai_queue (88)          ← solo el servidor.
--   · pos_gerente_procesados (154)← solo el servidor.
--   · pos_planes (3)              ← creada hoy; la necesita el menú de marcas.
-- ═══════════════════════════════════════════════════════════════════════

drop policy if exists aislar_iv_movimientos on public.iv_movimientos;
create policy aislar_iv_movimientos on public.iv_movimientos for all to authenticated
  using (current_tenant_id() = tenant_id) with check (current_tenant_id() = tenant_id);

-- Catálogo común a todos los clientes: no tiene dueño, así que se lee siempre.
-- Escribirlo queda solo para el servidor.
drop policy if exists leer_planes on public.pos_planes;
create policy leer_planes on public.pos_planes for select to authenticated using (true);

drop policy if exists aislar_chat_ai_queue on public.chat_ai_queue;
create policy aislar_chat_ai_queue on public.chat_ai_queue for all to authenticated
  using (current_tenant_id() = tenant_id) with check (current_tenant_id() = tenant_id);

-- `pos_gerente_procesados` se deja negando todo a propósito: ninguna pantalla
-- la lee, solo las funciones del servidor, y lo más seguro es que siga así.
-- `mypass_vault` y `user_profiles` NO son del POS (otro proyecto en el mismo
-- Supabase) y no se tocan.
