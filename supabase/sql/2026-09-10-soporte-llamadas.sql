-- ════════════════════════════════════════════════════════════════════
--  LAS VIDEOLLAMADAS DE SOPORTE CON COBRA (10-sep-2026)
--
--  Punto 7 de la lista: un boton en el Escritorio para que un restaurante
--  con un problema hable con Sergio. Sergio: *"mucho mejor si el
--  agendamiento se hace dentro de Cobra"* — un agendador propio, sin
--  Calendly. Decidido con el: videollamada de Google Meet (una sala fija
--  suya), 30 minutos, aviso por correo a sergio@cobrapos.app y lista en la
--  consola de plataforma.
--
--  Todo se escribe desde la Edge Function `soporte-llamadas` (servicio):
--  ella valida que la hora este libre y dentro del horario. Aqui solo se
--  deja LEER: cada restaurante lo suyo, la plataforma todo.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.plataforma_agenda (
  id                int primary key default 1 check (id = 1),   -- una sola fila
  meet_url          text,                                       -- la sala fija de Sergio
  correo_aviso      text not null default 'sergio@cobrapos.app',
  duracion_min      int  not null default 30,
  anticipacion_min  int  not null default 120,  -- no se agenda para dentro de 5 minutos
  dias_adelante     int  not null default 14,
  --  Por dia de la semana (0 = domingo ... 6 = sabado), rangos "HH:MM" en
  --  hora de Colombia. Nace con el horario que ya decia el bloque de ayuda
  --  del Escritorio ("Lun a Sab 08:00am-09:00pm · Dom 09:00am-06:00pm");
  --  Sergio lo cambia en su consola.
  horario           jsonb not null default
    '{"0":[["09:00","18:00"]],"1":[["08:00","21:00"]],"2":[["08:00","21:00"]],"3":[["08:00","21:00"]],"4":[["08:00","21:00"]],"5":[["08:00","21:00"]],"6":[["08:00","21:00"]]}'::jsonb,
  bloqueos          jsonb not null default '[]'::jsonb,       -- ["2026-09-15", ...] dias sin atencion
  updated_at        timestamptz not null default now()
);
insert into public.plataforma_agenda (id) values (1) on conflict (id) do nothing;
alter table public.plataforma_agenda enable row level security;
drop policy if exists plataforma_agenda_admin on public.plataforma_agenda;
create policy plataforma_agenda_admin on public.plataforma_agenda for select to authenticated
  using (public.es_admin_plataforma());

create table if not exists public.plataforma_llamadas (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  branch_id      uuid,
  user_id        uuid,
  restaurante    text,
  contacto       text,
  correo         text,
  telefono       text,
  motivo         text,
  inicio         timestamptz not null,
  fin            timestamptz not null,
  estado         text not null default 'agendada' check (estado in ('agendada', 'hecha', 'cancelada')),
  cancelada_por  text,
  created_at     timestamptz not null default now()
);
--  Dos restaurantes no pueden tener la misma hora: lo frena la base aunque
--  dos pantallas agenden en el mismo segundo.
create unique index if not exists plataforma_llamadas_hueco
  on public.plataforma_llamadas (inicio) where estado = 'agendada';
create index if not exists plataforma_llamadas_tenant on public.plataforma_llamadas (tenant_id, inicio);
alter table public.plataforma_llamadas enable row level security;
drop policy if exists plataforma_llamadas_ver on public.plataforma_llamadas;
create policy plataforma_llamadas_ver on public.plataforma_llamadas for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.es_admin_plataforma());
grant select on public.plataforma_llamadas, public.plataforma_agenda to authenticated;
