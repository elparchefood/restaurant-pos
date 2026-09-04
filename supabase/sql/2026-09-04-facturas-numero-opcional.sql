-- ══════════════════════════════════════════════════════════════════════
--  EL NUMERO DE FACTURA NO PUEDE SER OBLIGATORIO  (4-sep-2026)
--
--  La regla 7 del adaptador dice: «un rechazo siempre se ve». La tabla la
--  contradecia: `numero` era NOT NULL, y un documento rechazado no trae
--  numero —el proveedor no gasta uno en algo que no acepto.
--
--  Resultado: al intentar guardar el rechazo, Postgres devolvia 23502 y la
--  funcion moria. El rechazo se perdia justo cuando mas falta hacia, y
--  desde fuera parecia que la facturacion «no hacia nada».
--
--  Comprobado 4-sep 18:58, tras arreglar los permisos:
--    pos_facturas 400 {"code":"23502", ... numero = null ... }
--
--  El numero llega CUANDO el proveedor acepta, no antes. Que la columna
--  sea opcional no es aflojar la regla: es escribir la verdad de que una
--  factura pendiente todavia no tiene numero.
-- ══════════════════════════════════════════════════════════════════════

alter table public.pos_facturas alter column numero drop not null;

--  Pero que no se quede a medias: si esta ACEPTADA, el numero es
--  obligatorio. Eso si es una regla dura, y ahora la sostiene la base.
alter table public.pos_facturas
  drop constraint if exists pos_facturas_aceptada_con_numero;
alter table public.pos_facturas
  add constraint pos_facturas_aceptada_con_numero
  check (estado <> 'aceptada' or numero is not null);

--  Igual el CUFE: es lo que la DIAN devuelve al aceptar. Una factura
--  aceptada sin CUFE no se puede demostrar ante nadie.
alter table public.pos_facturas
  drop constraint if exists pos_facturas_aceptada_con_cufe;
alter table public.pos_facturas
  add constraint pos_facturas_aceptada_con_cufe
  check (estado <> 'aceptada' or cufe is not null);

do $$
begin
  if (select is_nullable from information_schema.columns
       where table_schema='public' and table_name='pos_facturas'
         and column_name='numero') <> 'YES' then
    raise exception 'numero sigue siendo obligatorio';
  end if;
end $$;
