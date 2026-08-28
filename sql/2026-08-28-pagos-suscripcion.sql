-- ═══════════════════════════════════════════════════════════════════════════
--  EL PAGO DE LA SUSCRIPCIÓN — pos_pagos_suscripcion
--  Sergio, 28-ago-2026:
--    "cuando inicia sesión le aparece un modal en la pantalla que no lo deja
--     hacer absolutamente nada hasta que no pague... el modal lo lleva al pago
--     y el pagar ya vuelve a recuperar todo su acceso. La cuenta no puede
--     dejar de existir ni desaparecer."
--
--  Hasta hoy sólo existía el pago del PRIMER mes: `pos_registrations` guarda
--  el comprobante con el que alguien se registra, y ahí se acaba. Del segundo
--  mes en adelante no había dónde poner la plata que entra — el comprobante
--  llegaba por WhatsApp y quien reactivaba era Sergio de memoria.
--
--  Esta tabla es ese registro. Una fila por pago que un restaurante dice haber
--  hecho: cuánto, por cuál período, con qué comprobante, y si ya se revisó.
--  Sirve para tres cosas que hoy no se pueden hacer: saber quién pagó y quién
--  no, ver el comprobante antes de reactivar, y tener el histórico de cobros
--  de cada cliente cuando alguien reclame.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.pos_pagos_suscripcion (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  plan             text,
  sucursales       int,
  periodo          text not null default 'mensual',   -- mensual | trimestral | anual
  monto            numeric,
  comprobante_url  text,
  status           text not null default 'pending',   -- pending | approved | rejected
  nota             text,
  creado_por       uuid,
  created_at       timestamptz not null default now(),
  revisado_en      timestamptz,
  revisado_por     uuid
);

create index if not exists ix_pagos_susc_tenant on public.pos_pagos_suscripcion (tenant_id, created_at desc);
create index if not exists ix_pagos_susc_pend   on public.pos_pagos_suscripcion (status) where status = 'pending';

--  Las tablas creadas por la API de administración nacen SIN permisos: sin
--  esto, PostgREST responde "permission denied" a todo y la pantalla queda
--  muerta sin decir por qué. Ya pasó dos veces.
grant select, insert, update, delete on public.pos_pagos_suscripcion to service_role;
grant select on public.pos_pagos_suscripcion to authenticated;

alter table public.pos_pagos_suscripcion enable row level security;

--  El restaurante VE sus propios pagos (el modal necesita saber si ya mandó
--  uno y está en revisión, para no pedirle el comprobante otra vez). Pero no
--  los escribe: eso pasa por el servidor, que es quien calcula el monto. Si el
--  navegador pudiera insertar, cualquiera se pondría al día escribiendo una
--  fila.
drop policy if exists pagos_susc_ve_lo_suyo on public.pos_pagos_suscripcion;
create policy pagos_susc_ve_lo_suyo on public.pos_pagos_suscripcion
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.es_admin_plataforma());

notify pgrst, 'reload schema';
