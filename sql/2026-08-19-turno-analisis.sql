-- fn_turno_analisis — el cierre del turno: que se gasto de verdad, contra lo
-- que decian las recetas, y que porcion recomendar para CADA producto y CADA
-- presentacion (no es lo mismo una familiar que una personal).
create or replace function fn_turno_analisis(p_turno uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t          iv_turnos%rowtype;
  v_brand    uuid;
  desde      timestamptz;
  hasta      timestamptz;
  ins        record;
  rec        record;
  conv       numeric;
  teo_buy    numeric;
  real_buy   numeric;
  factor     numeric;
  unidades   numeric;
  total_uni  numeric;
  recetas    jsonb;
  salida     jsonb := '[]'::jsonb;
begin
  select * into t from iv_turnos where id = p_turno;
  if not found then return jsonb_build_object('error', 'turno no encontrado'); end if;
  desde := t.abierto_en;
  hasta := coalesce(t.cerrado_en, now());
  select br.brand_id into v_brand from branches br where br.id = t.branch_id;

  for ins in
    select l.insumo_id, l.inicio, l.fin, l.repuesto, i.nombre, i.buy_unit, i.use_unit,
           coalesce(nullif(i.conversion,0),1) as conversion
    from iv_turno_lineas l join iv_insumos i on i.id = l.insumo_id
    where l.turno_id = p_turno and l.inicio is not null and l.fin is not null
    order by i.nombre
  loop
    conv := ins.conversion;
    /* LO QUE DE VERDAD SE GASTO: con lo que se empezo, mas lo que entro
       durante el turno, menos lo que quedo. En unidad de compra. */
    real_buy := coalesce(ins.inicio,0) + coalesce(ins.repuesto,0) - coalesce(ins.fin,0);

    /* LO QUE DECIAN LAS RECETAS: ya lo calcula el inventario en cada venta. */
    select coalesce(sum(-m.delta),0) into teo_buy
    from iv_movimientos m
    where m.insumo_id = ins.insumo_id and m.motivo = 'venta' and not m.reversed
      and m.created_at >= desde and m.created_at <= hasta;

    factor := case when teo_buy > 0 then real_buy / teo_buy else null end;

    /* CADA RECETA QUE USA ESTE INSUMO, con lo que se vendio de ella. */
    recetas := '[]'::jsonb; total_uni := 0;
    for rec in
      select r.id as receta_id, r.product_id, p.name as producto, r.variant_option_id,
             r.cantidades, p.presentations
      from iv_recetas r join pos_products p on p.id = r.product_id
      where r.insumo_id = ins.insumo_id
        and (v_brand is null or r.brand_id is null or r.brand_id = v_brand)
    loop
      /* Una linea por presentacion: la familiar y la personal son porciones
         distintas y se recomiendan por separado. */
      declare
        pres_key text; pres_nom text; q_act numeric;
      begin
        for pres_key, q_act in
          select key, (value->>'q')::numeric from jsonb_each(coalesce(rec.cantidades,'{}'::jsonb))
        loop
          select coalesce(elem->>'name','') into pres_nom
          from jsonb_array_elements(coalesce(rec.presentations,'[]'::jsonb)) elem
          where elem->>'id' = pres_key limit 1;

          /* CUANTAS SE VENDIERON de esta receta+presentacion en el turno. */
          select coalesce(sum(oi.quantity),0) into unidades
          from pos_order_items oi join pos_orders o on o.id = oi.order_id
          where oi.product_id = rec.product_id
            and o.branch_id = t.branch_id
            and oi.created_at >= desde and oi.created_at <= hasta
            and coalesce(o.status,'') <> 'cancelled'
            and exists (select 1 from iv_movimientos m2 where m2.item_id = oi.id and m2.motivo='venta' and not m2.reversed)
            and (
              /* la presentacion coincide por nombre, o el producto tiene una sola */
              lower(btrim(coalesce(oi.selections->>'pres',''))) = lower(btrim(coalesce(pres_nom,'')))
              or jsonb_array_length(coalesce(rec.presentations,'[]'::jsonb)) = 1
            )
            and (
              rec.variant_option_id is null
              or exists (
                select 1 from jsonb_each(coalesce(oi.selections->'vars','{}'::jsonb)) e(k,v)
                where v->>'id' = rec.variant_option_id)
            );

          if unidades > 0 then
            total_uni := total_uni + unidades;
            recetas := recetas || jsonb_build_object(
              'receta_id',    rec.receta_id,
              'producto',     rec.producto,
              'presentacion', coalesce(nullif(pres_nom,''), 'unica'),
              'pres_key',     pres_key,
              'variante',     rec.variant_option_id,
              'unidades',     unidades,
              'porcion_hoy',  q_act,
              'porcion_reco', case when factor is null then null
                                   else round((q_act * factor)::numeric, 1) end,
              'usa_unidad',   ins.use_unit
            );
          end if;
        end loop;
      end;
    end loop;

    update iv_turno_lineas
       set teorico = teo_buy, real_gasto = real_buy
     where turno_id = p_turno and insumo_id = ins.insumo_id;

    salida := salida || jsonb_build_object(
      'insumo',        ins.nombre,
      'insumo_id',     ins.insumo_id,
      'unidad_compra', ins.buy_unit,
      'unidad_uso',    ins.use_unit,
      'inicio',        ins.inicio,
      'repuesto',      ins.repuesto,
      'fin',           ins.fin,
      'real',          real_buy,
      'teorico',       teo_buy,
      'real_uso',      round((real_buy * conv)::numeric, 1),
      'teorico_uso',   round((teo_buy  * conv)::numeric, 1),
      'factor',        case when factor is null then null else round(factor, 3) end,
      'platos',        total_uni,
      /* NO SE OPINA CON POCO DATO: con menos de 10 platos la diferencia puede
         ser la bascula, y por debajo del 10% es ruido de medicion. */
      'confiable',     (total_uni >= 10 and factor is not null and abs(factor - 1) >= 0.10),
      'recetas',       recetas
    );
  end loop;

  return jsonb_build_object('turno', p_turno, 'desde', desde, 'hasta', hasta, 'insumos', salida);
end;
$function$;

grant execute on function fn_turno_analisis(uuid) to service_role, authenticated;
notify pgrst, 'reload schema';
