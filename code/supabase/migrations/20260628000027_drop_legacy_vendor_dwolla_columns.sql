BEGIN;

ALTER TABLE public.vendors
  DROP CONSTRAINT IF EXISTS valid_dwolla_onboarding_status;

ALTER TABLE public.vendors
  DROP COLUMN IF EXISTS dwolla_customer_url,
  DROP COLUMN IF EXISTS dwolla_onboarding_status;

COMMIT;