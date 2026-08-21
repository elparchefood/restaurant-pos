-- ══════════════════════════════════════════════════════════════════════
--  FACTURACION ELECTRONICA DIAN — cimientos (21-ago-2026)
--
--  Esta migracion NO habla con ningun proveedor todavia: monta lo que es
--  nuestro y no cambia segun quien nos preste la API (Alanube o Factus).
--
--  LO MAS DELICADO ES EL CONSECUTIVO. Si dos cajas facturan al mismo
--  segundo y las dos toman el numero 501, eso no es un bug: es un problema
--  legal con la DIAN. Por eso el numero SIEMPRE sale de la base con
--  bloqueo de fila, jamas del navegador.
-- ══════════════════════════════════════════════════════════════════════

-- ── 1. La resolucion de la DIAN de cada restaurante ───────────────────
--  Un restaurante puede tener varias a lo largo del tiempo (cuando se le
--  acaba una pide otra), pero solo UNA activa por prefijo.
create table if not exists pos_facturacion_rangos (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  branch_id   uuid,
  resolucion  text not null,              -- numero de resolucion DIAN
  prefijo     text not null default '',   -- ej. 'FE'
  desde       bigint not null,            -- primer numero autorizado
  hasta       bigint not null,            -- ultimo numero autorizado
  actual      bigint not null,            -- ultimo EMITIDO (empieza en desde-1)
  vence_at    date,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint rango_coherente check (hasta >= desde and actual >= desde - 1 and actual <= hasta)
);

-- UNA sola resolucion activa por prefijo y sede: si hubiera dos, el
-- consecutivo se partiria en dos series y ninguna quedaria completa.
create unique index if not exists ux_rango_activo
  on pos_facturacion_rangos (tenant_id, coalesce(branch_id, tenant_id), prefijo)
  where activo;

-- ── 2. Las facturas emitidas ──────────────────────────────────────────
create table if not exists pos_facturas (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  branch_id    uuid,
  order_id     uuid,
  rango_id     uuid references pos_facturacion_rangos(id),
  prefijo      text not null default '',
  numero       bigint not null,
  -- pendiente: aun no sale · enviada: el proveedor la recibio · aceptada:
  -- la DIAN la valido · rechazada: la DIAN dijo que no · anulada: nota credito
  estado       text not null default 'pendiente'
               check (estado in ('pendiente','enviada','aceptada','rechazada','anulada')),
  cufe         text,                      -- el sello unico que devuelve la DIAN
  total        bigint not null default 0,
  respuesta    jsonb,                     -- lo que contesto el proveedor, tal cual
  intentos     int not null default 0,
  error        text,
  emitida_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- EL NUMERO NO SE REPITE, NUNCA. Es la regla que protege legalmente.
create unique index if not exists ux_factura_numero
  on pos_facturas (tenant_id, prefijo, numero);

-- UN PEDIDO, UNA FACTURA. Si un reintento vuelve a pedir factura para el
-- mismo pedido, la base lo rechaza en vez de emitir dos.
create unique index if not exists ux_factura_pedido
  on pos_facturas (order_id) where order_id is not null and estado <> 'anulada';

create index if not exists ix_facturas_pendientes
  on pos_facturas (tenant_id, estado) where estado in ('pendiente','rechazada');

-- ── 3. EL CONSECUTIVO, con bloqueo ────────────────────────────────────
--  Devuelve el siguiente numero y lo reserva en la misma operacion. Dos
--  llamadas simultaneas NO pueden recibir el mismo: la segunda espera a
--  que la primera termine (FOR UPDATE).
--
--  Si el pedido YA tiene factura, devuelve la que tiene en vez de emitir
--  otra: reintentar no puede duplicar (regla dura del plan).
create or replace function fn_factura_numero(
  p_tenant uuid,
  p_branch uuid,
  p_order  uuid,
  p_total  bigint default 0
) returns table (ok boolean, motivo text, factura_id uuid, prefijo text, numero bigint, quedan bigint)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rango pos_facturacion_rangos%rowtype;
  v_num   bigint;
  v_fac   pos_facturas%rowtype;
begin
  -- ¿Este pedido ya tiene factura viva? Se devuelve esa.
  if p_order is not null then
    select * into v_fac from pos_facturas
     where order_id = p_order and estado <> 'anulada' limit 1;
    if found then
      return query select true, 'ya_existia'::text, v_fac.id, v_fac.prefijo, v_fac.numero, null::bigint;
      return;
    end if;
  end if;

  -- El bloqueo: de aqui al commit, nadie mas toca esta fila.
  select * into v_rango from pos_facturacion_rangos
   where tenant_id = p_tenant
     and activo
     and (branch_id is null or branch_id = p_branch)
   order by branch_id nulls last
   limit 1
   for update;

  if not found then
    return query select false, 'sin_resolucion'::text, null::uuid, null::text, null::bigint, null::bigint;
    return;
  end if;

  v_num := v_rango.actual + 1;

  -- Se acabo el rango autorizado: NO se emite. Pedir otra resolucion a la
  -- DIAN toma dias, por eso mas abajo hay alerta al 90%.
  if v_num > v_rango.hasta then
    return query select false, 'rango_agotado'::text, null::uuid, null::text, null::bigint, 0::bigint;
    return;
  end if;

  update pos_facturacion_rangos set actual = v_num where id = v_rango.id;

  insert into pos_facturas (tenant_id, branch_id, order_id, rango_id, prefijo, numero, total)
  values (p_tenant, p_branch, p_order, v_rango.id, v_rango.prefijo, v_num, coalesce(p_total, 0))
  returning * into v_fac;

  return query select true, 'emitido'::text, v_fac.id, v_fac.prefijo, v_fac.numero,
                      (v_rango.hasta - v_num);
end;
$function$;

-- ── 4. Cuanto rango queda (para la alerta del 90%) ────────────────────
create or replace function fn_factura_rango_estado(p_tenant uuid)
returns table (resolucion text, prefijo text, usados bigint, total bigint, pct numeric, vence_at date)
language sql
security definer
set search_path to 'public'
as $function$
  select r.resolucion, r.prefijo,
         (r.actual - r.desde + 1) as usados,
         (r.hasta - r.desde + 1)  as total,
         round(((r.actual - r.desde + 1)::numeric / nullif(r.hasta - r.desde + 1, 0)) * 100, 1) as pct,
         r.vence_at
    from pos_facturacion_rangos r
   where r.tenant_id = p_tenant and r.activo;
$function$;

-- ── 5. Permisos y aislamiento ─────────────────────────────────────────
alter table pos_facturacion_rangos enable row level security;
alter table pos_facturas           enable row level security;

drop policy if exists fact_rangos_tenant on pos_facturacion_rangos;
create policy fact_rangos_tenant on pos_facturacion_rangos
  using (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid);

drop policy if exists facturas_tenant on pos_facturas;
create policy facturas_tenant on pos_facturas
  using (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid);

grant select on pos_facturacion_rangos to authenticated;
grant select on pos_facturas           to authenticated;
revoke all on pos_facturacion_rangos from anon;
revoke all on pos_facturas           from anon;

-- OJO CON EL PUBLIC: PostgreSQL le da EXECUTE a PUBLIC en toda funcion
-- nueva, y `anon` lo hereda. Quitarselo a anon solo no sirve de nada.
revoke all on function fn_factura_numero(uuid, uuid, uuid, bigint) from public;
revoke all on function fn_factura_rango_estado(uuid) from public;
grant execute on function fn_factura_numero(uuid, uuid, uuid, bigint) to service_role;
grant execute on function fn_factura_rango_estado(uuid) to authenticated, service_role;
