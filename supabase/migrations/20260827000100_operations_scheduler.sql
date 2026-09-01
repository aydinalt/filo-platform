-- Supabase-hosted scheduler for Vercel Hobby compatibility.
-- Run public.configure_operations_tick once after PUBLIC_APP_ORIGIN and
-- OPERATIONS_CRON_SECRET are available. Secrets stay encrypted in Vault.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE OR REPLACE FUNCTION public.configure_operations_tick(target_url text, bearer_secret text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, extensions, vault
AS $$
DECLARE
  existing_job record;
  scheduled_job bigint;
  endpoint_secret_id uuid;
  bearer_secret_id uuid;
BEGIN
  IF target_url !~ '^https://[^/]+/api/system/operations-tick$' THEN
    RAISE EXCEPTION 'Operations URL must be the production HTTPS operations-tick endpoint.';
  END IF;
  IF length(bearer_secret) < 32 THEN
    RAISE EXCEPTION 'Operations secret must contain at least 32 characters.';
  END IF;

  FOR existing_job IN SELECT jobid FROM cron.job WHERE jobname = 'filo-operations-quarter-hour' LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;

  SELECT id INTO endpoint_secret_id FROM vault.secrets WHERE name = 'filo_operations_tick_url';
  IF endpoint_secret_id IS NULL THEN
    PERFORM vault.create_secret(target_url, 'filo_operations_tick_url', 'Filo operations endpoint');
  ELSE
    PERFORM vault.update_secret(endpoint_secret_id, target_url, 'filo_operations_tick_url', 'Filo operations endpoint');
  END IF;
  SELECT id INTO bearer_secret_id FROM vault.secrets WHERE name = 'filo_operations_tick_secret';
  IF bearer_secret_id IS NULL THEN
    PERFORM vault.create_secret(bearer_secret, 'filo_operations_tick_secret', 'Filo operations bearer');
  ELSE
    PERFORM vault.update_secret(bearer_secret_id, bearer_secret, 'filo_operations_tick_secret', 'Filo operations bearer');
  END IF;

  SELECT cron.schedule(
    'filo-operations-quarter-hour',
    '*/15 * * * *',
    $job$
      SELECT net.http_get(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'filo_operations_tick_url' LIMIT 1),
        headers := jsonb_build_object(
          'Authorization',
          'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'filo_operations_tick_secret' LIMIT 1)
        ),
        timeout_milliseconds := 55000
      );
    $job$
  ) INTO scheduled_job;
  RETURN scheduled_job;
END;
$$;

REVOKE ALL ON FUNCTION public.configure_operations_tick(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.disable_operations_tick()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, vault
AS $$
DECLARE
  existing_job record;
  removed integer := 0;
BEGIN
  FOR existing_job IN SELECT jobid FROM cron.job WHERE jobname = 'filo-operations-quarter-hour' LOOP
    PERFORM cron.unschedule(existing_job.jobid);
    removed := removed + 1;
  END LOOP;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.disable_operations_tick() FROM PUBLIC, anon, authenticated;

COMMIT;
