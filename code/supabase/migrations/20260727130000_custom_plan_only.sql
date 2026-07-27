-- Switch commercial model from public fixed tiers to client-specific custom plans.
-- Pricing is discussed with each client; public Starter/Starter + AI/Advanced rows are retired.

BEGIN;

INSERT INTO public.plans (id, name, description, price_monthly, features, is_active)
VALUES (
  'custom',
  'Custom plan',
  'Custom commercial package discussed with each client before onboarding.',
  0.00,
  '["invoices", "products", "vendors", "payments", "inventory", "recipes", "analytics", "ai", "advanced_modules"]'::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    price_monthly = EXCLUDED.price_monthly,
    features = EXCLUDED.features,
    is_active = EXCLUDED.is_active;

UPDATE public.organizations
SET plan_id = 'custom'
WHERE plan_id IS NULL
   OR plan_id IN ('free', 'starter', 'starter-ai', 'advanced')
   OR NOT EXISTS (SELECT 1 FROM public.plans p WHERE p.id = organizations.plan_id);

UPDATE public.locations
SET plan_id = 'custom'
WHERE plan_id IS NULL
   OR plan_id IN ('free', 'starter', 'starter-ai', 'advanced')
   OR NOT EXISTS (SELECT 1 FROM public.plans p WHERE p.id = locations.plan_id);

UPDATE public.profiles
SET pending_onboarding_plan_id = 'custom',
    updated_at = now()
WHERE pending_onboarding_plan_id IN ('free', 'starter', 'starter-ai', 'advanced')
   OR (
     pending_onboarding_plan_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.plans p WHERE p.id = profiles.pending_onboarding_plan_id)
   );

UPDATE public.onboarding_coupon_redemptions
SET plan_id = 'custom'
WHERE plan_id IN ('free', 'starter', 'starter-ai', 'advanced')
   OR NOT EXISTS (SELECT 1 FROM public.plans p WHERE p.id = onboarding_coupon_redemptions.plan_id);

DELETE FROM public.plans
WHERE id IN ('free', 'starter', 'starter-ai', 'advanced');

ALTER TABLE public.organizations
  ALTER COLUMN plan_id SET DEFAULT 'custom';

ALTER TABLE public.locations
  ALTER COLUMN plan_id SET DEFAULT 'custom';

COMMENT ON TABLE public.plans IS 'Client-specific commercial plan catalog. Public fixed pricing tiers are retired; each client uses a custom discussed package.';
COMMENT ON COLUMN public.plans.price_monthly IS 'Internal monthly amount. Public landing pages do not expose fixed plan pricing.';

COMMIT;

NOTIFY pgrst, 'reload schema';