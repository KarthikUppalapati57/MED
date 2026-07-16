-- Acceptance test for 20260719000016_org_document_storage_stats.sql
--
-- Verifies get_org_document_stats(): (1) an org_manager sees the org's full file
-- count/total bytes across all documents (invoice-scoped at two different locations, plus
-- one org-level NULL-invoice_id doc), (2) a location_manager scoped to one location sees
-- only that location's contribution -- proving the function is SECURITY INVOKER and rides
-- the existing invoice_documents RLS rather than exposing cross-scope totals.

BEGIN;

INSERT INTO private.workflow_runtime_settings (setting_name, setting_value, updated_at)
VALUES ('service_role_key', 'rollback-test-service-role-key', now())
ON CONFLICT (setting_name) DO UPDATE
   SET setting_value = EXCLUDED.setting_value,
       updated_at = now();

CREATE TEMP TABLE odss_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE odss_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON odss_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON odss_results TO authenticated;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location_a uuid := gen_random_uuid();
  v_location_b uuid := gen_random_uuid();
  v_org_manager uuid := gen_random_uuid();
  v_location_manager uuid := gen_random_uuid();
  v_invoice_a uuid;
  v_invoice_b uuid;
BEGIN
  INSERT INTO odss_ids(key, value) VALUES ('org', v_org), ('org_manager', v_org_manager), ('location_manager', v_location_manager);

  INSERT INTO public.organizations (id, name, slug) VALUES (v_org, 'ODSS Org', 'odss-org-' || v_org);
  INSERT INTO public.brands (brand_id, name, organization_id) VALUES (v_brand, 'ODSS Brand', v_org);
  INSERT INTO public.locations (id, name, organization_id, brand_id) VALUES
    (v_location_a, 'ODSS Location A', v_org, v_brand),
    (v_location_b, 'ODSS Location B', v_org, v_brand);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_org_manager, 'authenticated', 'authenticated', 'odss-org-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_location_manager, 'authenticated', 'authenticated', 'odss-location-manager@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.profiles (id, email, full_name, role, status, organization_id, brand_id, location_id)
  VALUES
    (v_org_manager, 'odss-org-manager@example.test', 'ODSS Org Manager', 'org_manager', 'active', v_org, NULL, NULL),
    (v_location_manager, 'odss-location-manager@example.test', 'ODSS Location Manager', 'location_manager', 'active', v_org, v_brand, v_location_a)
  ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, role = EXCLUDED.role,
    brand_id = EXCLUDED.brand_id, location_id = EXCLUDED.location_id;

  INSERT INTO public.invoices (organization_id, brand_id, location_id, vendor_name, invoice_number, total_amount, status)
  VALUES (v_org, v_brand, v_location_a, 'ODSS Vendor', 'ODSS-INV-A', 10, 'pending_review')
  RETURNING id INTO v_invoice_a;

  INSERT INTO public.invoices (organization_id, brand_id, location_id, vendor_name, invoice_number, total_amount, status)
  VALUES (v_org, v_brand, v_location_b, 'ODSS Vendor', 'ODSS-INV-B', 10, 'pending_review')
  RETURNING id INTO v_invoice_b;

  -- location A document (1,000 bytes), location B document (2,000 bytes), org-level NULL-invoice document (4,000 bytes)
  INSERT INTO public.invoice_documents (invoice_id, organization_id, storage_path, file_name, file_size, source)
  VALUES
    (v_invoice_a, v_org, v_org || '/' || v_invoice_a || '/a.pdf', 'a.pdf', 1000, 'upload'),
    (v_invoice_b, v_org, v_org || '/' || v_invoice_b || '/b.pdf', 'b.pdf', 2000, 'upload'),
    (NULL, v_org, v_org || '/pending/c.pdf', 'c.pdf', 4000, 'upload');
END $$;

-- ===== org_manager sees the org's full totals (3 files, 7000 bytes) =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM odss_ids WHERE key = 'org_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO odss_results
SELECT 'org_manager_sees_full_totals',
       file_count = 3 AND total_bytes = 7000,
       'file_count=' || file_count || ' total_bytes=' || total_bytes
FROM public.get_org_document_stats()
WHERE organization_id = (SELECT value FROM odss_ids WHERE key = 'org');

RESET ROLE;

-- ===== location_manager (scoped to location A) sees only their location's contribution =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM odss_ids WHERE key = 'location_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO odss_results
SELECT 'location_manager_sees_scoped_totals',
       file_count = 1 AND total_bytes = 1000,
       'file_count=' || file_count || ' total_bytes=' || total_bytes
FROM public.get_org_document_stats()
WHERE organization_id = (SELECT value FROM odss_ids WHERE key = 'org');

RESET ROLE;

-- ===================== verdict =====================

SELECT * FROM odss_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM odss_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'org_document_storage_stats_acceptance failed';
  END IF;
END $$;

ROLLBACK;
