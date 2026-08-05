-- ═══════════════════════════════════════════════════════════════════════════
-- SALDO RECARGABLE DEL CLIENTE — los cimientos
-- ───────────────────────────────────────────────────────────────────────────
-- Regla de plata decidida con Sergio, y es la que manda sobre todo lo demás:
--
--   UNA RECARGA NO ES UNA VENTA.
--
-- Es dinero que el cliente entrega por adelantado y que el restaurante le DEBE.
-- Se vuelve venta cuando el cliente consume. Si entrara a ventas, los informes
-- mostrarían plata que no se ha ganado y se pagaría impuesto sobre ella. Es la
-- misma lógica del domicilio, que tampoco se suma a ventas.
--
-- Por eso el saldo NO vive en pos_orders ni en pos_payments: vive aquí, con su
-- propio libro de movimientos.
--
-- Las otras tres reglas acordadas:
--   · No se devuelve en efectivo. Solo se consume en el restaurante, y se le
--     dice al cliente ANTES de que pague.
--   · No vence nunca. Es plata suya. (Los puntos y el XP sí caducan a los 6
--     meses: eso es un premio, no plata.)
--   · Se aprueba sola con el mismo verificador de comprobantes del chat. Si no
--     cuadra, queda pendiente de revisión — NO se acredita.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── El saldo de cada cliente ───────────────────────────────────────────────
-- Una fila por cliente. El saldo es un CACHÉ del libro: la verdad son los
-- movimientos, y esta columna existe para no sumar la historia entera cada vez
-- que alguien abre la página.
create table if not exists public.pos_saldo (
  tenant_id  uuid not null,
  cliente_id uuid not null references public.pos_clientes(id) on delete cascade,
  saldo      bigint not null default 0 check (saldo >= 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, cliente_id)
);

comment on table public.pos_saldo is
  'Saldo prepagado de cada cliente. NO es venta: es plata que el restaurante le debe hasta que la consuma.';

-- ── El libro ───────────────────────────────────────────────────────────────
-- Cada movimiento, con su motivo y su respaldo. Sin esto no hay forma de
-- explicarle a un cliente por qué su saldo es el que es, ni de cuadrar la
-- plata recibida por adelantado al cierre del mes.
create table if not exists public.pos_saldo_mov (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  branch_id  uuid,
  cliente_id uuid not null references public.pos_clientes(id) on delete cascade,
  -- recarga: entra plata · consumo: la gasta en un pedido
  -- ajuste: corrección a mano del dueño · anulacion: se revierte una recarga
  motivo     text not null check (motivo in ('recarga','consumo','ajuste','anulacion')),
  -- Positivo suma, negativo resta. Se guarda el signo y no un tipo aparte:
  -- así sumar la columna da el saldo, sin condiciones.
  monto      bigint not null check (monto <> 0),
  saldo_post bigint not null,          -- cómo quedó, para poder auditar sin recalcular
  order_id   uuid references public.pos_orders(id) on delete set null,
  -- La referencia del banco, ya limpia. Sirve para el mismo candado que los
  -- pedidos: un comprobante no puede usarse dos veces.
  referencia text,
  detalle    text,
  quien      uuid,                     -- si lo hizo alguien del restaurante
  created_at timestamptz not null default now()
);

create index if not exists ix_saldo_mov_cliente on public.pos_saldo_mov (tenant_id, cliente_id, created_at desc);
-- Una referencia del banco NO se puede usar dos veces en el mismo restaurante.
-- Lo obliga la base y no el código: el código se salta desde otra pantalla.
create unique index if not exists ux_saldo_mov_ref
  on public.pos_saldo_mov (tenant_id, referencia) where referencia is not null;

