-- 2026-08-20 · Reponer el inventario que se descontó por pedidos de julio
--
-- QUÉ PASÓ. El 19-ago a las 16:13 se crearon 102 movimientos de inventario EN
-- EL MISMO SEGUNDO, descontando por 9 pedidos del 20 y 25 de julio. Esos
-- pedidos son anteriores a que el inventario empezara a funcionar: las recetas
-- se cargaron el 23 de julio y el primer movimiento real es del 30 de julio.
-- Nunca debieron tocar las existencias.
--
-- CÓMO SE SUPO QUE ESTABA MAL, y no es solo la fecha: el descuento dejó dos
-- insumos en stock NEGATIVO (Salsa de ajo −0,144 y Salsa de tomate −0,048).
-- Un stock negativo no existe en la vida real.
--
-- Lo notó Sergio porque el bot le decía 1 pan de hamburguesa cuando había
-- metido 3. El lote se había llevado exactamente 2.
--
-- LA TRAMPA AL REPONER (ya nos costó una vez): `iv_existencias` tiene
-- `branch_id` en NULL mientras los movimientos SÍ traen la sede. Cruzarlos por
-- sede no casa ni una fila y el UPDATE "funciona" sin cambiar nada. Por eso se
-- agrupa solo por insumo, y por eso se cuentan las filas afectadas.

with m as (
  select insumo_id, sum(delta) d
    from iv_movimientos
   where tenant_id = '0c78c799-bebb-4fe7-9bf6-c10062eaea7e'
     and created_at::date = '2026-08-19'
     and campo = 'stock' and reversed = false
   group by insumo_id
),
repuesto as (
  -- El delta es negativo, así que restarlo es devolverlo.
  update iv_existencias e
     set stock = e.stock - m.d, updated_at = now()
    from m
   where m.insumo_id = e.insumo_id
     and e.tenant_id = '0c78c799-bebb-4fe7-9bf6-c10062eaea7e'
  returning e.insumo_id
),
marcados as (
  -- Marcados para que no se puedan volver a aplicar ni contar dos veces.
  update iv_movimientos set reversed = true
   where tenant_id = '0c78c799-bebb-4fe7-9bf6-c10062eaea7e'
     and created_at::date = '2026-08-19'
     and campo = 'stock' and reversed = false
  returning id
)
select (select count(*) from repuesto) insumos_repuestos,   -- dio 18
       (select count(*) from marcados) movimientos,          -- dio 102
       (select count(*) from m)        insumos_esperados;    -- dio 18

-- ── Dos ajustes que quedaron después de reponer ──────────────────────
-- La salsa de ajo quedó en −0,003 galones: milésimas, pero negativo. Sergio
-- confirmó que no hay; se deja en cero limpio.
update iv_existencias e set stock = 0, updated_at = now()
  from iv_insumos i
 where i.id = e.insumo_id and i.tenant_id = '0c78c799-bebb-4fe7-9bf6-c10062eaea7e'
   and i.nombre = 'Salsa ajo casera' and e.stock < 0;

-- Coca Cola Personal: el total (8) estaba bien, pero una estaba contada en
-- bodega y va en la nevera. Es un traslado que nadie registró.
update iv_existencias e
   set stock = 3.0/12, stock_servicio = 5.0/12, updated_at = now()
  from iv_insumos i
 where i.id = e.insumo_id and i.tenant_id = '0c78c799-bebb-4fe7-9bf6-c10062eaea7e'
   and i.nombre = 'Coca Cola Personal';
