-- Today only notificationService.js's createNotification/notifyManagers (client-side) check
-- notification_delivery_preferences before inserting into public.notifications. At least five
-- other insert paths -- workflowService.js, _shared/notifyPaymentFailure.ts,
-- dashboard-report-scheduler, billing-worker, iot-webhook, plus the send_due_date_reminders/
-- notify_expired_owner_invitations DB functions -- insert directly and bypass it entirely, so a
-- user who disables in-app notifications for a module (or asks for critical-only) still gets
-- notified anyway depending on which code path happened to create the row. Patching each caller
-- individually is six+ diffs that can drift apart again; enforcing it once at the DB layer is
-- the root-cause fix and covers every future caller too.
--
-- This also activates the email_enabled/phone_enabled toggles the Settings UI already exposes
-- (code/src/modules/dashboard/pages/Notifications.jsx) but that nothing has ever acted on: an
-- AFTER-the-fact dispatch to a new notify-channel-dispatch Edge Function, gated per-channel by
-- the same preference row. Critical-type notifications (see CRITICAL_TYPES in
-- notificationService.js) always email regardless of the email_enabled toggle, matching the
-- existing (now-simplified) behavior of _shared/notifyPaymentFailure.ts, which unconditionally
-- emailed on payment failure before this migration -- nothing forces SMS the same way, since no
-- such precedent existed anywhere in this codebase before now.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_notification_delivery_preference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_module_key text;
  v_is_critical boolean;
  v_in_app_enabled boolean;
  v_critical_only boolean;
  v_email_enabled boolean;
  v_phone_enabled boolean;
  v_send_email boolean;
  v_send_sms boolean;
  v_functions_url text;
  v_service_role_key text;
  v_url text;
BEGIN
  -- Resolve module key the same way notificationService.js's moduleForNotification() does:
  -- explicit metadata.module_key wins, else map from type, else fall back to 'dashboard'.
  v_module_key := COALESCE(
    NEW.metadata->>'module_key',
    CASE NEW.type
      WHEN 'approval' THEN 'invoices'
      WHEN 'invoice' THEN 'invoices'
      WHEN 'invoice_approved' THEN 'invoices'
      WHEN 'payment' THEN 'payments'
      WHEN 'payment_failed' THEN 'payments'
      WHEN 'billing' THEN 'payments'
      WHEN 'inventory' THEN 'inventory'
      WHEN 'low_inventory' THEN 'inventory'
      WHEN 'order' THEN 'inventory'
      WHEN 'vendor_update' THEN 'vendors'
      WHEN 'labor_alert' THEN 'labor'
      ELSE 'dashboard'
    END
  );

  -- Mirrors notificationService.js's CRITICAL_TYPES / isCriticalNotification().
  v_is_critical := COALESCE((NEW.metadata->>'critical')::boolean, false)
    OR NEW.metadata->>'priority' = 'critical'
    OR NEW.type IN ('error', 'warning', 'payment_failed', 'low_inventory', 'AI_alert');

  SELECT in_app_enabled, critical_only, email_enabled, phone_enabled
    INTO v_in_app_enabled, v_critical_only, v_email_enabled, v_phone_enabled
  FROM public.notification_delivery_preferences
  WHERE user_id = NEW.user_id AND module_key = v_module_key;

  IF NOT FOUND THEN
    -- No stored row => same defaults the table's own column defaults encode.
    v_in_app_enabled := true;
    v_critical_only := false;
    v_email_enabled := false;
    v_phone_enabled := false;
  END IF;

  IF NOT v_in_app_enabled THEN
    RETURN NULL; -- silently cancel the insert, same "skip" behavior createNotification() already does client-side
  END IF;

  IF v_critical_only AND NOT v_is_critical THEN
    RETURN NULL;
  END IF;

  -- A caller that already sends its own specialized email (e.g. send_due_date_reminders(), which
  -- triggers send-due-date-reminder-emails separately) sets this to skip a duplicate generic one.
  IF NEW.metadata->>'skip_channel_dispatch' = 'true' THEN
    RETURN NEW;
  END IF;

  v_send_email := v_email_enabled OR v_is_critical;
  v_send_sms := v_phone_enabled;

  IF v_send_email OR v_send_sms THEN
    BEGIN
      SELECT setting_value INTO v_functions_url FROM private.workflow_runtime_settings WHERE setting_name = 'functions_url';
      SELECT setting_value INTO v_service_role_key FROM private.workflow_runtime_settings WHERE setting_name = 'service_role_key';

      IF v_service_role_key IS NOT NULL AND length(trim(v_service_role_key)) > 0 THEN
        v_url := COALESCE(NULLIF(trim(v_functions_url), ''), 'https://gsupqfmwlsmwoybphimx.supabase.co/functions/v1') || '/notify-channel-dispatch';

        PERFORM net.http_post(
          url := v_url,
          body := jsonb_build_object(
            'user_id', NEW.user_id,
            'title', NEW.title,
            'message', COALESCE(NEW.message, NEW.body),
            'send_email', v_send_email,
            'send_sms', v_send_sms
          ),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_role_key
          )
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- The in-app row is already landing via this same trigger's RETURN NEW below; a dispatch
      -- failure (or pg_net/net schema missing locally) must never block that.
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_notification_delivery_preference ON public.notifications;
CREATE TRIGGER trg_enforce_notification_delivery_preference
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_notification_delivery_preference();

-- send_due_date_reminders() (most recently redefined in 20260718000004_fix_reminders_role_list.sql)
-- already triggers its own dedicated send-due-date-reminder-emails call with properly formatted
-- invoice/vendor/amount content; mark its notification inserts so the new trigger above doesn't
-- also fire a second, generic email for the same event. CREATE OR REPLACE with only the
-- metadata's added skip_channel_dispatch key changed; rest of the function body is unchanged
-- from 20260718000004_fix_reminders_role_list.sql:9-108.
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
          jsonb_build_object('invoice_id', v_invoice.id, 'due_in_days', v_invoice.days_out, 'skip_channel_dispatch', true)
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
    NULL;
  END;
END;
$$;

COMMIT;
