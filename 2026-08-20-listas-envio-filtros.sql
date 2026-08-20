-- 2026-08-20 · Más maneras de armar una lista de envío
--
-- Sergio: "necesito tener varias posibilidades de crear listas de envío: todos
-- los contactos, solo los contactos con los que haya chateado, solo los que
-- estén registrados, solo los que tengan puntos, entre otros filtros que me
-- recomiendes".
--
-- Los dos primeros ya existían ("Todos" y "Ya escribieron"). Faltaban los que
-- cruzan con la app de clientes: registrados, puntos y saldo. La vista es el
-- sitio correcto para resolverlo — la pantalla ya sabe filtrar sobre lo que la
-- vista le entregue, y así los conteos salen bien sin que el navegador tenga
-- que cruzar tres tablas por su cuenta.
--
-- Todo se cruza por los ÚLTIMOS 10 DÍGITOS. Es la misma llave que ya usaba la
-- vista: los teléfonos entran con indicativo, sin él, con espacios y con
-- guiones, y comparar el texto crudo no casaría casi ninguno.

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
-- ── Lo nuevo ──────────────────────────────────────────────────────────
-- Quién ya tiene cuenta en la app: se mira la credencial, no el cliente.
-- Tener ficha de cliente no es estar registrado; la credencial sí lo prueba.
registrados as (
  select distinct right(regexp_replace(c.telefono, '\D', '', 'g'), 10) as tel10
    from pos_web_credenciales cr
    join pos_clientes c on c.id = cr.cliente_id
   where c.telefono is not null
),
-- Los puntos viven por teléfono, no por cliente: es su llave de verdad.
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
       coalesce(sa.saldo, 0)::bigint as saldo
  from pos_wa_contactos w
  left join escribieron e  on e.tel10  = right(regexp_replace(w.telefono, '\D', '', 'g'), 10)
  left join negros n       on n.tel10  = right(regexp_replace(w.telefono, '\D', '', 'g'), 10)
  left join pedidos10 p    on p.tel10  = right(regexp_replace(w.telefono, '\D', '', 'g'), 10)
  left join registrados r  on r.tel10  = right(regexp_replace(w.telefono, '\D', '', 'g'), 10)
  left join puntos pt      on pt.tel10 = right(regexp_replace(w.telefono, '\D', '', 'g'), 10)
  left join saldos sa      on sa.tel10 = right(regexp_replace(w.telefono, '\D', '', 'g'), 10);
