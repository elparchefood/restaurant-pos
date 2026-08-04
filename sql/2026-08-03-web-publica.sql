-- Lo que un visitante SIN SESIÓN puede saber de un restaurante.
--
-- La página del cliente entra sin cuenta, como un desconocido, y la tabla de
-- restaurantes no le deja ver nada — correcto: ahí están los correos, los planes
-- y el estado de pago de todos los negocios que usan Cobra.
--
-- Así que no se abre la tabla: se abre esta rendija. Devuelve el nombre, si la
-- página está publicada y si el negocio está abierto. Nada más. Ni correo, ni
-- plan, ni cuántas sucursales tiene, ni si está al día con su pago.
--
-- Y solo responde por restaurantes con la página PUBLICADA: mientras el dueño no
-- la encienda, ni siquiera se puede averiguar si esa dirección existe.
-- Se borra antes de crearla: al agregarle una columna de salida, Postgres no
-- deja reemplazarla sin más.
DROP FUNCTION IF EXISTS fn_web_publica(text);

CREATE FUNCTION fn_web_publica(p_slug text)
RETURNS TABLE (
  tenant_id uuid,
  nombre    text,
  abierto   boolean,
  motivo    text,
  detalle   text,
  abre      text,
  cierra    text,
  permite_programar boolean,
  -- Los rangos de ESTE restaurante, para pintar la escalera. Solo el nombre y
  -- el color: los umbrales en pesos son suyos y no se le muestran al cliente.
  niveles   jsonb,
  -- Los horarios, para la pantalla "El local". Es información que el
  -- restaurante quiere que su cliente vea.
  horarios  jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t RECORD;
  e RECORD;
BEGIN
  /* El nombre que ve el cliente es el de la MARCA, no el de la cuenta. La cuenta
     suele quedar registrada con el correo del dueño ("elparche.foodpopayan") y
     eso es lo último que uno quiere mostrarle a un comensal. Si no hay marca, se
     cae al nombre de la cuenta para no dejar la página sin título. */
  SELECT t0.id,
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
$$;

REVOKE ALL ON FUNCTION fn_web_publica(text) FROM public;
GRANT EXECUTE ON FUNCTION fn_web_publica(text) TO anon, authenticated, service_role;
