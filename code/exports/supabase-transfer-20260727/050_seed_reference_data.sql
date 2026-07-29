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

-- ---------------------------------------------------------------------------
-- Demo organization data
-- ---------------------------------------------------------------------------

-- Insert a demo organization when the base table exists.
DO $seed$
BEGIN
  IF to_regclass('public.organizations') IS NOT NULL THEN
    INSERT INTO public.organizations (id, name, slug, plan_id)
    VALUES ('10000000-0000-0000-0000-000000000001', 'Demo Restaurant Group', 'demo-restaurant-group', 'custom')
    ON CONFLICT DO NOTHING;
  END IF;
END $seed$;

-- Insert a demo brand.
DO $seed$
BEGIN
  IF to_regclass('public.brands') IS NOT NULL THEN
    INSERT INTO public.brands (brand_id, organization_id, name)
    VALUES ('15000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Demo Brand')
    ON CONFLICT DO NOTHING;
  END IF;
END $seed$;

-- Insert a demo location.
DO $seed$
BEGIN
  IF to_regclass('public.locations') IS NOT NULL THEN
    INSERT INTO public.locations (id, organization_id, brand_id, name)
    VALUES ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', 'Downtown Flagship')
    ON CONFLICT DO NOTHING;
  END IF;
END $seed$;

-- Ensure default recipe categories for seeded/existing organizations.
DO $seed$
DECLARE
  v_org uuid;
BEGIN
  IF to_regprocedure('public.ensure_default_recipe_categories(uuid)') IS NOT NULL THEN
    FOR v_org IN SELECT id FROM public.organizations LOOP
      PERFORM public.ensure_default_recipe_categories(v_org);
    END LOOP;
  END IF;
END $seed$;

-- Insert global items (ingredients) when the legacy global_items table exists.
DO $seed$
BEGIN
  IF to_regclass('public.global_items') IS NOT NULL THEN
    INSERT INTO public.global_items (id, organization_id, name, category, standard_uom, base_cost)
    VALUES
    ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Chicken Breast (Raw)', 'Proteins', 'lb', 3.50),
    ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Romaine Lettuce', 'Produce', 'head', 1.20),
    ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Tomatoes', 'Produce', 'lb', 0.80),
    ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Cheddar Cheese', 'Dairy', 'lb', 4.10)
    ON CONFLICT DO NOTHING;
  END IF;
END $seed$;

-- Insert demo vendors.
DO $seed$
BEGIN
  IF to_regclass('public.vendors') IS NOT NULL THEN
    INSERT INTO public.vendors (id, organization_id, name, email, phone)
    VALUES
    ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Sysco Foods', 'orders@sysco.demo', '555-0100'),
    ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'US Foods', 'orders@usfoods.demo', '555-0200')
    ON CONFLICT DO NOTHING;
  END IF;
END $seed$;

-- Insert demo customers for CRM.
DO $seed$
BEGIN
  IF to_regclass('public.customers') IS NOT NULL THEN
    INSERT INTO public.customers (id, organization_id, first_name, last_name, email, phone_number, total_spent)
    VALUES
    ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'John', 'Doe', 'john@demo.com', '555-1234', 450.00),
    ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Jane', 'Smith', 'jane@demo.com', '555-5678', 1200.00)
    ON CONFLICT DO NOTHING;
  END IF;
END $seed$;

-- Insert demo loyalty memberships.
DO $seed$
BEGIN
  IF to_regclass('public.loyalty_memberships') IS NOT NULL THEN
    INSERT INTO public.loyalty_memberships (id, organization_id, customer_id, points_balance, tier)
    VALUES
    ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 450, 'silver'),
    ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 1200, 'gold')
    ON CONFLICT DO NOTHING;
  END IF;
END $seed$;

COMMIT;