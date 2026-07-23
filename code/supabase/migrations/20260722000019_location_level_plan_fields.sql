BEGIN;

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS plan_id text REFERENCES public.plans(id),
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'unprovisioned',
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

CREATE INDEX IF NOT EXISTS idx_locations_plan_id ON public.locations(plan_id);
CREATE INDEX IF NOT EXISTS idx_locations_subscription_status ON public.locations(subscription_status);

UPDATE public.locations l
SET plan_id = COALESCE(l.plan_id, o.plan_id),
    subscription_status = COALESCE(l.subscription_status, o.subscription_status, 'unprovisioned'),
    stripe_customer_id = COALESCE(l.stripe_customer_id, o.stripe_customer_id),
    stripe_subscription_id = COALESCE(l.stripe_subscription_id, o.stripe_subscription_id),
    updated_at = now()
FROM public.organizations o
WHERE l.organization_id = o.id
  AND (
    l.plan_id IS NULL
    OR COALESCE(l.subscription_status, 'unprovisioned') = 'unprovisioned'
    OR l.stripe_customer_id IS NULL
    OR l.stripe_subscription_id IS NULL
  );

COMMENT ON COLUMN public.locations.plan_id IS 'Location-level subscription plan. Plans are priced per billable location.';
COMMENT ON COLUMN public.locations.subscription_status IS 'Location-level subscription status for per-location billing.';
COMMENT ON COLUMN public.locations.stripe_customer_id IS 'Stripe customer associated with this billable location when managed directly.';
COMMENT ON COLUMN public.locations.stripe_subscription_id IS 'Stripe subscription associated with this billable location when managed directly.';

NOTIFY pgrst, 'reload schema';

COMMIT;