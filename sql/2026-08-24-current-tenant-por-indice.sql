-- ═══════════════════════════════════════════════════════════════════════════
--  La comprobación de seguridad deja de barrer la tabla entera  (24-ago-2026)
-- ───────────────────────────────────────────────────────────────────────────
--  `current_tenant_id()` es la función de la que cuelga TODA la seguridad: las
--  políticas de las 86 tablas con `tenant_id` la llaman para decidir qué puede
--  ver cada quien. O sea que corre en cada consulta de cada pantalla de cada
--  usuario.
--
--  Y estaba barriendo la tabla `pos_users` completa cada vez. Medido:
--
--      pos_users → 1.035.278 barridos completos   contra   34 por índice
--
--  La causa es el `OR`:
--
--      WHERE pu.auth_user_id = auth.uid() OR pu.id = auth.uid()
--
--  Postgres no puede usar un índice para un `OR` entre dos columnas distintas,
--  así que lee la tabla entera. Con las 5 filas de hoy eso es gratis y por eso
--  nadie lo había notado. Con diez restaurantes y su personal —cajeros,
--  meseros, cocineros, domiciliarios— pasa a ser un impuesto que se paga en
--  CADA consulta, y crece con el éxito del producto.
--
--  Se parte en dos búsquedas, cada una por su índice, conservando EXACTAMENTE
--  la misma precedencia: primero la fila que coincide por `auth_user_id`, y si
--  no hay, la que coincide por `id`. El `pri` es lo que mantiene ese orden.
--
--  Se conserva también un detalle fino: si la fila existe pero su `tenant_id`
--  es nulo, la función devuelve `auth.uid()` — igual que antes. Por eso el
--  COALESCE envuelve el resultado y no cada búsqueda por separado; con un
--  COALESCE por búsqueda, una fila con tenant nulo habría caído a la segunda
--  búsqueda y podría haber devuelto OTRO restaurante. Hoy no hay ninguna fila
--  así, pero la función de seguridad no se escribe para los datos de hoy.
--
--  COMPROBADO ANTES DE APLICAR: se ejecutaron las dos versiones, la vieja y la
--  nueva, sobre los 7 identificadores que existen (todos los de auth.users,
--  todos los de pos_users, todos los auth_user_id, y uno inventado que no
--  existe). Resultados idénticos en los 7.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) El índice que faltaba ───────────────────────────────────────────────
--  Parcial: solo 2 de las 5 filas tienen `auth_user_id`, y las que no lo tienen
--  no se buscan nunca por ahí. Un índice más pequeño se lee más rápido.
create index if not exists ix_pos_users_auth_user
  on public.pos_users (auth_user_id)
  where auth_user_id is not null;

--  El otro camino, `id`, ya va por la llave primaria: no hace falta índice.

-- ── 2) La función, sin el OR ───────────────────────────────────────────────
create or replace function public.current_tenant_id()
returns uuid
language sql
stable security definer
set search_path to 'public'
as $function$
  SELECT COALESCE(
    (SELECT t FROM (
        --  Prioridad 1: la fila enlazada a la cuenta de acceso.
        SELECT pu.tenant_id AS t, 1 AS pri
          FROM public.pos_users pu
         WHERE pu.auth_user_id = auth.uid()
        UNION ALL
        --  Prioridad 2: la fila cuyo propio id ES la cuenta (cuentas viejas,
        --  creadas antes de que existiera auth_user_id).
        SELECT pu.tenant_id, 2
          FROM public.pos_users pu
         WHERE pu.id = auth.uid()
     ) x
     ORDER BY pri
     LIMIT 1),
    auth.uid()
  )
$function$;

comment on function public.current_tenant_id() is
  'De qué restaurante es quien está consultando. La usan las políticas de las 86 tablas con tenant_id, así que corre en CADA consulta: no puede barrer pos_users. Va por índice (ix_pos_users_auth_user y la llave primaria). No devolverle el OR.';
