-- Migration 120: Native Workflow Triggers via pg_net
-- Replaces Inngest by wiring database events directly to Supabase Edge Functions.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. Create a generic trigger function that dispatches events to Edge Functions
CREATE OR REPLACE FUNCTION public.invoke_edge_function()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  function_name TEXT := TG_ARGV[0];
  v_url TEXT;
  v_headers JSONB;
  v_payload JSONB;
BEGIN
  -- Construct the Edge Function URL. 
  -- We default to the known production URL, but allow overrides via custom settings if needed.
  v_url := COALESCE(current_setting('app.settings.functions_url', true), 'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1') || '/' || function_name;
  
  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || COALESCE(current_setting('app.settings.service_role_key', true), 'sb_secret_OEGt5rGA8uLwCaST9M4SuA_m3CPyA0C')
  );

  v_payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE null END,
    'old_record', CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD) ELSE null END
  );

  PERFORM net.http_post(
      url := v_url,
      body := v_payload,
      headers := v_headers
  );
  
  RETURN NULL; -- AFTER trigger
END;
$$;

-- 2. process-onboarding Triggers
DROP TRIGGER IF EXISTS trg_demo_requests_webhook ON public.demo_requests;
CREATE TRIGGER trg_demo_requests_webhook
  AFTER INSERT OR UPDATE ON public.demo_requests
  FOR EACH ROW EXECUTE FUNCTION public.invoke_edge_function('process-onboarding');

DROP TRIGGER IF EXISTS trg_org_deleted_webhook ON public.organizations;
CREATE TRIGGER trg_org_deleted_webhook
  AFTER DELETE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.invoke_edge_function('process-onboarding');

-- 3. invoice-processing Triggers
DROP TRIGGER IF EXISTS trg_invoices_webhook ON public.invoices;
CREATE TRIGGER trg_invoices_webhook
  AFTER INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoke_edge_function('invoice-processing');

-- 4. billing-worker Triggers
-- Note: Requires `subscriptions` table. If it's missing, this trigger will just wait to be attached.
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscriptions') THEN
    DROP TRIGGER IF EXISTS trg_subscriptions_webhook ON public.subscriptions;
    EXECUTE 'CREATE TRIGGER trg_subscriptions_webhook
      AFTER INSERT OR UPDATE ON public.subscriptions
      FOR EACH ROW EXECUTE FUNCTION public.invoke_edge_function(''billing-worker'')';
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_payments_webhook ON public.payments;
CREATE TRIGGER trg_payments_webhook
  AFTER UPDATE ON public.payments
  FOR EACH ROW 
  WHEN (NEW.status = 'failed' AND OLD.status IS DISTINCT FROM 'failed')
  EXECUTE FUNCTION public.invoke_edge_function('billing-worker');

-- 5. team-worker Triggers
DROP TRIGGER IF EXISTS trg_invitations_webhook ON public.invitations;
CREATE TRIGGER trg_invitations_webhook
  AFTER INSERT ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.invoke_edge_function('team-worker');

DROP TRIGGER IF EXISTS trg_integrations_webhook ON public.integrations;
CREATE TRIGGER trg_integrations_webhook
  AFTER INSERT ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.invoke_edge_function('team-worker');

-- 6. Setup pg_cron for Webhook Dispatcher
-- We set up a cron job to call the webhook-dispatcher every minute to process retries/queue.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  v_url TEXT;
  v_job_id INT;
BEGIN
  v_url := COALESCE(current_setting('app.settings.functions_url', true), 'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1') || '/webhook-dispatcher';
  
  -- Create the cron job if it doesn't exist
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'process-webhook-queue';
  
  IF v_job_id IS NULL THEN
    PERFORM cron.schedule(
      'process-webhook-queue',
      '* * * * *', -- Every minute
      format('SELECT net.http_post(''%s'', ''{}''::jsonb, ''{"Content-Type": "application/json"}'');', v_url)
    );
  END IF;
END $$;

COMMIT;
