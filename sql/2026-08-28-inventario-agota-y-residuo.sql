/*  ══ TRES COSAS DE INVENTARIO, DEL MISMO DÍA ═══════════════════════════
    Sergio, 27-ago-2026.

    1. NO TODO INSUMO PUEDE AGOTAR UN PRODUCTO.

       *«cuando se acaba la salsa barbecue, marca el producto como agotado y no
       quiero que sea así: realmente se puede preparar igual con otras salsas.
       Mientras que si falta otro ingrediente importante, sí no se puede»*.

       Es una distinción de cocina, no de software, y solo la sabe el
       restaurante: el mismo insumo puede ser imprescindible en un sitio y un
       acompañamiento en otro. Por eso es un interruptor por insumo y no una
       regla escrita en el programa.

       Viene ENCENDIDO por defecto — que es como se comporta hoy. Apagarlo es
       una decisión consciente sobre un insumo concreto.

       Ojo con lo que NO cambia: el insumo se sigue descontando, se sigue
       viendo en rojo en Inventario y sigue saliendo en el aviso de compras.
       Lo único que deja de hacer es BLOQUEAR la venta del producto. Confundir
       las dos cosas dejaría a Sergio sin saber que hay que comprar salsa.

    2. EL RESIDUO QUE HACÍA VENDER LO QUE NO HAY.

       La Coca Cola 1.5 tenía en la nevera `0.00000000000000000001` paquetes.
       Eso es una billonésima de botella — cero para cualquiera menos para un
       `> 0`, que decía «sí hay» y dejaba venderla. Sergio le ofreció una a un
       cliente y tuvo que ir a cambiársela.

       Sale de dividir: una botella de un paquete de doce es 1/12, que en
       decimal no termina nunca. Al restar doce veces queda polvo.

       Se limpia al escribir, que es donde nace: por debajo de una millonésima
       se pone en cero. Nadie tiene una millonésima de nada en una nevera.

    3. Y de paso, `iv_insumos` conserva tres columnas muertas del cambio del
       24-ago (`stock`, `agotado`, `stock_servicio` → `_migrado_no_usar`). No
       se borran aquí: hay código que todavía las nombra y borrarlas ahora
       cambiaría un fallo silencioso por uno ruidoso a mitad de servicio.   */

alter table iv_insumos
  add column if not exists agota_producto boolean not null default true;

comment on column iv_insumos.agota_producto is
  'Si se acaba, ¿bloquea la venta de los productos que lo llevan? Las salsas y acompañamientos van en false: el plato se prepara igual.';

/*  El residuo se corta al escribir. Una millonésima de unidad de compra es,
    en el peor caso imaginable, una millonésima de un galón: cero.          */
create or replace function fn_iv_mover_existencia(
  p_tenant uuid, p_insumo uuid, p_branch uuid, p_campo text, p_delta numeric)
returns void
language plpgsql security definer set search_path = public as $$
BEGIN
  IF p_campo = 'servicio' THEN
    INSERT INTO iv_existencias (tenant_id, insumo_id, branch_id, stock_servicio)
    VALUES (p_tenant, p_insumo, p_branch, p_delta)
    ON CONFLICT (insumo_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET stock_servicio = (
                    CASE WHEN abs(COALESCE(iv_existencias.stock_servicio,0) + p_delta) < 0.000001
                         THEN 0
                         ELSE COALESCE(iv_existencias.stock_servicio,0) + p_delta END),
                  updated_at = now();
  ELSE
    INSERT INTO iv_existencias (tenant_id, insumo_id, branch_id, stock)
    VALUES (p_tenant, p_insumo, p_branch, p_delta)
    ON CONFLICT (insumo_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET stock = (
                    CASE WHEN abs(COALESCE(iv_existencias.stock,0) + p_delta) < 0.000001
                         THEN 0
                         ELSE COALESCE(iv_existencias.stock,0) + p_delta END),
                  updated_at = now();
  END IF;
END;
$$;

--  Y el polvo que ya estaba escrito.
update iv_existencias set stock_servicio = 0
 where stock_servicio <> 0 and abs(stock_servicio) < 0.000001;
update iv_existencias set stock = 0
 where stock <> 0 and abs(stock) < 0.000001;
