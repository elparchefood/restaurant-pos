-- ══════════════════════════════════════════════════════════════════════
--  FACTURACION — LOS PERMISOS QUE FALTABAN  (4-sep-2026)
--
--  SINTOMA: `facturar` contestaba «No se pudo hablar con la base» y no
--  emitia nada. Cero facturas en toda la base desde el 21 de agosto.
--
--  CAUSA: las dos tablas se crearon con RLS y con su politica de tenant,
--  pero SIN el `grant`. Y son dos cosas distintas que se confunden:
--
--    · el GRANT dice si el rol puede tocar la tabla;
--    · la POLITICA dice cuales filas puede tocar.
--
--  Sin grant no se llega ni a mirar la politica. Postgres contesta 42501
--  —«insufficient privilege»— y PostgREST lo devuelve como un 403, que es
--  justo el error que `fetch` NO lanza. Por eso parecia un problema de
--  datos y no de permisos.
--
--  Comprobado en los registros de la funcion, 4-sep 18:55:
--    base: pos_facturas?... 403 {"code":"42501",
--      "hint":"GRANT SELECT ON public.pos_facturas TO service_role;"}
--
--  La base decia exactamente que hacia falta. Es la misma leccion del
--  rastro del gerente: mirar `ok`, y revisar permisos AL CREAR la tabla.
-- ══════════════════════════════════════════════════════════════════════

-- ── 1. Las facturas ───────────────────────────────────────────────────
--  Las emite la Edge Function con la llave de servicio, y nadie mas. Del
--  navegador solo se LEEN: el panel del gerente las muestra, pero una
--  factura no se crea ni se corrige desde una pantalla.
grant select, insert, update on public.pos_facturas to service_role;
grant select                 on public.pos_facturas to authenticated;

--  DELETE no se da a nadie, y es a proposito: una factura emitida es un
--  hecho ante la DIAN. Lo contrario de una factura no es borrarla, es la
--  nota de credito —que ya existe en esta misma tabla.

-- ── 2. Los rangos de la resolucion ────────────────────────────────────
--  Al reves: los escribe el gerente desde Configuracion, y el servidor
--  solo necesita leerlos y adelantar el consecutivo.
grant select, insert, update on public.pos_facturacion_rangos to authenticated;
--  INSERT tambien para el servidor (agregado el 4-sep, mismo dia): desde
--  que la resolucion se LEE DEL PROVEEDOR en vez de escribirla el dueno,
--  quien crea la fila es la Edge Function. Se me paso justo por lo mismo
--  de agosto: se dan los permisos de lo que hace falta HOY y el dia que
--  algo nuevo escribe, revienta con 42501 — que `fetch` no lanza.
grant select, insert, update on public.pos_facturacion_rangos to service_role;

--  Tampoco DELETE: la resolucion vencida no se borra, se desactiva
--  (`activo = false`). Hay que poder decir con que resolucion se emitio
--  cada factura vieja.

-- ── 3. Que no vuelva a pasar con las tablas que vengan ────────────────
--  Esto NO arregla las de hoy: solo se aplica a las que se creen desde
--  ahora, y solo a las que cree este mismo rol.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant select, insert, update on tables to authenticated;

-- ── 4. La comprobacion ────────────────────────────────────────────────
--  Se falla aqui mismo si algo quedo corto, para no descubrirlo otra vez
--  a base de una factura que no sale.
do $$
declare falta text;
begin
  select string_agg(x.tabla || ' -> ' || x.rol || ':' || x.priv, ', ')
    into falta
  from (values
      ('pos_facturas','service_role','SELECT'), ('pos_facturas','service_role','INSERT'),
      ('pos_facturas','service_role','UPDATE'), ('pos_facturas','authenticated','SELECT'),
      ('pos_facturacion_rangos','authenticated','SELECT'),
      ('pos_facturacion_rangos','authenticated','INSERT'),
      ('pos_facturacion_rangos','authenticated','UPDATE'),
      ('pos_facturacion_rangos','service_role','SELECT')
    ) as x(tabla, rol, priv)
  where not has_table_privilege(x.rol, 'public.' || x.tabla, x.priv);

  if falta is not null then
    raise exception 'Faltan permisos: %', falta;
  end if;
end $$;
