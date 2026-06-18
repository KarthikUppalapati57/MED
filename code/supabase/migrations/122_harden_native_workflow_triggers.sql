-- Migration 122: Harden native workflow trigger authentication
--
-- Removes hardcoded service-role fallback behavior from DB-to-Edge-Function
-- dispatch. Runtime secrets are read from private.workflow_runtime_settings,
-- which is not granted to anon/authenticated client roles.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.workflow_runtime_settings (
  setting_name text PRIMARY KEY,
  setting_value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE private.workflow_runtime_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.invoke_edge_function()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  function_name text := TG_ARGV[0];
  v_url text;
  v_functions_url text;
  v_service_role_key text;
  v_headers jsonb;
  v_payload jsonb;
BEGIN
  SELECT setting_value
    INTO v_functions_url
    FROM private.workflow_runtime_settings
   WHERE setting_name = 'functions_url';

  SELECT setting_value
    INTO v_service_role_key
    FROM private.workflow_runtime_settings
   WHERE setting_name = 'service_role_key';

  v_url := COALESCE(
    NULLIF(trim(v_functions_url), ''),
    'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1'
  ) || '/' || function_name;

  IF v_service_role_key IS NULL OR length(trim(v_service_role_key)) = 0 THEN
    RAISE EXCEPTION 'private.workflow_runtime_settings.service_role_key is required for invoke_edge_function';
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_service_role_key
  );

  v_payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END,
    'old_record', CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD) ELSE NULL END
  );

  PERFORM net.http_post(
    url := v_url,
    body := v_payload,
    headers := v_headers
  );

  RETURN NULL;
END;
$$;

DO $$
DECLARE
  v_url text;
  v_functions_url text;
  v_service_role_key text;
  v_job_id int;
BEGIN
  SELECT jobid
    INTO v_job_id
    FROM cron.job
   WHERE jobname = 'process-webhook-queue';

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  SELECT setting_value
    INTO v_functions_url
    FROM private.workflow_runtime_settings
   WHERE setting_name = 'functions_url';

  SELECT setting_value
    INTO v_service_role_key
    FROM private.workflow_runtime_settings
   WHERE setting_name = 'service_role_key';

  IF v_service_role_key IS NULL OR length(trim(v_service_role_key)) = 0 THEN
    RAISE NOTICE 'Skipping process-webhook-queue cron schedule: private.workflow_runtime_settings.service_role_key is not configured';
    RETURN;
  END IF;

  v_url := COALESCE(
    NULLIF(trim(v_functions_url), ''),
    'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1'
  ) || '/webhook-dispatcher';

  PERFORM cron.schedule(
    'process-webhook-queue',
    '* * * * *',
    format(
      'SELECT net.http_post(%L, %L::jsonb, jsonb_build_object(%L, %L, %L, %L));',
      v_url,
      '{}',
      'Content-Type',
      'application/json',
      'Authorization',
      'Bearer ' || v_service_role_key
    )
  );
END $$;

COMMIT;
