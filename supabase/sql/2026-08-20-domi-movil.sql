-- El numero de MOVIL del domiciliario externo (Rapid Service) queda en el
-- pedido: cuando la central pregunta "que movil lo llevo?", la respuesta
-- esta en el historial y no en la memoria de nadie. (20-ago-2026)
alter table pos_orders add column if not exists domi_movil text;
