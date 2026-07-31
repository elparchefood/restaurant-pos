-- ═══════════════════════════════════════════════════════════════
-- Contactos de WhatsApp + Listas de envío
-- La vista deja listos los cruces que hacen falta para segmentar, para que
-- la pantalla no tenga que calcularlos: si el contacto ya escribió a Cobra,
-- si está en lista negra y si tiene pedidos.
-- Los teléfonos se comparan por los ÚLTIMOS 10 DÍGITOS porque conviven
-- formatos distintos (+57 320…, 57320…, 320…).
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_wa_contactos AS
WITH escribieron AS (
  SELECT DISTINCT right(regexp_replace(contact_handle, '\D', '', 'g'), 10) AS tel10
  FROM chat_conversations
  WHERE contact_handle IS NOT NULL
),
negros AS (
  SELECT DISTINCT right(regexp_replace(telefono, '\D', '', 'g'), 10) AS tel10
  FROM pos_blacklist_telefonos
  WHERE telefono IS NOT NULL
),
pedidos AS (
  SELECT substring(notes from '\[tel:([0-9]+)\]') AS tel_raw,
         count(*) AS n_pedidos,
         max(created_at) AS ultimo_pedido
  FROM pos_orders
  WHERE notes ~ '\[tel:[0-9]+\]' AND status <> 'cancelled'
  GROUP BY 1
),
pedidos10 AS (
  SELECT right(regexp_replace(tel_raw, '\D', '', 'g'), 10) AS tel10,
         sum(n_pedidos) AS n_pedidos,
         max(ultimo_pedido) AS ultimo_pedido
  FROM pedidos WHERE tel_raw IS NOT NULL GROUP BY 1
)
SELECT
  w.id, w.tenant_id, w.branch_id,
  w.telefono, w.etiqueta, w.origen,
  COALESCE(w.guardado, false)    AS guardado,
  COALESCE(w.no_atender, false)  AS no_atender,
  w.created_at,
  right(regexp_replace(w.telefono, '\D', '', 'g'), 10) AS tel10,
  (e.tel10 IS NOT NULL)          AS ya_escribio,
  (n.tel10 IS NOT NULL)          AS en_lista_negra,
  COALESCE(p.n_pedidos, 0)       AS n_pedidos,
  p.ultimo_pedido,
  -- Nombre real o solo el número: los contactos que vienen del chat quedaron
  -- etiquetados con su propio número, no sirven para saludar por nombre.
  (w.etiqueta IS NOT NULL AND btrim(w.etiqueta) <> ''
     AND w.etiqueta !~ '^[+0-9 ()-]+$'
     AND length(btrim(w.etiqueta)) > 1)  AS tiene_nombre
FROM pos_wa_contactos w
LEFT JOIN escribieron e ON e.tel10 = right(regexp_replace(w.telefono, '\D', '', 'g'), 10)
LEFT JOIN negros     n ON n.tel10 = right(regexp_replace(w.telefono, '\D', '', 'g'), 10)
LEFT JOIN pedidos10  p ON p.tel10 = right(regexp_replace(w.telefono, '\D', '', 'g'), 10);

-- Listas de envío: se guardan los FILTROS, no los contactos. Así la lista se
-- recalcula sola: si alguien escribe a Cobra mañana, sale solo de la lista.
CREATE TABLE IF NOT EXISTS pos_wa_listas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid,
  branch_id  uuid NOT NULL,
  nombre     text NOT NULL,
  filtros    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_wa_listas_branch ON pos_wa_listas(branch_id);
ALTER TABLE pos_wa_listas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_listas_all ON pos_wa_listas;
CREATE POLICY wa_listas_all ON pos_wa_listas FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT ON v_wa_contactos TO anon, authenticated;
GRANT ALL    ON pos_wa_listas  TO anon, authenticated;
