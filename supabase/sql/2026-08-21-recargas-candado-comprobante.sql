-- ══════════════════════════════════════════════════════════════════════
--  QUE UN COMPROBANTE NO SE PUEDA COBRAR DOS VECES  (21-ago-2026)
--
--  Sergio, revisando las 8 solicitudes pendientes:
--    "No descartes ninguna. Las que ya se abonaron deben aparecer como que
--     ya se aprobó, en verde, porque si yo la confirmo se abonaría doble.
--     Y las que nunca se abonaron déjalas, yo decido."
--
--  LO QUE SE ENCONTRÓ REVISÁNDOLAS. En El Parche hay 8 solicitudes, todas
--  del propio número de Sergio, y solo DOS comprobantes de verdad: la misma
--  foto subida varias veces (se comparó la huella md5 de cada imagen, no la
--  hora ni el monto).
--
--      foto d249edcd ($55.000)  -> solicitudes 12, 15, 16
--      foto 74a603f2 ($210.000) -> solicitudes 13, 14, 17, 18, 19
--
--  Y hubo TRES abonos:
--      19-ago 1:26 pm  $55.000  + $5.000  ref M10646978  <- foto A, solicitud 12
--      19-ago 4:07 pm  $210.000 + $20.000 ref M15084814  <- foto B, solicitud 13
--      21-ago 1:06 am  $210.000 + $20.000 ref VACÍA      <- foto B OTRA VEZ (sol. 14)
--
--  El tercero es un COBRO DOBLE que ya ocurrió: el mismo comprobante del
--  19-ago se abonó de nuevo el 21.
--
--  POR QUÉ SE COLÓ. El candado de hoy compara la REFERENCIA bancaria, y solo
--  cuando existe: `ux_saldo_mov_ref` es `unique ... where referencia is not
--  null`, y `fn_recarga_aplicar` pregunta `if p_ref is not null and exists`.
--  Esa madrugada el sistema no logró leer la referencia, quedó nula, y el
--  candado no aplicó. Un candado que se abre solo cuando falta un dato no es
--  un candado.
--
--  EL ARREGLO. Se deja de confiar en la referencia y se confía en la FOTO:
--  la referencia a veces no se lee, la foto siempre está. Cada comprobante
--  pagado queda anotado en `pos_recargas_pagadas`, cuya llave primaria hace
--  que la misma foto NO PUEDA entrar dos veces. Como el abono va en la misma
--  transacción, si el candado salta no se abona nada.
--
--  Esto es de Cobra, no de El Parche: le podía pasar a cualquier restaurante
--  con un cliente de verdad.
-- ══════════════════════════════════════════════════════════════════════

-- ── 1 · LA HUELLA DE CADA COMPROBANTE ─────────────────────────────────
alter table pos_recargas_solicitudes
  add column if not exists comprobante_huella text;

comment on column pos_recargas_solicitudes.comprobante_huella is
  'Huella (md5) de la imagen del comprobante. Es la llave para no pagar dos veces la misma foto: la referencia bancaria a veces no se logra leer, la foto siempre está.';

update pos_recargas_solicitudes
   set comprobante_huella = md5(comprobante_url)
 where comprobante_url is not null and comprobante_url <> ''
   and comprobante_huella is null;

-- Que se llene sola, siempre. Si dependiera de que cada camino que crea
-- solicitudes se acuerde de calcularla, el dia que uno se olvide el candado
-- desaparece en silencio para esa solicitud.
create or replace function public.fn_recarga_huella()
returns trigger language plpgsql as $fn$
begin
  new.comprobante_huella := case
    when new.comprobante_url is null or new.comprobante_url = '' then null
    else md5(new.comprobante_url) end;
  return new;
end $fn$;

drop trigger if exists tg_recarga_huella on pos_recargas_solicitudes;
create trigger tg_recarga_huella
  before insert or update of comprobante_url on pos_recargas_solicitudes
  for each row execute function public.fn_recarga_huella();

-- ── 2 · CÓMO QUEDÓ CADA SOLICITUD ─────────────────────────────────────
--  Sin esto la pantalla no puede pintar en verde lo ya abonado: hoy la
--  solicitud y el abono son dos hechos que no se conocen entre sí.
alter table pos_recargas_solicitudes
  add column if not exists aplicado_at    timestamptz,
  add column if not exists aplicado_monto bigint,
  add column if not exists aplicado_bono  bigint,
  add column if not exists nota_revision  text;

