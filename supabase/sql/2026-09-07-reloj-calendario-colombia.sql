-- ═══════════════════════════════════════════════════════════════════════════
--  EL COBRO SE RIGE POR EL CALENDARIO DE COLOMBIA, NO POR EL DEL SERVIDOR
--
--  La vista contaba los dias contra CURRENT_DATE, y el servidor vive en UTC.
--  Colombia va cinco horas atras, asi que todas las noches —de 7 p.m. en
--  adelante— la base ya esta en el dia siguiente y el cliente no.
--
--  Se vio en la primera prueba del reloj: se le puso el vencimiento a "dentro
--  de 1 dia" y el reloj COBRO en vez de avisar, porque para el servidor ese
--  dia ya habia llegado. Con el aviso de 7 dias paso lo mismo al reves: lo
--  conto como 6 y no lo mando.
--
--  En produccion eso serian dos cosas que el cliente sí nota:
--    · "manana se cobra tu plan" llegando el dia equivocado
--    · el cobro cayendo a las 9 de la noche del dia ANTERIOR
--
--  Cobra factura en pesos y cobra por Wompi, que es colombiana: el dia del
--  cobro es el dia de Colombia. Se fija aqui, en la vista, porque es el unico
--  sitio donde se cuentan esos dias — si el calculo se copiara al codigo
--  volveriamos a tener dos relojes que se desincronizan.
--
--  Y el reloj se programa a las 14:00 UTC = 9 a.m. en Colombia, para que los
--  avisos lleguen de manana y no de madrugada.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view v_suscripciones_por_vencer as
  select id as tenant_id,
         name,
         plan,
         status,
         periodo_inicio,
         periodo_fin,
         saldo_favor,
         periodo_fin - (now() at time zone 'America/Bogota')::date as dias_para_vencer
    from tenants t
   where periodo_fin is not null
   order by periodo_fin;

--  El reloj la lee con la llave de servicio. Sin este permiso PostgREST
--  responde 403 con un objeto de error que NO es una lista, y el codigo que
--  no mire `ok` lo confunde con datos. Ya paso.
grant select on v_suscripciones_por_vencer to service_role;

--  Nadie mas la necesita: el navegador no decide cobros.
revoke all on v_suscripciones_por_vencer from anon;
revoke all on v_suscripciones_por_vencer from authenticated;
