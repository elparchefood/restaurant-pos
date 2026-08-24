-- ═══════════════════════════════════════════════════════════════════════════
--  El gerente vuelve a llamarse por su nombre  (24-ago-2026)
-- ───────────────────────────────────────────────────────────────────────────
--  Lo vio Sergio probando el restaurante de pruebas: el escritorio saludaba
--  "Buenas tardes, prueba-registro@ejemplo.com" y arriba a la derecha decía el
--  correo en vez de "Ana Prueba", que es el nombre que sí está guardado en
--  Configuración.
--
--  La causa es una fila con DOS formas de decir lo mismo:
--
--    · `pos_users.id`           = la cuenta de acceso  (forma vieja)
--    · `pos_users.auth_user_id` = la cuenta de acceso  (forma nueva)
--
--  `provision` —la función que monta un restaurante al registrarse— guardaba
--  solo la primera. Y las pantallas buscan por la segunda:
--
--      .eq('auth_user_id', authUser.id)
--
--  No encuentran nada, caen al respaldo por correo (que en estas filas está
--  vacío) y terminan mostrando el correo de la sesión como si fuera un nombre.
--
--  NO ES DEL RESTAURANTE DE PRUEBAS. Se revisaron las cinco fichas del sistema
--  y las TRES nacidas del registro están así: Meta Reviewer, Carlos Prueba y
--  Ana Prueba. Las dos que sí funcionan se crearon a mano. Es decir: a cada
--  restaurante nuevo que se registre le pasaría lo mismo, y lo vería su dueño
--  el primer día, en la primera pantalla.
--
--  Se arregla por los dos lados: aquí las que ya existen, y en `provision` para
--  que las próximas nazcan enlazadas.
--
--  Solo se tocan las filas cuyo `id` ES de verdad una cuenta de acceso. Una
--  ficha de mesero sin cuenta (como se crean desde Configuración) tiene un id
--  suyo que no existe en `auth.users`: copiárselo a `auth_user_id` la haría
--  pasar por una cuenta que no existe.
-- ═══════════════════════════════════════════════════════════════════════════

update public.pos_users u
   set auth_user_id = u.id
 where u.auth_user_id is null
   and exists (select 1 from auth.users a where a.id = u.id);

comment on column public.pos_users.auth_user_id is
  'La cuenta de acceso de esta persona. Las pantallas buscan por AQUI, no por `id`: quien cree una ficha con cuenta debe llenar este campo aunque el `id` ya sea el de la cuenta.';