comment on column pos_recargas_solicitudes.nota_revision is
  'Explicación para el dueño cuando el abono existe pero no debió existir (p. ej. comprobante repetido). Se muestra en la pantalla junto al abono.';

-- ── 3 · EL LIBRO DE COMPROBANTES YA PAGADOS · EL CANDADO ──────────────
create table if not exists pos_recargas_pagadas (
  tenant_id          uuid   not null,
  comprobante_huella text   not null,
  solicitud_id       bigint,
  cliente_id         uuid,
  monto              bigint,
  bono               bigint,
  como               text,
  aplicado_at        timestamptz not null default now(),
  primary key (tenant_id, comprobante_huella)
);

comment on table pos_recargas_pagadas is
  'Un renglón por comprobante pagado. La llave primaria ES el candado: la misma foto no puede abonarse dos veces. fn_recarga_aplicar escribe aquí ANTES de mover el saldo, así que si el candado salta no se abona nada.';

alter table pos_recargas_pagadas enable row level security;

-- Solo el servidor escribe aquí; el dueño puede mirar lo suyo.
drop policy if exists pos_recargas_pagadas_ver on pos_recargas_pagadas;
create policy pos_recargas_pagadas_ver on pos_recargas_pagadas
  for select to authenticated
  using (tenant_id = ((auth.jwt() -> 'user_metadata') ->> 'tenant_id')::uuid);

grant select on pos_recargas_pagadas to authenticated;
grant all    on pos_recargas_pagadas to service_role;

-- ── 4 · LO QUE YA PASÓ, ANOTADO COMO FUE ──────────────────────────────
--  Los ids van escritos a mano A PROPÓSITO: se emparejaron mirando la huella
--  de la foto y el abono que salió 3 segundos después, uno por uno. Emparejar
--  por monto y hora sería adivinar — hay tres solicitudes de $210.000.
insert into pos_recargas_pagadas
  (tenant_id, comprobante_huella, solicitud_id, cliente_id, monto, bono, como, aplicado_at)
select s.tenant_id, s.comprobante_huella, s.id, s.cliente_id, v.monto, v.bono,
       'automatico+correo (anotado despues)', v.cuando
  from (values
    (12::bigint, 55000::bigint,  5000::bigint,  timestamptz '2026-08-19 18:26:49.721694+00'),
    (13::bigint, 210000::bigint, 20000::bigint, timestamptz '2026-08-19 21:07:30.232923+00')
  ) as v(sol, monto, bono, cuando)
  join pos_recargas_solicitudes s on s.id = v.sol
 where s.comprobante_huella is not null
on conflict (tenant_id, comprobante_huella) do nothing;

--  Las dos legítimas: en verde, sin botones.
update pos_recargas_solicitudes set
  estado = 'aplicada', aplicado_at = '2026-08-19 18:26:49.721694+00',
  aplicado_monto = 55000, aplicado_bono = 5000
 where id = 12;

update pos_recargas_solicitudes set
  estado = 'aplicada', aplicado_at = '2026-08-19 21:07:30.232923+00',
  aplicado_monto = 210000, aplicado_bono = 20000
 where id = 13;

--  La 14 TAMBIÉN se abonó, así que también va en verde —la plata entró—,
--  pero con la nota de que no debió: es la misma foto de la 13. No entra al
--  libro de pagadas porque esa foto ya la tiene la 13, que fue la legítima.
update pos_recargas_solicitudes set
  estado = 'aplicada', aplicado_at = '2026-08-21 06:06:22.511308+00',
  aplicado_monto = 210000, aplicado_bono = 20000,
  nota_revision = 'Se abonó por error: este mismo comprobante ya se había abonado el 19 de agosto a las 4:07 p. m. El sistema no leyó la referencia esa vez y el candado viejo no lo detuvo. Son $230.000 de más en el saldo.'
 where id = 14;

