-- ══════════════════════════════════════════════════════════════════════
--  LOS PAPELES QUE SUBE EL DUENO DEL RESTAURANTE  (4-sep-2026)
--
--  Para activar un facturador, Factus pide por cada restaurante: RUT,
--  camara de comercio, cedula del representante y el logo. Esos papeles
--  son del restaurante, asi que los sube el dueno.
--
--  ══ LA REGLA QUE ORDENA TODO ESTO ════════════════════════════════════
--  EL DUENO NUNCA VE UNA LLAVE. El sube papeles; las llaves las manda
--  Factus a Cobra y las carga el administrador de la plataforma desde su
--  consola. Asi no viajan por el correo ni el WhatsApp del restaurante,
--  que es justo por donde se pierden.
--
--  ══ SON PAPELES DE VERDAD ════════════════════════════════════════════
--  Un RUT y una cedula no son una foto de un plato: llevan el NIT, la
--  direccion y el documento del representante legal. El deposito es
--  PRIVADO y solo entran dos: el propio restaurante y el administrador de
--  la plataforma.
-- ══════════════════════════════════════════════════════════════════════

-- ── 1. El deposito ────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'facturacion-docs', 'facturacion-docs', false,
  10485760,   -- 10 MB: un RUT escaneado no pesa mas, y el tope frena subidas raras
  array['application/pdf','image/png','image/jpeg','image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── 2. Quien entra al deposito ────────────────────────────────────────
--  La ruta de cada archivo es  <tenant_id>/<branch_id>/<tipo>.<ext>
--  El primer pedazo de la ruta ES el candado: un restaurante solo toca lo
--  que esta bajo su propio tenant.
create or replace function public.fn_es_admin_plataforma()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
     where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.fn_es_admin_plataforma() to authenticated, service_role;

drop policy if exists fdocs_lee on storage.objects;
create policy fdocs_lee on storage.objects for select to authenticated
  using (
    bucket_id = 'facturacion-docs'
    and (
      (storage.foldername(name))[1] = ((auth.jwt() -> 'user_metadata' ->> 'tenant_id'))
      or public.fn_es_admin_plataforma()
    )
  );

--  Subir y reemplazar: SOLO el restaurante, y solo lo suyo. El
--  administrador de la plataforma LEE los papeles; no los pone por
--  nadie. Si hiciera falta reemplazar uno, lo pide.
drop policy if exists fdocs_sube on storage.objects;
create policy fdocs_sube on storage.objects for insert to authenticated
  with check (
    bucket_id = 'facturacion-docs'
    and (storage.foldername(name))[1] = ((auth.jwt() -> 'user_metadata' ->> 'tenant_id'))
  );

drop policy if exists fdocs_reemplaza on storage.objects;
create policy fdocs_reemplaza on storage.objects for update to authenticated
  using (
    bucket_id = 'facturacion-docs'
    and (storage.foldername(name))[1] = ((auth.jwt() -> 'user_metadata' ->> 'tenant_id'))
  );

--  Borrar tambien, para poder cambiar un papel mal subido. Un papel
--  borrado no es un dato perdido: se vuelve a subir.
drop policy if exists fdocs_borra on storage.objects;
create policy fdocs_borra on storage.objects for delete to authenticated
  using (
    bucket_id = 'facturacion-docs'
    and (storage.foldername(name))[1] = ((auth.jwt() -> 'user_metadata' ->> 'tenant_id'))
  );

-- ── 3. Que papel es cada archivo ──────────────────────────────────────
--  Se podria leer del deposito, pero entonces la pantalla tendria que
--  adivinar por el nombre del archivo cual es cual. Aqui queda dicho.
create table if not exists public.pos_facturacion_docs (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  branch_id  uuid not null,
  tipo       text not null
             check (tipo in ('rut','camara','cedula','logo')),
  ruta       text not null,
  nombre     text,
  subido_at  timestamptz not null default now()
);

--  Un papel de cada tipo por sede: subir el RUT otra vez REEMPLAZA al
--  anterior, no deja dos y que alguien adivine cual vale.
create unique index if not exists ux_fdocs_tipo
  on public.pos_facturacion_docs (branch_id, tipo);

alter table public.pos_facturacion_docs enable row level security;

drop policy if exists fdocs_tabla_tenant on public.pos_facturacion_docs;
create policy fdocs_tabla_tenant on public.pos_facturacion_docs
  using (
    tenant_id = ((auth.jwt() -> 'user_metadata' ->> 'tenant_id'))::uuid
    or public.fn_es_admin_plataforma()
  )
  with check (tenant_id = ((auth.jwt() -> 'user_metadata' ->> 'tenant_id'))::uuid);

--  El GRANT, que es lo que faltaba en agosto y dejo la facturacion muda.
grant select, insert, update, delete on public.pos_facturacion_docs to authenticated;
grant select, insert, update, delete on public.pos_facturacion_docs to service_role;

-- ── 4. Cuando pidio la facturacion ────────────────────────────────────
alter table public.pos_facturacion_cuentas
  add column if not exists solicitada_at timestamptz;

-- ══════════════════════════════════════════════════════════════════════
--  COMPROBACIONES
-- ══════════════════════════════════════════════════════════════════════
do $$
declare v_publico boolean;
begin
  select public into v_publico from storage.buckets where id = 'facturacion-docs';
  if v_publico is null then
    raise exception 'no se creo el deposito';
  end if;
  --  Un RUT publico seria una fuga de datos del restaurante.
  if v_publico then
    raise exception 'GRAVE: el deposito de papeles quedo PUBLICO';
  end if;

  if not has_table_privilege('authenticated', 'public.pos_facturacion_docs', 'INSERT') then
    raise exception 'el restaurante no puede registrar sus papeles';
  end if;

  --  Y que las llaves sigan cerradas: esta migracion no las toca, pero
  --  comprobarlo cuesta nada y el dia que alguien afloje algo, se ve aqui.
  if has_function_privilege('authenticated',
       'public.fn_facturacion_llaves(uuid, text)', 'execute') then
    raise exception 'GRAVE: authenticated puede leer las llaves de facturacion';
  end if;
end $$;
