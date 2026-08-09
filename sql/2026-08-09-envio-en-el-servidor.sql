-- ═══════════════════════════════════════════════════════════════════════════
-- La tanda de WhatsApp la termina el SERVIDOR, no la pantalla
-- ───────────────────────────────────────────────────────────────────────────
-- Hoy el bucle que reintenta vive en `wlEnviar()` de configuracion.js: manda
-- de a 250, y como el servidor corta la funcion si tarda demasiado, la vuelve
-- a llamar hasta 12 veces. Todo eso pasa EN LA PANTALLA. Si Sergio la cierra
-- —o se le apaga el equipo, o se cae el WiFi— la tanda se detiene a medias.
-- Por eso quedaron 110 contactos esperando.
--
-- La cola en si ya estaba bien: `pos_wa_envios` guarda el estado de CADA
-- contacto, asi que nunca se le repite a nadie y al volver sigue donde iba.
-- Lo unico que falta es que alguien siga dandole al boton. Ese alguien pasa a
-- ser un reloj en la base.
--
-- DECISION DE SERGIO (9-ago): sigue SOLO LA TANDA DE HOY. Cuando se acaba el
-- cupo de las 24 h, se desarma solo. Manana el vuelve a darle si quiere. Es su
-- regla de siempre —"nada automatico, todo pasa porque alguien aprieta un
-- boton"— y aqui ademas cada mensaje cuesta plata.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Poder llamar a la funcion desde la base ─────────────────────────────
create extension if not exists pg_net with schema extensions;

-- ── 2) Que lista esta armada ───────────────────────────────────────────────
-- `envio_activo` lo enciende el boton y lo apaga el reloj cuando ya no hay
-- nada que mandar. `envio_armado_at` es para poder mirar despues quien y
-- cuando, y para el corte de seguridad.
alter table pos_wa_listas
  add column if not exists envio_activo    boolean     not null default false,
  add column if not exists envio_armado_at timestamptz;

-- ── 3) El reloj ────────────────────────────────────────────────────────────
create or replace function pos_wa_continuar_tandas()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  l           record;
  pendientes  int;
  enviados24  int;
begin
  for l in
    select id, branch_id from pos_wa_listas where envio_activo = true
  loop
    select count(*) into pendientes
      from pos_wa_envios where lista_id = l.id and estado = 'pendiente';

    /* El cupo de Meta es por ventana de 24 h, no por dia calendario: se cuenta
       igual que en la funcion que envia, para no discrepar. */
    select count(*) into enviados24
      from pos_wa_envios
     where branch_id = l.branch_id
       and estado not in ('pendiente', 'omitido')
       and enviado_at >= now() - interval '24 hours';

    /* Se acabo la lista o se acabo el cupo: se desarma. Manana el dueno vuelve
       a darle al boton — esa fue la decision, no seguir mandando solo. */
    if pendientes = 0 or enviados24 >= 250 then
      update pos_wa_listas set envio_activo = false where id = l.id;
      continue;
    end if;

    /* Una tanda mas. La funcion manda lo que alcance antes de que la corten y
       responde; el proximo tic sigue. No se espera la respuesta a proposito:
       si se cayera, el siguiente tic lo reintenta igual. */
    perform net.http_post(
      url     := 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/wa-enviar-lista',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object('lista_id', l.id, 'branch_id', l.branch_id, 'cantidad', 250)
    );
  end loop;
end;
$$;

-- ── 4) Cada 2 minutos ──────────────────────────────────────────────────────
-- Dos minutos y no menos: cada tic manda hasta 250 y la funcion tarda; mas
-- seguido solo amontonaria llamadas sobre la misma cola.
select cron.unschedule('wa-continuar-tandas')
  where exists (select 1 from cron.job where jobname = 'wa-continuar-tandas');

select cron.schedule('wa-continuar-tandas', '*/2 * * * *',
                     'select public.pos_wa_continuar_tandas()');

-- ── 5) Corte de seguridad ──────────────────────────────────────────────────
-- Si algo quedara armado por un error, no puede seguir vivo para siempre: a
-- las 24 h de armado se apaga sea como sea.
create or replace function pos_wa_desarmar_viejas()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update pos_wa_listas
     set envio_activo = false
   where envio_activo = true
     and envio_armado_at < now() - interval '24 hours';
end;
$$;

select cron.unschedule('wa-desarmar-viejas')
  where exists (select 1 from cron.job where jobname = 'wa-desarmar-viejas');

select cron.schedule('wa-desarmar-viejas', '17 * * * *',
                     'select public.pos_wa_desarmar_viejas()');