-- ── 5 · LA FUNCIÓN, CON EL CANDADO ADENTRO ────────────────────────────
--  Se BORRA la vieja antes de crear la nueva. Agregar un parámetro no
--  reemplaza una función: crea otra con el mismo nombre, y entonces cada
--  llamada queda entre dos y Postgres responde "la función no es única".
--  Quedarían las dos vivas y la mitad de las recargas fallarían.
drop function if exists public.fn_recarga_aplicar(uuid, uuid, bigint, text, uuid, text, uuid);

create or replace function public.fn_recarga_aplicar(
  p_tenant uuid, p_cliente uuid, p_monto bigint,
  p_ref text default null, p_branch uuid default null,
  p_como text default 'automatico', p_quien uuid default null,
  p_solicitud bigint default null)
returns table(ok boolean, motivo text, acreditado bigint, bono bigint, saldo bigint)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tel text; b record; v_saldo bigint; v_huella text;
begin
  select telefono into v_tel from pos_clientes where id = p_cliente;
  select * into b from fn_recarga_bono(p_tenant, v_tel, p_monto);

  if p_monto < b.minimo then
    return query select false, 'La recarga minima es ' || b.minimo::text, 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  /* Si esa referencia bancaria ya se uso, NO es un error tecnico: es alguien
     mandando el mismo comprobante dos veces. Hay que decirlo con esas palabras,
     no con un "no pudimos acreditar" que deja al cliente sin saber que hacer. */
  if p_ref is not null and exists (
      select 1 from pos_saldo_mov m
       where m.tenant_id = p_tenant and m.referencia = p_ref) then
    return query select false, 'comprobante_usado', 0::bigint, 0::bigint,
      coalesce((select s.saldo from fn_saldo_cliente(p_tenant, p_cliente) s), 0);
    return;
  end if;

  /* ══ EL CANDADO DE VERDAD: LA FOTO ══════════════════════════════════
     La referencia falla —el 21-ago se leyo vacia y el mismo comprobante se
     cobro dos veces—. La foto no falla: si viene con solicitud, se anota en
     el libro ANTES de mover un peso. Si esa foto ya estaba, la llave primaria
     lo impide y aqui no se abona nada.                                    */
  if p_solicitud is not null then
    select comprobante_huella into v_huella
      from pos_recargas_solicitudes
     where id = p_solicitud and tenant_id = p_tenant;

    if v_huella is not null then
      begin
        insert into pos_recargas_pagadas
          (tenant_id, comprobante_huella, solicitud_id, cliente_id, monto, bono, como)
        values (p_tenant, v_huella, p_solicitud, p_cliente, p_monto, b.bono, p_como);
      exception when unique_violation then
        return query select false, 'comprobante_usado', 0::bigint, 0::bigint,
          coalesce((select s.saldo from fn_saldo_cliente(p_tenant, p_cliente) s), 0);
        return;
      end;
    end if;
  end if;

  perform fn_saldo_mover(p_tenant, p_cliente, 'recarga', p_monto, p_branch, null,
                         p_ref, 'Recarga (' || p_como || ')', p_quien);

  if b.bono > 0 then
    perform fn_saldo_mover(p_tenant, p_cliente, 'bono_recarga', b.bono, p_branch, null,
                           case when p_ref is null then null else p_ref || ':bono' end,
                           b.bloques || ' x ' || b.por_bloque || ' (' || b.nivel || ')', p_quien);
  end if;

  select s.saldo into v_saldo from fn_saldo_cliente(p_tenant, p_cliente) s;

  /* La solicitud queda cerrada AQUI, en la misma transaccion que el abono.
     Antes el abono automatico dejaba la solicitud en 'leida', como si nadie
     la hubiera atendido, y la pantalla seguia ofreciendo el boton Aprobar:
     de ahi salio todo este lio. */
  if p_solicitud is not null then
    update pos_recargas_solicitudes
       set estado = 'aplicada', aplicado_at = now(),
           aplicado_monto = p_monto, aplicado_bono = b.bono
     where id = p_solicitud and tenant_id = p_tenant;
  end if;

  return query select true, 'ok', p_monto, b.bono, coalesce(v_saldo, 0);
end $function$;

grant execute on function public.fn_recarga_aplicar(uuid, uuid, bigint, text, uuid, text, uuid, bigint)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
