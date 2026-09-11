-- ═══════════════════════════════════════════════════════════════════════════
--  EL EXTINTOR: "cobrar por transferencia esta vez" (11-sep-2026)
--
--  Decision de Sergio (PLAN-COBRO-SUSCRIPCIONES.md §1): todo se cobra por
--  Wompi y la transferencia NO se ofrece. Queda como extintor: un boton en su
--  panel que la enciende para UN cliente y UN pago. Sirve en tres casos que
--  el mismo escogio: cuenta suspendida, cliente al dia, y cliente nuevo.
--
--  · `transferencia_ok_at` en tenants y en pos_registrations: encendida
--    desde cuando (y quien la encendio). NULL = apagada.
--  · Se apaga SOLA al aprobarse un pago (es "esta vez", no para siempre).
--  · pos_pagos_suscripcion gana las columnas del lector (las mismas que ya
--    tiene pos_registrations) para que el lector de siempre la revise sola.
-- ═══════════════════════════════════════════════════════════════════════════

alter table tenants
  add column if not exists transferencia_ok_at  timestamptz,
  add column if not exists transferencia_ok_por uuid;

alter table pos_registrations
  add column if not exists transferencia_ok_at  timestamptz,
  add column if not exists transferencia_ok_por uuid;

alter table pos_pagos_suscripcion
  add column if not exists verif_intentos int not null default 0,
  add column if not exists verif_at       timestamptz,
  add column if not exists verif_detalle  text,
  add column if not exists verif_extraido jsonb;

--  Un pago aprobado APAGA el permiso: "esta vez" es una vez. Sin esto el
--  cliente seguiria pudiendo pagar por transferencia todos los meses, que es
--  justo lo que Sergio no quiere ("se olvidan y se salen").
create or replace function fn_pago_apaga_transferencia()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or coalesce(old.status, '') <> 'approved') then
    update tenants set transferencia_ok_at = null, transferencia_ok_por = null
     where id = new.tenant_id and transferencia_ok_at is not null;
  end if;
  return new;
end $$;

drop trigger if exists trg_pago_apaga_transferencia on pos_pagos_suscripcion;
create trigger trg_pago_apaga_transferencia
  after insert or update of status on pos_pagos_suscripcion
  for each row execute function fn_pago_apaga_transferencia();

--  pos_registrations deja INSERTAR a cualquiera (asi se registra la gente).
--  Sin esto, quien se registra podria mandar el permiso encendido de fabrica.
--  Solo Sergio (admin de plataforma) o el servidor lo encienden.
create or replace function fn_registro_sin_permiso_propio()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not es_admin_plataforma() and coalesce(auth.role(), '') <> 'service_role' then
    new.transferencia_ok_at  := null;
    new.transferencia_ok_por := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_registro_sin_permiso_propio on pos_registrations;
create trigger trg_registro_sin_permiso_propio
  before insert on pos_registrations
  for each row execute function fn_registro_sin_permiso_propio();

--  El reloj de cobro lee esta vista: con la columna al final, sabe a quien NO
--  cobrarle por Wompi este periodo (ya va a pagar por transferencia).
create or replace view v_suscripciones_por_vencer as
 select id as tenant_id, name, plan, status, periodo_inicio, periodo_fin, saldo_favor,
        (periodo_fin - ((now() at time zone 'America/Bogota'))::date) as dias_para_vencer,
        transferencia_ok_at
   from tenants t
  where periodo_fin is not null
  order by periodo_fin;
