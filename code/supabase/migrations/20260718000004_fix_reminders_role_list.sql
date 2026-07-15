-- send_due_date_reminders (20260717000001_payment_reminders_and_failure_notify.sql) shipped
-- 9 days after tenant_super_admin/org_manager existed and still used the dead 'org_owner'
-- string with no tenant_super_admin branch -- no org_manager/tenant_super_admin ever received
-- an invoice due-date reminder. CREATE OR REPLACE with the only line changed (the role check);
-- rest of the function body is unchanged from 20260717000001...sql:60-159.

BEGIN;

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
          v_profile.role IN ('org_manager', 'tenant_super_admin', 'platform_admin')
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

COMMIT;
