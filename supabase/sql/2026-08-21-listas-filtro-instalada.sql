-- 2026-08-21 · La vista de contactos ahora sabe quién INSTALÓ la app
--
-- Sergio: "filtro de personas que se registraron pero no la instalaron,
-- filtro de los que la instalaron y no han pedido, y más filtros que me
-- recomiendes" — para mandarles plantillas (p.ej. contarles el bono de
-- $5.000 por instalar).
--
-- Solo se agrega UNA columna al final (instalada_app); todo lo demás queda
-- idéntico a 2026-08-20-listas-envio-filtros.sql. La evidencia de
-- instalación es la misma de la pantalla "Registrados en la app":
--   · alguna sesión reportó instalada=true (el aparato lo dijo), o
--   · hay huella de avisos por el servidor de Apple (en iPhone los avisos
--     solo existen con la app instalada — prueba dura).
-- Un "no" de un aparato no desmiente un "sí" de otro: basta una evidencia.

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
-- ── Lo nuevo: quién tiene la app en su pantalla de inicio ─────────────
instalados as (
  select distinct right(regexp_replace(c.telefono, '\D', '', 'g'), 10) as tel10
    from pos_clientes c
   where c.telefono is not null and (
         exists (select 1 from pos_web_sesiones s
                  where s.cliente_id = c.id and s.instalada = true)
      or exists (select 1 from pos_web_push w
                  where w.cliente_id = c.id and w.endpoint like '%push.apple.com%')
   )
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
       i.tel10 is not null as instalada_app
  from pos_wa_contactos w
  left join escribieron e  on e.tel10  = right(regexp_replace(w.telefono, '\D', '', 'g'), 10)
  left join negros n       on n.tel10  = right(regexp_replace(w.telefono, '\D', '', 'g'), 10)
  left join pedidos10 p    on p.tel10  = right(regexp_replace(w.telefono, '\D', '', 'g'), 10)
  left join registrados r  on r.tel10  = right(regexp_replace(w.telefono, '\D', '', 'g'), 10)
  left join puntos pt      on pt.tel10 = right(regexp_replace(w.telefono, '\D', '', 'g'), 10)
  left join saldos sa      on sa.tel10 = right(regexp_replace(w.telefono, '\D', '', 'g'), 10)
  left join instalados i   on i.tel10  = right(regexp_replace(w.telefono, '\D', '', 'g'), 10);
