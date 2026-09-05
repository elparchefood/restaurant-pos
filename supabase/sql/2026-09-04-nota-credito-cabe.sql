/*  UNA NOTA DE CRÉDITO NO CABÍA EN LA TABLA
    ──────────────────────────────────────────────────────────────────────
    `ux_factura_pedido` era UNIQUE (order_id) para toda fila no anulada. Su
    intención era la idempotencia: que dos cajas tocando "facturar" a la vez
    no emitan dos facturas del mismo pedido. Y para eso está bien.

    Pero al anular con nota de crédito hay que guardar una SEGUNDA fila del
    mismo pedido —la nota— y el índice la rechazaba:

        duplicate key value violates unique constraint "ux_factura_pedido"

    Que por el camino de la función se veía como «No se pudo hablar con la
    base», sin decir cuál era el problema.

    ── EL ARREGLO ──────────────────────────────────────────────────────
    El índice pasa a mirar SOLO las facturas. La idempotencia queda igual
    de firme: sigue habiendo una sola factura viva por pedido. Y las notas
    ya tenían su propio candado desde el 3-sep,
    `facturas_una_nota_por_factura`, que impide dos notas para la misma
    factura — que es el problema de verdad con la DIAN.                  */

drop index if exists ux_factura_pedido;

create unique index ux_factura_pedido
    on public.pos_facturas (order_id)
 where order_id is not null
   and tipo = 'factura'
   and estado <> 'anulada';

/*  ── QUE SIGA IMPIDIENDO LO QUE TENÍA QUE IMPEDIR ────────────────────
    No basta con que el índice exista: hay que comprobar que la
    idempotencia no se aflojó. Se intenta meter dos facturas al mismo
    pedido y se exige que la base lo rechace.                            */
do $guarda$
declare
  v_ped uuid;
  v_t   uuid;
  v_b   uuid;
  ok    boolean := false;
begin
  select id, tenant_id, branch_id into v_ped, v_t, v_b
    from pos_orders order by created_at desc limit 1;
  if v_ped is null then
    raise notice 'sin pedidos con que probar; se salta la comprobacion';
    return;
  end if;

  begin
    insert into pos_facturas (tenant_id, branch_id, order_id, tipo, proveedor, estado)
    values (v_t, v_b, v_ped, 'factura', 'prueba_indice', 'pendiente'),
           (v_t, v_b, v_ped, 'factura', 'prueba_indice', 'pendiente');
  exception when unique_violation then
    ok := true;
  end;

  delete from pos_facturas where proveedor = 'prueba_indice';

  if not ok then
    raise exception 'el indice ya NO impide dos facturas del mismo pedido';
  end if;
end
$guarda$;

do $guarda2$
begin
  if not exists (
      select 1 from pg_indexes
       where tablename = 'pos_facturas'
         and indexname = 'ux_factura_pedido'
         and indexdef like '%tipo = ''factura''%') then
    raise exception 'el indice no quedo limitado a las facturas';
  end if;
end
$guarda2$;
