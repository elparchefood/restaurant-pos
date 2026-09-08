-- ═══════════════════════════════════════════════════════════════════════════
--  EL RELOJ DEL COBRO: una vez al dia, a las 9 de la manana en Colombia
--
--  14:00 UTC = 9 a.m. en Popayan. La hora importa: los avisos ("el 18 se
--  cobra tu plan, ten saldo en tu Nequi ····3265") tienen que llegar cuando
--  la persona puede hacer algo al respecto, no de madrugada.
--
--  NO LLEVA LA LLAVE MAESTRA. El cron manda un secreto propio y estrecho que
--  vive en la boveda: asi este archivo puede estar en un repositorio publico
--  —que lo esta— sin regalar nada. La funcion lo compara contra su variable
--  WOMPI_RELOJ_SECRETO, que tiene el mismo valor.
--
--  Correrlo de mas no hace dano: los avisos chocan contra la llave primaria
--  de pos_wompi_avisos y los cobros contra la referencia unica de
--  pos_wompi_cobros. Por eso puede repetirse sin convertir un recordatorio
--  amable en acoso.
--
--  PARA VOLVER A CREAR LA LLAVE EN UN PROYECTO NUEVO:
--    select vault.create_secret('<algo largo y aleatorio>', 'wompi_reloj_secreto');
--    y poner ese mismo valor en la variable WOMPI_RELOJ_SECRETO de la funcion.
-- ═══════════════════════════════════════════════════════════════════════════

select cron.unschedule('wompi-reloj')
 where exists (select 1 from cron.job where jobname = 'wompi-reloj');

select cron.schedule('wompi-reloj', '0 14 * * *', $$
  select net.http_post(
    url     := 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/wompi-reloj',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := jsonb_build_object('secreto',
                 (select decrypted_secret from vault.decrypted_secrets
                   where name = 'wompi_reloj_secreto' limit 1))
  );
$$);
