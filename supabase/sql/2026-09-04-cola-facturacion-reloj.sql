/*  EL RELOJ DE LA COLA DE FACTURACION
    ──────────────────────────────────────────────────────────────────────
    Sergio: «la factura queda en cola y se reintenta sola cuando regrese el
    Internet». Esto es el «sola»: cada 5 minutos alguien tiene que mirar la
    cola, y ese alguien no puede ser una persona ni una pantalla abierta.

    ── POR QUE NO SE LLAMA CON LA LLAVE DE SERVICIO ─────────────────────
    La llave de servicio abre TODA la base de TODOS los restaurantes, y el
    cron vive DENTRO de la base: escribirla en `cron.job` es dejarla en una
    tabla. El secreto de la cola solo sirve para decir «procesa lo
    vencido»: no lee ni escribe nada por si mismo.

    Y tampoco va escrito en el comando del reloj, por lo mismo. Vive en el
    Vault, y esta funcion —que es la unica que puede leerlo— lo saca al
    vuelo. Por eso es SECURITY DEFINER y por eso se le quita el permiso de
    ejecucion a todo el mundo menos al dueño: si cualquiera pudiera
    llamarla, cualquiera podria disparar la cola.

    ── EL VALOR DEL SECRETO NO ESTA EN ESTE ARCHIVO ─────────────────────
    A proposito: este archivo va al repositorio. El secreto se guarda a
    mano, una sola vez, con:

        select vault.create_secret('<el secreto>', 'cola_facturacion_secreto',
               'Secreto con el que el reloj le pide a facturar que procese la cola');

    y tiene que ser EL MISMO que la variable COLA_SECRETO de la funcion
    `facturar`. Si no coincide, la funcion contesta 401 y el log dice cual
    de las dos cosas fallo.

    ── SI NO HAY SECRETO NO PASA NADA MALO ──────────────────────────────
    Avisa y se va. No llama sin secreto «por si acaso»: eso seria dejar la
    puerta abierta esperando que nadie pase.                              */

create extension if not exists pg_cron;

create or replace function public.fn_cola_facturacion_tick()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_secreto text;
begin
  select decrypted_secret into v_secreto
    from vault.decrypted_secrets
   where name = 'cola_facturacion_secreto'
   limit 1;

  if v_secreto is null or v_secreto = '' then
    raise warning '[cola] no hay secreto en el Vault: el reloj no llama a nada';
    return;
  end if;

  perform net.http_post(
    url     := 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/facturar',
    headers := jsonb_build_object(
                 'Content-Type',   'application/json',
                 'x-cola-secreto', v_secreto),
    body    := jsonb_build_object('cola', true),
    timeout_milliseconds := 55000
  );
end;
$fn$;

revoke all on function public.fn_cola_facturacion_tick() from public;
revoke all on function public.fn_cola_facturacion_tick() from anon;
revoke all on function public.fn_cola_facturacion_tick() from authenticated;

/*  Cada 5 minutos. No mas seguido: la espera de los reintentos empieza en
    1 minuto y se dobla, asi que mirar mas a menudo no adelanta nada y solo
    gasta llamadas.                                                       */
select cron.unschedule('cola-facturacion')
 where exists (select 1 from cron.job where jobname = 'cola-facturacion');

select cron.schedule(
  'cola-facturacion',
  '*/5 * * * *',
  $cron$ select public.fn_cola_facturacion_tick(); $cron$
);

/*  ── QUE ESTO SE HAYA HECHO DE VERDAD ────────────────────────────────
    Un `create` que no toma no avisa. Aqui se revienta si algo falto.   */
do $guarda$
declare
  n_job    int;
  n_fun    int;
  n_suelto int;
begin
  select count(*) into n_job
    from cron.job where jobname = 'cola-facturacion' and active;
  if n_job <> 1 then
    raise exception 'el reloj de la cola no quedo programado (jobs activos: %)', n_job;
  end if;

  select count(*) into n_fun
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fn_cola_facturacion_tick'
     and p.prosecdef;
  if n_fun <> 1 then
    raise exception 'la funcion del reloj no existe o no es SECURITY DEFINER';
  end if;

  select count(*) into n_suelto
    from information_schema.role_routine_grants
   where routine_schema = 'public'
     and routine_name   = 'fn_cola_facturacion_tick'
     and grantee in ('anon', 'authenticated', 'PUBLIC');
  if n_suelto > 0 then
    raise exception 'la funcion del reloj quedo ejecutable por % roles de fuera', n_suelto;
  end if;
end
$guarda$;
