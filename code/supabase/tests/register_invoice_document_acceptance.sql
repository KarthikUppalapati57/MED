-- Acceptance test for 20260719000004_register_invoice_document.sql
--
-- Verifies: (1) a document can be registered with no invoice yet (invoice_id NULL),
-- (2) it can later be attached to a real invoice, (3) organization_id defaults to the
-- caller's own org when omitted, (4) cross-org registration is denied,
-- (5) cross-org attach is denied.

BEGIN;

CREATE TEMP TABLE rid_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE rid_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON rid_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON rid_results TO authenticated;

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
  v_user_b uuid := gen_random_uuid();
  v_invoice_a uuid;
BEGIN
  INSERT INTO rid_ids(key, value) VALUES ('org_a', v_org_a), ('org_b', v_org_b), ('user_a', v_user_a), ('user_b', v_user_b);

  INSERT INTO public.organizations (id, name, slug) VALUES
    (v_org_a, 'RID Org A', 'rid-org-a-' || v_org_a),
    (v_org_b, 'RID Org B', 'rid-org-b-' || v_org_b);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_user_a, 'authenticated', 'authenticated', 'rid-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_user_b, 'authenticated', 'authenticated', 'rid-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.profiles (id, email, full_name, role, status, organization_id)
  VALUES
    (v_user_a, 'rid-a@example.test', 'RID A', 'org_manager', 'active', v_org_a),
    (v_user_b, 'rid-b@example.test', 'RID B', 'org_manager', 'active', v_org_b)
  ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, role = EXCLUDED.role;

  INSERT INTO public.invoices (organization_id, vendor_name, invoice_number, total_amount, status)
  VALUES (v_org_a, 'RID Vendor', 'RID-INV-1', 100, 'pending_review')
  RETURNING id INTO v_invoice_a;

  INSERT INTO rid_ids(key, value) VALUES ('invoice_a', v_invoice_a);
END $$;

-- ===== register a document before the invoice exists (invoice_id NULL), org inferred from caller =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM rid_ids WHERE key = 'user_a'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
DECLARE
  v_doc_id uuid;
BEGIN
  v_doc_id := public.register_invoice_document(
    p_storage_path := 'org-a/pending/receipt.pdf',
    p_file_name := 'receipt.pdf',
    p_file_type := 'application/pdf',
    p_file_size := 1024,
    p_file_hash := 'deadbeef',
    p_source := 'mobile'
  );
  INSERT INTO rid_ids(key, value) VALUES ('doc_a', v_doc_id);
END $$;

RESET ROLE;

INSERT INTO rid_results
SELECT 'document_registered_with_null_invoice_and_inferred_org',
       invoice_id IS NULL AND organization_id = (SELECT value FROM rid_ids WHERE key = 'org_a'),
       'invoice_id=' || COALESCE(invoice_id::text, 'NULL') || ' organization_id=' || organization_id
FROM public.invoice_documents
WHERE id = (SELECT value FROM rid_ids WHERE key = 'doc_a');

-- ===== attach it to a real invoice =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM rid_ids WHERE key = 'user_a'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT public.attach_invoice_document(
  (SELECT value FROM rid_ids WHERE key = 'doc_a'),
  (SELECT value FROM rid_ids WHERE key = 'invoice_a')
);

RESET ROLE;

INSERT INTO rid_results
SELECT 'document_attached_to_invoice',
       invoice_id = (SELECT value FROM rid_ids WHERE key = 'invoice_a'),
       'invoice_id=' || COALESCE(invoice_id::text, 'NULL')
FROM public.invoice_documents
WHERE id = (SELECT value FROM rid_ids WHERE key = 'doc_a');

-- ===== cross-org registration denied =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM rid_ids WHERE key = 'user_a'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.register_invoice_document(
      p_storage_path := 'org-b/pending/hijack.pdf',
      p_file_name := 'hijack.pdf',
      p_organization_id := (SELECT value FROM rid_ids WHERE key = 'org_b')
    );
    INSERT INTO rid_results VALUES ('cross_org_register_denied', false, 'cross-org register unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO rid_results VALUES ('cross_org_register_denied', true, SQLERRM);
  END;
END $$;

RESET ROLE;

-- ===== cross-org attach denied (org B user tries to attach org A's document) =====

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM rid_ids WHERE key = 'user_b'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.attach_invoice_document(
      (SELECT value FROM rid_ids WHERE key = 'doc_a'),
      (SELECT value FROM rid_ids WHERE key = 'invoice_a')
    );
    INSERT INTO rid_results VALUES ('cross_org_attach_denied', false, 'cross-org attach unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO rid_results VALUES ('cross_org_attach_denied', true, SQLERRM);
  END;
END $$;

RESET ROLE;

-- ===================== verdict =====================

SELECT * FROM rid_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM rid_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'register_invoice_document_acceptance failed';
  END IF;
END $$;

ROLLBACK;
