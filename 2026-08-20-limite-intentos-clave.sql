-- 2026-08-20 · Frenar el que prueba contraseñas una tras otra
--
-- El código por SMS ya tenía freno (3 intentos, 3 por hora, 8 por día). La
-- CONTRASEÑA no tenía ninguno: quien supiera un número podía probar claves sin
-- parar. La clave se guarda con PBKDF2 de 120.000 vueltas, así que cada intento
-- es lento a propósito y eso ya frena mucho — pero "lento" no es "imposible", y
-- además cada intento gasta CPU del servidor, así que probar en masa sale caro
-- en las dos direcciones.
--
-- Se cuenta por TELÉFONO y no por IP: la IP cambia sola en los datos del
-- celular, y bloquear por IP dejaría fuera a media ciudad si comparten salida.

create table if not exists public.pos_web_intentos (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  telefono   text not null,
  ok         boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ix_web_intentos_tel
  on public.pos_web_intentos (tenant_id, telefono, created_at desc);

-- Nadie de afuera lo toca: solo las Edge Functions, con la llave de servicio.
alter table public.pos_web_intentos enable row level security;
revoke all on public.pos_web_intentos from public, anon, authenticated;
grant all on public.pos_web_intentos to service_role;

-- La limpieza va aquí y no en un cron: la tabla solo interesa 15 minutos hacia
-- atrás, y borrar lo viejo en la misma llamada que la consulta evita otro reloj
-- que mantener.
create or replace function public.fn_web_intentos_fallidos(p_tenant uuid, p_tel text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_n int;
begin
  delete from pos_web_intentos where created_at < now() - interval '1 day';
  select count(*) into v_n
    from pos_web_intentos
   where tenant_id = p_tenant and telefono = p_tel and not ok
     and created_at > now() - interval '15 minutes';
  return coalesce(v_n, 0);
end;
$fn$;

revoke execute on function public.fn_web_intentos_fallidos(uuid, text) from public, anon;
grant  execute on function public.fn_web_intentos_fallidos(uuid, text) to service_role;

notify pgrst, 'reload schema';
