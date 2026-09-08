-- ═══════════════════════════════════════════════════════════════════════════
--  EL COBRO DE QUIEN TODAVÍA NO ES CLIENTE (7-sep-2026)
--
--  Al registrarse, el restaurante **todavía no existe**: `tenants` se crea al
--  aprobar. Pero el pago ocurre ANTES — es lo que dispara la aprobación.
--
--  Así que la fuente de pago y el cobro tienen que poder colgar de la
--  SOLICITUD mientras no haya restaurante, y mudarse a él cuando se cree.
--
--  Sergio, 7-sep, corrigiéndome: *"la aprobación a mano simplemente es una
--  opción más… la cuenta se crea automáticamente con el pago en línea, siempre
--  lo decidí así"*. Y tenía razón: `verificar-pago-plataforma` YA llama a
--  `provision approve` sola cuando encuentra el dinero. Esto solo le tiende el
--  puente a Wompi.
-- ═══════════════════════════════════════════════════════════════════════════

alter table pos_wompi_fuentes alter column tenant_id drop not null;
alter table pos_wompi_cobros  alter column tenant_id drop not null;

alter table pos_wompi_fuentes
  add column if not exists registration_id uuid references pos_registrations(id) on delete cascade;
alter table pos_wompi_cobros
  add column if not exists registration_id uuid references pos_registrations(id) on delete cascade;

/*  Una fila tiene que colgar de ALGO: o de un restaurante, o de una solicitud.
    Sin esto podría quedar una fuente de pago huérfana — un medio de pago
    guardado que no es de nadie, que es justo lo que no se puede permitir. */
alter table pos_wompi_fuentes drop constraint if exists ck_wompi_fuente_dueno;
alter table pos_wompi_fuentes add constraint ck_wompi_fuente_dueno
  check (tenant_id is not null or registration_id is not null);

alter table pos_wompi_cobros drop constraint if exists ck_wompi_cobro_dueno;
alter table pos_wompi_cobros add constraint ck_wompi_cobro_dueno
  check (tenant_id is not null or registration_id is not null);

/*  Una sola fuente activa POR SOLICITUD también: si alguien se equivoca de
    tarjeta y vuelve a intentar, la anterior se apaga igual que en el otro
    caso. El índice de tenant ya existía y no cambia.                     */
create unique index if not exists ux_wompi_fuente_activa_reg
  on pos_wompi_fuentes (registration_id) where activa and registration_id is not null;

create index if not exists ix_wompi_fuentes_reg on pos_wompi_fuentes (registration_id);
create index if not exists ix_wompi_cobros_reg  on pos_wompi_cobros  (registration_id);

/*  Y quien se está registrando todavía no tiene `tenant_id` en su sesión, así
    que la política de "ve lo suyo" no lo cubriría. Ve lo que cuelga de SU
    solicitud, que se reconoce por el usuario que la creó.                */
drop policy if exists wompi_fuentes_ve_lo_suyo on pos_wompi_fuentes;
create policy wompi_fuentes_ve_lo_suyo on pos_wompi_fuentes
  for select to authenticated
  using (
    tenant_id = current_tenant_id()
    or es_admin_plataforma()
    or registration_id in (select id from pos_registrations where user_id = auth.uid())
  );

drop policy if exists wompi_cobros_ve_lo_suyo on pos_wompi_cobros;
create policy wompi_cobros_ve_lo_suyo on pos_wompi_cobros
  for select to authenticated
  using (
    tenant_id = current_tenant_id()
    or es_admin_plataforma()
    or registration_id in (select id from pos_registrations where user_id = auth.uid())
  );
