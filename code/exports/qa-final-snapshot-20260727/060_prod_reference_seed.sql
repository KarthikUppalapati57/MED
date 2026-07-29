-- Restops360 Master Demo + Reference Seed Script
-- Idempotent: safe to rerun after migrations. This file intentionally avoids
-- copying real users, vendors, payments, invoices, or other production records.

BEGIN;

-- ---------------------------------------------------------------------------
-- Platform/reference catalogs
-- ---------------------------------------------------------------------------

-- Current onboarding/pricing plan catalog.
DO $seed$
BEGIN
  IF to_regclass('public.plans') IS NOT NULL THEN
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

    DELETE FROM public.plans
    WHERE id IN ('free', 'starter', 'starter-ai', 'advanced');
  END IF;
END $seed$;
-- Platform onboarding verification defaults.
DO $seed$
BEGIN
  IF to_regclass('public.platform_onboarding_settings') IS NOT NULL THEN
    INSERT INTO public.platform_onboarding_settings (id, ein_verification_enabled, ssn_verification_enabled)
    VALUES (true, true, true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $seed$;

-- Client feedback routing defaults.
DO $seed$
BEGIN
  IF to_regclass('public.platform_feedback_settings') IS NOT NULL THEN
    INSERT INTO public.platform_feedback_settings (id)
    VALUES (true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $seed$;

-- System RBAC role names.
DO $seed$
BEGIN
  IF to_regclass('public.roles') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'roles'
        AND column_name = 'is_system'
    ) THEN
      INSERT INTO public.roles (name, is_system)
      VALUES
        ('ground_staff', true),
        ('location_manager', true),
        ('branch_manager', true),
        ('brand_manager', true),
        ('org_manager', true),
        ('tenant_super_admin', true),
        ('platform_admin', true)
      ON CONFLICT (name) WHERE is_system = true DO UPDATE SET is_system = true;
    ELSE
      INSERT INTO public.roles (name)
      VALUES
        ('platform_admin'),
        ('org_owner'),
        ('branch_manager'),
        ('ground_staff')
      ON CONFLICT (name) DO NOTHING;
    END IF;
  END IF;
END $seed$;

-- Global invoice action reason vocabulary.
DO $seed$
BEGIN
  IF to_regclass('public.invoice_action_reasons') IS NOT NULL THEN
    INSERT INTO public.invoice_action_reasons (
      code,
      label,
      severity,
      resolution_route
    ) VALUES
      ('possible_duplicate', 'Possible Duplicate', 'critical', '/invoices/review/duplicate'),
      ('validation_flag', 'Validation Flag', 'warning', '/invoices/review/validation'),
      ('missing_receipt', 'Missing Receipt', 'warning', '/orders/receiving'),
      ('missing_purchase_order', 'Missing Purchase Order', 'warning', '/orders/new'),
      ('reconciliation_variance', 'Reconciliation Variance', 'critical', '/invoices/review/reconciliation')
    ON CONFLICT (code) DO UPDATE SET
      label = EXCLUDED.label,
      severity = EXCLUDED.severity,
      resolution_route = EXCLUDED.resolution_route,
      updated_at = now();
  END IF;
END $seed$;

-- Shared canonical vendor item examples used by matching/category intelligence.
DO $seed$
BEGIN
  IF to_regclass('public.global_vendor_items') IS NOT NULL THEN
    INSERT INTO public.global_vendor_items (
      vendor_name,
      vendor_item_code,
      item_name,
      most_common_category,
      confidence_score,
      mapping_count
    ) VALUES
      ('Sysco', 'SYS-101', 'Ground Beef 80/20', 'food_cogs', 95, 412),
      ('US Foods', 'USF-88', 'Heinz Ketchup 1Gal', 'food_cogs', 98, 850),
      ('Ecolab', 'ECO-22', 'Sanitizer Solution', 'cleaning_supplies', 99, 1200),
      ('Local Farm', 'LOC-01', 'Heirloom Tomatoes', 'food_cogs', 85, 45)
    ON CONFLICT (vendor_name, vendor_item_code, item_name) DO UPDATE SET
      most_common_category = EXCLUDED.most_common_category,
      confidence_score = EXCLUDED.confidence_score,
      mapping_count = EXCLUDED.mapping_count,
      updated_at = now();
  END IF;
END $seed$;

-- Provider-neutral payment compliance defaults.
DO $seed$
BEGIN
  IF to_regclass('public.payment_provider_compliance_profiles') IS NOT NULL THEN
    INSERT INTO public.payment_provider_compliance_profiles (
      provider,
      provider_use,
      requires_terms_acceptance,
      requires_ach_authorization,
      requires_kyc,
      requires_country_eligibility,
      requires_fraud_review,
      requires_requirements_remediation,
      requires_active_account_fee_tracking
    )
    VALUES
      ('not_configured', 'collection', false, false, false, false, false, false, false),
      ('not_configured', 'payout', false, false, false, false, false, false, false),
      ('stripe_ach_debit', 'collection', true, true, false, true, false, true, false),
      ('stripe_connect_custom', 'payout', true, false, true, true, true, true, true),
      ('checkbook', 'check', true, false, false, true, false, true, false)
    ON CONFLICT (provider, provider_use) DO NOTHING;
  END IF;
END $seed$;

COMMIT;
