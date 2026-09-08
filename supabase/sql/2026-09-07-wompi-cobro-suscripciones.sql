-- ═══════════════════════════════════════════════════════════════════════════
--  EL COBRO DE LAS SUSCRIPCIONES DE COBRA (Wompi) — 7-sep-2026
--
--  Tres tablas, y cada una existe por una razón distinta:
--
--    pos_wompi_fuentes   con qué se le cobra a cada restaurante
--    pos_wompi_cobros    cada intento de cobro, con su barrera anti-doble
--    pos_wompi_avisos    qué avisos ya se mandaron, para no repetirlos
--
--  El diseño completo (por qué débito automático, por qué la transferencia no
--  se ofrece, y el calendario de avisos) está en PLAN-COBRO-SUSCRIPCIONES.md.
--
--  ⚠️ NINGUNA de estas tablas se escribe desde el navegador. Todo lo escribe
--  la Edge Function con la llave de servicio. Desde el navegador solo se LEE,
--  y solo lo propio — para que un restaurante pueda ver "tu tarjeta ***4242"
--  en su panel sin poder tocar nada.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. LA FUENTE DE PAGO ───────────────────────────────────────────────────
/*  Lo que Wompi llama "payment source": el medio de pago que el restaurante
    autorizó UNA vez y que después se puede cobrar sin que esté presente.

    `ultimos4` y `marca` NO son adorno: son lo que dice el aviso de "el 18 se
    cobrará tu plan, ten saldo en tu tarjeta ***4242". Se guardan al inscribir
    porque después no hay de dónde sacarlos — Wompi solo los devuelve en ese
    momento.                                                                 */
create table if not exists pos_wompi_fuentes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  fuente_id   bigint not null,              -- el payment_source_id de Wompi
  tipo        text   not null,              -- CARD | NEQUI | BANCOLOMBIA_TRANSFER | DAVIPLATA
  ultimos4    text,
  marca       text,                         -- VISA, Mastercard, Nequi…
  correo      text   not null,              -- el customer_email con el que se creó
  estado      text   not null default 'AVAILABLE',
  activa      boolean not null default true,
  created_at  timestamptz not null default now(),
  anulada_at  timestamptz,
  anulada_por text
);

/*  UNA sola fuente activa por restaurante. Si inscribe otra tarjeta, la
    anterior se marca inactiva primero. Sin esto, dos fuentes activas =
    dos cobros el mismo mes, y el índice es más barato que descubrirlo. */
create unique index if not exists ux_wompi_fuente_activa
  on pos_wompi_fuentes (tenant_id) where activa;

create index if not exists ix_wompi_fuentes_tenant on pos_wompi_fuentes (tenant_id);


-- ── 2. LOS COBROS ──────────────────────────────────────────────────────────
/*  Un renglón por INTENTO, no por mes: el plan de Sergio reintenta a 1, 3 y 7
    días, y hay que poder ver los tres.

    ⚠️ `referencia` ES LA BARRERA CONTRA EL COBRO DOBLE, y por eso es única
    aquí Y en Wompi. Se arma sola y siempre igual:
        cobra-<tenant>-<periodo_fin>-<intento>
    Si el reloj se dispara dos veces, o alguien le da al botón dos veces, el
    segundo intento choca contra este índice y no sale a internet. Es la misma
    idea que `reference_code` en la facturación: la idempotencia se pone en la
    base, no en la buena memoria del código.                                */
create table if not exists pos_wompi_cobros (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  referencia    text not null unique,
  periodo_fin   date not null,              -- qué periodo está pagando
  intento       smallint not null default 1,
  monto         integer not null,           -- en PESOS, no en centavos
  plan          text,
  periodo       text,                       -- mensual | trimestral | anual
  fuente_id     bigint,
  transaccion_id text,
  estado        text not null default 'PENDIENTE',   -- PENDIENTE|APROBADO|RECHAZADO|ERROR
  motivo        text,                       -- lo que contestó Wompi si falló
  created_at    timestamptz not null default now(),
  resuelto_at   timestamptz
);

