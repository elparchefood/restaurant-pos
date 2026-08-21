-- ══════════════════════════════════════════════════════════════════════
--  NO SE PODIA CREAR UN CAJERO, UN COCINERO NI UN DOMICILIARIO
--  (encontrado el 21-ago-2026 al construir la app del domiciliario)
--
--  `pos_users.role` tenia un candado de la primera version:
--      CHECK (role IN ('gerente','mesero','cajera','cocina'))
--  ...pero la pantalla de Usuarios guarda el NOMBRE DEL ROL en minusculas
--  (`configuracion.js`: role.name.toLowerCase()). Los roles que Cobra
--  siembra se llaman "Cajero", "Cocinero" y "Domiciliario", que en
--  minusculas dan 'cajero', 'cocinero' y 'domiciliario' — NINGUNO estaba
--  en la lista.
--
--  Consecuencia real: crear ese usuario fallaba. Por eso en El Parche
--  solo existen un gerente y un mesero despues de meses de uso.
--  Y para vender es peor: un restaurante que cree sus propios roles
--  ("Barista", "Repartidor") no podia crear un solo usuario.
--
--  QUIEN MANDA DE VERDAD es `role_id` → pos_roles.perms. La columna
--  `role` es un texto heredado que solo se usa para dos comparaciones
--  tolerantes (login.js y ventas-salon.js), asi que abrirla no rompe
--  nada. Se deja un candado minimo: que no venga vacia.
-- ══════════════════════════════════════════════════════════════════════

alter table pos_users drop constraint if exists pos_users_role_check;

alter table pos_users add constraint pos_users_role_check
  check (role is null or length(btrim(role)) > 0);
