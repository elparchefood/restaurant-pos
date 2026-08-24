-- ═══════════════════════════════════════════════════════════════════════════
--  EL PIN DEL ADMINISTRADOR, DE VERDAD PROTEGIDO  (24-ago-2026)
-- ───────────────────────────────────────────────────────────────────────────
--  Sergio: *"el PIN no lo debe ver nadie que sepa programar, es decir ni
--  siquiera tú deberías poder verlo internamente. Porque si no, cualquier
--  persona con una inteligencia artificial simplemente ingresa, ve el código y
--  averigua el PIN y roba al restaurante"*.
--
--  Tenía razón, y el problema era peor de lo que yo le había dicho. Yo afirmé
--  que el PIN "se comprueba contra la base". **Es falso.** El sistema se traía
--  el PIN hasta el computador y lo comparaba EN LA PANTALLA:
--
--      var q = sb.from('pos_users').select('pin').eq('is_authorized_admin', true)
--      ...
--      if (String(row.pin).trim() !== String(entered).trim()) { ...
--
--  Tres agujeros a la vez:
--    1. El PIN viajaba al computador de quien lo iba a usar.
--    2. La única política de `pos_users` es `current_tenant_id() = tenant_id`,
--       o sea que **cualquier empleado del restaurante podía leer la ficha de
--       los demás, PIN incluido**. Un cajero podía consultarlo a mano.
--    3. La comparación ocurría en la pantalla, así que ni siquiera hacía falta
--       saberlo: bastaba saltarse esa línea.
--
--  ── CÓMO QUEDA ──────────────────────────────────────────────────────────
--  · El PIN **ya no se guarda**. Se guarda su huella (bcrypt, con sal). De una
--    huella no se puede volver al PIN: ni yo, ni quien lea la base, ni quien se
--    robe una copia de seguridad. Solo se puede comprobar si un PIN la produce.
--  · Vive en **otra tabla**, cerrada a todo el mundo. Ni `anon` ni
--    `authenticated` pueden ni mirarla. Solo entran las dos funciones de abajo.
--  · La comprobación ocurre **en el servidor**. La pantalla manda lo que
--    escribieron y recibe sí o no. El PIN nunca baja.
--
--  ── POR QUÉ EN OTRA TABLA Y NO ESCONDIENDO LA COLUMNA ───────────────────
--  Se puede quitar el permiso de leer UNA columna. Pero cinco pantallas piden
--  la ficha completa (`select('*')` en dashboard y configuración), y Postgres
--  falla el `select *` entero si una de las columnas está negada. Habría
--  cambiado cinco consultas y dejado una trampa para la sexta que alguien
--  escriba mañana. Sacando el dato a otra tabla, `select('*')` sigue
--  funcionando y no hay nada que recordar.
--
--  ── EL FRENO A LA FUERZA BRUTA ──────────────────────────────────────────
--  Un PIN de 4 dígitos son 10.000 combinaciones: un programa las prueba todas
--  en minutos. Poner la comprobación en el servidor SIN freno habría cambiado
--  un agujero por otro. Se sigue el mismo patrón de `pos_web_intentos` (20-ago).
--
--  **5 fallos y se bloquea 15 minutos**, no una hora. La primera versión
--  bloqueaba una hora y eso es peor que el problema que resuelve: el dueño que
--  se equivoca cinco veces en pleno servicio se queda sin poder autorizar un
--  descuento hasta la noche, con el cliente esperando en la caja. Y no hace
--  falta: a 5 intentos cada 15 minutos, probar las 10.000 combinaciones tomaría
--  **más de veinte días sin parar**. La seguridad que se gana con la hora es
--  ninguna; el daño en la operación, real.
--
--  ── Y EL RASTRO ─────────────────────────────────────────────────────────
--  El PIN nunca va a impedir un robo del todo: quien lo sepa, lo sabe. Lo que
--  de verdad protege es que cada anulación y cada descuento queden con NOMBRE
--  y hora. Hoy el pedido guarda el descuento y el motivo, pero **no quién lo
--  autorizó**, y no existe ninguna tabla de auditoría en todo el sistema.
--
--  ── MIGRACIÓN ───────────────────────────────────────────────────────────
--  Hay UN solo PIN en todo el sistema (el de Sergio, 4 dígitos). Se le calcula
--  la huella y se borra el original. Su PIN sigue siendo el mismo: no tiene que
--  aprenderse otro.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── 1) Dónde vive la huella ────────────────────────────────────────────────
create table if not exists public.pos_pines (
  user_id     uuid primary key references public.pos_users(id) on delete cascade,
  tenant_id   uuid not null,
  branch_id   uuid,
  pin_hash    text not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

create index if not exists ix_pos_pines_tenant on public.pos_pines (tenant_id, branch_id);

--  CERRADA A TODO EL MUNDO. No hay política que valga: sin `grant`, ninguna
--  sesión de navegador puede tocarla ni para mirar. Se entra solo por las
--  funciones de abajo, que corren con permisos propios.
alter table public.pos_pines enable row level security;
revoke all on public.pos_pines from public, anon, authenticated;
grant all on public.pos_pines to service_role;

comment on table public.pos_pines is
  'La HUELLA del PIN de administrador, nunca el PIN. Cerrada a las sesiones de navegador a proposito: se entra solo por fn_pin_definir y fn_pin_verificar. No abrirle permisos a authenticated.';

-- ── 2) Los intentos, para frenar la fuerza bruta ───────────────────────────
create table if not exists public.pos_pin_intentos (
  id         bigserial primary key,
  tenant_id  uuid not null,
  quien      uuid not null,
  acerto     boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists ix_pin_intentos on public.pos_pin_intentos (quien, created_at desc);

alter table public.pos_pin_intentos enable row level security;
revoke all on public.pos_pin_intentos from public, anon, authenticated;
grant all on public.pos_pin_intentos to service_role;

-- ── 3) El rastro: quién autorizó qué ───────────────────────────────────────
create table if not exists public.pos_autorizaciones (
  id         bigserial primary key,
  tenant_id  uuid not null,
  branch_id  uuid,
  quien      uuid,                    -- la cuenta que estaba usando el sistema
  quien_nombre text,                  -- copiado al momento: si borran la ficha, el rastro queda
  accion     text not null,           -- 'anulacion' | 'descuento' | otra
  order_id   uuid,
  monto      numeric,
  motivo     text,
  created_at timestamptz not null default now()
);

