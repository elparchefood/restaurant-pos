-- ══════════════ CUADRE DE STOCK (conteo físico) ══════════════
-- IMPORTANTE: esto NO cambia cómo funciona el inventario. El stock se sigue
-- calculando, descontando y mostrando igual que siempre. Lo único que se añade
-- es DEJAR CONSTANCIA de los ajustes, que hoy no queda en ninguna parte:
-- alguien edita el stock a mano en la ficha y nadie sabe que pasó ni cuánto
-- faltaba. Con $1.725.222 parados en inventario, esa diferencia importa.

-- ── Sesión de conteo ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS iv_conteos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid,
  branch_id    uuid,
  estado       text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','cerrado','anulado')),
  categoria    text,                       -- null = se contó todo
  nota         text,
  -- Resumen congelado al cerrar, para no recalcularlo cada vez que se consulta.
  n_items      int,
  n_diferencias int,
  valor_faltante numeric,
  valor_sobrante numeric,
  abierto_por  text,
  cerrado_por  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  closed_at    timestamptz
);

-- ── Una línea por insumo contado ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS iv_conteo_lineas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conteo_id    uuid NOT NULL REFERENCES iv_conteos(id) ON DELETE CASCADE,
  insumo_id    uuid NOT NULL REFERENCES iv_insumos(id) ON DELETE CASCADE,
  -- Lo que el sistema creía, CONGELADO al abrir el conteo. Si se recalculara al
  -- cerrar, una venta hecha mientras se contaba ensuciaría la diferencia.
  esperado     numeric NOT NULL,
  contado      numeric,                    -- null = todavía no lo han contado
  diferencia   numeric,
  costo_unit   numeric,                    -- precio de COMPRA congelado
  valor_dif    numeric,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS iv_conteo_lineas_uniq ON iv_conteo_lineas (conteo_id, insumo_id);
CREATE INDEX IF NOT EXISTS iv_conteos_branch ON iv_conteos (branch_id, created_at DESC);

ALTER TABLE iv_conteos ENABLE ROW LEVEL SECURITY;
ALTER TABLE iv_conteo_lineas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS iv_conteos_tenant ON iv_conteos;
CREATE POLICY iv_conteos_tenant ON iv_conteos FOR ALL
  USING (current_tenant_id() = tenant_id) WITH CHECK (current_tenant_id() = tenant_id);
-- Las líneas heredan el permiso de su conteo.
DROP POLICY IF EXISTS iv_conteo_lineas_tenant ON iv_conteo_lineas;
CREATE POLICY iv_conteo_lineas_tenant ON iv_conteo_lineas FOR ALL
  USING (EXISTS (SELECT 1 FROM iv_conteos c WHERE c.id = conteo_id AND c.tenant_id = current_tenant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM iv_conteos c WHERE c.id = conteo_id AND c.tenant_id = current_tenant_id()));
GRANT SELECT, INSERT, UPDATE, DELETE ON iv_conteos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON iv_conteo_lineas TO authenticated;

-- ── Abrir un conteo ───────────────────────────────────────────────────
-- Congela lo que el sistema cree que hay AHORA. Deliberadamente NO devuelve
-- esos números al que va a contar: si los ve, escribe lo mismo y el conteo no
-- sirve de nada (mismo principio del cierre ciego).
CREATE OR REPLACE FUNCTION fn_iv_abrir_conteo(
  p_tenant uuid, p_branch uuid, p_categoria text DEFAULT NULL, p_quien text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE v_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM iv_conteos WHERE branch_id = p_branch AND estado = 'abierto') THEN
    RAISE EXCEPTION 'Ya hay un conteo abierto. Ciérralo o anúlalo antes de empezar otro.';
  END IF;

  INSERT INTO iv_conteos (tenant_id, branch_id, categoria, abierto_por)
  VALUES (p_tenant, p_branch, nullif(btrim(coalesce(p_categoria,'')), ''), p_quien)
  RETURNING id INTO v_id;

  INSERT INTO iv_conteo_lineas (conteo_id, insumo_id, esperado, costo_unit)
  SELECT v_id, i.id,
         coalesce(i.stock,0) + CASE WHEN i.sub_inventario THEN coalesce(i.stock_servicio,0) ELSE 0 END,
         coalesce(i.precio,0)
    FROM iv_insumos i
   WHERE i.branch_id = p_branch
     AND i.activo IS NOT FALSE
     AND (p_categoria IS NULL OR btrim(p_categoria) = '' OR i.categoria = p_categoria);

  RETURN v_id;
END;
$fn$;

-- ── Cerrar el conteo y ajustar ────────────────────────────────────────
-- Ajusta el stock a lo contado y deja el rastro en el kardex. Las líneas sin
-- contar se ignoran: no contar algo no significa que haya cero.
CREATE OR REPLACE FUNCTION fn_iv_cerrar_conteo(p_conteo uuid, p_quien text DEFAULT NULL)
RETURNS TABLE (ajustados int, faltante numeric, sobrante numeric)
LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE c RECORD; l RECORD; v_n int := 0; v_falta numeric := 0; v_sobra numeric := 0; v_dif numeric;
BEGIN
  SELECT * INTO c FROM iv_conteos WHERE id = p_conteo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ese conteo no existe'; END IF;
  IF c.estado <> 'abierto' THEN RAISE EXCEPTION 'Ese conteo ya está cerrado'; END IF;

  FOR l IN SELECT * FROM iv_conteo_lineas WHERE conteo_id = p_conteo AND contado IS NOT NULL LOOP
    v_dif := l.contado - l.esperado;
    UPDATE iv_conteo_lineas
       SET diferencia = v_dif, valor_dif = v_dif * coalesce(l.costo_unit,0)
     WHERE id = l.id;

    IF v_dif <> 0 THEN
      v_n := v_n + 1;
      IF v_dif < 0 THEN v_falta := v_falta + abs(v_dif * coalesce(l.costo_unit,0));
      ELSE               v_sobra := v_sobra + (v_dif * coalesce(l.costo_unit,0)); END IF;

      -- El ajuste va SIEMPRE contra la bodega (`stock`). Lo que está en servicio
      -- no se toca: repartir la diferencia entre los dos niveles sería inventar
      -- de dónde salió.
      UPDATE iv_insumos SET stock = coalesce(stock,0) + v_dif, updated_at = now()
       WHERE id = l.insumo_id;

      INSERT INTO iv_movimientos (tenant_id, branch_id, insumo_id, delta, campo, motivo)
      VALUES (c.tenant_id, c.branch_id, l.insumo_id, v_dif, 'stock', 'conteo fisico');
    END IF;
  END LOOP;

  UPDATE iv_conteos
     SET estado = 'cerrado', cerrado_por = p_quien, closed_at = now(),
         n_items = (SELECT count(*) FROM iv_conteo_lineas WHERE conteo_id = p_conteo AND contado IS NOT NULL),
         n_diferencias = v_n, valor_faltante = v_falta, valor_sobrante = v_sobra
   WHERE id = p_conteo;

  ajustados := v_n; faltante := v_falta; sobrante := v_sobra;
  RETURN NEXT;
END;
$fn$;

GRANT EXECUTE ON FUNCTION fn_iv_abrir_conteo(uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_iv_cerrar_conteo(uuid, text) TO authenticated, service_role;
