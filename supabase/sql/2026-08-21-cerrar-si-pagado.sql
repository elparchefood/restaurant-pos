-- 2026-08-21 · El pedido entregado y pagado se cierra EN LA BASE, de un golpe
--
-- Sergio, tercera vez con el mismo lío: "No puedo cerrar caja porque me dice
-- que estos pedidos están abiertos, pero ya están pagos y entregados. Esto ya
-- me ha pasado varias veces."
--
-- Los tres pedidos de la noche (Mónica, Brenda, Miguel) estaban entregados y
-- con paid_amount = total, pero status seguía 'open'. cambiar-estado tiene el
-- cierre desde el 15-ago y FUNCIONA (probado en el Restaurante de Prueba)...
-- pero su chequeo es leer-y-decidir con un try/catch que traga cualquier error
-- sin dejar rastro: si esa lectura falla un instante, el cierre no ocurre y
-- nadie se entera hasta que la caja no deja cerrar el turno.
--
-- El arreglo: la condición y el cierre viajan JUNTOS en un solo UPDATE de la
-- base. O se cumple y cierra, o no se cumple y no pasa nada — no hay lectura
-- intermedia que pueda fallar por su lado. Y cambiar-estado ahora ANOTA en
-- pos_diag cada entrega con su antes y después: si vuelve a quedar uno
-- abierto, el rastro dice por qué.

create or replace function public.fn_cerrar_si_pagado(p_order uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_n integer;
begin
  update pos_orders
     set status = 'paid', closed_at = now()
   where id = p_order
     and status = 'open'
     and total > 0
     and paid_amount >= total;
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;

grant execute on function public.fn_cerrar_si_pagado(uuid) to anon, authenticated, service_role;

-- ── Reparar los tres de esta noche (y cualquier otro igual de viejo) ──
--  Misma condición del candado, más la de estar entregado: no se toca nada
--  que deba plata ni nada vivo.
update pos_orders
   set status = 'paid', closed_at = coalesce(closed_at, delivered_at, now())
 where status = 'open'
   and delivered_at is not null
   and estado = 'entregado'
   and total > 0
   and paid_amount >= total;

notify pgrst, 'reload schema';
