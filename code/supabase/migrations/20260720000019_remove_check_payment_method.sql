-- Removes the Check payment method (added in 20260720000016_check_payment_method.sql).
-- Product decision: Card + ACH cover it; the manual admin-confirmation workflow Check
-- required wasn't worth keeping. No profiles.payment_method_type = 'check' rows exist yet
-- (verified before writing this migration), so this is a clean revert, not a data migration.
--
-- Drops confirm_check_payment_received() -- its only caller (the admin "Confirm Check
-- Received" button in PlatformOrganizations.jsx) has been removed, and create-checkout-session
-- no longer has a 'check' branch to set profiles.payment_method_type = 'check' in the first
-- place. Reverts the payment_method_type CHECK constraint to its pre-20260720000016 shape.

BEGIN;

DROP FUNCTION IF EXISTS public.confirm_check_payment_received(uuid, text);

ALTER TABLE public.profiles
  DROP CONSTRAINT profiles_payment_method_type_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_payment_method_type_check
  CHECK (payment_method_type IS NULL OR payment_method_type = ANY (ARRAY['card'::text, 'ach'::text, 'free_plan'::text, 'mock_subscription'::text, 'stripe_subscription'::text, 'trial_coupon'::text]));

COMMIT;
