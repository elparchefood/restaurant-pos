-- Poder nombrar administradores de la plataforma desde la consola.
--
-- Es la funcion mas delicada del sistema: un administrador ve TODOS los
-- restaurantes, todas las solicitudes y todos los datos de facturacion. Por eso
-- va por funciones controladas y no dandole permiso de escritura a la tabla.
--
-- Tres candados:
--   1. Solo un administrador puede nombrar a otro.
--   2. Nadie puede quitarse a si mismo (evita quedarse por fuera sin querer).
--   3. No se puede quitar al ULTIMO administrador (evita quedarse sin nadie).

-- ── Listar los usuarios de la plataforma ──────────────────────────────
create or replace function public.admin_listar_usuarios()
returns table (id uuid, email text, nombre text, rol text, creado timestamptz, ultimo_acceso timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo un administrador de la plataforma puede ver esta lista';
  end if;
  return query
    select u.id,
           u.email::text,
           coalesce(u.raw_user_meta_data->>'nombre', split_part(u.email::text,'@',1)),
           coalesce(p.role, 'usuario'),
           u.created_at,
           u.last_sign_in_at
      from auth.users u
      left join public.user_profiles p on p.id = u.id
     order by (coalesce(p.role,'') = 'admin') desc, u.created_at;
end $$;

-- ── Nombrar o quitar administrador ────────────────────────────────────
create or replace function public.admin_definir_rol(p_usuario uuid, p_admin boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare cuantos int;
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo un administrador de la plataforma puede cambiar roles';
  end if;

  if p_usuario = auth.uid() and not p_admin then
    raise exception 'No puedes quitarte a ti mismo el acceso de administrador';
  end if;

  -- Solo importa si el que se va a degradar ES admin hoy: si no lo es, quitarle
  -- algo que no tiene no puede dejar a la plataforma sin nadie.
  if not p_admin and exists (select 1 from public.user_profiles where id = p_usuario and role = 'admin') then
    select count(*) into cuantos from public.user_profiles where role = 'admin';
    if cuantos <= 1 then
      raise exception 'No se puede quitar al ultimo administrador de la plataforma';
    end if;
  end if;

  if p_admin then
    insert into public.user_profiles (id, role) values (p_usuario, 'admin')
    on conflict (id) do update set role = 'admin';
    return 'admin';
  else
    -- Se BORRA la fila en vez de ponerle otro rol: la tabla solo acepta
    -- admin/client/support, y sin fila el usuario simplemente no es
    -- administrador de la plataforma, que es justo lo que se quiere.
    delete from public.user_profiles where id = p_usuario;
    return 'usuario';
  end if;
end $$;

revoke all on function public.admin_listar_usuarios() from public;
revoke all on function public.admin_definir_rol(uuid, boolean) from public;
grant execute on function public.admin_listar_usuarios() to authenticated;
grant execute on function public.admin_definir_rol(uuid, boolean) to authenticated;
