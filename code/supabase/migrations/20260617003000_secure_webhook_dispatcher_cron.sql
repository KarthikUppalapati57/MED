-- Migration: Secure webhook dispatcher cron command
--
-- Keep service-role material out of cron.job.command by moving the outbound
-- call into a SECURITY DEFINER function that reads locked runtime settings.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.dispatch_webhook_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url text;
  v_functions_url text;
  v_service_role_key text;
BEGIN
  SELECT setting_value
    INTO v_functions_url
    FROM private.workflow_runtime_settings
   WHERE setting_name = 'functions_url';

  SELECT setting_value
    INTO v_service_role_key
    FROM private.workflow_runtime_settings
   WHERE setting_name = 'service_role_key';

  IF v_service_role_key IS NULL OR length(trim(v_service_role_key)) = 0 THEN
    RAISE EXCEPTION 'private.workflow_runtime_settings.service_role_key is required for dispatch_webhook_queue';
  END IF;

  v_url := COALESCE(
    NULLIF(trim(v_functions_url), ''),
    'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1'
  ) || '/webhook-dispatcher';

  PERFORM net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_webhook_queue() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_job_id int;
BEGIN
  SELECT jobid
    INTO v_job_id
    FROM cron.job
   WHERE jobname = 'process-webhook-queue';

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'process-webhook-queue',
    '* * * * *',
    'SELECT public.dispatch_webhook_queue();'
  );
END $$;

COMMIT;
