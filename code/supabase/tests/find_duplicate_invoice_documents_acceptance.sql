-- Acceptance test for 20260719000005_find_duplicate_invoice_documents.sql
--
-- Verifies: (1) a matching file_hash in the same org is found, (2) a different hash is not
-- a match, (3) a document whose invoice was soft-deleted is excluded, (4) cross-org lookups
-- are denied, (5) an unmapped document (invoice_id NULL) still matches on hash.

BEGIN;

CREATE TEMP TABLE fdd_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE fdd_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON fdd_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON fdd_results TO authenticated;

INSERT INTO private.workflow_runtime_settings (setting_name, setting_value, updated_at)
VALUES ('service_role_key', 'rollback-test-service-role-key', now())
ON CONFLICT (setting_name) DO UPDATE
   SET setting_value = EXCLUDED.setting_value,
       updated_at = now();

DO $$
DECLARE
  v_org_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();
  v_user_a uuid := gen_random_uuid();
  v_invoice_live uuid;
  v_invoice_deleted uuid;
BEGIN
  INSERT INTO fdd_ids(key, value) VALUES ('org_a', v_org_a), ('org_b', v_org_b), ('user_a', v_user_a);

  INSERT INTO public.organizations (id, name, slug) VALUES
    (v_org_a, 'FDD Org A', 'fdd-org-a-' || v_org_a),
    (v_org_b, 'FDD Org B', 'fdd-org-b-' || v_org_b);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_user_a, 'authenticated', 'authenticated', 'fdd-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.profiles (id, email, full_name, role, status, organization_id)
  VALUES (v_user_a, 'fdd-a@example.test', 'FDD A', 'org_manager', 'active', v_org_a)
  ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, role = EXCLUDED.role;

  INSERT INTO public.invoices (organization_id, vendor_name, invoice_number, total_amount, status)
  VALUES (v_org_a, 'FDD Vendor', 'FDD-INV-LIVE', 50, 'pending_review')
  RETURNING id INTO v_invoice_live;

  INSERT INTO public.invoices (organization_id, vendor_name, invoice_number, total_amount, status, deleted_at)
  VALUES (v_org_a, 'FDD Vendor', 'FDD-INV-DELETED', 75, 'pending_review', now())
  RETURNING id INTO v_invoice_deleted;

  INSERT INTO fdd_ids(key, value) VALUES ('invoice_live', v_invoice_live), ('invoice_deleted', v_invoice_deleted);

  -- matching hash, attached to a live invoice
  INSERT INTO public.invoice_documents (organization_id, invoice_id, storage_path, file_name, file_hash)
  VALUES (v_org_a, v_invoice_live, 'org-a/inv-live/receipt.pdf', 'receipt.pdf', 'hash-match');

  -- matching hash, but attached to a soft-deleted invoice -- must be excluded
  INSERT INTO public.invoice_documents (organization_id, invoice_id, storage_path, file_name, file_hash)
  VALUES (v_org_a, v_invoice_deleted, 'org-a/inv-deleted/receipt.pdf', 'receipt.pdf', 'hash-match-deleted');

  -- matching hash, no invoice yet (unmapped) -- must still be found
  INSERT INTO public.invoice_documents (organization_id, invoice_id, storage_path, file_name, file_hash)
  VALUES (v_org_a, NULL, 'org-a/pending/receipt.pdf', 'receipt.pdf', 'hash-unmapped');

  -- different hash -- must not match a lookup for 'hash-match'
  INSERT INTO public.invoice_documents (organization_id, invoice_id, storage_path, file_name, file_hash)
  VALUES (v_org_a, v_invoice_live, 'org-a/inv-live/other.pdf', 'other.pdf', 'hash-different');
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM fdd_ids WHERE key = 'user_a'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO fdd_results
SELECT 'matching_hash_found',
       EXISTS (
         SELECT 1 FROM public.find_duplicate_invoice_documents((SELECT value FROM fdd_ids WHERE key = 'org_a'), 'hash-match')
         WHERE invoice_id = (SELECT value FROM fdd_ids WHERE key = 'invoice_live')
       ),
       'expected hash-match to surface the live invoice document';

INSERT INTO fdd_results
SELECT 'deleted_invoice_document_excluded',
       NOT EXISTS (
         SELECT 1 FROM public.find_duplicate_invoice_documents((SELECT value FROM fdd_ids WHERE key = 'org_a'), 'hash-match-deleted')
       ),
       'expected soft-deleted invoice''s document to be excluded';

INSERT INTO fdd_results
SELECT 'unmapped_document_still_matches',
       EXISTS (
         SELECT 1 FROM public.find_duplicate_invoice_documents((SELECT value FROM fdd_ids WHERE key = 'org_a'), 'hash-unmapped')
         WHERE invoice_id IS NULL
       ),
       'expected unmapped document (invoice_id NULL) to still be found by hash';

INSERT INTO fdd_results
SELECT 'different_hash_no_match',
       NOT EXISTS (
         SELECT 1 FROM public.find_duplicate_invoice_documents((SELECT value FROM fdd_ids WHERE key = 'org_a'), 'hash-does-not-exist')
       ),
       'expected no rows for a hash nothing was uploaded with';

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM fdd_ids WHERE key = 'user_a'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.find_duplicate_invoice_documents((SELECT value FROM fdd_ids WHERE key = 'org_b'), 'hash-match');
    INSERT INTO fdd_results VALUES ('cross_org_lookup_denied', false, 'cross-org lookup unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO fdd_results VALUES ('cross_org_lookup_denied', true, SQLERRM);
  END;
END $$;

RESET ROLE;

-- ===================== verdict =====================

SELECT * FROM fdd_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM fdd_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'find_duplicate_invoice_documents_acceptance failed';
  END IF;
END $$;

ROLLBACK;
