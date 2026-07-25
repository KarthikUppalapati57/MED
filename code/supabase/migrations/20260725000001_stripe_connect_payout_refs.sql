BEGIN;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS stripe_transfer_id text;

COMMENT ON COLUMN public.payments.stripe_transfer_id IS
  'Stripe Connect transfer id for vendor ACH payouts.';

COMMIT;