create index if not exists ix_autorizaciones on public.pos_autorizaciones (tenant_id, created_at desc);

alter table public.pos_autorizaciones enable row level security;

--  Esta SÍ se puede leer, pero solo el propio restaurante y solo para MIRAR.
--  Nadie puede cambiarla ni borrar una fila desde una pantalla: un rastro que
--  el interesado puede borrar no es un rastro.
drop policy if exists "autorizaciones: las ve su restaurante" on public.pos_autorizaciones;
create policy "autorizaciones: las ve su restaurante"
  on public.pos_autorizaciones for select
  to authenticated
  using (tenant_id = public.current_tenant_id());

revoke all on public.pos_autorizaciones from public, anon, authenticated;
grant select on public.pos_autorizaciones to authenticated;
grant all on public.pos_autorizaciones to service_role;
grant usage, select on sequence public.pos_autorizaciones_id_seq to service_role;

comment on table public.pos_autorizaciones is
  'Quien autorizo cada anulacion y cada descuento, con hora y monto. Solo lectura desde el navegador: se escribe por fn_pin_verificar. Un rastro que el interesado puede borrar no es un rastro.';

-- ── 4) Poner o cambiar el PIN ──────────────────────────────────────────────
--  Solo el dueño o el administrador del restaurante, y solo sobre fichas de SU
--  restaurante. Devuelve true/false; nunca devuelve nada del PIN.
create or replace function public.fn_pin_definir(p_pin text, p_user uuid default null)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_tenant uuid := public.current_tenant_id();
  v_yo     uuid := auth.uid();
  v_puede  boolean;
  v_branch uuid;
begin
  if v_tenant is null or v_yo is null then return false; end if;

  --  Un PIN de menos de 4 digitos no es un PIN. Y solo digitos: el teclado de
  --  la pantalla de cobro solo tiene numeros, una letra dejaria a alguien sin
  --  poder escribir su propio PIN.
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then return false; end if;

  --  Quien lo pone tiene que ser dueno o administrador DE ESTE restaurante.
  select exists (
    select 1 from pos_users u
     where (u.auth_user_id = v_yo or u.id = v_yo)
       and u.tenant_id = v_tenant
       and (u.is_authorized_admin = true or u.role = 'gerente')
  ) into v_puede;
  if not v_puede then return false; end if;

  --  Sin decir a quien, se le pone al administrador de ESTE restaurante, que
  --  es el caso normal desde Configuracion. Asi la pantalla no tiene que
  --  averiguar ids: pedirselos seria darle mas de lo que necesita saber.
  if p_user is null then
    select u.id, u.branch_id into p_user, v_branch
      from pos_users u
     where u.tenant_id = v_tenant and u.is_authorized_admin = true
     order by (u.branch_id is not distinct from (select branch_id from pos_users where (auth_user_id = v_yo or id = v_yo) limit 1)) desc
     limit 1;
    if p_user is null then return false; end if;
  else
    --  Y si se dice, la ficha tiene que ser de este restaurante.
    select u.branch_id into v_branch
      from pos_users u where u.id = p_user and u.tenant_id = v_tenant;
    if not found then return false; end if;
  end if;

  insert into pos_pines (user_id, tenant_id, branch_id, pin_hash, updated_at, updated_by)
  values (p_user, v_tenant, v_branch, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), now(), v_yo)
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash, branch_id = excluded.branch_id,
        updated_at = now(), updated_by = v_yo;

  return true;
end;
$function$;

