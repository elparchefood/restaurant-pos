-- ═══════════════════════════════════════════════════════════════════════════
-- CATÁLOGO DE PUNTOS — que también acepte combos
-- ───────────────────────────────────────────────────────────────────────────
-- Hasta hoy una fila del catálogo de puntos apuntaba SIEMPRE a un producto
-- suelto. Un combo no se podía canjear, aunque para el cliente "papas + gaseosa
-- por 60 puntos" es justo el premio que tiene sentido ofrecer.
--
-- Una fila apunta a UN producto o a UN combo, nunca a los dos ni a ninguno. Eso
-- lo obliga la base y no el navegador: si se deja como norma de la pantalla,
-- basta una consulta desde otro lado para meter una fila sin dueño.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.pos_puntos_catalogo
  add column if not exists combo_id uuid references public.pos_combos(id) on delete cascade;

-- product_id deja de ser obligatorio: ahora puede venir combo_id en su lugar.
alter table public.pos_puntos_catalogo alter column product_id drop not null;

do $$ begin
  alter table public.pos_puntos_catalogo add constraint pos_puntos_catalogo_dueno_check
    check ((product_id is not null) <> (combo_id is not null));
exception when duplicate_object then null; end $$;

comment on column public.pos_puntos_catalogo.combo_id is
  'Si la fila es un combo, aquí va su id y product_id queda vacío. Un combo no tiene presentaciones ni variantes: pres_id y variantes se dejan nulos y el precio en puntos es uno solo.';

create index if not exists ix_puntos_catalogo_combo
  on public.pos_puntos_catalogo (tenant_id, combo_id) where combo_id is not null;
