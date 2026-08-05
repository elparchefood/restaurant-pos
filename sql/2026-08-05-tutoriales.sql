-- ═══════════════════════════════════════════════════════════════════════════
-- TUTORIALES — videos de YouTube organizados por módulos
-- ───────────────────────────────────────────────────────────────────────────
-- Los tutoriales los hace COBRA, no cada restaurante: son los mismos para todos
-- los clientes. Por eso estas tablas NO llevan tenant_id — meterlo obligaría a
-- copiar los mismos 24 videos a cada cliente nuevo y a mantenerlos en paralelo.
-- Los crea y los edita el administrador de la plataforma desde su consola.
--
-- Lo único que sí es de cada quien es el PROGRESO: en qué minuto va cada
-- persona y qué ya terminó. Eso va por usuario, no por restaurante — en un
-- local el mesero y el dueño aprenden cosas distintas y a su ritmo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Módulos ────────────────────────────────────────────────────────────────
create table if not exists public.tuto_modulos (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null,
  descripcion text,
  orden       int  not null default 0,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.tuto_modulos is
  'Temas de la ruta de aprendizaje (Ventas, Inventario, Chat...). Globales: los mismos para todos los restaurantes.';

-- ── Videos ─────────────────────────────────────────────────────────────────
create table if not exists public.tuto_videos (
  id           uuid primary key default gen_random_uuid(),
  modulo_id    uuid not null references public.tuto_modulos(id) on delete cascade,
  titulo       text not null,
  resumen      text,
  -- Se guarda el ID de YouTube (11 caracteres), no la direccion completa: la
  -- direccion viene de mil formas (youtu.be, con lista, con minuto de inicio) y
  -- el reproductor solo necesita el id. La consola lo extrae al pegar el enlace.
  youtube_id   text not null,
  -- Se guarda para poder pintar la lista y el progreso ANTES de abrir el video.
  -- Si queda en 0, la pantalla lo averigua sola la primera vez que alguien lo
  -- reproduce y lo escribe aqui: es un dato que el sistema puede saber solo, y
  -- pedirselo a mano a quien sube el video es una forma segura de que quede mal.
  duracion_seg int  not null default 0,
  nivel        text not null default 'basico'
               check (nivel in ('basico','intermedio','avanzado')),
  -- Los "pasos clave" del video: [{"t": 45, "texto": "Crear la categoria"}]
  -- Con el minuto exacto, para poder saltar ahi.
  pasos        jsonb not null default '[]'::jsonb,
  -- El boton que lleva a la pantalla que se esta enseñando. Sin esto el que
  -- aprende termina el video y tiene que acordarse de donde estaba la cosa.
  ruta_destino text,
  ruta_texto   text,
  orden        int  not null default 0,
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists ix_tuto_videos_modulo on public.tuto_videos (modulo_id, orden);

comment on column public.tuto_videos.ruta_destino is
  'Pantalla del sistema que enseña el video (ej. inventario.html). El boton solo aparece si esto tiene valor.';

-- ── Progreso, por usuario ──────────────────────────────────────────────────
create table if not exists public.tuto_progreso (
  user_id    uuid not null references auth.users(id) on delete cascade,
  video_id   uuid not null references public.tuto_videos(id) on delete cascade,
  segundos   int  not null default 0,
  completado boolean not null default false,
  -- '¿Te sirvió?' — sirve para saber cuales hay que volver a grabar.
  feedback   text check (feedback in ('si','no')),
  updated_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

comment on table public.tuto_progreso is
  'En que minuto va cada persona y que ya termino. Por USUARIO: en un local el mesero y el dueño aprenden cosas distintas.';

-- ── Quién ve y quién edita ─────────────────────────────────────────────────
alter table public.tuto_modulos  enable row level security;
alter table public.tuto_videos   enable row level security;
alter table public.tuto_progreso enable row level security;

-- Ver: cualquiera que haya entrado al sistema. Son material de ayuda, no datos
-- de nadie; esconderlos por restaurante no protegeria nada y complicaria todo.
drop policy if exists tuto_modulos_ver on public.tuto_modulos;
create policy tuto_modulos_ver on public.tuto_modulos
  for select to authenticated using (activo);

drop policy if exists tuto_videos_ver on public.tuto_videos;
create policy tuto_videos_ver on public.tuto_videos
  for select to authenticated using (activo);

-- Editar: SOLO el administrador de la plataforma. Que un cliente pueda cambiar
-- los tutoriales se los cambiaria a todos los demas.
drop policy if exists tuto_modulos_admin on public.tuto_modulos;
create policy tuto_modulos_admin on public.tuto_modulos
  for all to authenticated
  using (public.es_admin_plataforma()) with check (public.es_admin_plataforma());

drop policy if exists tuto_videos_admin on public.tuto_videos;
create policy tuto_videos_admin on public.tuto_videos
  for all to authenticated
  using (public.es_admin_plataforma()) with check (public.es_admin_plataforma());

-- Progreso: cada quien el suyo, y nada mas.
drop policy if exists tuto_progreso_propio on public.tuto_progreso;
create policy tuto_progreso_propio on public.tuto_progreso
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.tuto_modulos, public.tuto_videos to authenticated;
grant insert, update, delete on public.tuto_modulos, public.tuto_videos to authenticated;
grant select, insert, update, delete on public.tuto_progreso to authenticated;

-- ── La duración que el sistema averigua solo ───────────────────────────────
-- La escribe el reproductor la primera vez que alguien abre el video. Va por
-- funcion y no por politica de escritura para que un usuario cualquiera pueda
-- rellenar ESE dato sin poder tocar nada mas del video.
create or replace function public.tuto_fijar_duracion(p_video uuid, p_seg int)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_seg is null or p_seg <= 0 then return; end if;
  update public.tuto_videos
     set duracion_seg = p_seg, updated_at = now()
   where id = p_video and duracion_seg = 0;   -- solo si aun no se sabia
end;
$$;

grant execute on function public.tuto_fijar_duracion(uuid, int) to authenticated;
