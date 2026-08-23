-- ═══════════════════════════════════════════════════════════════════════════
--  El cuaderno de diagnósticos deja de ser público  (23-ago-2026)
-- ───────────────────────────────────────────────────────────────────────────
--  Hallado en la auditoría de multimarca que pidió Sergio.
--
--  `pos_diag` es donde el sistema anota lo que le salió raro. La política
--  `diag_read` lo dejaba LEER a `anon`: o sea a cualquiera con la llave
--  pública, que va escrita en el front y por tanto la tiene todo el mundo.
--
--  Y ahí dentro hay datos de personas de verdad. De las 270 anotaciones de
--  hoy: teléfonos de clientes (`chat/puntos`), y lecturas de comprobantes de
--  banco con monto y remitente (`web-recarga/lectura`). Con un restaurante es
--  poco; con cincuenta es una lista.
--
--  No se pierde nada al cerrarlo: NINGUNA pantalla lee esta tabla — se buscó
--  en todo el proyecto y solo hay inserciones. El que necesita mirarla es
--  Sergio, y él entra por la consola (que va con la llave de servicio y se
--  salta RLS de todos modos).
--
--  Lo que SÍ se conserva es poder escribir: si anotar fallara, el rastro se
--  perdería justo cuando más falta hace — que es la lección del trigger de
--  puntos que estuvo cinco días callado.
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists diag_read on pos_diag;

create policy diag_read on pos_diag
  for select
  using (
    exists (
      select 1 from public.user_profiles p
       where p.id = auth.uid() and p.role = 'admin'
    )
  );

comment on table pos_diag is
  'Cuaderno de diagnósticos. Cualquiera puede ANOTAR (si no, se pierde el rastro justo cuando hace falta); LEER solo el administrador de la plataforma. Puede contener datos de clientes.';
