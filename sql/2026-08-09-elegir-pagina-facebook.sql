-- ═══════════════════════════════════════════════════════════════════════════
-- Elegir CUAL pagina de Facebook conectar
-- ───────────────────────────────────────────────────────────────────────────
-- Hoy `meta-oauth-callback` toma `pagesData.data[0]` — la primera de la lista,
-- en silencio. Dos problemas:
--
--   1. Si el dueno administra varias paginas, Cobra conecta la que no es.
--   2. `pages_show_list` es EXACTAMENTE el permiso de "ver la lista y elegir".
--      Meta ya rechazo esta solicitud una vez por un video que no demostraba
--      el permiso. Un video donde la lista nunca aparece lo tumba otra vez.
--
-- Para elegir hacen falta DOS pasos (listar y despues guardar), y el `code` de
-- Facebook solo se puede canjear UNA vez. Asi que el token del primer paso hay
-- que guardarlo en algun lado hasta el segundo.
--
-- Se guarda AQUI y no en el navegador: es la misma razon por la que
-- `provision` se paso al servidor — un token de acceso no baja al cliente.
-- Vive minutos y se borra al usarse.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists meta_oauth_pendiente (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  branch_id   uuid not null,
  channel     text not null,
  token       text not null,          -- token largo del usuario de Facebook
  paginas     jsonb not null,         -- lo que se le muestra para elegir
  created_at  timestamptz not null default now()
);

-- Nadie entra aqui desde el navegador: solo la funcion del servidor, que usa
-- la llave de servicio. Sin politicas, RLS niega todo lo demas.
alter table meta_oauth_pendiente enable row level security;

-- Lo que quede colgado (el dueno cerro la ventana a medias) se borra solo.
create or replace function meta_oauth_limpiar()
returns void
language sql
security definer
set search_path = public
as $$
  delete from meta_oauth_pendiente where created_at < now() - interval '30 minutes';
$$;

select cron.unschedule('meta-oauth-limpiar')
  where exists (select 1 from cron.job where jobname = 'meta-oauth-limpiar');

select cron.schedule('meta-oauth-limpiar', '*/30 * * * *',
                     'select public.meta_oauth_limpiar()');
