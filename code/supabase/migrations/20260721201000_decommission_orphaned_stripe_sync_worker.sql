-- Decommission the orphaned Stripe Sync Engine cron job.
-- The scheduled command targets /functions/v1/stripe-worker, but this repository does not
-- contain or deploy a stripe-worker Edge Function. Leaving the cron active creates a
-- misleading stream of successful no-op runs whenever stripe_sync_skip_until is set, or
-- failed HTTP dispatches when it expires. Core Stripe checkout/webhook flows remain active.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('stripe-sync-worker')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stripe-sync-worker');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END $$;

COMMIT;