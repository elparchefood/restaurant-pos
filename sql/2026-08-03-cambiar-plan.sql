-- Cambiar el plan de un cliente desde la consola de plataforma.
--
-- Tres cosas, y la primera es la importante:
--
-- 1. Un restaurante NO puede cambiarse el plan a sí mismo. La regla que había
--    (`owner_tenant`, con permiso ALL) dejaba que cualquier dueño escribiera su
--    propia fila de `tenants`. Como el plan vive en esa fila, cualquier cliente
--    podía pasarse de Starter a Premium desde la consola del navegador sin
--    pagar. Ahora su regla es solo de lectura: ve su fila, no la toca.
-- 2. El precio de cada plan pasa a vivir en la base, no escrito en el código de
--    la consola. Así se cambia un precio sin volver a desplegar nada.
-- 3. Cada cambio de plan queda anotado: quién, cuándo, de qué a qué y por qué.
--    Esto es plata; tiene que haber rastro.

-- ─────────────────────────────────────────────────────────────────────
-- 1. El cliente lee su fila, pero no la escribe
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists "owner_tenant" on public.tenants;

create policy "owner_tenant_lee" on public.tenants
  for select
  using (id = ((auth.jwt() -> 'user_metadata' ->> 'tenant_id'))::uuid);

-- La regla del admin de plataforma sigue igual (ALL): es la única vía de
-- escritura, y pasa por la función de abajo.

-- ─────────────────────────────────────────────────────────────────────
-- 2. Precio en el catálogo de planes
-- ─────────────────────────────────────────────────────────────────────
alter table public.pos_planes add column if not exists precio numeric;

update public.pos_planes set precio = 149000 where plan = 'starter' and precio is null;
update public.pos_planes set precio = 249000 where plan = 'pro'     and precio is null;
-- Premium queda en NULL a propósito: todavía no tiene precio decidido, y la
-- consola lo muestra como "precio por definir" en vez de inventarse uno.

-- Starter tenía `funciones` en NULL. Se deja como lista vacía: significa
-- exactamente lo mismo (no incluye ninguna función avanzada), pero sin NULL de
-- por medio, que es el tipo de detalle con el que un día algo pasa de largo.
update public.pos_planes set funciones = '{}'::text[] where funciones is null;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Historial de cambios de plan
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.pos_plan_historial (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  plan_anterior text,
  plan_nuevo    text not null,
  motivo        text,
  cambiado_por  uuid,
  created_at    timestamptz not null default now()
);

create index if not exists idx_plan_hist_tenant
  on public.pos_plan_historial (tenant_id, created_at desc);

alter table public.pos_plan_historial enable row level security;

drop policy if exists "hist plan solo admin" on public.pos_plan_historial;
create policy "hist plan solo admin" on public.pos_plan_historial
  for all using (es_admin_plataforma()) with check (es_admin_plataforma());

grant select on public.pos_plan_historial to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 4. La función que hace el cambio
-- ─────────────────────────────────────────────────────────────────────
-- Va por función y no por un UPDATE suelto desde la consola para que el cambio
-- y su anotación en el historial ocurran juntos: o pasan los dos, o no pasa
-- ninguno. Un cambio de plan sin rastro no sirve para cobrar.
create or replace function public.admin_cambiar_plan(
  p_tenant uuid,
  p_plan   text,
  p_motivo text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anterior text;
  v_nombre   text;
begin
  if not es_admin_plataforma() then
    raise exception 'Solo un administrador de la plataforma puede cambiar el plan';
  end if;

  -- El plan tiene que existir en el catálogo. Sin esto, un dedazo dejaría al
  -- restaurante en un plan inexistente y sin ninguna función habilitada.
  select nombre into v_nombre from pos_planes where plan = p_plan;
  if v_nombre is null then
    raise exception 'El plan "%" no existe', p_plan;
  end if;

  select plan into v_anterior from tenants where id = p_tenant for update;
  if v_anterior is null then
    raise exception 'Esa cuenta no existe';
  end if;

  if v_anterior = p_plan then
    return jsonb_build_object('ok', true, 'sin_cambio', true, 'plan', p_plan);
  end if;

  update tenants set plan = p_plan, updated_at = now() where id = p_tenant;

  insert into pos_plan_historial (tenant_id, plan_anterior, plan_nuevo, motivo, cambiado_por)
  values (p_tenant, v_anterior, p_plan, nullif(btrim(coalesce(p_motivo, '')), ''), auth.uid());

  return jsonb_build_object('ok', true, 'anterior', v_anterior, 'plan', p_plan, 'nombre', v_nombre);
end;
$$;

revoke all on function public.admin_cambiar_plan(uuid, text, text) from public, anon;
grant execute on function public.admin_cambiar_plan(uuid, text, text) to authenticated;
