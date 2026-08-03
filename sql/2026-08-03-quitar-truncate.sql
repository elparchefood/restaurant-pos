-- Quitar a la app el permiso de VACIAR tablas.
--
-- `anon` (cualquiera con la llave publica del sitio) y `authenticated` tenian
-- TRUNCATE sobre 64 y 66 tablas. TRUNCATE **se salta las politicas de
-- aislamiento**: vacia la tabla entera sin mirar de quien son los datos. Es de
-- los pocos permisos que pueden borrar el negocio de todos los clientes de una.
--
-- Hoy no era explotable —PostgREST solo expone leer/crear/editar/borrar fila a
-- fila, y ninguna funcion de la base usa truncate (verificado)— pero basta con
-- que alguien cree una funcion que lo use para abrir la puerta.
--
-- Se quitan tambien REFERENCES y TRIGGER: dejan crear llaves foraneas y
-- disparadores sobre tablas ajenas. La app nunca hace eso; son restos de los
-- permisos por defecto.
--
-- NO se toca SELECT/INSERT/UPDATE/DELETE: eso es lo que usa la aplicacion y lo
-- que las politicas de aislamiento ya controlan fila por fila.
do $$
declare t record;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;

-- Las vistas (v_*) no estan en pg_tables, asi que el bucle de arriba no las
-- toca. En una vista TRUNCATE ni siquiera se puede ejecutar, pero se quita
-- igual para que el listado de permisos quede limpio y no despiste al que lo
-- revise despues.
do $$
declare v record;
begin
  for v in select viewname from pg_views where schemaname = 'public'
  loop
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', v.viewname);
  end loop;
end $$;
