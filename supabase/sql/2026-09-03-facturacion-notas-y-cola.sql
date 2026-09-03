-- ══════════════════════════════════════════════════════════════════════
--  FACTURACION ELECTRONICA — notas de credito, cola y proveedor
--  (3-sep-2026)
--
--  Sigue a `2026-08-21-facturacion-dian-base.sql`, y como aquella, NO habla
--  con ningun proveedor: monta lo que es nuestro y no cambia segun quien nos
--  preste la API.
--
--  ESO ES A PROPOSITO Y ES UNA DECISION DE NEGOCIO, no una manía tecnica.
--  Sergio, 3-sep: *"en el momento que ya tengamos volumen de clientes y ya
--  haya bastantes facturas electronicas ya podemos pasarnos a Alanube"*. O
--  sea que el proveedor de HOY no es el de siempre, y cambiarlo tiene que
--  salir barato. Todo lo que dependa del proveedor vive en UN adaptador; la
--  base guarda lo mismo venga de donde venga.
-- ══════════════════════════════════════════════════════════════════════

-- ── 1. De que proveedor salio cada factura ────────────────────────────
--  El dia que se cambie de proveedor, las facturas viejas NO se migran: una
--  factura emitida es un hecho cerrado ante la DIAN. Pero hay que poder
--  saber quien la emitio para reclamar, reenviar o consultar su estado —
--  cada proveedor tiene su propio panel y su propio identificador.
alter table pos_facturas
  add column if not exists proveedor    text,
  add column if not exists proveedor_id text;   -- el id del documento en SU sistema

comment on column pos_facturas.proveedor is
  'Quien la emitio: factus | matias | alanube. Se guarda por factura, no por '
  'restaurante: al cambiar de proveedor las viejas siguen siendo de quien las emitio.';

-- ── 2. Las notas de credito ───────────────────────────────────────────
--  UNA FACTURA EMITIDA NO SE BORRA. Si el pedido se anula, la unica forma
--  legal de deshacerla es emitir una nota de credito que la referencie. Hoy
--  anular un pedido solo lo marca `cancelled`, y eso deja una factura viva
--  ante la DIAN por algo que no se vendio.
--
--  Va en la MISMA tabla que las facturas, no en una aparte:
--    · comparte estados (pendiente -> enviada -> aceptada/rechazada),
--    · comparte la cola de reintento,
--    · y comparte el consecutivo, que tambien lleva su propio rango.
--  Tenerlas separadas obligaria a duplicar las tres cosas.
alter table pos_facturas
  add column if not exists tipo    text not null default 'factura',
  add column if not exists nota_de uuid references pos_facturas(id),
  add column if not exists motivo  text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'facturas_tipo_valido') then
    alter table pos_facturas add constraint facturas_tipo_valido
      check (tipo in ('factura', 'nota_credito'));
  end if;

  --  Una nota de credito SIN factura de origen no significa nada, y una
  --  factura no puede referenciar a otra. Se obliga aqui y no en el codigo:
  --  el codigo se olvida, la base no.
  if not exists (select 1 from pg_constraint where conname = 'facturas_nota_coherente') then
    alter table pos_facturas add constraint facturas_nota_coherente
      check ((tipo = 'nota_credito' and nota_de is not null)
          or (tipo = 'factura'      and nota_de is null));
  end if;
end $$;

--  UNA sola nota de credito por factura. Emitir dos contra la misma factura
--  es devolver el dinero dos veces ante la DIAN.
create unique index if not exists facturas_una_nota_por_factura
  on pos_facturas (nota_de)
  where tipo = 'nota_credito' and estado <> 'rechazada';

-- ── 3. La cola: cuando reintentar ─────────────────────────────────────
--  Sin internet se sigue vendiendo (regla dura 3): la venta sale con recibo
--  provisional y la factura queda `pendiente`. Alguien tiene que reintentar.
--
--  `proximo_intento` existe para NO reintentar en bucle. Un rechazo por
--  datos mal puestos no se arregla repitiendolo mil veces: solo quema
--  documentos del paquete —que se pagan— y llena la tabla de ruido.
alter table pos_facturas
  add column if not exists proximo_intento timestamptz;

--  El indice que usa el reintento. Parcial a proposito: las aceptadas son la
--  inmensa mayoria y no tienen por que ocupar sitio en el.
create index if not exists facturas_cola
  on pos_facturas (proximo_intento)
  where estado in ('pendiente', 'rechazada');

