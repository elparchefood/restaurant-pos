/*  ══ EL MAPA SE VENDE APARTE, Y SE MIDE POR DÍA ══════════════════════════
    Sergio, 27-ago-2026.

    DOS CAMBIOS QUE VAN JUNTOS PORQUE SON LA MISMA DECISIÓN.

    1. EL MAPA SALE DEL PLAN. Estaba dentro de Pro, y Sergio hizo cuentas: el
       mapa es lo único de Cobra que le cuesta dinero a él CADA VEZ QUE SE USA.
       Todo lo demás (pantallas, informes, impresión) cuesta lo mismo con un
       restaurante que con cincuenta. Meter un costo variable dentro de un
       precio fijo es apostar a que nadie lo use mucho.

       Así que pasa a ser un servicio que se contrata aparte. Quien no lo
       contrate usa la app del domiciliario COMPLETA — sus pedidos, cobrar,
       marcar entregado, todo — y al tocar «Ruta» ve un letrero que le dice
       que ese servicio no está incluido y cómo pedirlo.

       ⚠️ El interruptor es de COBRA, no del restaurante. No se pone en la
       pantalla de configuración: se enciende aquí cuando alguien paga. Si
       estuviera en configuración, cualquiera se lo activaría solo.

    2. EL TOPE PASA A SER DIARIO, además del mensual. Un tope solo mensual
       tiene un problema: se puede gastar entero en dos días y dejar al
       restaurante veintiocho días sin mapa. Un tope diario reparte el daño —
       lo peor que puede pasar es quedarse sin mapa una tarde, y al día
       siguiente vuelve solo.

       El mensual se queda como techo de la factura; el diario como freno de
       mano.                                                                */

alter table pos_mapas_config
  add column if not exists addon        boolean not null default false,
  add column if not exists addon_desde  timestamptz,
  add column if not exists addon_nota   text,
  add column if not exists tope_dia     integer;

comment on column pos_mapas_config.addon is
  'El restaurante contrató el servicio de mapas (se vende aparte del plan). Lo enciende Cobra, no el restaurante.';
comment on column pos_mapas_config.tope_dia is
  'Mapas por día. Null = el que traiga la función por defecto.';

/*  El gasto del día. Mismo diseño que `pos_mapas_uso` (que es por mes): una
    fila por restaurante, día y tipo de llamada. Sin políticas de lectura a
    propósito — esto lo escribe el servidor con su llave, y nadie más lo ve. */
create table if not exists pos_mapas_uso_dia (
  tenant_id uuid not null,
  dia       date not null,
  sku       text not null,
  n         integer not null default 0,
  primary key (tenant_id, dia, sku)
);
alter table pos_mapas_uso_dia enable row level security;

/*  Y el contador mira los dos frenos en la misma llamada.

    Va en UNA función y no en dos porque los dos contadores tienen que subir
    juntos o no subir: si sube el del mes y el del día se queda, un reinicio a
    media tarde regala cupo; si sube el del día y falla el del mes, se cobra
    dos veces. Dentro de una función son una sola operación.                */
create or replace function fn_mapas_consumir(
  p_tenant uuid, p_sku text, p_n integer default 1)
returns table (permitido boolean, usado integer, tope integer)
language plpgsql security definer set search_path = public as $$
declare
  v_tope_mes integer;
  v_tope_dia integer;
  v_mes text := to_char(now() at time zone 'America/Bogota', 'YYYY-MM');
  v_dia date := (now() at time zone 'America/Bogota')::date;
  v_n   integer;
  v_nd  integer;
begin
  select coalesce(c.tope_mes, 1200), coalesce(c.tope_dia, 40)
    into v_tope_mes, v_tope_dia
    from pos_mapas_config c where c.tenant_id = p_tenant;
  --  Sin fila de configuración se aplican los mismos números por defecto:
  --  un restaurante nuevo NO empieza sin freno.
  if v_tope_mes is null then v_tope_mes := 1200; end if;
  if v_tope_dia is null then v_tope_dia := 40;   end if;

  insert into pos_mapas_uso (tenant_id, mes, sku, n)
  values (p_tenant, v_mes, p_sku, 0)
  on conflict (tenant_id, mes, sku) do nothing;
  insert into pos_mapas_uso_dia (tenant_id, dia, sku, n)
  values (p_tenant, v_dia, p_sku, 0)
  on conflict (tenant_id, dia, sku) do nothing;

  --  El candado de la fila evita que dos llamadas simultaneas lean el
  --  mismo numero y las dos crean que quedaba cupo.
  select u.n into v_n from pos_mapas_uso u
   where u.tenant_id = p_tenant and u.mes = v_mes and u.sku = p_sku
     for update;
  select d.n into v_nd from pos_mapas_uso_dia d
   where d.tenant_id = p_tenant and d.dia = v_dia and d.sku = p_sku
     for update;

  --  Se devuelve el que se acabó, no siempre el del mes: el letrero tiene que
  --  poder decir «hoy» o «este mes», que son dos esperas muy distintas.
  if v_nd + p_n > v_tope_dia then
    return query select false, v_nd, v_tope_dia;
    return;
  end if;
  if v_n + p_n > v_tope_mes then
    return query select false, v_n, v_tope_mes;
    return;
  end if;

  update pos_mapas_uso u set n = u.n + p_n
   where u.tenant_id = p_tenant and u.mes = v_mes and u.sku = p_sku
   returning u.n into v_n;
  update pos_mapas_uso_dia d set n = d.n + p_n
   where d.tenant_id = p_tenant and d.dia = v_dia and d.sku = p_sku;

  return query select true, v_n, v_tope_mes;
end;
$$;

/*  Y el mapa sale de los planes. Aquí es donde deja de venir con Pro.
    (Se quita también de `premium`, que es una fila vieja que ya no se vende
    pero que El Parche todavía tiene puesta.)                              */
update pos_planes
   set funciones = array_remove(funciones, 'mapa')
 where 'mapa' = any(funciones);

/*  El Parche estrena el servicio: es el banco de pruebas y sin esto se
    quedaría sin mapas esta misma tarde. Los demás quedan apagados, que es
    justo lo que hay que poder ver funcionando.                            */
insert into pos_mapas_config (tenant_id, addon, addon_desde, addon_nota)
values ('0c78c799-bebb-4fe7-9bf6-c10062eaea7e', true, now(), 'El Parche — banco de pruebas')
on conflict (tenant_id) do update set addon = true, addon_desde = coalesce(pos_mapas_config.addon_desde, now());
