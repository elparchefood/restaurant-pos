-- ══════════════════════════════════════════════════════════════════════
--  UNA CUENTA DE FACTURACION POR RESTAURANTE  (4-sep-2026)
--
--  HOY HAY UNA SOLA LLAVE PARA TODO COBRA, y con eso no se le puede
--  activar la facturacion a nadie: la factura saldria con el NIT
--  equivocado. Cada restaurante factura con SU NIT, asi que cada uno
--  necesita sus propias llaves.
--
--  ══ POR QUE LAS LLAVES NO VAN EN UNA COLUMNA ═════════════════════════
--  Con las llaves de un restaurante se pueden emitir facturas a su
--  nombre ante la DIAN. Eso no es una contrasena de una pantalla: es
--  poder tributario. En una columna de texto quedarian legibles para
--  cualquiera que llegue a la tabla.
--
--  Van al **Vault de Supabase**, que las guarda cifradas con una llave
--  que no vive en la tabla. La tabla solo guarda un PUNTERO.
--
--  ══ LO QUE SI PUEDE VER EL NAVEGADOR ═════════════════════════════════
--  La pantalla del gerente necesita saber si hay cuenta conectada y en
--  que ambiente — no las llaves. Por eso se parte en dos:
--
--    · la TABLA (sin secretos) la lee el restaurante, con su politica;
--    · las LLAVES solo se sacan con una funcion que unicamente puede
--      ejecutar el rol de servicio, o sea la Edge Function.
--
--  El navegador NUNCA puede llegar a las llaves. Ni equivocandose.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.pos_facturacion_cuentas (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  branch_id    uuid not null,
  proveedor    text not null default 'factus',
  --  `sandbox` no emite ante la DIAN: sirve para probar. `produccion` si.
  --  Se guarda aqui y no en el codigo porque cada restaurante puede estar
  --  en un momento distinto: uno probando y otro facturando de verdad.
  ambiente     text not null default 'sandbox'
               check (ambiente in ('sandbox','produccion')),
  --  EL PUNTERO AL VAULT. Aqui no hay ninguna llave.
  secreto_id   uuid,
  activo       boolean not null default false,
  conectada_at timestamptz,
  --  Lo ultimo que contesto el proveedor al comprobar la cuenta. Sirve
  --  para que la pantalla diga POR QUE no conecta, en vez de un aviso
  --  mudo. Nunca lleva llaves: solo el mensaje.
  ultimo_error text,
  created_at   timestamptz not null default now()
);

--  UNA cuenta activa por sede y proveedor. Dos cuentas activas serian dos
--  numeraciones distintas para el mismo restaurante — el peor lio posible
--  ante la DIAN.
create unique index if not exists ux_fact_cuenta_sede
  on public.pos_facturacion_cuentas (branch_id, proveedor)
  where activo;

create index if not exists ix_fact_cuenta_tenant
  on public.pos_facturacion_cuentas (tenant_id);

-- ── Quien ve que ──────────────────────────────────────────────────────
alter table public.pos_facturacion_cuentas enable row level security;

drop policy if exists fact_cuentas_tenant on public.pos_facturacion_cuentas;
create policy fact_cuentas_tenant on public.pos_facturacion_cuentas
  using      (tenant_id = ((auth.jwt() -> 'user_metadata' ->> 'tenant_id'))::uuid)
  with check (tenant_id = ((auth.jwt() -> 'user_metadata' ->> 'tenant_id'))::uuid);

--  El GRANT es lo que faltaba en las tablas de agosto y por eso la
--  facturacion no emitio nada en dos semanas. Aqui va de una.
grant select, insert, update on public.pos_facturacion_cuentas to authenticated;
grant select, insert, update, delete on public.pos_facturacion_cuentas to service_role;

-- ══════════════════════════════════════════════════════════════════════
--  GUARDAR LAS LLAVES  —  solo el servidor
-- ══════════════════════════════════════════════════════════════════════
--  Recibe las llaves, las mete al Vault y deja el puntero. Si la sede ya
--  tenia cuenta, REEMPLAZA el secreto en vez de crear otro: dejar
--  secretos huerfanos en el Vault es dejar llaves vivas tiradas.
create or replace function public.fn_facturacion_guardar_llaves(
  p_tenant   uuid,
  p_branch   uuid,
  p_llaves   jsonb,
  p_ambiente text default 'sandbox',
  p_proveedor text default 'factus'
) returns uuid
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_cuenta  public.pos_facturacion_cuentas%rowtype;
  v_secreto uuid;
  v_nombre  text := p_proveedor || ':' || p_branch::text;
