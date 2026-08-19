-- De DONDE salio cada barrio sin precio.
--
-- La campana del escritorio se estaba llenando con todo lo que Paco aprendia
-- atendiendo pedidos, y Sergio pidio que ahi solo lleguen los barrios de
-- personas que se REGISTRARON en la pagina de clientes: son los que el tiene
-- que confirmar para que quede guardado el precio del domicilio.
--
--   'web'  — lo escribio un cliente al guardar su direccion en la pagina
--   'chat' — lo aprendio el asistente atendiendo un pedido
alter table pos_domi_aprendidos add column if not exists origen text;
-- Los que ya estaban son del chat: se comprobo cruzandolos con los clientes
-- que tienen sesion en la pagina (ninguno coincidia).
update pos_domi_aprendidos set origen = 'chat' where origen is null;
notify pgrst, 'reload schema';
