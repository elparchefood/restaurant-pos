
-- ══════════════ CATALOGO DE CANJE POR PUNTOS ══════════════
-- Regla de Sergio: "ante el sistema nada fue gratis, simplemente se usaron
-- puntos para hacer el pago". Los puntos son un METODO DE PAGO mas, y solo
-- sirven para los productos que esten en este catalogo.
--
-- Una fila por PRESENTACION, no por producto: el mismo producto puede tener
-- precio en puntos en Personal y no ofrecerse en Familiar.
--   pres_id = null  -> el producto no tiene presentaciones (una sola)
--   variantes       -> que opciones de variante se pueden pedir en el canje.
--                      Vacio o null = TODAS. Con contenido = solo esas.
CREATE TABLE IF NOT EXISTS pos_puntos_catalogo (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  branch_id   uuid,
  product_id  uuid NOT NULL REFERENCES pos_products(id) ON DELETE CASCADE,
  pres_id     text,
  pres_nombre text,
  puntos      int  NOT NULL CHECK (puntos > 0),
  variantes   jsonb,             -- {"vg_xxx":["vo_a","vo_b"]}  null = todas
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- El mismo producto+presentacion no puede estar dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS pos_puntos_catalogo_uniq
  ON pos_puntos_catalogo (tenant_id, product_id, coalesce(pres_id, ''));
CREATE INDEX IF NOT EXISTS pos_puntos_catalogo_branch
  ON pos_puntos_catalogo (branch_id, activo);

ALTER TABLE pos_puntos_catalogo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pos_puntos_catalogo_tenant ON pos_puntos_catalogo;
CREATE POLICY pos_puntos_catalogo_tenant ON pos_puntos_catalogo FOR ALL
  USING (current_tenant_id() = tenant_id) WITH CHECK (current_tenant_id() = tenant_id);

-- Los dos roles, siempre (leccion de las 4 veces que falto este GRANT).
GRANT SELECT, INSERT, UPDATE, DELETE ON pos_puntos_catalogo TO authenticated, service_role;

-- Movimientos de puntos: para poder auditar por que un cliente tiene N puntos.
-- Hoy solo existe el saldo en pos_puntos y no hay forma de reconstruirlo.
CREATE TABLE IF NOT EXISTS pos_puntos_movimientos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  branch_id     uuid,
  telefono      text NOT NULL,
  tipo          text NOT NULL,            -- 'acumulacion' | 'canje' | 'ajuste'
  puntos        int  NOT NULL,            -- + suma, - resta
  saldo_despues int,
  order_id      uuid,
  detalle       text,
  quien         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pos_puntos_mov_tel ON pos_puntos_movimientos (tenant_id, telefono, created_at DESC);
ALTER TABLE pos_puntos_movimientos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pos_puntos_mov_tenant ON pos_puntos_movimientos;
CREATE POLICY pos_puntos_mov_tenant ON pos_puntos_movimientos FOR ALL
  USING (current_tenant_id() = tenant_id) WITH CHECK (current_tenant_id() = tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON pos_puntos_movimientos TO authenticated, service_role;
