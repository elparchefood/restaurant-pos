-- ══════════════════════════════════════════════════════════════════════
--  LA REGLA DE PUNTOS DEJA DE ESTAR ESCRITA A FUEGO (21-ago-2026)
--
--  "1 punto por cada $1.000" es una decision de NEGOCIO de cada
--  restaurante, no una ley del sistema. Estaba escrita dentro del
--  disparador, asi que cualquier restaurante que comprara Cobra heredaba
--  la economia de El Parche sin poder cambiarla — y ni siquiera podia
--  APAGAR los puntos si no tiene programa de fidelidad.
--
--  Donde vive ahora: `branches.operacion_config -> puntos`
--      { "pesos_por_punto": 1000, "activo": true }
--  Es el mismo bloque donde ya viven el empaque, la propina y los
--  impuestos, asi que lo guarda la pantalla que ya existe.
--
--  RED DE SEGURIDAD: si un restaurante no tiene nada configurado, se
--  comporta EXACTAMENTE como hoy (1 punto por cada $1.000, encendido).
--  Nadie se entera de este cambio hasta que decida usarlo.
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.award_loyalty_points()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE tel text; pts numeric; food numeric; ahora boolean; antes boolean; saldo numeric;
        v_cfg jsonb; v_por numeric; v_activo boolean;
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

      -- ── La regla de ESTE restaurante ──────────────────────────────
      -- Si no configuro nada, se queda con lo de siempre. Un valor raro
      -- (cero, negativo, texto) tampoco puede romper la venta: cae al
      -- mismo respaldo.
      BEGIN
        SELECT operacion_config -> 'puntos' INTO v_cfg
          FROM branches WHERE id = NEW.branch_id;
      EXCEPTION WHEN OTHERS THEN v_cfg := NULL; END;

      v_activo := COALESCE((v_cfg ->> 'activo')::boolean, true);
      IF NOT v_activo THEN RETURN NEW; END IF;   -- restaurante sin programa de puntos

      BEGIN
        v_por := (v_cfg ->> 'pesos_por_punto')::numeric;
      EXCEPTION WHEN OTHERS THEN v_por := NULL; END;
      IF v_por IS NULL OR v_por <= 0 THEN v_por := 1000; END IF;

      food := COALESCE(NEW.subtotal,0) + COALESCE(NEW.packaging_fee,0);
      IF food <= 0 THEN food := COALESCE(NEW.total,0) - COALESCE(NEW.delivery_fee,0); END IF;
      -- Lo canjeado con puntos no genera puntos.
      food := food - COALESCE(NEW.puntos_valor,0);
      pts := floor(food / v_por);
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
      ON CONFLICT (tenant_id, (pos_tel10(telefono)))
        DO UPDATE SET puntos = pos_puntos.puntos + EXCLUDED.puntos, updated_at = now()
      RETURNING puntos INTO saldo;

      INSERT INTO pos_puntos_movimientos
        (tenant_id, branch_id, telefono, tipo, puntos, saldo_despues, order_id, detalle, quien)
      VALUES (NEW.tenant_id, NEW.branch_id, tel, 'acumulacion', pts::int, saldo::int, NEW.id,
              'Compra', 'sistema');
    EXCEPTION WHEN OTHERS THEN
      -- Nunca bloquear la venta, pero JAMAS esconder el error.
      BEGIN
        INSERT INTO trg_debug(msg) VALUES ('award_loyalty_points ERROR '||NEW.id||': '||SQLERRM);
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END;
  END IF;
  RETURN NEW;
END;
$function$;

-- Para que las PANTALLAS digan la regla del restaurante y no una frase
-- escrita a mano ("1 punto por cada $1.000" estaba repetido en 4 sitios).
create or replace function public.fn_puntos_regla(p_branch uuid)
returns table (pesos_por_punto numeric, activo boolean)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    coalesce(nullif((b.operacion_config -> 'puntos' ->> 'pesos_por_punto')::numeric, 0), 1000),
    coalesce((b.operacion_config -> 'puntos' ->> 'activo')::boolean, true)
  from branches b where b.id = p_branch;
$function$;

revoke all on function public.fn_puntos_regla(uuid) from public;
grant execute on function public.fn_puntos_regla(uuid) to authenticated, service_role;
