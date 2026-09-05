-- ══════════════════════════════════════════════════════════════════════
--  LA TABLET TIENE QUE ENTERARSE DE LOS CAMBIOS  (4-sep-2026)
--
--  SINTOMA, de Sergio: *"en el computador esta muy bien, pero en la tablet
--  sigue apareciendo agotado con las salsas"*. Y ademas, al reves: *"me
--  permite vender bebidas que ya estan agotadas"*.
--
--  Dos sintomas opuestos, UNA causa.
--
--  ══ POR QUE PASA ═════════════════════════════════════════════════════
--  `pos-datos.js` guarda en cada equipo lo que "no cambia durante un
--  turno" — productos, categorias, INSUMOS y RECETAS — hasta 8 horas. Y
--  su propia nota lo dice:
--
--    "la pantalla que guardo llama a invalidar() y lo deja fresco en ESE
--     equipo. En otro equipo se ve al reabrir."
--
--  Eso se decidio pensando en PRECIOS, que nadie cambia a mitad de turno.
--  Pero en el mismo paquete viajan las RECETAS y el interruptor
--  `agota_producto`, y esos SI se tocan a mitad de turno — justo cuando
--  alguien ve que una salsa esta bloqueando.
--
--  Resultado en la tablet:
--    · salsa que ya no agota  -> sigue con el dato viejo y BLOQUEA;
--    · bebida con receta nueva -> no tiene la receta y NO BLOQUEA.
--  Las dos caras del mismo dato viejo.
--
--  ══ POR QUE UNA VERSION Y NO BAJAR EL TIEMPO ═════════════════════════
--  Bajar las 8 horas a 5 minutos haria que cada pantalla se volviera a
--  traer 374 recetas cada 5 minutos, que es justo lo que este modulo vino
--  a quitar. Aqui se guarda UN numero: la tablet pregunta ese numero (una
--  fila diminuta) y solo si cambio vuelve a traerlo todo.
--
--  ══ POR QUE UN DISPARADOR Y NO UNA LLAMADA DESDE LA PANTALLA ═════════
--  Porque la pantalla se olvida. Ya paso: `invalidar()` existe y se llama
--  desde inventario, pero solo sirve en ese equipo — y cualquier camino
--  nuevo que escriba (una funcion del servidor, el panel, una migracion)
--  no se acordaria de llamarlo. La base no se olvida.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.pos_datos_version (
  tenant_id  uuid primary key,
  version    bigint not null default 1,
  cambio_en  text,                 -- que tabla lo movio, para poder mirar
  updated_at timestamptz not null default now()
);

alter table public.pos_datos_version enable row level security;

drop policy if exists datos_version_tenant on public.pos_datos_version;
--  Solo LEER, y solo lo suyo. Nadie escribe esto a mano: lo mueve el
--  disparador. Si se pudiera escribir, un equipo podria hacer creer a
--  otro que no hay cambios.
create policy datos_version_tenant on public.pos_datos_version
  for select using (
    tenant_id = ((auth.jwt() -> 'user_metadata' ->> 'tenant_id'))::uuid
  );

grant select on public.pos_datos_version to authenticated;
grant select, insert, update on public.pos_datos_version to service_role;

-- ── El disparador ─────────────────────────────────────────────────────
create or replace function public.fn_datos_version_subir()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  --  En un DELETE los datos vienen en OLD; en el resto, en NEW.
  v_tenant := coalesce(
    case when tg_op = 'DELETE' then (to_jsonb(old) ->> 'tenant_id')
         else (to_jsonb(new) ->> 'tenant_id') end, '')::uuid;
  if v_tenant is null then return coalesce(new, old); end if;

  insert into public.pos_datos_version (tenant_id, version, cambio_en, updated_at)
  values (v_tenant, 1, tg_table_name, now())
  on conflict (tenant_id) do update
    set version = public.pos_datos_version.version + 1,
        cambio_en = excluded.cambio_en,
        updated_at = now();

  return coalesce(new, old);
end $$;

--  Las tablas que viajan dentro del paquete guardado. Si manana se le
--  agrega otra a `pos-datos.js`, hay que agregarla AQUI TAMBIEN — y por
--  eso van escritas una por una y no con un bucle: se ve la lista.
do $$
declare t text;
begin
  foreach t in array array[
    'pos_products', 'pos_categories', 'pos_modifier_groups',
    'iv_insumos', 'iv_recetas'
  ] loop
    execute format('drop trigger if exists trg_datos_version on public.%I', t);
    execute format(
      'create trigger trg_datos_version after insert or update or delete on public.%I
         for each row execute function public.fn_datos_version_subir()', t);
  end loop;
end $$;

-- ══════════════════════════════════════════════════════════════════════
--  COMPROBACION: que el disparador de verdad mueva el numero
-- ══════════════════════════════════════════════════════════════════════
do $$
declare
  v_tenant uuid := '0c78c799-bebb-4fe7-9bf6-c10062eaea7e';  -- El Parche
  v_antes bigint;
  v_despues bigint;
  v_ins uuid;
begin
  select version into v_antes from public.pos_datos_version where tenant_id = v_tenant;
  v_antes := coalesce(v_antes, 0);

  --  Se toca un insumo sin cambiarle nada de verdad.
  select id into v_ins from public.iv_insumos where tenant_id = v_tenant limit 1;
  if v_ins is null then
    raise notice 'sin insumos para probar; se salta la comprobacion';
    return;
  end if;
  update public.iv_insumos set updated_at = now() where id = v_ins;

  select version into v_despues from public.pos_datos_version where tenant_id = v_tenant;
  if coalesce(v_despues, 0) <= v_antes then
    raise exception 'el disparador NO subio la version (antes %, despues %)', v_antes, v_despues;
  end if;
  raise notice 'disparador comprobado: % -> %', v_antes, v_despues;
end $$;
