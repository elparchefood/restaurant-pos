-- ═══════════════════════════════════════════════════════════════════════
-- EL RELOJ DEL VIGILANTE
--
-- Es lo primero de Cobra que corre sin que nadie escriba. Despierta a
-- recordar-comprobante cada 5 minutos para que revise los pedidos que se
-- quedaron esperando un comprobante que nunca llegó.
--
-- Cada 5 minutos y no cada minuto porque los minutos que importan los pone
-- el restaurante (30 por defecto): revisar más seguido no adelanta nada y
-- son doce despertadas por hora que nadie necesita.
--
-- La función es la que decide a quién le escribe y a quién no; esto solo la
-- llama. Si la llamada falla, la siguiente vuelta lo intenta de nuevo — no
-- se pierde ninguna conversación porque el estado vive en la base, no aquí.
-- ═══════════════════════════════════════════════════════════════════════

-- Idempotente: correr esto dos veces no deja dos relojes.
select cron.unschedule('vigilante-comprobante')
where exists (select 1 from cron.job where jobname = 'vigilante-comprobante');

select cron.schedule(
  'vigilante-comprobante',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://tblujfduscslxjmrjbdr.supabase.co/functions/v1/recordar-comprobante',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
