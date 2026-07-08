BEGIN;

CREATE TEMP TABLE process_email_ids (key text PRIMARY KEY, value uuid NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE process_email_results (test_name text PRIMARY KEY, passed boolean NOT NULL, detail text) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE, DELETE ON process_email_ids TO authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON process_email_results TO authenticated, anon, service_role;

INSERT INTO private.workflow_runtime_settings (setting_name, setting_value, updated_at)
VALUES ('service_role_key', 'rollback-test-service-role-key', now())
ON CONFLICT (setting_name) DO UPDATE
   SET setting_value = EXCLUDED.setting_value,
       updated_at = now();

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_choto uuid := gen_random_uuid();
  v_seymore uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_choto_manager uuid := gen_random_uuid();
  v_seymore_manager uuid := gen_random_uuid();
BEGIN
  INSERT INTO process_email_ids VALUES
    ('org', v_org), ('brand', v_brand), ('choto', v_choto), ('seymore', v_seymore),
    ('owner', v_owner), ('choto_manager', v_choto_manager), ('seymore_manager', v_seymore_manager);

  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_owner, 'authenticated', 'authenticated', 'process-email-owner@example.test', '', now(), '{}', '{}', now(), now()),
    (v_choto_manager, 'authenticated', 'authenticated', 'process-email-choto@example.test', '', now(), '{}', '{}', now(), now()),
    (v_seymore_manager, 'authenticated', 'authenticated', 'process-email-seymore@example.test', '', now(), '{}', '{}', now(), now());

  INSERT INTO public.organizations(id, name, slug, owner_id)
  VALUES (v_org, 'Process Email Org', 'process-email-org', v_owner);
  INSERT INTO public.brands(brand_id, organization_id, name)
  VALUES (v_brand, v_org, 'Craven Wings');
  INSERT INTO public.locations(id, brand_id, organization_id, name)
  VALUES (v_choto, v_brand, v_org, 'Choto'), (v_seymore, v_brand, v_org, 'Seymore');

  INSERT INTO public.profiles(id, email, full_name, role, organization_id, brand_id, location_id, access_level)
  VALUES
    (v_owner, 'process-email-owner@example.test', 'Owner', 'org_manager', v_org, NULL, NULL, 'organization'),
    (v_choto_manager, 'process-email-choto@example.test', 'Choto Manager', 'location_manager', v_org, v_brand, v_choto, 'location'),
    (v_seymore_manager, 'process-email-seymore@example.test', 'Seymore Manager', 'location_manager', v_org, v_brand, v_seymore, 'location')
  ON CONFLICT (id) DO UPDATE SET role=EXCLUDED.role, organization_id=EXCLUDED.organization_id, brand_id=EXCLUDED.brand_id, location_id=EXCLUDED.location_id, deleted_at=NULL;

  INSERT INTO public.organization_members(organization_id, user_id, role)
  VALUES (v_org, v_owner, 'org_manager'), (v_org, v_choto_manager, 'location_manager'), (v_org, v_seymore_manager, 'location_manager');

  INSERT INTO public.location_email_addresses(email, organization_id, brand_id, location_id, label)
  VALUES ('choto-invoices@example.test', v_org, v_brand, v_choto, 'Choto invoices');
END $$;

SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_candidates text[] := ARRAY['vendor-list@example.test','choto-invoices@example.test','mailbox@example.test'];
  v_matched text;
  v_result jsonb;
  v_invoice uuid;
