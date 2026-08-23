-- ══════════════════════════════════════════════════════════════════════
--  REPARAR EL INVENTARIO QUE QUEDÓ MAL (22-ago-2026, 22:45)
--
--  DOS errores del gerente por WhatsApp, la misma noche:
--
--  1) LAS COCA-COLAS. La factura traía "COCA-COLA 1.5 PET X12" (1 paquete).
--     El sistema dudó del empaque y preguntó; Sergio contestó "un paquete
--     que trae 12 unidades" — describiendo el CONTENIDO. El sistema lo tomó
--     como MULTIPLICADOR y entró 1 × 12 = 12 PAQUETES = 144 botellas.
--     El insumo ya se mide en "paq. ×12" (conversion = 12): ese 12 ya
--     estaba contado. Sobran 11 paquetes en cada una.
--
--  2) EL HIT DE MANGO. Sergio escribió "Compre 0.5 paquete hit litro
--     mango" y el medio paquete se sumó a "Hit Litro Mora", existiendo
--     "Hit Litro Mango" con ese nombre exacto.
--
--  Se revierte EXACTAMENTE lo que entró mal. No se toca stock_servicio:
--  las operaciones del gerente solo movieron bodega.
-- ══════════════════════════════════════════════════════════════════════
update iv_existencias e
   set stock = e.stock - 11
  from iv_insumos i
 where i.id = e.insumo_id
   and i.nombre in ('Coca Cola 1.5 Litros', 'Coca Cola Personal');

update iv_existencias e
   set stock = e.stock - 0.5
  from iv_insumos i
 where i.id = e.insumo_id and i.nombre = 'Hit Litro Mora';

update iv_existencias e
   set stock = e.stock + 0.5
  from iv_insumos i
 where i.id = e.insumo_id and i.nombre = 'Hit Litro Mango';

-- El sinónimo aprendido guardó factor 12: si no se corrige, la PRÓXIMA
-- factura del proveedor vuelve a multiplicar por doce sin preguntar nada.
-- 1 renglón de la factura = 1 paquete nuestro.
update iv_insumo_alias set factor = 1
 where alias in ('COCA-COLA 1.5 PET X12', 'COCA-COLA 400 FLEXI PET X12');

select i.nombre, e.stock as paquetes, round(e.stock * i.conversion) as botellas
  from iv_insumos i join iv_existencias e on e.insumo_id = i.id
 where i.nombre in ('Coca Cola 1.5 Litros','Coca Cola Personal',
                    'Hit Litro Mora','Hit Litro Mango','Hit Litro Frutos Tropicales')
 order by i.nombre;
