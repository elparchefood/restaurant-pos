-- ¿La página está abierta ahora mismo, y por qué?
--
-- Son TRES cosas distintas y antes las había mezclado en un solo interruptor:
--
--   1. EL HORARIO manda siempre. No es una opción: si el restaurante está
--      cerrado según su horario, la página está cerrada. Punto.
--   2. EL CIERRE A MANO es una excepción POR ENCIMA del horario, para el día que
--      el negocio cierra a una hora distinta de la que tiene puesta.
--   3. LOS CIERRES PROGRAMADOS son para lo que se sabe con anticipación:
--      diciembre, vacaciones, un festivo.
--
-- Cualquiera de las tres puede cerrar; ninguna puede abrir por encima de otra.
-- Estar "abierto" es que las tres digan que sí.
--
-- El cálculo vive aquí y no en cada pantalla para que la configuración del dueño
-- y la página del cliente digan exactamente lo mismo. Es la misma razón por la
-- que el nivel del cliente se calcula en `fn_nivel_cliente`.

-- Cerrar a mano "solo por hoy": a esa hora se reabre solo.
-- Sin esto, el dueño cierra un sábado por la noche, se le olvida, y el domingo
-- pierde el día entero sin enterarse.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS web_cerrado_hasta timestamptz;

/* CERRADO NO ES APAGADO. Con el negocio cerrado la página se sigue viendo
   completa: el cliente entra, mira su saldo, sus puntos, recarga y navega la
   carta. Lo único que cambia es si puede o no MANDAR un pedido.
   Y eso lo decide cada restaurante: si acepta pedidos programados, el cliente
   puede dejarlo pedido para después; si no, ve que ahora no se puede y ya. */
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS web_programar_pedidos boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN tenants.web_programar_pedidos IS
  'Con el negocio cerrado, ¿el cliente puede dejar el pedido programado para después?';
COMMENT ON COLUMN tenants.web_cerrado_hasta IS
  'Cierre a mano con vencimiento. NULL con web_cerrado_manual=true = cerrado hasta que lo abran.';

