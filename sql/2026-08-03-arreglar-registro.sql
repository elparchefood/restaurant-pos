-- El registro de nuevos restaurantes estaba MUERTO. Nadie podia registrarse.
--
-- Causa: la politica de `user_profiles` que da acceso al administrador dice
-- "dejalo pasar si existe una fila en user_profiles con su id y rol admin".
-- Para responder eso Postgres tiene que LEER user_profiles, lo que vuelve a
-- disparar la misma politica, que vuelve a leer... bucle infinito. Postgres lo
-- corta con "infinite recursion detected in policy".
--
-- Y como la politica de `pos_registrations` tambien consulta user_profiles, el
-- bucle se disparaba al INSERTAR una solicitud: el formulario de registro
-- fallaba con error 500 y la persona no podia ni mandar su comprobante. Por eso
-- habia CERO solicitudes.
--
-- Arreglo: preguntar "¿es administrador?" desde una funcion SECURITY DEFINER.
-- Al correr con los permisos de su dueño, la funcion lee la tabla SIN pasar por
-- las politicas — y ahi se acaba el bucle.

create or replace function public.es_admin_plataforma()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.es_admin_plataforma() from public;
grant execute on function public.es_admin_plataforma() to anon, authenticated, service_role;

-- Las dos politicas ahora usan la funcion en vez de consultar la tabla.
drop policy if exists "admin ve todos" on public.user_profiles;
create policy "admin ve todos" on public.user_profiles
  for all using (public.es_admin_plataforma())
  with check (public.es_admin_plataforma());

drop policy if exists "admin gestiona registros" on public.pos_registrations;
create policy "admin gestiona registros" on public.pos_registrations
  for all using (public.es_admin_plataforma())
  with check (public.es_admin_plataforma());

-- La de registrarse se queda como estaba: cualquiera puede MANDAR su solicitud
-- (es un formulario publico), pero solo el administrador puede LEERLAS.

-- El formulario de registro corre SIN sesion (nadie ha entrado todavia), asi
-- que lo ejecuta el rol `anon`. Y `anon` no tenia NINGUN permiso sobre
-- pos_registrations: aunque la politica decia "cualquiera puede registrarse",
-- el permiso de base faltaba. Eran dos fallas apiladas.
--
-- Solo INSERT: mandar la solicitud, si. Leerlas, no — esas son de Sergio.
grant insert on public.pos_registrations to anon;
