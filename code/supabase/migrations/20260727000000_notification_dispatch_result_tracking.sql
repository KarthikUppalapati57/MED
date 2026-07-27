-- 20260727000000: Track per-channel notification dispatch outcome.
-- enforce_notification_delivery_preference() called notify-channel-dispatch but never told it
-- which row to report back to, so a failed (or successful) email/SMS send had nowhere durable to
-- land -- only a server-side console.error nobody but a developer with log access could see.
-- Threading notification_id through lets the edge function record the outcome on the row itself.
-- Gating logic (in_app_enabled/critical_only/skip_channel_dispatch/email_enabled/phone_enabled)
-- is unchanged; see notification_delivery_preference_enforcement_acceptance.sql for that.

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

  v_is_critical := COALESCE((NEW.metadata->>'critical')::boolean, false)
    OR NEW.metadata->>'priority' = 'critical'
    OR NEW.type IN ('error', 'warning', 'payment_failed', 'low_inventory', 'AI_alert');

  SELECT in_app_enabled, critical_only, email_enabled, phone_enabled
    INTO v_in_app_enabled, v_critical_only, v_email_enabled, v_phone_enabled
  FROM public.notification_delivery_preferences
  WHERE user_id = NEW.user_id AND module_key = v_module_key;

  IF NOT FOUND THEN
    v_in_app_enabled := true;
    v_critical_only := false;
    v_email_enabled := false;
    v_phone_enabled := false;
  END IF;

  IF NOT v_in_app_enabled THEN
    RETURN NULL;
  END IF;

  IF v_critical_only AND NOT v_is_critical THEN
    RETURN NULL;
  END IF;

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
            'notification_id', NEW.id,
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
      -- Same rule as before: a dispatch failure must never block the in-app row landing.
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
