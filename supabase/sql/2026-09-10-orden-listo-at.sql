-- ════════════════════════════════════════════════════════════════════
--  LA HORA EN QUE SALIO DE LA COCINA, QUIETA (Sergio, 10-sep-2026, noche)
--
--  "los pedidos que ya salieron, los que estan en gris, todavia les sigue
--  corriendo el reloj... debe quedar totalmente congelado en el momento que
--  quedan listos: solo vamos a medir el tiempo que se demoro preparandose".
--
--  La cocina paraba el reloj con `delivered_at || estado_at || closed_at`.
--  Pero `estado_at` es la hora del ULTIMO cambio de estado: cuando el
--  domicilio pasaba a "en camino" y despues a "entregado", esa hora se
--  movia y el reloj de la comanda gris saltaba hacia adelante.
--
--  `listo_at` es la hora en que el pedido SALIO DE LA COCINA por primera vez
--  (listo, o directo a en camino / entregado) y ya no se mueve. Si la cocina
--  lo deshace (vuelve a en preparacion) se borra, y se vuelve a poner cuando
--  salga de nuevo. Lo pone la base: da igual que pantalla lo marque.
-- ════════════════════════════════════════════════════════════════════

alter table public.pos_orders add column if not exists listo_at timestamptz;

create or replace function public.fn_orden_listo_at()
returns trigger language plpgsql as $$
begin
  if new.estado is distinct from old.estado then
    if new.estado = 'en_preparacion' then
      new.listo_at := null;                              -- la cocina lo deshizo
    elsif new.estado in ('listo', 'en_camino', 'entregado') and new.listo_at is null then
      new.listo_at := now();                             -- la primera vez que sale
    end if;
  end if;
  return new;
end $$;

drop trigger if exists tg_orden_listo_at on public.pos_orders;
create trigger tg_orden_listo_at
  before update of estado on public.pos_orders
  for each row execute function public.fn_orden_listo_at();

--  Los de hoy que ya salieron: se congelan donde estan ahora (para los que
--  estan en "listo", `estado_at` ES la hora de listo; los que ya iban en
--  camino o entregados no tienen como saberla — quedan donde estan).
update public.pos_orders set listo_at = estado_at
 where listo_at is null and estado_at is not null
   and estado in ('listo', 'en_camino', 'entregado')
   and created_at > now() - interval '1 day';
