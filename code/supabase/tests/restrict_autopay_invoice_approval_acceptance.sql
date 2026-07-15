-- Acceptance test for 20260719000008_restrict_autopay_invoice_approval.sql
--
-- Verifies: (1) a location_manager (within scope, within their own limit) CANNOT approve an
-- invoice for an AutoPay-enabled vendor, (2) that same location_manager CAN still approve a
-- normal (non-AutoPay) invoice as before -- no regression, (3) an org_manager CAN approve the
-- AutoPay invoice, (4) the restriction applies on a raw direct UPDATE too, not just through
-- approve_invoice_with_limit -- proving it's enforced at the trigger, the single choke point
-- every approval path already routes through.

BEGIN;

INSERT INTO private.workflow_runtime_settings (setting_name, setting_value, updated_at)
VALUES ('service_role_key', 'rollback-test-service-role-key', now())
ON CONFLICT (setting_name) DO UPDATE
   SET setting_value = EXCLUDED.setting_value,
       updated_at = now();

CREATE TEMP TABLE raia_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE raia_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON raia_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON raia_results TO authenticated;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_org_manager uuid := gen_random_uuid();
  v_location_manager uuid := gen_random_uuid();
  v_vendor_autopay uuid;
  v_vendor_normal uuid;
  v_invoice_autopay uuid;
  v_invoice_normal uuid;
  v_invoice_autopay_direct uuid;
BEGIN
  INSERT INTO raia_ids(key, value) VALUES ('org', v_org), ('org_manager', v_org_manager), ('location_manager', v_location_manager);

  INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'RAIA Org', 'raia-org-' || v_org);
  INSERT INTO public.brands (brand_id, name, organization_id) VALUES (v_brand, 'RAIA Brand', v_org);
  INSERT INTO public.locations (id, name, organization_id, brand_id) VALUES (v_location, 'RAIA Location', v_org, v_brand);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_org_manager, 'authenticated', 'authenticated', 'raia-org-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_location_manager, 'authenticated', 'authenticated', 'raia-location-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.profiles (id, email, full_name, role, status, organization_id, brand_id, location_id, invoice_approval_limit)
  VALUES
    (v_org_manager, 'raia-org-manager@example.test', 'RAIA Org Manager', 'org_manager', 'active', v_org, NULL, NULL, 1000000),
    (v_location_manager, 'raia-location-manager@example.test', 'RAIA Location Manager', 'location_manager', 'active', v_org, v_brand, v_location, 100000)
  ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, role = EXCLUDED.role,
    brand_id = EXCLUDED.brand_id, location_id = EXCLUDED.location_id, invoice_approval_limit = EXCLUDED.invoice_approval_limit;

  INSERT INTO public.vendors (organization_id, name, autopay_enabled) VALUES (v_org, 'RAIA AutoPay Vendor', true) RETURNING id INTO v_vendor_autopay;
  INSERT INTO public.vendors (organization_id, name, autopay_enabled) VALUES (v_org, 'RAIA Normal Vendor', false) RETURNING id INTO v_vendor_normal;

  INSERT INTO public.invoices (organization_id, brand_id, location_id, vendor_id, vendor_name, invoice_number, total_amount, status)
  VALUES (v_org, v_brand, v_location, v_vendor_autopay, 'RAIA AutoPay Vendor', 'RAIA-AUTOPAY-1', 50, 'pending_review')
  RETURNING id INTO v_invoice_autopay;

  INSERT INTO public.invoices (organization_id, brand_id, location_id, vendor_id, vendor_name, invoice_number, total_amount, status)
  VALUES (v_org, v_brand, v_location, v_vendor_normal, 'RAIA Normal Vendor', 'RAIA-NORMAL-1', 50, 'pending_review')
  RETURNING id INTO v_invoice_normal;

  INSERT INTO public.invoices (organization_id, brand_id, location_id, vendor_id, vendor_name, invoice_number, total_amount, status)
  VALUES (v_org, v_brand, v_location, v_vendor_autopay, 'RAIA AutoPay Vendor', 'RAIA-AUTOPAY-2', 50, 'pending_review')
  RETURNING id INTO v_invoice_autopay_direct;

  INSERT INTO raia_ids(key, value) VALUES
    ('invoice_autopay', v_invoice_autopay),
    ('invoice_normal', v_invoice_normal),
    ('invoice_autopay_direct', v_invoice_autopay_direct);
END $$;

-- ===== location_manager cannot approve an AutoPay-vendor invoice =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM raia_ids WHERE key = 'location_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.approve_invoice_with_limit(
      (SELECT value FROM raia_ids WHERE key = 'invoice_autopay'),
      (SELECT value FROM raia_ids WHERE key = 'location_manager'),
      50
    );
    INSERT INTO raia_results VALUES ('location_manager_blocked_on_autopay', false, 'approval unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO raia_results VALUES ('location_manager_blocked_on_autopay', true, SQLERRM);
  END;
END $$;

-- ===== but the SAME location_manager can still approve a normal (non-AutoPay) invoice =====

SELECT public.approve_invoice_with_limit(
  (SELECT value FROM raia_ids WHERE key = 'invoice_normal'),
  (SELECT value FROM raia_ids WHERE key = 'location_manager'),
  50
);

RESET ROLE;

INSERT INTO raia_results
SELECT 'location_manager_still_approves_normal_invoice',
       status = 'approved',
       'status=' || status
FROM public.invoices
WHERE id = (SELECT value FROM raia_ids WHERE key = 'invoice_normal');

-- ===== org_manager CAN approve the AutoPay-vendor invoice =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM raia_ids WHERE key = 'org_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT public.approve_invoice_with_limit(
  (SELECT value FROM raia_ids WHERE key = 'invoice_autopay'),
  (SELECT value FROM raia_ids WHERE key = 'org_manager'),
  50
);

RESET ROLE;

INSERT INTO raia_results
SELECT 'org_manager_approves_autopay_invoice',
       status = 'approved',
       'status=' || status
FROM public.invoices
WHERE id = (SELECT value FROM raia_ids WHERE key = 'invoice_autopay');

-- ===== the restriction fires on a raw direct UPDATE too, not just through the RPC =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM raia_ids WHERE key = 'location_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    UPDATE public.invoices SET status = 'approved', ap_status = 'approved'
    WHERE id = (SELECT value FROM raia_ids WHERE key = 'invoice_autopay_direct');
    INSERT INTO raia_results VALUES ('direct_update_also_blocked', false, 'direct UPDATE unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO raia_results VALUES ('direct_update_also_blocked', true, SQLERRM);
  END;
END $$;

RESET ROLE;

-- ===================== verdict =====================

SELECT * FROM raia_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM raia_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'restrict_autopay_invoice_approval_acceptance failed';
  END IF;
END $$;

ROLLBACK;