revoke all on function public.fn_pin_definir(text, uuid) from public, anon;
grant execute on function public.fn_pin_definir(text, uuid) to authenticated;

-- ── 5) Comprobar el PIN ────────────────────────────────────────────────────
--  Recibe lo que escribieron y responde sí o no. El PIN no baja nunca.
--  De paso deja el rastro de quién autorizó qué.
create or replace function public.fn_pin_verificar(
  p_pin text, p_accion text default null, p_order uuid default null,
  p_monto numeric default null, p_motivo text default null)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_tenant uuid := public.current_tenant_id();
  v_yo     uuid := auth.uid();
  v_fallos int;
  v_ok     boolean := false;
  v_branch uuid;
  v_nombre text;
begin
  if v_tenant is null or v_yo is null then return false; end if;

  --  EL FRENO. 5 fallos en la ultima hora y no se le vuelve a mirar el PIN
  --  hasta que pase esa hora. Sin esto, poner la comprobacion en el servidor
  --  seria cambiar un agujero por otro: 10.000 combinaciones se prueban solas.
  select count(*) into v_fallos
    from pos_pin_intentos
   where quien = v_yo and acerto = false and created_at > now() - interval '15 minutes';
  if v_fallos >= 5 then
    insert into pos_pin_intentos (tenant_id, quien, acerto) values (v_tenant, v_yo, false);
    return false;
  end if;

  --  Se compara CONTRA LA HUELLA, aqui dentro. `crypt` vuelve a calcularla con
  --  la misma sal y mira si coincide; del lado de la pantalla nunca hay nada
  --  que leer.
  select true into v_ok
    from pos_pines p
    join pos_users u on u.id = p.user_id
   where p.tenant_id = v_tenant
     and u.is_authorized_admin = true
     and p.pin_hash = extensions.crypt(p_pin, p.pin_hash)
   limit 1;

  v_ok := coalesce(v_ok, false);
  insert into pos_pin_intentos (tenant_id, quien, acerto) values (v_tenant, v_yo, v_ok);

  --  La limpieza va aqui y no en una tarea programada: los intentos viejos no
  --  le sirven a nadie y asi la tabla no crece sola para siempre.
  delete from pos_pin_intentos where created_at < now() - interval '7 days';

  --  EL RASTRO. Solo cuando acerto y cuando de verdad venia a autorizar algo.
  if v_ok and p_accion is not null then
    select u.branch_id, u.name into v_branch, v_nombre
      from pos_users u
     where (u.auth_user_id = v_yo or u.id = v_yo) and u.tenant_id = v_tenant
     limit 1;
    insert into pos_autorizaciones (tenant_id, branch_id, quien, quien_nombre, accion, order_id, monto, motivo)
    values (v_tenant, v_branch, v_yo, v_nombre, p_accion, p_order, p_monto, p_motivo);
  end if;

  return v_ok;
end;
$function$;

revoke all on function public.fn_pin_verificar(text, text, uuid, numeric, text) from public, anon;
grant execute on function public.fn_pin_verificar(text, text, uuid, numeric, text) to authenticated;

-- ── 6) ¿Hay PIN puesto? ────────────────────────────────────────────────────
--  La pantalla necesita saberlo para avisar "todavia no has puesto tu PIN", y
--  la puesta en marcha lo usa como uno de sus pasos. Responde si o no; no dice
--  cual ni deja adivinar nada.
create or replace function public.fn_pin_existe()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from pos_pines p
      join pos_users u on u.id = p.user_id
     where p.tenant_id = public.current_tenant_id()
       and u.is_authorized_admin = true
  )
$function$;

revoke all on function public.fn_pin_existe() from public, anon;
grant execute on function public.fn_pin_existe() to authenticated;

-- ── 7) Mudar el PIN que ya existe, y BORRAR EL ORIGINAL ────────────────────
--  Hay uno solo en todo el sistema. Su dueño sigue usando el mismo numero.
--  ENVUELTO EN UNA COMPROBACIÓN para que este archivo se pueda volver a
--  ejecutar. Sin esto, la segunda vez falla —"column u.pin does not exist"— y
--  se queda a medias justo antes de los cambios que vengan después. Una
--  migración que solo corre una vez es una trampa para el día que alguien
--  reconstruya la base desde cero.
do $mudanza$
begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='pos_users' and column_name='pin') then

    insert into public.pos_pines (user_id, tenant_id, branch_id, pin_hash)
    select u.id, u.tenant_id, u.branch_id,
           extensions.crypt(trim(u.pin), extensions.gen_salt('bf', 10))
      from public.pos_users u
     where coalesce(trim(u.pin), '') <> ''
    on conflict (user_id) do nothing;

    --  Y AHORA SÍ, DESAPARECE. Mientras la columna exista con el numero
    --  dentro, no hemos hecho nada: sigue estando a la vista de cualquier
    --  empleado.
    alter table public.pos_users drop column pin;
  end if;
end
$mudanza$;
