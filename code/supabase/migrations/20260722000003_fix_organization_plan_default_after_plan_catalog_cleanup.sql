-- Keep organization creation aligned with the current three-plan catalog.
-- The old schema defaulted organizations.plan_id to 'free', but the current catalog
-- only contains starter, starter-ai, and advanced. During hierarchy approval the
-- organization row is inserted before pending_onboarding_plan_id is applied, so the
-- stale default can violate organizations_plan_id_fkey.

INSERT INTO public.plans (id, name, description, price_monthly, features, is_active)
VALUES
  (
    'starter',
    'Starter',
    'Core location operations for one restaurant, store, or service location.',
    149.00,
    '["invoices", "products", "vendors", "payments", "inventory", "recipes", "analytics"]'::jsonb,
    true
  ),
  (
    'starter-ai',
    'Starter + AI',
    'Starter modules plus AI-assisted operating intelligence.',
    249.00,
    '["starter_modules", "ai"]'::jsonb,
    false
  ),
  (
    'advanced',
    'Advanced modules',
    'Expanded controls for larger teams and advanced operating workflows.',
    349.00,
    '["starter_ai", "advanced_modules"]'::jsonb,
    false
  )
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    price_monthly = EXCLUDED.price_monthly,
    features = EXCLUDED.features,
    is_active = EXCLUDED.is_active;

UPDATE public.organizations o
SET plan_id = 'starter'
WHERE o.plan_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.plans p WHERE p.id = o.plan_id
  );

UPDATE public.profiles p
SET pending_onboarding_plan_id = 'starter',
    updated_at = now()
WHERE p.pending_onboarding_plan_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.plans plan WHERE plan.id = p.pending_onboarding_plan_id
  );

ALTER TABLE public.organizations
  ALTER COLUMN plan_id SET DEFAULT 'starter';