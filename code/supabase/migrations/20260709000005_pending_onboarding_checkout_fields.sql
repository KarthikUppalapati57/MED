-- Store checkout/subscription details while tenant hierarchy is still a draft.
-- The final onboarding hierarchy RPC links these pending values to the primary organization.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pending_onboarding_plan_id text REFERENCES public.plans(id),
  ADD COLUMN IF NOT EXISTS pending_stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS pending_stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS pending_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS pending_payment_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_payment_method_type_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_payment_method_type_check
  CHECK (
    payment_method_type IS NULL
    OR payment_method_type IN ('card', 'ach', 'free_plan', 'mock_subscription', 'stripe_subscription')
  );

CREATE INDEX IF NOT EXISTS idx_profiles_pending_onboarding_plan_id
  ON public.profiles(pending_onboarding_plan_id);
CREATE INDEX IF NOT EXISTS idx_profiles_pending_checkout_session_id
  ON public.profiles(pending_checkout_session_id);