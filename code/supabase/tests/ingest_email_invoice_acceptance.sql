BEGIN;

CREATE TEMP TABLE ingest_email_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE ingest_email_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON ingest_email_ids TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ingest_email_results TO authenticated, anon, service_role;

INSERT INTO private.workflow_runtime_settings (setting_name, setting_value, updated_at)
VALUES ('service_role_key', 'rollback-test-service-role-key', now())
ON CONFLICT (setting_name) DO UPDATE
   SET setting_value = EXCLUDED.setting_value,
       updated_at = now();
DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand1 uuid := gen_random_uuid();
  v_brand2 uuid := gen_random_uuid();
  v_choto uuid := gen_random_uuid();
  v_seymore uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_choto_manager uuid := gen_random_uuid();
  v_seymore_manager uuid := gen_random_uuid();
BEGIN
  INSERT INTO ingest_email_ids(key, value) VALUES
    ('org', v_org),
    ('brand1', v_brand1),
    ('brand2', v_brand2),
    ('choto', v_choto),
    ('seymore', v_seymore),
    ('owner', v_owner),
    ('choto_manager', v_choto_manager),
    ('seymore_manager', v_seymore_manager);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_owner, 'authenticated', 'authenticated', 'ingest-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_choto_manager, 'authenticated', 'authenticated', 'ingest-choto@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_seymore_manager, 'authenticated', 'authenticated', 'ingest-seymore@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.organizations (id, name, slug, owner_id)
  VALUES (v_org, 'Ingest Email Org', 'ingest-email-org', v_owner);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES
    (v_brand1, v_org, 'Craven Wings'),
    (v_brand2, v_org, 'Other Brand');

  INSERT INTO public.locations (id, brand_id, organization_id, name)
  VALUES
    (v_choto, v_brand1, v_org, 'Choto'),
    (v_seymore, v_brand1, v_org, 'Seymore');

  INSERT INTO public.profiles (
    id, email, full_name, role, organization_id, brand_id, location_id,
    access_level, invoice_approval_limit
  ) VALUES
    (v_owner, 'ingest-owner@example.test', 'Ingest Owner', 'org_owner', v_org, NULL, NULL, 'organization', 10000),
    (v_choto_manager, 'ingest-choto@example.test', 'Choto Manager', 'location_manager', v_org, v_brand1, v_choto, 'location', 500),
    (v_seymore_manager, 'ingest-seymore@example.test', 'Seymore Manager', 'location_manager', v_org, v_brand1, v_seymore, 'location', 500)
  ON CONFLICT (id) DO UPDATE
     SET role = EXCLUDED.role,
         organization_id = EXCLUDED.organization_id,
         brand_id = EXCLUDED.brand_id,
         location_id = EXCLUDED.location_id,
         access_level = EXCLUDED.access_level,
         invoice_approval_limit = EXCLUDED.invoice_approval_limit,
         deleted_at = NULL,
         updated_at = now();

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES
    (v_org, v_owner, 'org_owner'),
    (v_org, v_choto_manager, 'location_manager'),
    (v_org, v_seymore_manager, 'location_manager');

  INSERT INTO public.location_email_addresses (
    email, organization_id, brand_id, location_id, label
  ) VALUES (
    'choto-invoices@example.test',
    v_org,
    v_brand1,
    v_choto,
    'Choto invoices'
  );
END $$;

SET LOCAL ROLE service_role;

DO $$
DECLARE
  v_result jsonb;
  v_invoice_id uuid;
BEGIN
  v_result := public.ingest_email_invoice(
    'choto-invoices@example.test',
    (SELECT value FROM ingest_email_ids WHERE key='org'),
    jsonb_build_object(
      'vendor_name', 'Matched Vendor',
      'invoice_number', 'EMAIL-MATCHED-1',
      'total_amount', 123.45,
      'raw_text', 'matched raw text'
    )
  );
  v_invoice_id := (v_result->>'invoice_id')::uuid;
  INSERT INTO ingest_email_ids VALUES ('matched_invoice', v_invoice_id);

  INSERT INTO ingest_email_results
  SELECT 'matched_stamps_choto_scope',
         (v_result->>'matched')::boolean = true
         AND EXISTS (
           SELECT 1
           FROM public.invoices i
           WHERE i.id = v_invoice_id
             AND i.organization_id = (SELECT value FROM ingest_email_ids WHERE key='org')
             AND i.brand_id = (SELECT value FROM ingest_email_ids WHERE key='brand1')
             AND i.location_id = (SELECT value FROM ingest_email_ids WHERE key='choto')
             AND i.created_by = '99999999-9999-9999-9999-999999999999'::uuid
             AND i.source = 'email_import'
             AND i.status = 'extracting'
             AND i.ap_status = 'processing'
             AND i.status <> 'approved'
             AND i.ap_status <> 'approved'
         ),
         v_result::text;
END $$;

DO $$
DECLARE
  v_result jsonb;
  v_invoice_id uuid;
