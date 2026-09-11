-- ════════════════════════════════════════════════════════════════════
--  EL DOMICILIO QUE LA COCINA MARCA LISTO, LISTO TAMBIEN EN VENTAS
--  (Sergio, 10-sep-2026, en pleno turno)
--
--  "cuando en cocina se coloque un domicilio como listo, en la pantalla de
--  ventas del cajero tambien tiene que cambiar de preparacion a listo".
--
--  Son DOS columnas: la cocina escribe `estado` (en_preparacion / listo) y
--  el tablero de domicilios de Ventas lee `delivery_status` (preparacion /
--  listo / camino / entregado). Nadie las unia.
--
--  Se une AQUI, en la base, y no en cocina.js: asi da igual quien lo marque
--  (la cocina, el deshacer, la mesa que se libera, la carta...). Solo se
--  mueve el paso de COCINA: si el domicilio ya va en camino o entregado, la
--  cocina no lo devuelve a "listo".
-- ════════════════════════════════════════════════════════════════════

create or replace function public.fn_domicilio_listo_desde_cocina()
returns trigger language plpgsql as $$
begin
  if new.estado is distinct from old.estado
     and lower(coalesce(new.channel, '')) in ('domicilio', 'whatsapp') then
    if new.estado = 'listo' and coalesce(new.delivery_status, 'preparacion') in ('preparacion', 'recibido') then
      new.delivery_status := 'listo';
    elsif old.estado = 'listo' and new.estado = 'en_preparacion' and new.delivery_status = 'listo' then
      new.delivery_status := 'preparacion';        -- la cocina deshizo el "listo"
    end if;
  end if;
  return new;
end $$;

drop trigger if exists tg_domicilio_listo_desde_cocina on public.pos_orders;
create trigger tg_domicilio_listo_desde_cocina
  before update of estado on public.pos_orders
  for each row execute function public.fn_domicilio_listo_desde_cocina();
