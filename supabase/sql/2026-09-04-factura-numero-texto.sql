-- ══════════════════════════════════════════════════════════════════════
--  EL NUMERO DE FACTURA ES TEXTO, NO UN NUMERO  (4-sep-2026)
--
--  Lo dijo la primera factura que salio de verdad. Factus devolvio:
--
--      number = "SETP990017772"
--
--  y la tabla lo esperaba `bigint`:
--      22P02 invalid input syntax for type bigint: "SETP990017772"
--
--  O SEA QUE LA FACTURA SE EMITIO Y NO SE PUDO GUARDAR. Peor que no
--  emitirla: el documento existe ante el proveedor y en la casa no queda
--  rastro.
--
--  ── POR QUE NO ES SOLO UN CAMBIO DE TIPO ─────────────────────────────
--  El identificador de un documento electronico ante la DIAN es PREFIJO +
--  CONSECUTIVO, y va junto: "SETP990017772". No es una cantidad. No se
--  suma, no se promedia, y el cero de la izquierda cuenta.
--
--  Yo lo puse bigint porque *parece* un numero. Es el mismo error de
--  siempre: guardar la forma en vez del significado. Un telefono tampoco
--  es un numero.
--
--  ── Y EL CONSECUTIVO NUESTRO SE QUEDA COMO ESTA ──────────────────────
--  `pos_facturacion_rangos.actual` SIGUE siendo bigint, y esta bien: ese
--  si es un contador —se le suma uno— y es NUESTRO, para el dia que el
--  proveedor no lleve la numeracion. Son dos cosas distintas aunque se
--  parezcan: una cuenta, la otra identifica.
-- ══════════════════════════════════════════════════════════════════════

--  El indice unico incluye `numero`, asi que se quita y se vuelve a poner.
drop index if exists ux_factura_numero;

alter table public.pos_facturas
  alter column numero type text using numero::text;

--  Mismo indice, mismo sentido: dos documentos del mismo restaurante no
--  pueden llevar el mismo prefijo y numero.
create unique index ux_factura_numero
  on public.pos_facturas (tenant_id, prefijo, numero);

do $$
begin
  if (select data_type from information_schema.columns
       where table_schema='public' and table_name='pos_facturas'
         and column_name='numero') <> 'text' then
    raise exception 'numero no quedo en texto';
  end if;
  if not exists (select 1 from pg_class where relname='ux_factura_numero') then
    raise exception 'se perdio el indice unico del numero';
  end if;
end $$;