BEGIN
  v_result := public.ingest_email_invoice(
    'CHOTO-Invoices@Example.Test',
    (SELECT value FROM ingest_email_ids WHERE key='org'),
    jsonb_build_object(
      'vendor_name', 'Case Vendor',
      'invoice_number', 'EMAIL-CASE-1',
      'total_amount', 10
    )
  );
  v_invoice_id := (v_result->>'invoice_id')::uuid;
  INSERT INTO ingest_email_ids VALUES ('case_invoice', v_invoice_id);

  INSERT INTO ingest_email_results
  SELECT 'case_insensitive_match',
         (v_result->>'matched')::boolean = true
         AND EXISTS (
           SELECT 1
           FROM public.invoices i
           WHERE i.id = v_invoice_id
             AND i.location_id = (SELECT value FROM ingest_email_ids WHERE key='choto')
             AND i.source = 'email_import'
         ),
         v_result::text;
END $$;

DO $$
DECLARE
  v_result jsonb;
  v_invoice_id uuid;
BEGIN
  v_result := public.ingest_email_invoice(
    'unknown@example.test',
    (SELECT value FROM ingest_email_ids WHERE key='org'),
    jsonb_build_object(
      'vendor_name', 'Unknown Recipient Vendor',
      'invoice_number', 'EMAIL-UNKNOWN-1',
      'total_amount', 44
    )
  );
  v_invoice_id := (v_result->>'invoice_id')::uuid;
  INSERT INTO ingest_email_ids VALUES ('unmatched_invoice', v_invoice_id);

  INSERT INTO ingest_email_results
  SELECT 'unmatched_triage_org_level',
         (v_result->>'matched')::boolean = false
         AND EXISTS (
           SELECT 1
           FROM public.invoices i
           WHERE i.id = v_invoice_id
             AND i.organization_id = (SELECT value FROM ingest_email_ids WHERE key='org')
             AND i.brand_id IS NULL
             AND i.location_id IS NULL
             AND i.created_by = '99999999-9999-9999-9999-999999999999'::uuid
             AND i.source = 'email_import'
             AND i.ap_status = 'action_required'
             AND i.action_required_reason = 'needs_scope_assignment'
             AND i.ap_metadata->>'ingest_recipient' = 'unknown@example.test'
             AND i.ap_metadata->>'reason' = 'no_location_email_match'
         ),
         v_result::text;
END $$;

DO $$
DECLARE
  v_result jsonb;
  v_invoice_id uuid;
BEGIN
  v_result := public.ingest_email_invoice(
    'choto-invoices@example.test',
    (SELECT value FROM ingest_email_ids WHERE key='org'),
    '{}'::jsonb
  );
  v_invoice_id := (v_result->>'invoice_id')::uuid;
  INSERT INTO ingest_email_ids VALUES ('fallback_invoice', v_invoice_id);

  INSERT INTO ingest_email_results
  SELECT 'required_field_fallbacks_insert_valid_invoice',
         EXISTS (
           SELECT 1
           FROM public.invoices i
           WHERE i.id = v_invoice_id
             AND i.vendor_name = 'Unknown Vendor (Auto-Ingested)'
             AND i.invoice_number LIKE 'EMAIL-%'
             AND i.total_amount = 0
             AND i.source = 'email_import'
         ),
         v_result::text;
END $$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM ingest_email_ids WHERE key='choto_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO ingest_email_results
SELECT 'matched_visible_to_choto_manager',
       EXISTS (
         SELECT 1 FROM public.invoices
         WHERE id = (SELECT value FROM ingest_email_ids WHERE key='matched_invoice')
       ),
       'Choto manager can see matched Choto email invoice';
INSERT INTO ingest_email_results
SELECT 'unmatched_hidden_from_location_manager',
       NOT EXISTS (
         SELECT 1 FROM public.invoices
         WHERE id = (SELECT value FROM ingest_email_ids WHERE key='unmatched_invoice')
       ),
       'Org-level triage invoice hidden from location manager';
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM ingest_email_ids WHERE key='seymore_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO ingest_email_results
SELECT 'matched_hidden_from_seymore_manager',
       NOT EXISTS (
         SELECT 1 FROM public.invoices
         WHERE id = (SELECT value FROM ingest_email_ids WHERE key='matched_invoice')
       ),
       'Seymore manager cannot see Choto email invoice';
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM ingest_email_ids WHERE key='owner'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO ingest_email_results
SELECT 'unmatched_visible_to_org_owner',
       EXISTS (
         SELECT 1 FROM public.invoices
         WHERE id = (SELECT value FROM ingest_email_ids WHERE key='unmatched_invoice')
       ),
       'Org owner can triage org-level unmatched email invoice';

DO $$
BEGIN
  BEGIN
    PERFORM public.ingest_email_invoice(
      'choto-invoices@example.test',
      (SELECT value FROM ingest_email_ids WHERE key='org'),
      jsonb_build_object('vendor_name','Bad Caller','invoice_number','BAD-CALL','total_amount',1)
    );
    INSERT INTO ingest_email_results VALUES ('authenticated_cannot_execute_ingest_rpc', false, 'authenticated call unexpectedly succeeded');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO ingest_email_results VALUES ('authenticated_cannot_execute_ingest_rpc', true, SQLERRM);
  WHEN others THEN
    INSERT INTO ingest_email_results VALUES ('authenticated_cannot_execute_ingest_rpc', SQLSTATE = '42501', SQLERRM);
  END;
END $$;
RESET ROLE;

SELECT test_name, passed, detail
FROM ingest_email_results
ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM ingest_email_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'ingest_email_invoice acceptance failed';
  END IF;
END $$;

ROLLBACK;
