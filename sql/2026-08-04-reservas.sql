-- ═══════════════════════════════════════════════════════════════════════════
-- RESERVAS — base de datos
-- Decisiones de Sergio, 4 de agosto de 2026:
--   · Un interruptor por restaurante: si no acepta reservas, la pantalla se ve
--     apagada y el estado "reservada" ni siquiera existe para el.
--   · Nada automatico: todo pasa porque alguien aprieta un boton.
--   · "Reservada" = ya se sentaron con su reserva pero AUN NO han pedido.
--     Distinto de "mesa libre que tiene una reserva mas tarde", que sigue libre.
--   · Al sentar una reserva con pedido previo, el pedido se pasa a la mesa con
--     su estado de pago; si no esta pagado manda `branches.cobro_adelantado`.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. El interruptor ──────────────────────────────────────────────────────
alter table public.branches
  add column if not exists acepta_reservas boolean not null default false;

comment on column public.branches.acepta_reservas is
  'Si esta apagado, la pantalla de Reservas se ve pero no se puede usar, y el estado "reservada" no aparece en las mesas.';

-- ── 2. Lo que le faltaba a la reserva ──────────────────────────────────────
alter table public.pos_reservations
  add column if not exists duracion_min  integer not null default 90,
  add column if not exists origen        text    not null default 'telefono',
  add column if not exists abono         numeric not null default 0,
  add column if not exists order_id      uuid,
  add column if not exists seated_at     timestamptz,
  -- Rastro de quien la movio de mesa y cuando. Recomendacion aceptada por
  -- Sergio: cuesta nada y evita discusiones cuando un cliente reclama.
  add column if not exists mesa_anterior text,
  add column if not exists movida_por    text,
  add column if not exists movida_at     timestamptz;

do $$ begin
  alter table public.pos_reservations
    add constraint pos_reservations_order_fk
    foreign key (order_id) references public.pos_orders(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.pos_reservations
    add constraint pos_reservations_origen_check
    check (origen = any (array['whatsapp','telefono','web','mesero']));
exception when duplicate_object then null; end $$;

-- Estados: se conservan los viejos por compatibilidad y se suman los del diseño.
alter table public.pos_reservations drop constraint if exists pos_reservations_status_check;
alter table public.pos_reservations
  add constraint pos_reservations_status_check
  check (status = any (array[
    'pendiente',   -- creada, sin confirmar
    'confirmada',  -- confirmada con el cliente
    'sentada',     -- ya llegaron y se sentaron
    'cumplida',    -- terminaron y pagaron
    'cancelada',
    'no_show',
    'llego'        -- viejo, equivalente a 'sentada'
  ]));

-- ── 3. El estado nuevo de la mesa ──────────────────────────────────────────
-- "reservada": la gente de la reserva ya se sento pero todavia no ha pedido.
-- OJO para Caja e Informes: una mesa reservada NO tiene pedido, asi que no
-- puede contarse como venta ni como mesa activa (recomendacion aceptada).
alter table public.pos_tables drop constraint if exists pos_tables_status_check;
alter table public.pos_tables
  add constraint pos_tables_status_check
  check (status = any (array['libre','pendiente_pago','esperando','comiendo','reservada']));

-- ── 4. Lista de espera ─────────────────────────────────────────────────────
create table if not exists public.pos_reservation_waitlist (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  branch_id    uuid not null,
  nombre       text not null,
  telefono     text,
  personas     integer not null default 2,
  zona         text,
  notas        text,
  estado       text not null default 'esperando'
               check (estado = any (array['esperando','sentado','se_fue'])),
  desde        timestamptz not null default now(),
  sentado_at   timestamptz,
  table_id     text references public.pos_tables(id) on delete set null,
  created_by   text,
  created_at   timestamptz default now()
);

-- ── 5. Que las busquedas del dia no recorran toda la tabla ─────────────────
create index if not exists ix_reservas_dia
  on public.pos_reservations (branch_id, reserved_at)
  where status <> 'cancelada';
create index if not exists ix_reservas_mesa
  on public.pos_reservations (table_id, reserved_at)
  where status = any (array['pendiente','confirmada','sentada']);
create index if not exists ix_espera_abierta
  on public.pos_reservation_waitlist (branch_id, desde)
  where estado = 'esperando';

-- ── 6. Aislamiento: cada restaurante ve solo lo suyo ───────────────────────
alter table public.pos_reservation_waitlist enable row level security;
drop policy if exists aislar_pos_reservation_waitlist on public.pos_reservation_waitlist;
create policy aislar_pos_reservation_waitlist on public.pos_reservation_waitlist
  for all
  using      (tenant_id = ((auth.jwt() -> 'user_metadata' ->> 'tenant_id'))::uuid)
  with check (tenant_id = ((auth.jwt() -> 'user_metadata' ->> 'tenant_id'))::uuid);

-- Las tablas nuevas NO heredan permisos: hay que darlos a mano o las Edge
-- Functions se quedan fuera (nos paso con las tablas de la pagina de clientes).
grant select, insert, update, delete on public.pos_reservation_waitlist to authenticated, service_role;

-- ── 7. Aviso de no-show, para que el sistema PREGUNTE (nunca decida solo) ───
-- Sergio: "siempre a mano, pero automaticamente saldra un aviso si el cliente
-- no se presento para poder confirmar liberarla".
create or replace function public.fn_reservas_sin_llegar(p_branch uuid, p_minutos integer default 20)
returns table (
  id uuid, customer_name text, customer_phone text, party_size integer,
  reserved_at timestamptz, table_id text, minutos_tarde integer
)
language sql stable security definer set search_path = public as $$
  select r.id, r.customer_name, r.customer_phone, r.party_size,
         r.reserved_at, r.table_id,
         floor(extract(epoch from (now() - r.reserved_at)) / 60)::int
    from public.pos_reservations r
   where r.branch_id = p_branch
     and r.status in ('pendiente','confirmada')
     and r.reserved_at < now() - make_interval(mins => p_minutos)
     and r.reserved_at > now() - interval '12 hours'
   order by r.reserved_at;
$$;
grant execute on function public.fn_reservas_sin_llegar(uuid, integer) to authenticated, service_role;
