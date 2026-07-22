-- Align tenant onboarding plans with the public pricing tiers.
-- Only the three current onboarding tiers should remain in the catalog.

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

-- Remap orgs off retired plan ids before deleting catalog rows.
UPDATE public.organizations
SET plan_id = 'starter'
WHERE plan_id IS NOT NULL
  AND plan_id NOT IN ('starter', 'starter-ai', 'advanced');

DELETE FROM public.plans
WHERE id NOT IN ('starter', 'starter-ai', 'advanced');
