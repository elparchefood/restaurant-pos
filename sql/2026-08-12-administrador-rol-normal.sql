
/* PASO 2 — 'Administrador' vuelve a ser un ROL NORMAL.
   Regla de Sergio: el gerente es el DUEÑO (la cuenta con la que se registro el
   restaurante) y tiene todo por serlo, sin rol. 'Administrador' es un rol mas,
   y solo puede lo que el dueño le conceda.
   Hoy estaba con system_role = true, que pos-perms traduce a acceso TOTAL: un
   'Administrador' nacia pudiendolo todo sin que el dueño se lo diera.
   Nadie usa ese rol hoy (los 5 usuarios son 4 gerente + 1 mesero), asi que el
   cambio no le quita permisos a nadie ahora mismo. */
UPDATE pos_roles
   SET system_role = false,
       perms = COALESCE(NULLIF(perms, '{}'), ARRAY[
         'ventas.ver','pedidos.crear','pedidos.cobrar',
         'caja.abrir','caja.cerrar','caja.movimientos',
         'historial.ver','informes.ver','inventario.ver'
       ]::text[])
 WHERE lower(name) = 'administrador';