begin
  select * into v_cuenta from public.pos_facturacion_cuentas
   where branch_id = p_branch and proveedor = p_proveedor
   limit 1;

  if v_cuenta.id is not null and v_cuenta.secreto_id is not null then
    perform vault.update_secret(v_cuenta.secreto_id, p_llaves::text, v_nombre,
                                'Llaves de facturacion de esta sede');
    v_secreto := v_cuenta.secreto_id;
  else
    v_secreto := vault.create_secret(p_llaves::text, v_nombre,
                                     'Llaves de facturacion de esta sede');
  end if;

  if v_cuenta.id is null then
    insert into public.pos_facturacion_cuentas
      (tenant_id, branch_id, proveedor, ambiente, secreto_id, activo, conectada_at)
    values (p_tenant, p_branch, p_proveedor, p_ambiente, v_secreto, true, now())
    returning id into v_cuenta.id;
  else
    update public.pos_facturacion_cuentas
       set secreto_id = v_secreto, ambiente = p_ambiente, activo = true,
           conectada_at = now(), ultimo_error = null
     where id = v_cuenta.id;
  end if;

  return v_cuenta.id;
end $$;

-- ══════════════════════════════════════════════════════════════════════
--  SACAR LAS LLAVES  —  ESTA ES LA QUE HAY QUE CUIDAR
-- ══════════════════════════════════════════════════════════════════════
create or replace function public.fn_facturacion_llaves(
  p_branch    uuid,
  p_proveedor text default 'factus'
) returns jsonb
language sql
security definer
set search_path = public, vault, extensions
as $$
  select (s.decrypted_secret)::jsonb
    from public.pos_facturacion_cuentas c
    join vault.decrypted_secrets s on s.id = c.secreto_id
   where c.branch_id = p_branch
     and c.proveedor = p_proveedor
     and c.activo
   limit 1;
$$;

--  ⚠️ LO MAS IMPORTANTE DEL ARCHIVO ⚠️
--  Una funcion nace ejecutable por TODO EL MUNDO. Si esto no se revoca,
--  cualquiera con una sesion de cajero puede pedir las llaves de
--  facturacion de su restaurante desde el navegador — y con ellas emitir
--  facturas a nombre del negocio ante la DIAN.
revoke execute on function public.fn_facturacion_llaves(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.fn_facturacion_guardar_llaves(uuid, uuid, jsonb, text, text)
  from public, anon, authenticated;

grant execute on function public.fn_facturacion_llaves(uuid, text)
  to service_role;
grant execute on function public.fn_facturacion_guardar_llaves(uuid, uuid, jsonb, text, text)
  to service_role;

-- ══════════════════════════════════════════════════════════════════════
--  Y SE COMPRUEBA, que para eso estamos
-- ══════════════════════════════════════════════════════════════════════
do $$
begin
  --  Que el navegador NO pueda sacar llaves. Es el candado que importa.
  if has_function_privilege('authenticated',
       'public.fn_facturacion_llaves(uuid, text)', 'execute') then
    raise exception 'GRAVE: authenticated puede leer las llaves de facturacion';
  end if;
  if has_function_privilege('anon',
       'public.fn_facturacion_llaves(uuid, text)', 'execute') then
    raise exception 'GRAVE: anon puede leer las llaves de facturacion';
  end if;
  --  Y que el servidor SI pueda, o no se emite nada.
  if not has_function_privilege('service_role',
       'public.fn_facturacion_llaves(uuid, text)', 'execute') then
    raise exception 'el rol de servicio no puede leer las llaves';
  end if;
  --  Y los permisos de la tabla, que es donde se falló en agosto.
  if not has_table_privilege('service_role', 'public.pos_facturacion_cuentas', 'SELECT')
     or not has_table_privilege('authenticated', 'public.pos_facturacion_cuentas', 'SELECT') then
    raise exception 'faltan permisos en pos_facturacion_cuentas';
  end if;
end $$;