CREATE OR REPLACE FUNCTION fn_web_estado(p_tenant uuid)
RETURNS TABLE (
  abierto boolean,
  motivo  text,     -- 'abierto' | 'horario' | 'manual' | 'programado' | 'sin_horario'
  detalle text,
  abre    text,
  cierra  text,
  -- Con el negocio cerrado: ¿deja el restaurante que le programen pedidos?
  permite_programar boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t        RECORD;
  cfg      RECORD;
  tz       text;
  ahora    timestamptz := now();
  local    timestamp;
  dia      text;
  hoy      jsonb;
  h_abre   text;
  h_cierra text;
  cierre   jsonb;
  desfase  interval;
  i        int;
BEGIN
  SELECT id, web_cerrado_manual, web_cerrado_hasta, web_cierres, web_programar_pedidos
    INTO t FROM tenants WHERE id = p_tenant;
  IF t.id IS NULL THEN
    abierto := false; motivo := 'sin_horario'; detalle := 'No existe ese restaurante';
    permite_programar := false;
    RETURN NEXT; RETURN;
  END IF;

  SELECT c.horarios, c.zona_horaria INTO cfg
    FROM ia_config c JOIN branches b ON b.id = c.branch_id
   WHERE b.tenant_id = p_tenant LIMIT 1;

  permite_programar := coalesce(t.web_programar_pedidos, false);
  tz := coalesce(cfg.zona_horaria, '-05:00');

  /* ⚠ TRAMPA DE POSTGRES, y de las caras.
     `AT TIME ZONE '-05:00'` con la zona como TEXTO no resta cinco horas: las
     SUMA. Postgres lee esa cadena como nombre de zona al estilo POSIX, donde el
     signo va al revés. Resultado: diez horas de error — a las 10 de la noche del
     lunes la base creía que eran las 8 de la mañana del martes, y el horario del
     restaurante habría estado corrido todo el día.
     Como INTERVALO sí resta bien. Los nombres de zona de verdad
     ("America/Bogota") se usan tal cual. */
  /* La zona puede venir de varias formas: '-5' (lo que hay guardado hoy),
     '-05:00', o un nombre real como 'America/Bogota'. Las numéricas se pasan a
     intervalo; los nombres se usan tal cual. */
  IF tz ~ '^[+-]?[0-9]{1,2}(:[0-9]{2})?$' THEN
    desfase := (CASE WHEN tz ~ ':' THEN tz ELSE tz || ':00' END)::interval;
    local := ahora AT TIME ZONE desfase;
  ELSE
    desfase := NULL;
    local := ahora AT TIME ZONE tz;
  END IF;

  -- 1. CIERRE A MANO. Si tiene vencimiento y ya pasó, no cuenta.
  IF coalesce(t.web_cerrado_manual, false)
     AND (t.web_cerrado_hasta IS NULL OR t.web_cerrado_hasta > ahora) THEN
    abierto := false; motivo := 'manual';
    detalle := CASE WHEN t.web_cerrado_hasta IS NULL
                    THEN 'Cerrado a mano hasta que lo vuelvas a abrir'
                    ELSE 'Cerrado a mano hasta las ' ||
                         to_char(CASE WHEN desfase IS NOT NULL
                                      THEN t.web_cerrado_hasta AT TIME ZONE desfase
                                      ELSE t.web_cerrado_hasta AT TIME ZONE tz END,
                                 'HH12:MI am') END;
    RETURN NEXT; RETURN;
  END IF;

  -- 2. CIERRES PROGRAMADOS: [{desde, hasta, motivo}] con fechas del negocio.
  IF jsonb_typeof(coalesce(t.web_cierres, '[]'::jsonb)) = 'array' THEN
    FOR i IN 0 .. jsonb_array_length(t.web_cierres) - 1 LOOP
      cierre := t.web_cierres -> i;
      IF (cierre->>'desde') IS NOT NULL AND (cierre->>'hasta') IS NOT NULL
         AND local::date >= (cierre->>'desde')::date
         AND local::date <= (cierre->>'hasta')::date THEN
        abierto := false; motivo := 'programado';
        detalle := coalesce(nullif(btrim(cierre->>'motivo'), ''), 'Cerrado por temporada')
                   || ' · hasta el ' || to_char((cierre->>'hasta')::date, 'DD/MM');
        RETURN NEXT; RETURN;
      END IF;
    END LOOP;
  END IF;

  -- 3. EL HORARIO.
  IF cfg.horarios IS NULL THEN
    -- Sin horario configurado se deja ABIERTA: es peor dejar a un restaurante
    -- sin vender por algo que nunca configuró que dejarlo abierto de más.
    abierto := true; motivo := 'sin_horario';
    detalle := 'No tienes horarios configurados, así que la página no cierra sola';
    RETURN NEXT; RETURN;
  END IF;

  dia := CASE extract(dow from local)::int
           WHEN 0 THEN 'domingo' WHEN 1 THEN 'lunes'   WHEN 2 THEN 'martes'
           WHEN 3 THEN 'miercoles' WHEN 4 THEN 'jueves' WHEN 5 THEN 'viernes'
           ELSE 'sabado' END;
  hoy := cfg.horarios -> dia;

  IF hoy IS NULL OR coalesce((hoy->>'activo')::boolean, false) = false THEN
    abierto := false; motivo := 'horario';
    detalle := 'Hoy el restaurante no abre';
    RETURN NEXT; RETURN;
  END IF;

  h_abre   := coalesce(hoy->>'abre', '00:00');
  h_cierra := coalesce(hoy->>'cierra', '23:59');
  abre := h_abre; cierra := h_cierra;

  /* Cierre pasada la medianoche (abre 6 pm, cierra 1 am): el rango da la vuelta,
     así que se compara al revés. Sin esto, un restaurante que cierra a la 1 am
     aparecería cerrado toda la noche. */
  IF h_cierra::time <= h_abre::time THEN
    abierto := (local::time >= h_abre::time) OR (local::time < h_cierra::time);
  ELSE
    abierto := (local::time >= h_abre::time) AND (local::time < h_cierra::time);
  END IF;

  IF abierto THEN
    motivo := 'abierto'; detalle := 'Abierto hasta las ' || h_cierra;
  ELSE
    motivo := 'horario';
    detalle := CASE WHEN local::time < h_abre::time
                    THEN 'Abre hoy a las ' || h_abre
                    ELSE 'Cerró a las ' || h_cierra END;
  END IF;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION fn_web_estado(uuid) FROM public;
GRANT EXECUTE ON FUNCTION fn_web_estado(uuid) TO anon, authenticated, service_role;
