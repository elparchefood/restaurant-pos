
-- Segundo numero de contacto. NO es llave y NO acumula puntos: es solo "por si
-- acaso el cliente lo indica" (el del esposo, el de la casa, el de quien recibe).
-- La llave del cliente y la cuenta de puntos siguen siendo `telefono`.
ALTER TABLE pos_clientes ADD COLUMN IF NOT EXISTS telefono2 text;
COMMENT ON COLUMN pos_clientes.telefono2 IS 'Segundo numero de contacto. NO es llave ni acumula puntos; solo para poder ubicar al cliente.';
