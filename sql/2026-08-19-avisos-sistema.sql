/* ══ AVISOS DEL SISTEMA PARA LA CAMPANITA (19-ago-2026) ═══════════════════
   Sergio: "avisame cuando este por agotarse el saldo de Twilio". Si el saldo
   llega a cero los codigos dejan de salir SIN AVISAR y los clientes nuevos no
   se pueden registrar — el mismo agujero que acabamos de tapar, pero por otra
   puerta.

   La tabla es generica a proposito (`clave`), no "avisos_de_twilio": el
   siguiente aviso del sistema que haga falta entra aqui sin tocar la campana. */
create table if not exists public.pos_avisos_sistema (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  clave      text not null,
  titulo     text not null,
  sub        text,
  urgente    boolean not null default false,
  ir         text,
  datos      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, clave)
);

alter table public.pos_avisos_sistema enable row level security;
drop policy if exists aislar_pos_avisos_sistema on public.pos_avisos_sistema;
create policy aislar_pos_avisos_sistema on public.pos_avisos_sistema
  for all using (current_tenant_id() = tenant_id);

/* LOS PERMISOS A MANO (leccion del 19-ago): una tabla creada por la API de
   administracion NO otorga nada, y la funcion se queda con 403 en silencio. */
grant select, insert, update, delete on public.pos_avisos_sistema to service_role;
grant select on public.pos_avisos_sistema to authenticated;

notify pgrst, 'reload schema';
