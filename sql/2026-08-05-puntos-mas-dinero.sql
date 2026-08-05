-- ═══════════════════════════════════════════════════════════════════════════
-- CANJE MIXTO — puntos + plata
-- ───────────────────────────────────────────────────────────────────────────
-- Pedido de Sergio: "con $10.000 + 200 puntos redimen X producto".
--
-- Sirve para dos cosas a la vez: deja poner premios grandes al alcance de la
-- gente (una salchipapa de $27.000 a 400 puntos no la alcanza casi nadie; a
-- 200 puntos + $10.000 sí), y le baja el costo al programa, porque parte del
-- premio la sigue pagando el cliente.
--
-- Cero significa "solo puntos", que es como funciona hoy: nada cambia de
-- comportamiento hasta que alguien le ponga un valor.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.pos_puntos_catalogo
  add column if not exists dinero integer not null default 0;

do $$ begin
  alter table public.pos_puntos_catalogo add constraint pos_puntos_catalogo_dinero_check
    check (dinero >= 0);
exception when duplicate_object then null; end $$;

comment on column public.pos_puntos_catalogo.dinero is
  'Plata que el cliente pone ADEMÁS de los puntos. 0 = el canje es solo con puntos. Ej: 200 puntos + $10.000.';
