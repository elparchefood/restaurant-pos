-- Los textos de los avisos al celular, editables por cada restaurante desde
-- "Mi página web". Antes vivian escritos en la funcion `avisar-cliente`: los
-- mismos para todos, y Sergio no podia cambiarles ni una palabra.
--
-- Forma: { "<clave>": { "titulo": "...", "cuerpo": "..." }, ... }
-- Claves: preparacion · listo_domicilio · listo_recoger · en_camino ·
--         entregado · recarga_con_bono · recarga_sin_bono
--
-- Lo que no este escrito usa el texto de fabrica, asi que un restaurante que
-- no toque nada sigue funcionando igual. Nulo = todo de fabrica.
alter table tenants add column if not exists web_avisos jsonb;
notify pgrst, 'reload schema';
