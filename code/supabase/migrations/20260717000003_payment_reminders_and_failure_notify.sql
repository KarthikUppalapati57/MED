BEGIN;

-- Per-user due-date reminder settings. Deliberately per-user, not org-wide (each person picks
-- their own reminder cadence for invoices they can already see).
CREATE TABLE IF NOT EXISTS public.invoice_reminder_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reminder_days int[] NOT NULL DEFAULT '{7,3,1}',
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_reminder_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_reminder_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_reminder_settings_self" ON public.invoice_reminder_settings;
CREATE POLICY "invoice_reminder_settings_self"
  ON public.invoice_reminder_settings
  FOR ALL
  USING (user_id = auth.uid() OR auth.role() = 'service_role')
  WITH CHECK (user_id = auth.uid() OR auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_reminder_settings TO authenticated;
GRANT ALL ON public.invoice_reminder_settings TO service_role;

-- Idempotency log: one row per (invoice, user, reminder_day) that's ever fired, so the daily
-- job can never re-notify for the same threshold crossing.
CREATE TABLE IF NOT EXISTS public.invoice_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_day int NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, user_id, reminder_day)
);

ALTER TABLE public.invoice_reminder_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_reminder_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_reminder_log_self_read" ON public.invoice_reminder_log;
CREATE POLICY "invoice_reminder_log_self_read"
  ON public.invoice_reminder_log
  FOR SELECT
  USING (user_id = auth.uid() OR auth.role() = 'service_role');

REVOKE ALL ON public.invoice_reminder_log FROM authenticated, anon;
GRANT SELECT ON public.invoice_reminder_log TO authenticated;
GRANT ALL ON public.invoice_reminder_log TO service_role;

-- Payments needs a failure_reason so the UI can show WHY a payout failed (not just that it
-- did). Nothing set payments.status='failed' synchronously before the payment-workflow-
-- hardening pass above; this column already exists if that migration ran first, IF NOT EXISTS
-- keeps this migration standalone-safe either way.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS failure_reason text;

-- Reimplements the org_owner/branch_manager/location_manager/ground_staff visibility rule
-- from financial_scope_visible(), but against an EXPLICIT target user's profile instead of
-- auth.uid() -- financial_scope_visible only ever checks the calling session's own access,
-- which is meaningless inside a cron job that has to evaluate many different users' access.
CREATE OR REPLACE FUNCTION public.send_due_date_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setting RECORD;
  v_profile RECORD;
  v_invoice RECORD;
BEGIN
  FOR v_setting IN
    SELECT user_id, organization_id, reminder_days
    FROM public.invoice_reminder_settings
    WHERE enabled = true
  LOOP
    SELECT role, organization_id, brand_id, location_id
      INTO v_profile
    FROM public.profiles
    WHERE id = v_setting.user_id
      AND deleted_at IS NULL;

    IF v_profile.role IS NULL THEN
      CONTINUE;
    END IF;

    FOR v_invoice IN
      SELECT i.id, i.due_date, (i.due_date - CURRENT_DATE) AS days_out
      FROM public.invoices i
      WHERE i.deleted_at IS NULL
        AND i.organization_id = v_setting.organization_id
        AND COALESCE(i.payment_status, 'unpaid') NOT IN ('paid', 'auto_pay')
        AND i.due_date IS NOT NULL
        AND (i.due_date - CURRENT_DATE) = ANY(v_setting.reminder_days)
        AND (
          v_profile.role IN ('org_owner', 'platform_admin')
          OR (
            v_profile.role = 'branch_manager'
            AND (
              i.brand_id = v_profile.brand_id
              OR i.location_id IN (SELECT l.id FROM public.locations l WHERE l.brand_id = v_profile.brand_id)
            )
          )
          OR (
            v_profile.role IN ('location_manager', 'ground_staff')
            AND i.location_id = v_profile.location_id
          )
        )
    LOOP
      INSERT INTO public.invoice_reminder_log (invoice_id, user_id, reminder_day)
      VALUES (v_invoice.id, v_setting.user_id, v_invoice.days_out)
      ON CONFLICT (invoice_id, user_id, reminder_day) DO NOTHING;

      IF FOUND THEN
        INSERT INTO public.notifications (user_id, organization_id, type, title, message, is_read, metadata)
        VALUES (
          v_setting.user_id,
          v_setting.organization_id,
          'invoice',
          CASE WHEN v_invoice.days_out <= 0 THEN 'Invoice overdue' ELSE 'Invoice due soon' END,
          CASE WHEN v_invoice.days_out <= 0
            THEN format('An invoice was due on %s and is still unpaid.', to_char(v_invoice.due_date, 'Mon DD, YYYY'))
            ELSE format('An invoice is due in %s day%s (%s).', v_invoice.days_out, CASE WHEN v_invoice.days_out = 1 THEN '' ELSE 's' END, to_char(v_invoice.due_date, 'Mon DD, YYYY'))
          END,
          false,
          jsonb_build_object('invoice_id', v_invoice.id, 'due_in_days', v_invoice.days_out)
        );
      END IF;
    END LOOP;
  END LOOP;

  -- Trigger the email side (plain SQL can't call Resend). Same secure-dispatch pattern as
  -- dispatch_webhook_queue(): read the functions URL/service key from
  -- private.workflow_runtime_settings rather than hardcoding credentials in this function.
  DECLARE
    v_functions_url text;
    v_service_role_key text;
    v_url text;
  BEGIN
    SELECT setting_value INTO v_functions_url FROM private.workflow_runtime_settings WHERE setting_name = 'functions_url';
    SELECT setting_value INTO v_service_role_key FROM private.workflow_runtime_settings WHERE setting_name = 'service_role_key';

    IF v_service_role_key IS NOT NULL AND length(trim(v_service_role_key)) > 0 THEN
      v_url := COALESCE(NULLIF(trim(v_functions_url), ''), 'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1') || '/send-due-date-reminder-emails';

      PERFORM net.http_post(
        url := v_url,
        body := '{}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role_key
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Notifications already landed above; a failure to trigger the email side is non-fatal.
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.send_due_date_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_due_date_reminders() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('send_due_date_reminders')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send_due_date_reminders');

      PERFORM cron.schedule(
        'send_due_date_reminders',
        '0 8 * * *',
        'SELECT public.send_due_date_reminders();'
      );
    EXCEPTION WHEN OTHERS THEN
      -- local/CI without cron privileges: skip, not fatal
      NULL;
    END;
  END IF;
END $$;

COMMIT;
