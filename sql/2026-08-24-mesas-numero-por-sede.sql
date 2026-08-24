-- ═══════════════════════════════════════════════════════════════════════════
--  El número de mesa es del restaurante, no del mundo  (24-ago-2026)
-- ───────────────────────────────────────────────────────────────────────────
--  `pos_tables` tenía:
--
--      UNIQUE (number)
--
--  Único en TODA la base. Es decir: si El Parche tiene la mesa 1, **ningún otro
--  restaurante del sistema puede crear su mesa 1**. Con diez clientes, nueve no
--  podrían montar su salón — y el error que verían sería un "duplicate key" sin
--  explicación, en el paso 4 de la puesta en marcha.
--
--  Cómo apareció: copiando la carta de El Parche a un restaurante de pruebas.
--  Reventó en la mesa 6. No lo encontró la auditoría de multimarca del 23-ago
--  porque esa revisó las políticas de seguridad y los roles, no las
--  restricciones de las tablas. Queda la lección: al auditar multi-restaurante,
--  las restricciones ÚNICAS son parte del examen.
--
--  Se barrieron las demás restricciones únicas de tablas con `tenant_id` o
--  `branch_id`. Hay otras cuatro globales y las cuatro son CORRECTAS, así que
--  no se tocan: el id de conversación de `chat_ai_queue`, el `item_id` de
--  `iv_consumo_alertas`, el `endpoint` de `pos_web_push` y el `token_hash` de
--  `pos_web_sesiones`. Esas sí deben ser únicas en todo el sistema por su
--  propia naturaleza — una dirección de aviso o la huella de una sesión no
--  pueden repetirse aunque sean de restaurantes distintos.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.pos_tables drop constraint if exists pos_tables_number_key;

--  Por SEDE y no por restaurante: un negocio con dos sucursales tiene una mesa
--  1 en cada una, y son mesas distintas.
alter table public.pos_tables
  add constraint pos_tables_numero_por_sede unique (branch_id, number);

comment on constraint pos_tables_numero_por_sede on public.pos_tables is
  'El número de mesa es único DENTRO de su sede. Antes era único en toda la base y eso impedía que un segundo restaurante creara su mesa 1.';