BEGIN
  SELECT candidate INTO v_matched
  FROM unnest(v_candidates) WITH ORDINALITY AS c(candidate, position)
  WHERE EXISTS (
    SELECT 1 FROM public.location_email_addresses lea
    WHERE lea.email = c.candidate AND lea.is_active AND lea.deleted_at IS NULL
  )
  ORDER BY position
  LIMIT 1;

  v_result := public.ingest_email_invoice(
    COALESCE(v_matched, v_candidates[1]),
    (SELECT value FROM process_email_ids WHERE key='org'),
    jsonb_build_object('vendor_name','Process Email Matched','invoice_number','PE-MATCHED','total_amount',12)
  );
  v_invoice := (v_result->>'invoice_id')::uuid;
  INSERT INTO process_email_ids VALUES ('matched_invoice', v_invoice);

  INSERT INTO process_email_results
  SELECT 'matched_candidate_creates_choto_scoped_invoice',
         v_matched = 'choto-invoices@example.test'
         AND (v_result->>'matched')::boolean
         AND EXISTS (
           SELECT 1 FROM public.invoices i
           WHERE i.id = v_invoice
             AND i.organization_id = (SELECT value FROM process_email_ids WHERE key='org')
             AND i.brand_id = (SELECT value FROM process_email_ids WHERE key='brand')
             AND i.location_id = (SELECT value FROM process_email_ids WHERE key='choto')
             AND i.source = 'email_import'
         ),
         v_result::text;
END $$;

DO $$
DECLARE
  v_candidates text[] := ARRAY['unknown@example.test','mailbox@example.test'];
  v_matched text;
  v_result jsonb;
  v_invoice uuid;
BEGIN
  SELECT candidate INTO v_matched
  FROM unnest(v_candidates) WITH ORDINALITY AS c(candidate, position)
  WHERE EXISTS (
    SELECT 1 FROM public.location_email_addresses lea
    WHERE lea.email = c.candidate AND lea.is_active AND lea.deleted_at IS NULL
  )
  ORDER BY position
  LIMIT 1;

  v_result := public.ingest_email_invoice(
    COALESCE(v_matched, v_candidates[1]),
    (SELECT value FROM process_email_ids WHERE key='org'),
    jsonb_build_object('vendor_name','Process Email Unmatched','invoice_number','PE-UNMATCHED','total_amount',0)
  );
  v_invoice := (v_result->>'invoice_id')::uuid;
  INSERT INTO process_email_ids VALUES ('unmatched_invoice', v_invoice);

  INSERT INTO process_email_results
  SELECT 'unmatched_candidate_creates_org_triage_invoice',
         v_matched IS NULL
         AND NOT (v_result->>'matched')::boolean
         AND EXISTS (
           SELECT 1 FROM public.invoices i
           WHERE i.id = v_invoice
             AND i.organization_id = (SELECT value FROM process_email_ids WHERE key='org')
             AND i.brand_id IS NULL
             AND i.location_id IS NULL
             AND i.ap_status = 'action_required'
             AND i.action_required_reason = 'needs_scope_assignment'
         ),
         v_result::text;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM process_email_ids WHERE key='choto_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO process_email_results
SELECT 'choto_manager_sees_matched_not_unmatched',
       EXISTS (SELECT 1 FROM public.invoices WHERE id = (SELECT value FROM process_email_ids WHERE key='matched_invoice'))
       AND NOT EXISTS (SELECT 1 FROM public.invoices WHERE id = (SELECT value FROM process_email_ids WHERE key='unmatched_invoice')),
       'Choto manager sees scoped invoice only';
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM process_email_ids WHERE key='seymore_manager'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO process_email_results
SELECT 'seymore_manager_sees_neither',
       NOT EXISTS (SELECT 1 FROM public.invoices WHERE id = (SELECT value FROM process_email_ids WHERE key='matched_invoice'))
       AND NOT EXISTS (SELECT 1 FROM public.invoices WHERE id = (SELECT value FROM process_email_ids WHERE key='unmatched_invoice')),
       'Seymore manager sees neither Choto nor org-level triage';
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM process_email_ids WHERE key='owner'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO process_email_results
SELECT 'owner_sees_unmatched_triage',
       EXISTS (SELECT 1 FROM public.invoices WHERE id = (SELECT value FROM process_email_ids WHERE key='unmatched_invoice')),
       'Owner can triage org-level unmatched invoice';
RESET ROLE;

SELECT test_name, passed, detail FROM process_email_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM process_email_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'process-email-invoices routing simulation failed';
  END IF;
END $$;

ROLLBACK;