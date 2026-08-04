-- Página web de clientes — cimientos.
--
-- Nada de esto se ve todavía: es la base sobre la que se monta la página.
-- Cuatro cosas: la dirección de cada restaurante, el teléfono normalizado en un
-- solo sitio, y las dos tablas del acceso (códigos y sesiones).

-- ─────────────────────────────────────────────────────────────────────
-- 1. UNA SOLA FORMA DE ESCRIBIR UN TELÉFONO
-- ─────────────────────────────────────────────────────────────────────
-- El teléfono es la llave del cliente: sus puntos, su nivel y su cuenta cuelgan
-- de él. Pero cada tabla lo venía normalizando por su cuenta, repitiendo la
-- misma expresión en índices, funciones y código. `pos_clientes` se queda con
-- los últimos 10 dígitos; `pos_puntos` guardaba lo que le llegara.
--
-- Hoy no se nota porque los 72 clientes están en 10 dígitos limpios. Pero basta
-- con que la página guarde un `+573103137510` para que se cree una SEGUNDA fila
-- de puntos del mismo cliente y su saldo se parta en dos: 40 puntos en un lado
-- y 25 en el otro, sin que nadie entienda por qué.
CREATE OR REPLACE FUNCTION pos_tel10(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT right(regexp_replace(coalesce(t, ''), '\D', '', 'g'), 10)
$$;

-- Normalizar lo que ya hay (hoy no cambia ninguna fila: ya están todas en 10).
UPDATE pos_puntos SET telefono = pos_tel10(telefono)
 WHERE telefono IS DISTINCT FROM pos_tel10(telefono);

-- La unicidad pasa a ser por teléfono NORMALIZADO, no por el texto crudo.
-- Es una RESTRICCIÓN, no un índice suelto: hay que quitarla por su nombre de
-- restricción o Postgres se niega (el índice le pertenece a ella).
ALTER TABLE pos_puntos DROP CONSTRAINT IF EXISTS pos_puntos_tenant_tel;
DROP INDEX IF EXISTS pos_puntos_tenant_tel;
CREATE UNIQUE INDEX IF NOT EXISTS ux_puntos_tenant_tel10
  ON pos_puntos (tenant_id, pos_tel10(telefono));

-- `pos_clientes` tenía DOS índices únicos idénticos (mismo tenant, mismos 10
-- dígitos). Uno sobra: cuesta trabajo en cada escritura y el día que alguien lea
-- eso no va a saber cuál manda.
DROP INDEX IF EXISTS pos_clientes_tel_uniq;

-- ─────────────────────────────────────────────────────────────────────
-- 2. LA DIRECCIÓN DE CADA RESTAURANTE
-- ─────────────────────────────────────────────────────────────────────
-- cobrapos.app/elparchefood — lo que va después de la barra lo personaliza cada
-- restaurante. Se genera del nombre del negocio y se puede cambiar después.
CREATE OR REPLACE FUNCTION pos_slug(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
    lower(translate(coalesce(t, ''),
      'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
      'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')),
    '[^a-z0-9]', '', 'g')
$$;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS web_activa boolean NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS web_cerrado_manual boolean NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS web_cierres jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN tenants.web_activa IS 'La página nace apagada: el dueño la enciende, no la crea.';
COMMENT ON COLUMN tenants.web_cerrado_manual IS 'Cerrar el negocio a mano, por encima del horario.';
COMMENT ON COLUMN tenants.web_cierres IS 'Cierres programados: [{desde, hasta, motivo}] — diciembre, vacaciones.';

-- Se rellena solo para los que ya existen. Si dos negocios se llaman igual, al
-- segundo se le pega un número: la dirección no se puede repetir.
UPDATE tenants t SET slug = base.s || CASE WHEN base.n = 1 THEN '' ELSE base.n::text END
  FROM (
    SELECT id, pos_slug(name) AS s,
           row_number() OVER (PARTITION BY pos_slug(name) ORDER BY created_at) AS n
      FROM tenants WHERE slug IS NULL AND pos_slug(name) <> ''
  ) base
 WHERE t.id = base.id;

CREATE UNIQUE INDEX IF NOT EXISTS ux_tenants_slug
  ON tenants (lower(slug)) WHERE slug IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 3. LA CONTRASEÑA DEL CLIENTE — en su propia tabla, cerrada
-- ─────────────────────────────────────────────────────────────────────
-- Lo natural sería una columna en `pos_clientes`. No sirve: esa tabla la leen
-- el cajero, el chat y los informes, y en Postgres no se puede tapar una sola
-- columna si el permiso está dado sobre la tabla entera. La huella de la
-- contraseña quedaría a la vista de todo el que pueda ver un cliente.
--
-- Aquí sí se puede cerrar de verdad: tabla aparte, RLS activo y sin ninguna
-- política, o sea que desde un navegador no entra nadie. Solo la tocan las
-- funciones del servidor.
CREATE TABLE IF NOT EXISTS pos_web_credenciales (
  cliente_id uuid PRIMARY KEY REFERENCES pos_clientes(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pass_hash  text NOT NULL,                     -- bcrypt. NUNCA en claro.
  alta_at    timestamptz NOT NULL DEFAULT now(),
  cambiada_at timestamptz
);

CREATE INDEX IF NOT EXISTS ix_web_cred_tenant ON pos_web_credenciales (tenant_id);

-- ─────────────────────────────────────────────────────────────────────
-- 4. CÓDIGOS DE ACCESO (los 6 dígitos por WhatsApp)
-- ─────────────────────────────────────────────────────────────────────
-- El código es una credencial: se guarda cifrado, igual que una contraseña. Si
-- alguien alcanzara a leer esta tabla, no podría entrar con lo que hay dentro.
CREATE TABLE IF NOT EXISTS pos_web_codigos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  telefono    text NOT NULL,                    -- normalizado, 10 dígitos
  codigo_hash text NOT NULL,
  motivo      text NOT NULL DEFAULT 'alta',     -- 'alta' | 'recordar_clave'
  intentos    smallint NOT NULL DEFAULT 0,
  usado       boolean NOT NULL DEFAULT false,
  expira_at   timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Para el tope de códigos por número por hora, que es lo que evita que la página
-- se vuelva una forma de llenarle el WhatsApp a cualquiera.
CREATE INDEX IF NOT EXISTS ix_web_codigos_tel
  ON pos_web_codigos (tenant_id, telefono, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────
-- 5. SESIONES
-- ─────────────────────────────────────────────────────────────────────
-- Del token solo se guarda su huella: si alguien leyera esta tabla, no podría
-- hacerse pasar por nadie.
CREATE TABLE IF NOT EXISTS pos_web_sesiones (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES pos_clientes(id) ON DELETE CASCADE,
  telefono   text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  recordar   boolean NOT NULL DEFAULT false,    -- la casilla "mantener mi sesión"
  expira_at  timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ultimo_uso timestamptz
);

CREATE INDEX IF NOT EXISTS ix_web_sesiones_cliente
  ON pos_web_sesiones (cliente_id, expira_at DESC);

-- ─────────────────────────────────────────────────────────────────────
-- 6. CANDADOS
-- ─────────────────────────────────────────────────────────────────────
-- Estas dos tablas NO las toca nadie desde un navegador. Solo las funciones del
-- servidor, que corren con la llave de servicio. Se activa RLS y no se crea
-- ninguna política: sin política, RLS no deja pasar a nadie.
ALTER TABLE pos_web_codigos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_web_sesiones     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_web_credenciales ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON pos_web_codigos      FROM anon, authenticated;
REVOKE ALL ON pos_web_sesiones     FROM anon, authenticated;
REVOKE ALL ON pos_web_credenciales FROM anon, authenticated;
