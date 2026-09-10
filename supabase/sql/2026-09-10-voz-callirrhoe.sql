-- La voz de la cocina de TODO Cobra: la escogio Sergio el 10-sep-2026
-- (Nº 17 del comparador, entre las 48 de Google es-US). Chirp 3 HD:
-- 1 M de letras al mes gratis, despues US$30 por millon; por eso el secreto
-- VOZ_TOPE_GLOBAL quedo en 950.000 (dentro de lo gratis).
insert into public.pos_voces (id, nombre, proveedor, config, por_defecto, orden, notas) values
  ('google-es-us-chirp3-hd-callirrhoe', 'Callirrhoe · mujer', 'google',
   '{"voz": "es-US-Chirp3-HD-Callirrhoe", "idioma": "es-US"}'::jsonb, true, 10,
   'La escogio Sergio el 10-sep-2026. Chirp 3 HD: 1 M letras/mes gratis, luego US$30/M.')
on conflict (id) do update set config = excluded.config, activa = true, por_defecto = true;
