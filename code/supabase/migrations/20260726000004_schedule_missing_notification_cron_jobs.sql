-- schedule-reports (proxies to dashboard-report-scheduler) and onboarding-expiry-monitor both
-- contain complete, working logic but were never actually scheduled anywhere in this repo: no
-- cron.schedule call, no supabase/config.toml cron entry, no external trigger. Wires both up
-- with the same guarded cron.schedule + private.workflow_runtime_settings pattern already used
-- for send_due_date_reminders (20260717000003_payment_reminders_and_failure_notify.sql).
--
-- schedule-reports runs at 6am daily to match dashboard-report-scheduler's own internal
-- shouldSendCustomReport()/shouldSendPreference() checks, which compare against the cron strings
-- '0 6 * * *' / '0 6 * * 1' / '0 6 1 * *' (daily/weekly-Monday/monthly-1st) -- it only actually
-- sends when today matches, so a single daily invocation at that hour covers all three cadences.
-- onboarding-expiry-monitor runs at 9am daily, offset an hour from the existing 8am
-- send_due_date_reminders job so they don't contend for the same minute.

BEGIN;

DO $$
DECLARE
  v_functions_url text;
  v_service_role_key text;
  v_reports_url text;
  v_expiry_url text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  SELECT setting_value INTO v_functions_url FROM private.workflow_runtime_settings WHERE setting_name = 'functions_url';
  SELECT setting_value INTO v_service_role_key FROM private.workflow_runtime_settings WHERE setting_name = 'service_role_key';

  IF v_service_role_key IS NULL OR length(trim(v_service_role_key)) = 0 THEN
    RAISE NOTICE 'Skipping schedule-reports/onboarding-expiry-monitor cron schedule: private.workflow_runtime_settings.service_role_key is not configured';
    RETURN;
  END IF;

  v_reports_url := COALESCE(NULLIF(trim(v_functions_url), ''), 'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1') || '/schedule-reports';
  v_expiry_url := COALESCE(NULLIF(trim(v_functions_url), ''), 'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1') || '/onboarding-expiry-monitor';

  BEGIN
    PERFORM cron.unschedule('schedule-reports')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'schedule-reports');

    PERFORM cron.schedule(
      'schedule-reports',
      '0 6 * * *',
      format(
        'SELECT net.http_post(%L, ''{}''::jsonb, jsonb_build_object(%L, %L, %L, %L));',
        v_reports_url,
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_role_key
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL; -- local/CI without cron privileges: skip, not fatal
  END;

  BEGIN
    PERFORM cron.unschedule('onboarding-expiry-monitor')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'onboarding-expiry-monitor');

    PERFORM cron.schedule(
      'onboarding-expiry-monitor',
      '0 9 * * *',
      format(
        'SELECT net.http_post(%L, ''{}''::jsonb, jsonb_build_object(%L, %L, %L, %L));',
        v_expiry_url,
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_role_key
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

COMMIT;
