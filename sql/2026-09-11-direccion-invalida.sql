-- 11-sep-2026 · Quien escribio la direccion que quedo pendiente de precio.
--
-- Sergio: un cliente se registro con "Caballo de copas" como direccion (un
-- sitio en la calle, sin barrio ni conjunto). El aviso de la campana le
-- permitia ponerle precio o marcar "no es un barrio", pero no habia forma de
-- decirle AL CLIENTE que la corrigiera: la fila pendiente no sabia de quien
-- era (solo guardaba el texto de la direccion).
--
-- Ahora `web-acceso` anota el cliente al crear la fila, y la campana puede
-- avisarle directo (push + aviso dentro de la app) con "Direccion invalida".
-- Las filas viejas siguen sin cliente: para esas se busca por el texto.
alter table pos_domi_aprendidos
  add column if not exists cliente_id uuid references pos_clientes(id) on delete set null;

comment on column pos_domi_aprendidos.cliente_id is
  'Cliente de la app que escribio esta direccion (para avisarle si es invalida). Null en filas viejas o aprendidas por el asistente.';
