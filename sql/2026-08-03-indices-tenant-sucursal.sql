-- Indices por dueño y sucursal.
--
-- Por que combinados (tenant_id, branch_id) y no sueltos: las politicas de
-- aislamiento agregan SIEMPRE "tenant_id = el mio" a cada consulta. Asi que en
-- la practica toda consulta de la app termina siendo
--   WHERE tenant_id = X AND branch_id = Y
-- y un indice combinado con tenant_id de primero sirve para las dos: para el
-- chequeo de aislamiento y para la busqueda por sucursal. Dos indices sueltos
-- ocuparian mas y servirian menos.
--
-- Ninguno borra ni cambia datos. Con el tamaño actual tardan milisegundos.

create index if not exists ix_chat_messages_tenant  on public.chat_messages   (tenant_id);
create index if not exists ix_order_items_tb        on public.pos_order_items (tenant_id, branch_id);
create index if not exists ix_iv_movimientos_tb     on public.iv_movimientos  (tenant_id, branch_id);
create index if not exists ix_iv_insumos_tb         on public.iv_insumos      (tenant_id, branch_id);
create index if not exists ix_chat_ai_queue_tb      on public.chat_ai_queue   (tenant_id, branch_id);
create index if not exists ix_pos_tables_tb         on public.pos_tables      (tenant_id, branch_id);
create index if not exists ix_branches_tenant       on public.branches        (tenant_id);

-- Segunda tanda: las tablas que hoy estan vacias pero crecen con el uso.
-- Se hacen ahora que cuesta cero, no cuando ya haya volumen.
create index if not exists ix_brands_tb                  on public.brands                  (tenant_id);
create index if not exists ix_pos_bases_tb               on public.pos_bases               (tenant_id);
create index if not exists ix_pos_blacklist_tb           on public.pos_blacklist           (tenant_id);
create index if not exists ix_pos_cash_moves_tb          on public.pos_cash_moves          (tenant_id, branch_id);
create index if not exists ix_pos_credito_movimientos_tb on public.pos_credito_movimientos (tenant_id, branch_id);
create index if not exists ix_pos_ingredients_tb         on public.pos_ingredients         (tenant_id, branch_id);
create index if not exists ix_pos_printers_tb            on public.pos_printers            (tenant_id, branch_id);
create index if not exists ix_pos_ratings_tb             on public.pos_ratings             (tenant_id, branch_id);
create index if not exists ix_pos_recipes_tb             on public.pos_recipes             (tenant_id, branch_id);
create index if not exists ix_pos_registrations_tb       on public.pos_registrations       (tenant_id);
create index if not exists ix_pos_roles_tb               on public.pos_roles               (tenant_id);
create index if not exists ix_pos_users_tb               on public.pos_users               (tenant_id, branch_id);

-- Verificado ejecutando EXPLAIN ANALYZE sobre chat_messages:
--   · consultando el tenant que hoy tiene TODAS las filas -> recorrido completo,
--     y esta bien: llevarse el 100% es mas barato asi.
--   · consultando otro tenant (como sera con 100 clientes) -> Index Only Scan,
--     costo 1,40 contra 99,97 del recorrido. ~70 veces menos trabajo.
