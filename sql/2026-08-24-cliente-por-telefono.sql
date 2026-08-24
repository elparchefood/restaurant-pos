-- ═══════════════════════════════════════════════════════════════════════════
--  Buscar UN cliente por su teléfono, sin traerse a todos  (24-ago-2026)
-- ───────────────────────────────────────────────────────────────────────────
--  `web-acceso` busca al cliente en cada entrada y en cada comprobación de
--  sesión de la app. Lo hacía en dos pasos, y los dos mal:
--
--    1. `telefono=like.*<tel>` — filtra en el servidor, sí, pero un patrón que
--       empieza por comodín NO puede usar índice: lee la tabla entera.
--    2. Si eso fallaba, `limit=5000` y buscar el teléfono EN MEMORIA. Con los
--       222 clientes de hoy son 222 filas viajando por internet para encontrar
--       una; con el éxito, son miles.
--
--  Lo curioso es que **el índice correcto ya existía**: `ux_clientes_tel`, sobre
--  (tenant_id, últimos 10 dígitos del teléfono). Nadie lo estaba usando porque
--  desde la API no se puede filtrar por una expresión — hace falta una función.
--
--  Esta es esa función. El `WHERE` está escrito EXACTAMENTE igual que el índice
--  (misma expresión, mismo orden) para que Postgres lo reconozca; comprobado con
--  el plan: `Index Scan using ux_clientes_tel`.
--
--  Y busca por los ÚLTIMOS 10 DÍGITOS, que es la identidad real del cliente en
--  todo el sistema. Esa regla ya costó un incidente: se buscaba por teléfono
--  exacto y bastaba UNA fila guardada con indicativo (573244756271) o con un
--  espacio para que el cliente "no existiera" — la página lo mandaba a
--  registrarse de cero teniendo sus puntos y su historial. Aquí se conserva.
--
--  Devuelve jsonb y no una fila fija a propósito: quien llama pide distintas
--  columnas según el caso, y con un tipo fijo habría que cambiar la función
--  cada vez que alguien necesite un campo más.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_cliente_por_tel(p_tenant uuid, p_tel text)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  SELECT to_jsonb(c)
    FROM public.pos_clientes c
   WHERE c.tenant_id = p_tenant
     AND right(regexp_replace(c.telefono, '\D', '', 'g'), 10)
         = right(regexp_replace(coalesce(p_tel, ''), '\D', '', 'g'), 10)
     AND c.telefono IS NOT NULL
   LIMIT 1
$function$;

comment on function public.fn_cliente_por_tel(uuid, text) is
  'Un cliente por los últimos 10 dígitos de su teléfono. El WHERE está escrito igual que el índice ux_clientes_tel para que lo use; si se cambia la expresión, se pierde el índice y vuelve a leer la tabla entera.';

--  Solo el servidor la llama (web-acceso, con la clave de servicio). No se le
--  abre a `anon`: devolvería la ficha de cualquier cliente a quien supiera un
--  número de teléfono.
--
--  ⚠️ EL `revoke` SOLO NO BASTA, Y ROMPIÓ LA APP UNOS MINUTOS (24-ago-2026).
--  `service_role` hereda el permiso de `public`, así que quitárselo a `public`
--  se lo quitó TAMBIÉN al servidor: la función respondía "permission denied" y
--  web-acceso no encontraba a nadie. Es decir, todo cliente que intentara
--  entrar habría recibido "el número o la contraseña no son correctos" — el
--  mismo desastre del 15-ago pero por otra puerta. Se detectó porque después
--  de desplegar se probó la llamada REAL con la clave de servicio, no solo el
--  SQL desde la consola (que corre como superusuario y nunca falla).
--  Por eso el `grant` explícito de abajo: hay que devolvérselo a mano.
revoke all on function public.fn_cliente_por_tel(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_cliente_por_tel(uuid, text) to service_role;
