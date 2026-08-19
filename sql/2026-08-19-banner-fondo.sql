-- Fondo configurable del banner de texto de la pagina de clientes.
-- {"tipo":"color"|"degradado"|"imagen", color, color2, angulo, imagen, velo}
-- `velo` es la capa oscura ENCIMA de la foto: sin ella el texto blanco se
-- pierde sobre una imagen clara, por eso no es opcional cuando hay imagen.
alter table tenants add column if not exists web_banner jsonb;

CREATE OR REPLACE FUNCTION public.fn_web_publica(p_slug text)
 RETURNS TABLE(tenant_id uuid, nombre text, abierto boolean, motivo text, detalle text, abre text, cierra text, permite_programar boolean, niveles jsonb, horarios jsonb, logo text, pago jsonb, direccion text, ciudad text, pais text, destacados jsonb, banner jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t RECORD;
  e RECORD;
  s RECORD;
BEGIN
  /* El nombre que ve el cliente es el de la MARCA, no el de la cuenta. La cuenta
     suele quedar registrada con el correo del dueño ("elparche.foodpopayan") y
     eso es lo último que uno quiere mostrarle a un comensal. Si no hay marca, se
     cae al nombre de la cuenta para no dejar la página sin título. */
  SELECT t0.id, t0.web_destacados, t0.web_banner,
         coalesce(nullif(btrim((SELECT b.name FROM brands b
                                 WHERE b.tenant_id = t0.id
                                 ORDER BY b.created_at LIMIT 1)), ''), t0.name) AS name
    INTO t
    FROM tenants t0
   WHERE lower(t0.slug) = lower(regexp_replace(coalesce(p_slug, ''), '[^a-zA-Z0-9]', '', 'g'))
     AND coalesce(t0.web_activa, false) = true
     AND coalesce(t0.status, 'active') = 'active'
   LIMIT 1;

  IF t.id IS NULL THEN RETURN; END IF;   -- sin filas: la página dirá que no existe

  SELECT * INTO e FROM fn_web_estado(t.id);

  tenant_id := t.id;
  nombre    := t.name;
  /* La foto del restaurante es la MISMA que ya se configuro en Cobra
     (brands.logo_url). Una segunda foto solo para la pagina seria una foto mas
     que mantener, y el dia que cambien el logo quedarian distintas. */
  /* Los datos de pago del restaurante, para la pantalla de recarga. Solo lo
     que el cliente necesita para transferir -- nada mas de esa configuracion. */
  pago := (SELECT jsonb_build_object(
             'llave',   ic.pagos->>'llave',
             'numero',  ic.pagos->>'numero',
             'entidad', ic.pagos->>'entidad',
             'titular', ic.pagos->>'titular')
           FROM ia_config ic
           WHERE ic.tenant_id = t.id LIMIT 1);
  logo := (SELECT nullif(btrim(b.logo_url), '') FROM brands b
            WHERE b.tenant_id = t.id ORDER BY b.created_at LIMIT 1);

  /* DONDE QUEDA (16-ago). Lo primero que busca quien va a recoger; tenerlo solo
     en el chat obliga a preguntar. Sale de la sucursal, no de la cuenta: un
     restaurante con dos sedes tiene dos direcciones. */
  SELECT nullif(btrim(b.address), '') AS address,
         nullif(btrim(b.city), '')    AS city,
         nullif(btrim(b.country), '') AS country
    INTO s
    FROM branches b
   WHERE b.tenant_id = t.id AND coalesce(b.is_active, true) = true
   ORDER BY b.created_at
   LIMIT 1;
  direccion := s.address;
  ciudad    := s.city;
  pais      := s.country;

  /* Los tres destacados que eligio el dueño, EN ORDEN. Vacio = que la pagina
     los escoja sola, como ha venido haciendo. */
  destacados := coalesce(t.web_destacados, '[]'::jsonb);
  /* EL FONDO DEL BANNER DE TEXTO lo elige el dueNo (color, degradado o su
     propia foto con un velo encima). Nulo = el vino tinto de siempre. */
  banner := t.web_banner;

  abierto   := e.abierto;
  motivo    := e.motivo;
  detalle   := e.detalle;
  abre      := e.abre;
  cierra    := e.cierra;
  permite_programar := e.permite_programar;
  SELECT coalesce(jsonb_agg(jsonb_build_object('nombre', x->>'nombre', 'color', x->>'color')), '[]'::jsonb)
    INTO niveles
    FROM pos_niveles_config c
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(c.niveles, '[]'::jsonb)) x
   WHERE c.tenant_id = t.id
      OR c.branch_id IN (SELECT b.id FROM branches b WHERE b.tenant_id = t.id);
  SELECT c2.horarios INTO horarios
    FROM ia_config c2 JOIN branches b2 ON b2.id = c2.branch_id
   WHERE b2.tenant_id = t.id LIMIT 1;

  RETURN NEXT;
END;
$function$


grant execute on function fn_web_publica(text) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
