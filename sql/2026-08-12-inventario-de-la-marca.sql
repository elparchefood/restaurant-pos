/* ══════════════════════════════════════════════════════════════════════
   INVENTARIO DE LA MARCA — paso 1: los cimientos.

   Decisiones de Sergio (PLAN-MULTIMARCA.md):
     · La definición del insumo y su precio son de la MARCA.
     · Las recetas son de la MARCA.
     · Lo único que cambia por sede son las EXISTENCIAS, y eso lo decide un
       interruptor que vive en la marca: bolsa común o cada sede la suya.

   POR QUE URGE, y no es solo multi-marca:
   `fn_iv_consumir_item` une las recetas SOLO por producto — nunca filtra por
   sucursal. Con una sede funciona. Con dos, cada venta encontraría la receta
   de las dos sedes, las sumaría y DESCONTARIA EL DOBLE, sin quejarse. Que la
   receta sea de la marca (una sola fila) es lo que cierra ese hueco.

   ESTE ARCHIVO NO ROMPE NADA: solo agrega. Las columnas viejas siguen ahí y
   el motor de descuento sigue usándolas hasta el paso 2.
   ══════════════════════════════════════════════════════════════════════ */

-- ── 1. El interruptor, en la marca ────────────────────────────────────
ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS inventario_modo text NOT NULL DEFAULT 'global';

ALTER TABLE public.brands DROP CONSTRAINT IF EXISTS brands_inventario_modo_chk;
ALTER TABLE public.brands ADD CONSTRAINT brands_inventario_modo_chk
  CHECK (inventario_modo IN ('global','sucursal'));

COMMENT ON COLUMN public.brands.inventario_modo IS
  'global = una sola bolsa para toda la marca (un bulto de papa sirve a las 3 sedes; la alerta la ven todas). sucursal = cada sede tiene lo suyo y solo ella ve su alerta. Se decide por marca: una puede tener bodega central y otra no.';

-- ── 2. A quién pertenece cada cosa ────────────────────────────────────
/* La definición del insumo, la receta, las porciones y los alias pasan a ser
   de la MARCA. Se agrega la columna y se rellena desde la sucursal que hoy la
   tiene; branch_id se queda por ahora para no romper nada. */
ALTER TABLE public.iv_insumos      ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE;
ALTER TABLE public.iv_recetas      ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE;
ALTER TABLE public.iv_porciones    ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE;
ALTER TABLE public.iv_insumo_alias ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE;

UPDATE public.iv_insumos      x SET brand_id = b.brand_id FROM public.branches b WHERE b.id = x.branch_id AND x.brand_id IS NULL;
UPDATE public.iv_recetas      x SET brand_id = b.brand_id FROM public.branches b WHERE b.id = x.branch_id AND x.brand_id IS NULL;
UPDATE public.iv_porciones    x SET brand_id = b.brand_id FROM public.branches b WHERE b.id = x.branch_id AND x.brand_id IS NULL;
UPDATE public.iv_insumo_alias x SET brand_id = b.brand_id FROM public.branches b WHERE b.id = x.branch_id AND x.brand_id IS NULL;

CREATE INDEX IF NOT EXISTS iv_insumos_brand  ON public.iv_insumos(brand_id);
CREATE INDEX IF NOT EXISTS iv_recetas_brand  ON public.iv_recetas(brand_id);

-- ── 3. Las existencias, fuera de la definición ────────────────────────
/* El nudo que había: `iv_insumos` guardaba en la misma fila QUE ES el insumo
   y CUANTO HAY. Mientras estuvieran juntos, heredar la definición obligaba a
   heredar también el stock — que es justo lo que no se puede.

   branch_id NULL = la bolsa común de la marca (modo global).
   branch_id lleno = lo que tiene esa sede (modo sucursal).
   Las dos formas conviven en la misma tabla: al cambiar de modo no se migra
   nada, se lee la otra fila. */
CREATE TABLE IF NOT EXISTS public.iv_existencias (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL DEFAULT public.current_tenant_id(),
  insumo_id      uuid NOT NULL REFERENCES public.iv_insumos(id) ON DELETE CASCADE,
  branch_id      uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  stock          numeric(10,3) DEFAULT 0,
  stock_servicio numeric DEFAULT 0,
  agotado_manual boolean DEFAULT false,
  updated_at     timestamptz DEFAULT now()
);

COMMENT ON COLUMN public.iv_existencias.branch_id IS
  'NULL = la bolsa común de la marca (modo global). Lleno = lo que hay en esa sede (modo sucursal).';

/* Un índice normal no sirve: en Postgres dos NULL no se consideran iguales,
   así que la bolsa común se podría duplicar sin que nadie lo impida. */
CREATE UNIQUE INDEX IF NOT EXISTS iv_existencias_uniq
  ON public.iv_existencias (insumo_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS iv_existencias_branch ON public.iv_existencias(branch_id);

ALTER TABLE public.iv_existencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aislar_iv_existencias ON public.iv_existencias;
CREATE POLICY aislar_iv_existencias ON public.iv_existencias
  FOR ALL USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- ── 4. Pasar lo que hay hoy ───────────────────────────────────────────
/* Todas las marcas arrancan en 'global', así que lo de hoy va a la bolsa
   común (branch_id NULL). Con una sola sede los dos modos son idénticos, de
   modo que esto no cambia ningún número para nadie. */
INSERT INTO public.iv_existencias (tenant_id, insumo_id, branch_id, stock, stock_servicio, agotado_manual)
SELECT i.tenant_id, i.id, NULL, COALESCE(i.stock,0), COALESCE(i.stock_servicio,0), COALESCE(i.agotado_manual,false)
FROM public.iv_insumos i
ON CONFLICT DO NOTHING;

-- ── 5. Comprobación ───────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM public.iv_insumos)                          AS insumos,
  (SELECT count(*) FROM public.iv_insumos WHERE brand_id IS NULL)   AS insumos_sin_marca,
  (SELECT count(*) FROM public.iv_recetas WHERE brand_id IS NULL)   AS recetas_sin_marca,
  (SELECT count(*) FROM public.iv_existencias)                      AS existencias,
  (SELECT count(*) FROM public.iv_existencias e JOIN public.iv_insumos i ON i.id=e.insumo_id
    WHERE COALESCE(e.stock,0) <> COALESCE(i.stock,0))               AS stock_que_no_cuadra,
  (SELECT count(*) FROM public.brands WHERE inventario_modo='global') AS marcas_en_global;
