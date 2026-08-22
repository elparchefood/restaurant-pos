drop function if exists fn_web_usuarios(uuid);

CREATE OR REPLACE FUNCTION public.fn_web_usuarios(p_tenant uuid)
 RETURNS TABLE(cliente_id uuid, nombre text, telefono text, alta timestamp with time zone, entradas integer, ultimo timestamp with time zone, avisos integer, saldo bigint, recargado bigint, puntos integer, pedidos_app integer, pedidos integer, instalada boolean, plataforma text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    cr.cliente_id,
    c.nombre,
    c.telefono,
    cr.alta_at,
    (select count(*)::int          from pos_web_sesiones s
      where s.cliente_id = cr.cliente_id and s.tenant_id = p_tenant),
    (select max(s.ultimo_uso)      from pos_web_sesiones s
      where s.cliente_id = cr.cliente_id and s.tenant_id = p_tenant),
    (select count(*)::int          from pos_web_push w
      where w.cliente_id = cr.cliente_id and w.tenant_id = p_tenant),
    coalesce((select x.saldo from pos_saldo x
      where x.cliente_id = cr.cliente_id and x.tenant_id = p_tenant), 0)::bigint,
    coalesce((select sum(m.monto) from pos_saldo_mov m
      where m.cliente_id = cr.cliente_id and m.tenant_id = p_tenant
        and m.motivo = 'recarga'), 0)::bigint,
    coalesce((select p.puntos from pos_puntos p
      where p.tenant_id = p_tenant
        and p.telefono = regexp_replace(coalesce(c.telefono, ''), '[^0-9]', '', 'g')), 0)::int,
    -- Solo los que entraron por la página. `origen` lo empezó a marcar
    -- web-pedido el 20-ago; antes de esa fecha nadie había pedido por ahí.
    (select count(*)::int from pos_orders o
      where o.cliente_id = cr.cliente_id and o.tenant_id = p_tenant
        and o.origen = 'web' and o.status <> 'cancelled'),
    (select count(*)::int from pos_orders o
      where o.cliente_id = cr.cliente_id and o.tenant_id = p_tenant
        and o.status <> 'cancelled'),
    /* INSTALADA = la tiene en su pantalla de inicio en ALGUN aparato. Se mira
       por sesion porque es por aparato: se puede tener instalada en el celular
       y entrar por el navegador del computador.
       NULL = TODAVIA NO SE SABE. Sin el coalesce a propósito: decir "no la
       tiene" de quien no hemos visto entrar desde el 21-ago es afirmar algo
       que no nos consta, y sobre eso se decide a quien mandarle la campaña.
       No saber y saber que no son cosas distintas. */
    /* INSTALADA: la tiene en su pantalla de inicio en ALGUN aparato.

       El orden importa, y estuvo al reves (21-ago, con la fila del propio
       Sergio): el entro por el navegador del computador —que reporto "no
       instalada"— y ese "no" TAPABA la prueba dura de que recibe avisos por
       el servidor de Apple, que solo existen con la app instalada en un
       iPhone. Un "no" de un aparato no desmiente un "si" de otro: la
       pregunta es si la tiene en ALGUNO.

       1. Avisos por Apple -> instalada, sin discusion.
       2. Alguna sesion dijo que si -> instalada.
       3. Solo hay noes -> navegador.
       4. Nadie ha dicho nada -> sin dato (null, no un "no" inventado). */
    coalesce(
      (select true from pos_web_push w
        where w.cliente_id = cr.cliente_id and w.tenant_id = p_tenant
          and w.endpoint like '%push.apple.com%' limit 1),
      (select bool_or(s.instalada) from pos_web_sesiones s
        where s.cliente_id = cr.cliente_id and s.tenant_id = p_tenant)
    ),
    /* EL SISTEMA DEL TELEFONO. Tambien por prioridad: el aparato donde la
       tiene instalada vale mas que el computador desde el que miro un dia.
       A Sergio le salia "escritorio" siendo usuario de iPhone, porque el
       max() alfabetico no sabe cual aparato importa. */
    coalesce(
      (select s.plataforma from pos_web_sesiones s
        where s.cliente_id = cr.cliente_id and s.tenant_id = p_tenant
          and s.instalada is true and s.plataforma is not null
        order by s.ultimo_uso desc nulls last limit 1),
      (select 'ios' from pos_web_push w
        where w.cliente_id = cr.cliente_id and w.tenant_id = p_tenant
          and w.endpoint like '%push.apple.com%' limit 1),
      (select s.plataforma from pos_web_sesiones s
        where s.cliente_id = cr.cliente_id and s.tenant_id = p_tenant
          and s.plataforma is not null and s.plataforma <> 'escritorio'
        order by s.ultimo_uso desc nulls last limit 1),
      (select s.plataforma from pos_web_sesiones s
        where s.cliente_id = cr.cliente_id and s.tenant_id = p_tenant
          and s.plataforma is not null
        order by s.ultimo_uso desc nulls last limit 1),
      (select 'android' from pos_web_push w
        where w.cliente_id = cr.cliente_id and w.tenant_id = p_tenant
          and w.endpoint like '%googleapis%' limit 1)
    )
  from pos_web_credenciales cr
  join pos_clientes c on c.id = cr.cliente_id
 where cr.tenant_id = p_tenant
 order by cr.alta_at desc;
$function$
;
