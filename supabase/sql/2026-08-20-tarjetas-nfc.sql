-- Tarjetas fisicas (NFC/RFID) atadas al TELEFONO del cliente, igual que los
-- puntos: si el cliente esta guardado varias veces, la tarjeta apunta a su
-- identidad real, no a una ficha. El uid es lo que el lector "escribe".
create table if not exists pos_tarjetas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  uid text not null,
  telefono text not null,
  activa boolean not null default true,
  detalle text,
  quien uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, uid)
);
alter table pos_tarjetas enable row level security;
-- Mismo aislamiento del resto: cada tenant ve solo lo suyo.
drop policy if exists tarjetas_tenant on pos_tarjetas;
create policy tarjetas_tenant on pos_tarjetas
  using (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid);
grant select, insert, update, delete on pos_tarjetas to authenticated;
revoke all on pos_tarjetas from anon;
