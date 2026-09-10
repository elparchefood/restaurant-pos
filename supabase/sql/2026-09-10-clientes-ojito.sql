-- ════════════════════════════════════════════════════════════════════
--  CLIENTES: TODO SE VE, LA PLATA CON UN OJITO (10-sep-2026)
--
--  Sergio corrigio la version de la manana: "tambien tenia que quedar tal
--  cual estaba, no tenias que quitar nada. Lo unico era ocultar los valores:
--  donde hubiera un valor en dinero, un ojo cerrado; al tocarlo, si tiene el
--  PIN lo puede ver... el gerente, desde la cuenta del cajero".
--
--  Sin el permiso `clientes.gasto` la plata sigue saliendo VACIA del servidor
--  (no viaja al computador). Lo nuevo es `p_pin`: el ojito le manda aqui el
--  PIN que se escribio, y si es de un administrador (fn_pin_verificar, con su
--  freno de 5 fallos y su rastro en pos_autorizaciones) sale la plata.
--  Y el orden vuelve a ser por gasto, como estaba: la pantalla queda igual.
-- ════════════════════════════════════════════════════════════════════
drop function if exists public.fn_clientes_resumen(uuid, uuid);
create function public.fn_clientes_resumen(p_tenant uuid, p_sede uuid default null, p_pin text default null)
returns table(id uuid, nombre text, telefono text, barrio text, puntos integer, saldo bigint,
              pedidos integer, gastado bigint, promedio bigint, ultimo timestamp with time zone,
              recargado bigint, recargas integer, redimido integer)
language plpgsql volatile security definer
set search_path to 'public'
as $$
#variable_conflict use_column
declare
  v_ve boolean;
begin
  if not public.fn_soy_del_restaurante(p_tenant) then return; end if;
  v_ve := public.fn_permiso_estricto(p_tenant, 'clientes.gasto', p_sede);
  --  El ojito: el PIN se revisa AQUI, no en la pantalla.
  if not v_ve and coalesce(p_pin, '') <> '' then
    v_ve := coalesce(public.fn_pin_verificar(p_pin, 'ver_valores_clientes'), false);
  end if;
  return query
  select c.id, c.nombre, c.telefono, c.barrio,
         coalesce(pt.puntos, 0)::int,
         coalesce(sa.saldo, 0)::bigint,
         coalesce(o.n, 0)::int,
         case when v_ve then coalesce(o.total, 0)::bigint end,
         case when v_ve then
           case when coalesce(o.n,0) > 0 then (o.total / o.n)::bigint else 0::bigint end
         end,
         o.ultimo,
         case when v_ve then coalesce(rc.total, 0)::bigint end,
         case when v_ve then coalesce(rc.n, 0)::int end,
         coalesce(rd.puntos, 0)::int
    from pos_clientes c
    -- Los puntos viven por telefono, no por id de cliente.
    left join pos_puntos pt
           on pt.tenant_id = c.tenant_id
          and pos_tel10(pt.telefono) = pos_tel10(c.telefono)
    left join pos_saldo sa on sa.cliente_id = c.id
    left join lateral (
      select count(*) n,
             sum(coalesce(x.total_final, x.total, 0) + coalesce(x.delivery_fee, 0)) total,
             max(x.created_at) ultimo
        from pos_orders x
       where x.cliente_id = c.id and x.status = 'paid'
    ) o on true
    left join lateral (
      -- Solo el dinero REAL recargado: el bono es cupo regalado, no plata.
      select count(*) n, sum(m.monto) total
        from pos_saldo_mov m
       where m.cliente_id = c.id and m.motivo = 'recarga'
    ) rc on true
    left join lateral (
      select coalesce(sum(-v.puntos), 0) puntos
        from pos_puntos_movimientos v
       where pos_tel10(v.telefono) = pos_tel10(c.telefono)
         and v.tenant_id = c.tenant_id
         and v.puntos < 0 and coalesce(v.revertido, false) = false
    ) rd on true
   where c.tenant_id = p_tenant
   order by coalesce(o.total, 0) desc, c.nombre;
end
$$;
revoke all on function public.fn_clientes_resumen(uuid, uuid, text) from public, anon;
grant execute on function public.fn_clientes_resumen(uuid, uuid, text) to authenticated, service_role;
