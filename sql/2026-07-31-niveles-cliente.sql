-- Niveles de cliente (Estandar/Premium/VIP). El calculo vive en la BASE para
-- que el chat, la futura pantalla del cliente y los informes lean lo mismo.
-- Config en pos_niveles_config: criterio (puntos|pedidos|gastado) + umbrales.
CREATE OR REPLACE FUNCTION fn_nivel_cliente(p_tenant uuid, p_tel text)
RETURNS TABLE (criterio text, valor numeric, nivel text, color text, siguiente text, falta numeric, desde_actual numeric, desde_siguiente numeric, progreso integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  t10  text := right(regexp_replace(coalesce(p_tel,''), '\D', '', 'g'), 10);
  cfg  RECORD;
  crit text;
  nivs jsonb;
  v    numeric := 0;
  act  jsonb;
  sig  jsonb;
  i    int;
BEGIN
  SELECT * INTO cfg FROM pos_niveles_config c
   WHERE c.tenant_id = p_tenant OR c.branch_id IN (SELECT b.id FROM branches b WHERE b.tenant_id = p_tenant)
   LIMIT 1;
  crit := coalesce(cfg.criterio, 'puntos');
  nivs := coalesce(cfg.niveles, '[
    {"nombre":"Estándar","desde":0,"color":"#787C8B"},
    {"nombre":"Premium","desde":150,"color":"#7C5CFF"},
    {"nombre":"VIP","desde":400,"color":"#F0A83C"}]'::jsonb);

  IF crit = 'pedidos' THEN
    SELECT count(*) INTO v FROM pos_orders o
      JOIN pos_clientes cl ON cl.id = o.cliente_id
     WHERE cl.tenant_id = p_tenant
       AND right(regexp_replace(cl.telefono,'\D','','g'),10) = t10
       AND coalesce(o.status,'') <> 'cancelled';
  ELSIF crit = 'gastado' THEN
    SELECT coalesce(sum(coalesce(o.total_final, o.total)),0) INTO v FROM pos_orders o
      JOIN pos_clientes cl ON cl.id = o.cliente_id
     WHERE cl.tenant_id = p_tenant
       AND right(regexp_replace(cl.telefono,'\D','','g'),10) = t10
       AND coalesce(o.status,'') <> 'cancelled';
  ELSE
    SELECT coalesce(max(p.puntos),0) INTO v FROM pos_puntos p
     WHERE right(regexp_replace(p.telefono,'\D','','g'),10) = t10;
  END IF;

  -- El nivel actual es el último cuyo umbral ya alcanzó.
  act := nivs->0; sig := NULL;
  FOR i IN 0 .. jsonb_array_length(nivs)-1 LOOP
    IF v >= (nivs->i->>'desde')::numeric THEN act := nivs->i;
    ELSE sig := nivs->i; EXIT;
    END IF;
  END LOOP;

  criterio := crit;
  valor    := v;
  nivel    := act->>'nombre';
  color    := coalesce(act->>'color', '#7C5CFF');
  siguiente:= sig->>'nombre';
  desde_actual    := (act->>'desde')::numeric;
  desde_siguiente := (sig->>'desde')::numeric;
  falta    := CASE WHEN sig IS NULL THEN 0 ELSE greatest(0, (sig->>'desde')::numeric - v) END;
  progreso := CASE
    WHEN sig IS NULL THEN 100
    WHEN (sig->>'desde')::numeric <= (act->>'desde')::numeric THEN 100
    ELSE least(100, greatest(0, round(((v - (act->>'desde')::numeric) * 100)
          / ((sig->>'desde')::numeric - (act->>'desde')::numeric))))::int
  END;
  RETURN NEXT;
END;
$$;