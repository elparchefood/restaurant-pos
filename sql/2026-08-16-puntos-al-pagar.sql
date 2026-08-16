-- ══════════════ LOS PUNTOS SALEN CUANDO LA PLATA ENTRA ══════════════
-- Caso real (15-ago, Isabella): pago por transferencia VERIFICADO, pedido
-- "Pagado" en pantalla... y sin puntos. El trigger solo miraba status
-- paid/completed, y los pedidos del bot viven en 'open' hasta que se cierran
-- (la pantalla de domicilios SOLO muestra los 'open', asi que cerrarlos al
-- nacer los haria desaparecer de ahi — se intento y se revirtio).
-- Regla nueva: los puntos se dan cuando el pedido queda PAGADO DE VERDAD —
-- por status (paid/completed, camino de caja) O por plata completa
-- (paid_amount cubre el total, camino del bot con transferencia verificada).
-- Con doble candado anti-repeticion: la transicion (si ya calificaba antes,
-- no vuelve a dar) y el historial (si el pedido ya tiene acumulacion, jamas
-- da otra).
CREATE OR REPLACE FUNCTION public.award_loyalty_points()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE tel text; pts numeric; food numeric; ahora boolean; antes boolean;
BEGIN
  ahora := NEW.status IN ('paid','completed')
        OR (COALESCE(NEW.paid_amount,0) >= COALESCE(NEW.total,0) AND COALESCE(NEW.total,0) > 0);
  antes := TG_OP = 'UPDATE' AND (
           COALESCE(OLD.status,'') IN ('paid','completed')
        OR (COALESCE(OLD.paid_amount,0) >= COALESCE(OLD.total,0) AND COALESCE(OLD.total,0) > 0));
  IF ahora AND NOT antes AND COALESCE(NEW.status,'') <> 'cancelled' THEN
    BEGIN
      -- Candado 2: un pedido da puntos UNA sola vez, pase lo que pase con sus estados.
      IF EXISTS (SELECT 1 FROM pos_puntos_movimientos WHERE order_id = NEW.id AND tipo = 'acumulacion') THEN
        RETURN NEW;
      END IF;
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
