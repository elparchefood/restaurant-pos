
-- ══════════════ LO CANJEADO NO ES VENTA ══════════════
-- Regla de Sergio: "300 puntos no es igual a 8000 pesos. La gaseosa costo 300
-- puntos, no 8000 pesos. En las ventas no se suma lo que no entro".
-- El producto canjeado se entrega y SI descuenta inventario, pero NO suma a las
-- ventas: seria dinero ficticio.
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS puntos_redimidos int;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS puntos_valor numeric;   -- precio de lista de lo canjeado (solo para estadistica)

COMMENT ON COLUMN pos_orders.puntos_redimidos IS 'Puntos que el cliente entrego en este pedido';
COMMENT ON COLUMN pos_orders.puntos_valor IS 'Cuanto habria costado en pesos lo canjeado. NO es venta: sirve para saber cuanto se regalo en producto.';

-- Los puntos se ganan sobre lo que el cliente PAGO, no sobre lo que redimio:
-- si no, un canje generaria puntos nuevos y la bola de nieve no para.
CREATE OR REPLACE FUNCTION public.award_loyalty_points()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE tel text; pts numeric; food numeric;
BEGIN
  IF NEW.status IN ('paid','completed')
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.status,'') NOT IN ('paid','completed')) THEN
    BEGIN
      food := COALESCE(NEW.subtotal,0) + COALESCE(NEW.packaging_fee,0);
      IF food <= 0 THEN food := COALESCE(NEW.total,0) - COALESCE(NEW.delivery_fee,0); END IF;
      -- Lo canjeado con puntos no genera puntos.
      food := food - COALESCE(NEW.puntos_valor,0);
      pts := floor(food / 1000.0);
      IF pts <= 0 THEN RETURN NEW; END IF;

      tel := substring(COALESCE(NEW.notes,'') from '\[tel:([^\]]+)\]');
      IF (tel IS NULL OR tel = '') AND NEW.cliente_id IS NOT NULL THEN
        SELECT telefono INTO tel FROM pos_clientes WHERE id = NEW.cliente_id;
      END IF;
      tel := regexp_replace(COALESCE(tel,''), '\D', '', 'g');
      IF length(tel) = 12 AND left(tel,2) = '57' THEN tel := substring(tel from 3); END IF;
      IF tel IS NULL OR length(tel) < 7 THEN RETURN NEW; END IF;

      INSERT INTO pos_puntos (tenant_id, branch_id, telefono, puntos, updated_at)
      VALUES (NEW.tenant_id, NEW.branch_id, tel, pts, now())
      ON CONFLICT (tenant_id, telefono)
        DO UPDATE SET puntos = pos_puntos.puntos + EXCLUDED.puntos, updated_at = now();

      INSERT INTO pos_puntos_movimientos
        (tenant_id, branch_id, telefono, tipo, puntos, order_id, detalle, quien)
      VALUES (NEW.tenant_id, NEW.branch_id, tel, 'acumulacion', pts::int, NEW.id,
              'Compra', 'sistema');
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RETURN NEW;
END;
$function$;