create index if not exists ix_wompi_cobros_tenant  on pos_wompi_cobros (tenant_id, created_at desc);
create index if not exists ix_wompi_cobros_estado  on pos_wompi_cobros (estado) where estado = 'PENDIENTE';
create index if not exists ix_wompi_cobros_tx      on pos_wompi_cobros (transaccion_id);


-- ── 3. LOS AVISOS ──────────────────────────────────────────────────────────
/*  7, 3 y 1 día ANTES del cobro; y 1, 3 y 7 días DESPUÉS si falló.

    La llave primaria es la idempotencia: (restaurante, periodo, clase). El
    reloj puede correr diez veces al día — el mismo aviso no sale dos veces
    porque la segunda inserción choca. Sin esto, un reloj nervioso convierte
    un recordatorio amable en acoso.                                       */
create table if not exists pos_wompi_avisos (
  tenant_id   uuid not null references tenants(id) on delete cascade,
  periodo_fin date not null,
  clase       text not null,   -- antes_7 | antes_3 | antes_1 | fallo_1 | fallo_3 | fallo_7 | bloqueo
  canal       text,            -- whatsapp | correo
  enviado_at  timestamptz not null default now(),
  primary key (tenant_id, periodo_fin, clase)
);


-- ── PERMISOS ───────────────────────────────────────────────────────────────
/*  ⚠️ GRANT y POLÍTICA son cosas distintas y se confunden. La facturación se
    creó con RLS y políticas correctas y sin un solo GRANT, y falló muda desde
    el primer día. Aquí van los dos.                                        */
alter table pos_wompi_fuentes enable row level security;
alter table pos_wompi_cobros  enable row level security;
alter table pos_wompi_avisos  enable row level security;

/*  ⚠️ PRIMERO SE QUITA LO QUE SUPABASE REGALA. Toda tabla nueva nace con
    permiso de INSERT y UPDATE para `authenticated`, así que un `grant select`
    no restringe nada: suma sobre lo que ya estaba. Comprobado el 7-sep — las
    tres tablas nacieron con INSERT y UPDATE para el navegador.

    Hoy RLS lo tapa (no hay política de escritura, y sin política no pasa
    nada). Pero eso deja UNA sola cosa entre un restaurante y darse por
    pagado. Dos son mejor que una.                                         */
revoke insert, update, delete, truncate on pos_wompi_fuentes from authenticated, anon;
revoke insert, update, delete, truncate on pos_wompi_cobros  from authenticated, anon;
revoke all                               on pos_wompi_avisos from authenticated, anon;

grant select on pos_wompi_fuentes to authenticated;
grant select on pos_wompi_cobros  to authenticated;
grant select, insert, update, delete on pos_wompi_fuentes to service_role;
grant select, insert, update, delete on pos_wompi_cobros  to service_role;
grant select, insert, update, delete on pos_wompi_avisos  to service_role;

/*  Cada restaurante ve LO SUYO; el administrador de plataforma lo ve todo.
    Nadie escribe desde el navegador: las fuentes de pago y los cobros solo
    los toca el servidor, con su llave. Un restaurante que pudiera escribir
    aquí podría darse por pagado.                                          */
drop policy if exists wompi_fuentes_ve_lo_suyo on pos_wompi_fuentes;
create policy wompi_fuentes_ve_lo_suyo on pos_wompi_fuentes
  for select to authenticated
  using (tenant_id = current_tenant_id() or es_admin_plataforma());

drop policy if exists wompi_cobros_ve_lo_suyo on pos_wompi_cobros;
create policy wompi_cobros_ve_lo_suyo on pos_wompi_cobros
  for select to authenticated
  using (tenant_id = current_tenant_id() or es_admin_plataforma());

/*  Los avisos son maquinaria interna: no los ve nadie desde el navegador,
    ni siquiera el dueño del restaurante. No hay política de SELECT a
    propósito — sin política, RLS no deja pasar nada.                      */
