-- Align tenant onboarding plans with the public pricing tiers.
-- Starter is available now; AI and Advanced tiers are staged as inactive until launch.

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

UPDATE public.plans
SET is_active = false
WHERE id IN ('free', 'pro', 'enterprise');
