-- La entrega del efectivo del domiciliario — 30-ago-2026
--
-- POR QUE: hoy el domiciliario cobra en efectivo y esa plata queda en su
-- bolsillo sin dejar rastro. Medido en El Parche: 69 domicilios en efectivo en
-- 60 dias, ~$120.000 por noche. Si manana faltan $40.000 no hay donde mirar.
--
-- LA REGLA (de Sergio): el domiciliario NO puede poner su propia cuenta en
-- ceros. Solo mira lo que debe. Quien confirma es quien de verdad recibe la
-- plata: la cajera.
--
-- SE GUARDA POR PEDIDO, no un monto suelto: asi la entrega parcial sale sola
-- y siempre se sabe CUAL plata llego y cual no.

create table if not exists public.pos_domi_entregas (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  branch_id        uuid not null,
  session_id       uuid,          -- turno de caja en que se recibio
  -- QUIEN TRAIA LA PLATA. Dos formas de operar, las dos reales:
  --   interno  -> domiciliario_id (pos_users.id)
  --   externo  -> empresa + movil (El Parche opera asi: 157 de 157)
  custodio_tipo    text not null default 'interno',
  domiciliario_id  uuid,
  empresa_id       uuid,
  movil            text,
  custodio_nombre  text,          -- como se le enseña a la cajera
  -- QUIEN RECIBIO. El id del usuario con la sesion abierta (auth), no un
-- texto escrito a mano, y su nombre tal como sale en Caja.
  recibido_por     uuid,
  recibido_nombre  text,
  monto            numeric not null default 0,
  nota             text,          -- si hubo un faltante, aqui se explica
  recibido_at      timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

-- El pedido apunta a la entrega que lo cubrio. NULL = esa plata sigue en la
-- calle. Es el mismo dato que la columna vieja `domi_entregado_caja`, que
-- existe desde antes y NO la usa ni una linea de codigo; se mantienen las dos
-- en el mismo sentido para que nadie lea la vieja y crea otra cosa.
alter table public.pos_orders
  add column if not exists domi_entrega_id uuid;

create index if not exists idx_orders_domi_pendiente
  on public.pos_orders (branch_id, channel)
  where domi_entrega_id is null;

create index if not exists idx_domi_entregas_branch
  on public.pos_domi_entregas (branch_id, recibido_at desc);

create index if not exists idx_domi_entregas_domi
  on public.pos_domi_entregas (domiciliario_id, recibido_at desc);

-- Aislamiento entre restaurantes: el mismo criterio que todas las demas tablas.
alter table public.pos_domi_entregas enable row level security;

drop policy if exists aislar_pos_domi_entregas on public.pos_domi_entregas;
create policy aislar_pos_domi_entregas on public.pos_domi_entregas
  for all
  using (current_tenant_id() = tenant_id)
  with check (current_tenant_id() = tenant_id);

grant select, insert, update on public.pos_domi_entregas to authenticated;