-- ── 4. Cuanto esperar antes del siguiente intento ─────────────────────
--  Espera que se duplica: 1, 2, 4, 8... minutos, con tope de 1 hora. Lo
--  normal es que el primer reintento funcione (un corte de internet dura
--  segundos); si va por el intento diez, algo pasa de verdad y machacar al
--  proveedor cada minuto no lo arregla.
create or replace function fn_factura_reintentar(p_factura uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intentos int;
begin
  update pos_facturas
     set intentos        = intentos + 1,
         error           = p_error,
         estado          = 'pendiente',
         proximo_intento = now() + make_interval(mins => least(power(2, least(intentos, 6))::int, 60))
   where id = p_factura
  returning intentos into v_intentos;

  --  A los 8 intentos se deja de reintentar solo y se marca para que alguien
  --  la mire. Rendirse en silencio seria romper la regla dura 7: un rechazo
  --  de la DIAN SIEMPRE se ve.
  if v_intentos >= 8 then
    update pos_facturas
       set estado = 'rechazada', proximo_intento = null
     where id = p_factura;
  end if;
end $$;

-- ── 5. Numero para una nota de credito ────────────────────────────────
--  Mismo bloqueo de fila que `fn_factura_numero`, misma razon: dos cajas no
--  pueden tomar el mismo numero. Las notas llevan su PROPIO rango (prefijo
--  distinto, resolucion distinta), asi que no se puede reutilizar aquella
--  tal cual.
create or replace function fn_nota_credito_numero(
  p_factura uuid,
  p_motivo  text
)
returns pos_facturas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fac   pos_facturas%rowtype;
  v_nota  pos_facturas%rowtype;
  v_rango pos_facturacion_rangos%rowtype;
begin
  select * into v_fac from pos_facturas where id = p_factura;
  if not found then
    raise exception 'La factura no existe';
  end if;

  --  Solo se anula lo que la DIAN acepto. Una factura que nunca llego a
  --  emitirse no necesita nota: se descarta y ya.
  if v_fac.estado <> 'aceptada' then
    raise exception 'Solo se puede anular una factura aceptada (esta esta %)', v_fac.estado;
  end if;

  --  Si ya tiene nota, se devuelve la que hay. Idempotencia (regla dura 2):
  --  tocar dos veces "anular" no puede devolver el dinero dos veces.
  select * into v_nota from pos_facturas
   where nota_de = p_factura and tipo = 'nota_credito' and estado <> 'rechazada';
  if found then
    return v_nota;
  end if;

  --  El rango de notas de credito. Se busca por prefijo 'NC'; si el
  --  restaurante no lo tiene cargado, se dice claro en vez de emitir con el
  --  rango de facturas, que seria un lio con la DIAN.
  select * into v_rango from pos_facturacion_rangos
   where tenant_id = v_fac.tenant_id
     and coalesce(branch_id, tenant_id) = coalesce(v_fac.branch_id, v_fac.tenant_id)
     and prefijo = 'NC' and activo
   for update;

  if not found then
    raise exception 'No hay rango de notas de credito (prefijo NC) cargado para esta sede';
  end if;
  if v_rango.actual >= v_rango.hasta then
    raise exception 'El rango de notas de credito se agoto';
  end if;

  update pos_facturacion_rangos
     set actual = actual + 1
   where id = v_rango.id
  returning * into v_rango;

  insert into pos_facturas
    (tenant_id, branch_id, order_id, rango_id, prefijo, numero,
     tipo, nota_de, motivo, total, estado)
  values
    (v_fac.tenant_id, v_fac.branch_id, v_fac.order_id, v_rango.id,
     v_rango.prefijo, v_rango.actual,
     'nota_credito', p_factura, p_motivo, v_fac.total, 'pendiente')
  returning * into v_nota;

  return v_nota;
end $$;

-- ── 6. Permisos ───────────────────────────────────────────────────────
--  Emitir y reintentar los hace el SERVIDOR, nunca el navegador: ahi viven
--  las credenciales del proveedor y el consecutivo. El navegador solo lee.
grant execute on function fn_factura_reintentar(uuid, text)   to service_role;
grant execute on function fn_nota_credito_numero(uuid, text)  to service_role;