-- ── Mover el saldo ─────────────────────────────────────────────────────────
-- TODO movimiento pasa por aquí. Nadie escribe pos_saldo directamente: si se
-- pudiera, un día el saldo y el libro dirían cosas distintas y no habría forma
-- de saber cuál miente.
create or replace function public.fn_saldo_mover(
  p_tenant uuid, p_cliente uuid, p_motivo text, p_monto bigint,
  p_branch uuid default null, p_order uuid default null,
  p_ref text default null, p_detalle text default null, p_quien uuid default null
) returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_saldo bigint;
begin
  if p_monto = 0 then raise exception 'MONTO_CERO'; end if;

  -- El bloqueo evita que dos recargas a la vez lean el mismo saldo y una pise
  -- a la otra. Con plata de por medio no alcanza con que "casi nunca pasa".
  insert into pos_saldo (tenant_id, cliente_id, saldo)
  values (p_tenant, p_cliente, 0)
  on conflict (tenant_id, cliente_id) do nothing;

  select saldo into v_saldo from pos_saldo
   where tenant_id = p_tenant and cliente_id = p_cliente
     for update;

  v_saldo := v_saldo + p_monto;
  -- Nunca se queda debiendo: si no le alcanza, el cobro no se parte solo.
  if v_saldo < 0 then
    raise exception 'SALDO_INSUFICIENTE|%|%', v_saldo - p_monto, -p_monto;
  end if;

  update pos_saldo set saldo = v_saldo, updated_at = now()
   where tenant_id = p_tenant and cliente_id = p_cliente;

  insert into pos_saldo_mov (tenant_id, branch_id, cliente_id, motivo, monto,
                             saldo_post, order_id, referencia, detalle, quien)
  values (p_tenant, p_branch, p_cliente, p_motivo, p_monto,
          v_saldo, p_order, nullif(btrim(p_ref), ''), p_detalle, p_quien);

  return v_saldo;
end;
$$;

comment on function public.fn_saldo_mover is
  'La ÚNICA forma de mover el saldo. Bloquea la fila, comprueba que no quede en negativo y escribe el libro en la misma operación.';

-- ── Lo que ve el cliente ───────────────────────────────────────────────────
create or replace function public.fn_saldo_cliente(p_tenant uuid, p_cliente uuid)
returns table (saldo bigint, movimientos jsonb)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    coalesce((select s.saldo from pos_saldo s
               where s.tenant_id = p_tenant and s.cliente_id = p_cliente), 0),
    coalesce((
      select jsonb_agg(x order by x->>'fecha' desc)
        from (
          select jsonb_build_object(
                   'fecha',  m.created_at,
                   'motivo', m.motivo,
                   'monto',  m.monto,
                   'saldo',  m.saldo_post,
                   'detalle', m.detalle
                 ) as x
            from pos_saldo_mov m
           where m.tenant_id = p_tenant and m.cliente_id = p_cliente
           order by m.created_at desc
           limit 30
        ) t
    ), '[]'::jsonb);
$$;

-- ── Quién puede tocar esto ─────────────────────────────────────────────────
alter table public.pos_saldo     enable row level security;
alter table public.pos_saldo_mov enable row level security;

-- El restaurante ve el saldo de SUS clientes (la caja necesita cobrarlo).
drop policy if exists pos_saldo_tenant on public.pos_saldo;
create policy pos_saldo_tenant on public.pos_saldo
  for select to authenticated using (tenant_id = public.current_tenant_id());

drop policy if exists pos_saldo_mov_tenant on public.pos_saldo_mov;
create policy pos_saldo_mov_tenant on public.pos_saldo_mov
  for select to authenticated using (tenant_id = public.current_tenant_id());

-- Escribir, SOLO por la función. Ni el cajero ni la página tocan estas tablas:
-- es plata, y una escritura suelta descuadra el libro sin dejar rastro.
grant select on public.pos_saldo, public.pos_saldo_mov to authenticated;
grant select, insert, update on public.pos_saldo, public.pos_saldo_mov to service_role;
grant execute on function public.fn_saldo_mover(uuid,uuid,text,bigint,uuid,uuid,text,text,uuid) to service_role;
grant execute on function public.fn_saldo_cliente(uuid,uuid) to service_role, authenticated;
