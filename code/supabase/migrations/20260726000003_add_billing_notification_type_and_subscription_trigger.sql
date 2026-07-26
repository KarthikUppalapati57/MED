-- billing-worker's notifyOrgManagers() (subscription past-due / status-changed alerts) has been
-- structurally unreachable since before the subscriptions table existed: trg_subscriptions_webhook
-- was only ever defined in 120_native_workflow_triggers.sql, guarded on
-- `IF EXISTS (... table_name = 'subscriptions')`, but that migration runs (numeric prefix "120_")
-- before 20260622210009_saas_subscriptions.sql creates the table (timestamp-prefixed migrations
-- sort after plain numeric ones), so the guard always skipped it and nothing recreated it since.
-- (The payment-failure trigger into billing-worker is a separate, already-working trigger and is
-- unaffected by any of this.)
--
-- Independently, even if that trigger fires, billing-worker's notifyOrgManagers() inserts
-- type: 'billing', which was never added to notifications_type_check (defined once, in
-- 068_workflow_wiring_hardening.sql) -- so the insert would fail the CHECK constraint. Both need
-- fixing together for subscription alerts to actually work.

BEGIN;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type IS NULL OR type IN (
      'invoice',
      'approval',
      'invoice_approved',
      'payment',
      'payment_failed',
      'order',
      'inventory',
      'low_inventory',
      'AI_alert',
      'vendor_update',
      'labor_alert',
      'system',
      'alert',
      'warning',
      'error',
      'billing'
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscriptions') THEN
    DROP TRIGGER IF EXISTS trg_subscriptions_webhook ON public.subscriptions;
    CREATE TRIGGER trg_subscriptions_webhook
      AFTER INSERT OR UPDATE ON public.subscriptions
      FOR EACH ROW EXECUTE FUNCTION public.invoke_edge_function('billing-worker');
  END IF;
END $$;

COMMIT;
