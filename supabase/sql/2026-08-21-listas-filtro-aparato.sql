-- 2026-08-21 · La vista de contactos ahora sabe QUÉ aparato usa cada uno
--
-- Sergio: "filtrar las personas que tengan Android y las que tengan iPhone,
-- y otra plantilla general para los que no alcanzamos a captar el dato" —
-- así el tutorial de instalación llega con el video correcto para cada
-- celular.
--
-- Se agrega UNA columna al final (plataforma_app: 'ios' / 'android' / null);
-- el resto queda idéntico a 2026-08-21-listas-filtro-instalada.sql.
--
-- La evidencia, en orden: la huella de avisos de Apple o una sesión que dijo
-- iOS ganan (prueba dura de iPhone); si no, una sesión que dijo Android; si
-- solo hay sesiones de PC o ninguna, queda null — "sin dato" es la verdad,
-- no un guion. Un "no" de un aparato no desmiente un "sí" de otro.

create or replace view public.v_wa_contactos as
with escribieron as (
  select distinct right(regexp_replace(contact_handle, '\D', '', 'g'), 10) as tel10
    from chat_conversations where contact_handle is not null
), negros as (
  select distinct right(regexp_replace(telefono, '\D', '', 'g'), 10) as tel10
    from pos_blacklist_telefonos where telefono is not null
), pedidos as (
  select substring(notes, '\[tel:([0-9]+)\]') as tel_raw,
         count(*) as n_pedidos, max(created_at) as ultimo_pedido
    from pos_orders
   where notes ~ '\[tel:[0-9]+\]' and status <> 'cancelled'
   group by 1
), pedidos10 as (
  select right(regexp_replace(tel_raw, '\D', '', 'g'), 10) as tel10,
         sum(n_pedidos) as n_pedidos, max(ultimo_pedido) as ultimo_pedido
    from pedidos where tel_raw is not null group by 1
),
registrados as (
  select distinct right(regexp_replace(c.telefono, '\D', '', 'g'), 10) as tel10
    from pos_web_credenciales cr
    join pos_clientes c on c.id = cr.cliente_id
   where c.telefono is not null
),
puntos as (
  select right(regexp_replace(telefono, '\D', '', 'g'), 10) as tel10,
         max(puntos) as puntos
    from pos_puntos where telefono is not null group by 1
),
saldos as (
  select right(regexp_replace(c.telefono, '\D', '', 'g'), 10) as tel10,
         max(s.saldo) as saldo
    from pos_saldo s join pos_clientes c on c.id = s.cliente_id
   where c.telefono is not null group by 1
),
instalados as (
  select distinct right(regexp_replace(c.telefono, '\D', '', 'g'), 10) as tel10
    from pos_clientes c
   where c.telefono is not null and (
         exists (select 1 from pos_web_sesiones s
                  where s.cliente_id = c.id and s.instalada = true)
      or exists (select 1 from pos_web_push w
                  where w.cliente_id = c.id and w.endpoint like '%push.apple.com%')
   )
),
-- ── Lo nuevo: el aparato ──────────────────────────────────────────────
aparatos as (
  select right(regexp_replace(c.telefono, '\D', '', 'g'), 10) as tel10,
         bool_or(s.plataforma = 'ios'
                 or exists (select 1 from pos_web_push w
                             where w.cliente_id = c.id
                               and w.endpoint like '%push.apple.com%')) as hay_ios,
         bool_or(s.plataforma = 'android') as hay_android
    from pos_clientes c
    join pos_web_sesiones s on s.cliente_id = c.id
   where c.telefono is not null
   group by 1
)
select w.id, w.tenant_id, w.branch_id, w.telefono, w.etiqueta, w.origen,
       coalesce(w.guardado, false) as guardado,
       coalesce(w.no_atender, false) as no_atender,
       w.created_at,
       right(regexp_replace(w.telefono, '\D', '', 'g'), 10) as tel10,
       e.tel10 is not null as ya_escribio,
       n.tel10 is not null as en_lista_negra,
       coalesce(p.n_pedidos, 0::numeric) as n_pedidos,
       p.ultimo_pedido,
       w.etiqueta is not null and btrim(w.etiqueta) <> ''
         and w.etiqueta !~ '^[+0-9 ()-]+$' and length(btrim(w.etiqueta)) > 1 as tiene_nombre,
       r.tel10 is not null as registrado_app,
       coalesce(pt.puntos, 0)::int as puntos,
       coalesce(sa.saldo, 0)::bigint as saldo,
       i.tel10 is not null as instalada_app,
       case when a.hay_ios then 'ios'
            when a.hay_android then 'android' end as plataforma_app
  from pos_wa_contactos w
  left join escribieron e  on e.tel10  = right(regexp_replace(w.telefono, '\D', '', 'g'), 10)
  left join negros n       on n.tel10  = right(regexp_replace(w.telefono, '\D', '', 'g'), 10)
  left join pedidos10 p    on p.tel10  = right(regexp_replace(w.telefono, '\D', '', 'g'), 10)
  left join registrados r  on r.tel10  = right(regexp_replace(w.telefono, '\D', '', 'g'), 10)
  left join puntos pt      on pt.tel10 = right(regexp_replace(w.telefono, '\D', '', 'g'), 10)
  left join saldos sa      on sa.tel10 = right(regexp_replace(w.telefono, '\D', '', 'g'), 10)
  left join instalados i   on i.tel10  = right(regexp_replace(w.telefono, '\D', '', 'g'), 10)
  left join aparatos a     on a.tel10  = right(regexp_replace(w.telefono, '\D', '', 'g'), 10);
