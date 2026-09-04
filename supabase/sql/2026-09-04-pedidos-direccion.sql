-- ══════════════════════════════════════════════════════════════════════
--  LA DIRECCION DE CADA PEDIDO, EN SU PROPIA COLUMNA (4-sep-2026)
--
--  Sergio quiere que Paco le pregunte al cliente por **la direccion a la que
--  mas ha pedido**, y no simplemente por la ultima. Hoy eso no se puede
--  calcular: `pos_orders` no guarda a donde fue el pedido.
--
--  ══ PERO EL DATO SI ESTA, MAL GUARDADO ═══════════════════════════════
--  Va dentro de `notes`, como texto libre para la comanda:
--
--      "carrera 9b #63n58 [barrio:Bellavista] [tel:3105489093]"
--
--  Ese formato existe por una buena razon —el domiciliario lo lee de un
--  vistazo en el papel— y NO se toca. Lo que no sirve es para contar: habria
--  que sacar la direccion con expresiones regulares de un campo pensado para
--  leerse, y ahi cualquier cambio de formato rompe la cuenta en silencio.
--
--  Por eso van columnas propias. `notes` sigue igual para la cocina.
-- ══════════════════════════════════════════════════════════════════════

alter table pos_orders
  add column if not exists direccion text,
  add column if not exists barrio    text;

comment on column pos_orders.direccion is
  'A donde fue ESTE pedido. Se guarda aparte de notes —que es la comanda del '
  'domiciliario— para poder contar cuantos pedidos ha recibido cada direccion '
  'de un cliente. Solo se llena hacia adelante: los pedidos viejos quedan en null.';

--  ── El indice: para preguntarle a un cliente por sus direcciones ──────
--  Parcial a proposito: la inmensa mayoria de las filas viejas tienen la
--  direccion en null y no tienen por que ocupar sitio.
create index if not exists pedidos_por_direccion
  on pos_orders (cliente_id, direccion)
  where cliente_id is not null and direccion is not null;

-- ══════════════════════════════════════════════════════════════════════
--  CUAL ES LA DIRECCION PRINCIPAL DE UN CLIENTE
--
--  La regla es de Sergio: **la que mas pedidos tiene**; y si empatan, **la
--  del pedido mas reciente**.
--
--  Va como funcion y no como consulta suelta porque la usan dos sitios (Paco
--  y, mas adelante, la pantalla de clientes) y la regla debe ser UNA. Si
--  manana cambia —por ejemplo, mirar solo los ultimos seis meses— se cambia
--  aqui y cambia en los dos.
-- ══════════════════════════════════════════════════════════════════════
create or replace function fn_cliente_direccion_principal(p_cliente uuid)
returns table (direccion text, barrio text, pedidos bigint, ultimo timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select o.direccion,
         --  El barrio del pedido MAS RECIENTE de esa direccion: si el
         --  restaurante corrigio el nombre del barrio alguna vez, vale el
         --  ultimo, no el primero.
         (array_agg(o.barrio order by o.created_at desc))[1] as barrio,
         count(*)             as pedidos,
         max(o.created_at)    as ultimo
    from pos_orders o
   where o.cliente_id = p_cliente
     and o.direccion is not null
     and o.status <> 'cancelled'        -- un pedido anulado no dice donde vive nadie
   group by o.direccion
   --  Primero la mas pedida; con empate, la mas reciente. Es la regla exacta
   --  que pidio Sergio.
   order by count(*) desc, max(o.created_at) desc
   limit 1;
$$;

grant execute on function fn_cliente_direccion_principal(uuid) to service_role, authenticated;
