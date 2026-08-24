-- ═══════════════════════════════════════════════════════════════════════════
--  LA CUENTA DONDE COBRA COBRA — separada de la del restaurante  (24-ago-2026)
-- ───────────────────────────────────────────────────────────────────────────
--  Sergio, textual: *"una cosa es la cuenta donde pagan los clientes del
--  restaurante y otra cosa muy distinta es donde pagan los clientes de Cobra.
--  Por ahora es la misma cuenta, pero no deben tener ninguna vinculación ni
--  ninguna relación. Yo luego puedo cambiar la cuenta a la que pagan los
--  clientes que se registren en Cobra y no debe modificarse la cuenta de El
--  Parche"*.
--
--  La tentación era leerla de `ia_config.pagos` de El Parche, que ya la tiene.
--  Sería un error con forma de atajo: el día que cambie la de Cobra, cambiaría
--  la del restaurante, y los clientes de El Parche empezarían a transferirle a
--  otra cuenta sin que nadie lo pida. Son dos negocios distintos que hoy
--  comparten un número, y eso es una coincidencia, no una regla.
--
--  ⚠️ Y NO SON EL MISMO NÚMERO HOY. Al ir a mirarlo:
--       El Parche recibe en   Nequi        0092726260
--       La página de registro decía  Bancolombia  009 257 1225
--     Uno de los dos está desactualizado. NO SE ELIGE AQUÍ: la tabla nace con
--     lo que la página de registro venía mostrando —para no cambiarle a nadie
--     la cuenta por sorpresa— y queda marcada como SIN VERIFICAR, para que
--     Sergio la confirme en la consola antes de que se registre un cliente de
--     verdad. Un número de cuenta no se adivina.
--
--  ── UNA SOLA FILA ────────────────────────────────────────────────────────
--  `id` fijo en 1 con una restricción: no puede haber dos. Sin eso, un día hay
--  dos filas y la página de registro muestra la que le toque.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.plataforma_cobro (
  id          smallint primary key default 1,
  banco       text not null default '',
  tipo        text not null default '',   -- "Llave Bancolombia", "Nequi", "Ahorros"…
  numero      text not null default '',   -- la llave o el número de cuenta
  titular     text not null default '',
  nota        text default '',            -- lo que se le quiera decir a quien paga
  verificada  boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  constraint plataforma_cobro_una_sola check (id = 1)
);

comment on table public.plataforma_cobro is
  'A donde transfieren los restaurantes que compran Cobra POS. NO tiene ninguna relacion con ia_config.pagos, que es a donde le pagan los clientes de cada restaurante. Cambiar una NO debe cambiar la otra: son dos negocios distintos que hoy comparten un numero por coincidencia.';

-- ── Quién la ve y quién la cambia ──────────────────────────────────────────
alter table public.plataforma_cobro enable row level security;

--  LEERLA PUEDE CUALQUIERA, y tiene que ser así: la pantalla de registro la
--  muestra a quien todavía no tiene cuenta. No hay nada secreto en un número
--  al que se le pide a la gente que consigne — es como el que un negocio pega
--  en la pared.
drop policy if exists "cobro: lo lee cualquiera" on public.plataforma_cobro;
create policy "cobro: lo lee cualquiera"
  on public.plataforma_cobro for select to anon, authenticated using (true);

--  CAMBIARLA, SOLO EL ADMINISTRADOR DE LA PLATAFORMA. Con la misma
--  comprobación que usa la consola, no con `is_authorized_admin`, que significa
--  "es el administrador de SU restaurante" y se lo lleva cada cliente aprobado.
--  Esa confusión ya costó un fallo el 23-ago; aquí costaría que un cliente
--  cambiara la cuenta a la que le pagan a Sergio.
drop policy if exists "cobro: lo cambia el admin de plataforma" on public.plataforma_cobro;
create policy "cobro: lo cambia el admin de plataforma"
  on public.plataforma_cobro for update to authenticated
  using (public.es_admin_plataforma() = true)
  with check (public.es_admin_plataforma() = true);

revoke all on public.plataforma_cobro from public, anon, authenticated;
grant select on public.plataforma_cobro to anon, authenticated;
grant update on public.plataforma_cobro to authenticated;
grant all on public.plataforma_cobro to service_role;

--  Nadie puede INSERTAR ni BORRAR desde una pantalla, a propósito: la fila es
--  una y ya existe. Sin esto, alguien podría borrarla y dejar la pantalla de
--  registro sin decir a dónde pagar.

-- ── La fila, con lo que la página venía mostrando ──────────────────────────
insert into public.plataforma_cobro (id, banco, tipo, numero, titular, verificada)
values (1, 'Bancolombia', 'Llave Bancolombia', '0092571225', 'Sergio Andrés Abadía', false)
on conflict (id) do nothing;
