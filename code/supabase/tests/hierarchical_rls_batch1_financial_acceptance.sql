BEGIN;

CREATE TEMP TABLE batch1_rls_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE batch1_rls_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON batch1_rls_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON batch1_rls_results TO authenticated;

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
  v_loc1 uuid := gen_random_uuid();
  v_loc2 uuid := gen_random_uuid();
  v_platform uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_branch uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_ground uuid := gen_random_uuid();
  v_inv1 uuid;
  v_inv2 uuid;
  v_org_invoice uuid;
  v_deleted_invoice uuid;
  v_line1 uuid;
  v_deleted_line uuid;
  v_bill1 uuid;
  v_payment1 uuid;
BEGIN
  INSERT INTO batch1_rls_ids(key, value) VALUES
    ('org', v_org),
    ('brand1', v_brand1),
    ('brand2', v_brand2),
    ('loc1', v_loc1),
    ('loc2', v_loc2),
    ('platform', v_platform),
    ('owner', v_owner),
    ('branch', v_branch),
    ('location', v_location),
    ('ground', v_ground);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_platform, 'authenticated', 'authenticated', 'batch1-platform@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_owner, 'authenticated', 'authenticated', 'batch1-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_branch, 'authenticated', 'authenticated', 'batch1-branch@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_location, 'authenticated', 'authenticated', 'batch1-location@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_ground, 'authenticated', 'authenticated', 'batch1-ground@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.organizations (id, name, slug, owner_id)
  VALUES (v_org, 'Batch 1 RLS Org', 'batch-1-rls-org', v_owner);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES
    (v_brand1, v_org, 'Batch 1 Brand 1'),
    (v_brand2, v_org, 'Batch 1 Brand 2');

  INSERT INTO public.locations (id, brand_id, organization_id, name)
  VALUES
    (v_loc1, v_brand1, v_org, 'Batch 1 Location 1'),
    (v_loc2, v_brand2, v_org, 'Batch 1 Location 2');

  INSERT INTO public.profiles (
    id, email, full_name, role, organization_id, brand_id, location_id,
    access_level, invoice_approval_limit
  ) VALUES
    (v_platform, 'batch1-platform@example.test', 'Batch 1 Platform', 'platform_admin', NULL, NULL, NULL, 'platform', 10000),
    (v_owner, 'batch1-owner@example.test', 'Batch 1 Owner', 'org_manager', v_org, NULL, NULL, 'organization', 10000),
    (v_branch, 'batch1-branch@example.test', 'Batch 1 Branch', 'branch_manager', v_org, v_brand1, NULL, 'brand', 1000),
    (v_location, 'batch1-location@example.test', 'Batch 1 Location', 'location_manager', v_org, v_brand1, v_loc1, 'location', 500),
    (v_ground, 'batch1-ground@example.test', 'Batch 1 Ground', 'ground_staff', v_org, v_brand1, v_loc1, 'location', 0)
  ON CONFLICT (id) DO UPDATE
     SET email = EXCLUDED.email,
         full_name = EXCLUDED.full_name,
         role = EXCLUDED.role,
         organization_id = EXCLUDED.organization_id,
         brand_id = EXCLUDED.brand_id,
         location_id = EXCLUDED.location_id,
         access_level = EXCLUDED.access_level,
         invoice_approval_limit = EXCLUDED.invoice_approval_limit,
         deleted_at = NULL,
         updated_at = now();

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES
    (v_org, v_owner, 'org_manager'),
    (v_org, v_branch, 'branch_manager'),
    (v_org, v_location, 'location_manager'),
    (v_org, v_ground, 'ground_staff');

  INSERT INTO public.invoices (
    vendor_name, invoice_number, total_amount, status, ap_status,
    organization_id, brand_id, location_id, created_by, source
  ) VALUES
    ('Batch 1 Vendor', 'B1-LOC1', 11, 'pending_review', 'processing', v_org, v_brand1, v_loc1, v_ground, 'manual_upload'),
    ('Batch 1 Vendor', 'B1-LOC2', 22, 'pending_review', 'processing', v_org, v_brand2, v_loc2, v_owner, 'manual_upload'),
    ('Batch 1 Vendor', 'B1-ORG', 33, 'pending_review', 'processing', v_org, NULL, NULL, v_owner, 'manual_upload'),
    ('Batch 1 Vendor', 'B1-DELETED', 44, 'pending_review', 'processing', v_org, v_brand1, v_loc1, v_owner, 'manual_upload');

  SELECT id INTO v_inv1 FROM public.invoices WHERE invoice_number = 'B1-LOC1';
  SELECT id INTO v_inv2 FROM public.invoices WHERE invoice_number = 'B1-LOC2';
  SELECT id INTO v_org_invoice FROM public.invoices WHERE invoice_number = 'B1-ORG';
  SELECT id INTO v_deleted_invoice FROM public.invoices WHERE invoice_number = 'B1-DELETED';

  UPDATE public.invoices
     SET deleted_at = now(),
         deleted_by = v_owner
   WHERE id = v_deleted_invoice;

  INSERT INTO batch1_rls_ids(key, value) VALUES
    ('inv1', v_inv1),
    ('inv2', v_inv2),
    ('org_invoice', v_org_invoice),
    ('deleted_invoice', v_deleted_invoice);

  INSERT INTO public.invoice_line_items (
    invoice_id, organization_id, item_name, quantity, unit_price, total_price
  ) VALUES
    (v_inv1, v_org, 'Visible line', 1, 11, 11),
    (v_deleted_invoice, v_org, 'Deleted parent line', 1, 44, 44);

  SELECT id INTO v_line1
  FROM public.invoice_line_items
  WHERE invoice_id = v_inv1
  ORDER BY created_at
  LIMIT 1;

  SELECT id INTO v_deleted_line
  FROM public.invoice_line_items
  WHERE invoice_id = v_deleted_invoice
  ORDER BY created_at
  LIMIT 1;

  INSERT INTO batch1_rls_ids(key, value) VALUES
    ('line1', v_line1),
    ('deleted_line', v_deleted_line);

  INSERT INTO public.invoice_documents (
    invoice_id, organization_id, storage_path, file_name, source, created_by
  ) VALUES
    (v_inv1, v_org, 'batch1/visible.pdf', 'visible.pdf', 'upload', v_ground),
    (v_deleted_invoice, v_org, 'batch1/deleted.pdf', 'deleted.pdf', 'upload', v_owner);

  INSERT INTO public.invoice_audit_events (
    invoice_id, organization_id, user_id, action, description
  ) VALUES
    (v_inv1, v_org, v_owner, 'created', 'visible'),
    (v_deleted_invoice, v_org, v_owner, 'created', 'deleted parent');

  INSERT INTO public.ledger_bills (
    organization_id, invoice_id, total, status
  ) VALUES
    (v_org, v_inv1, 11, 'pending'),
    (v_org, v_deleted_invoice, 44, 'pending');

  SELECT id INTO v_bill1
  FROM public.ledger_bills
  WHERE invoice_id = v_inv1
  LIMIT 1;

  INSERT INTO batch1_rls_ids(key, value) VALUES ('bill1', v_bill1);

  INSERT INTO public.invoice_line_matches (
    organization_id, invoice_line_id, match_status
  ) VALUES
    (v_org, v_line1, 'exact'),
    (v_org, v_deleted_line, 'exact');

  INSERT INTO public.payments (
    organization_id, brand_id, location_id, invoice_id, amount,
    status, payment_method, created_by
  ) VALUES
    (v_org, v_brand1, v_loc1, v_inv1, 11, 'pending', 'manual', v_owner),
    (v_org, v_brand2, v_loc2, v_inv2, 22, 'pending', 'manual', v_owner);

  INSERT INTO public.ledger_payments (
    organization_id, bill_id, amount, status, created_by
  ) VALUES
    (v_org, v_bill1, 11, 'pending', v_owner);

  INSERT INTO public.ledger_entries (
    organization_id, account_code, debit, credit, reference_type, reference_id
  ) VALUES
    (v_org, '6000', 11, 0, 'invoice', v_inv1);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch1_rls_ids WHERE key = 'owner'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO batch1_rls_results
SELECT 'owner_sees_all_active_invoices',
       count(*) = 3,
       'count=' || count(*)
FROM public.invoices
WHERE organization_id = (SELECT value FROM batch1_rls_ids WHERE key = 'org');

INSERT INTO batch1_rls_results
SELECT 'owner_sees_org_level_ledger_entry',
       count(*) = 1,
       'count=' || count(*)
FROM public.ledger_entries
WHERE organization_id = (SELECT value FROM batch1_rls_ids WHERE key = 'org');

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch1_rls_ids WHERE key = 'branch'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO batch1_rls_results
SELECT 'branch_manager_sees_only_brand1_invoice',
       array_agg(invoice_number ORDER BY invoice_number) = ARRAY['B1-LOC1'],
       'invoices=' || COALESCE(array_agg(invoice_number ORDER BY invoice_number)::text, '{}')
FROM public.invoices
WHERE organization_id = (SELECT value FROM batch1_rls_ids WHERE key = 'org');

INSERT INTO batch1_rls_results
SELECT 'branch_manager_sees_only_brand1_payment',
       count(*) = 1,
       'count=' || count(*)
FROM public.payments
WHERE organization_id = (SELECT value FROM batch1_rls_ids WHERE key = 'org');

INSERT INTO public.payments (
  organization_id, brand_id, location_id, invoice_id, amount,
  status, payment_method, created_by
) VALUES (
  (SELECT value FROM batch1_rls_ids WHERE key = 'org'),
  (SELECT value FROM batch1_rls_ids WHERE key = 'brand1'),
  (SELECT value FROM batch1_rls_ids WHERE key = 'loc1'),
  (SELECT value FROM batch1_rls_ids WHERE key = 'inv1'),
  5,
  'pending',
  'manual',
  (SELECT value FROM batch1_rls_ids WHERE key = 'branch')
);

INSERT INTO batch1_rls_results VALUES (
  'branch_manager_can_write_in_scope_payment',
  true,
  'insert succeeded'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.payments (
      organization_id, brand_id, location_id, invoice_id, amount,
      status, payment_method, created_by
    ) VALUES (
      (SELECT value FROM batch1_rls_ids WHERE key = 'org'),
      (SELECT value FROM batch1_rls_ids WHERE key = 'brand2'),
      (SELECT value FROM batch1_rls_ids WHERE key = 'loc2'),
      (SELECT value FROM batch1_rls_ids WHERE key = 'inv2'),
      6,
      'pending',
      'manual',
      (SELECT value FROM batch1_rls_ids WHERE key = 'branch')
    );

    INSERT INTO batch1_rls_results VALUES (
      'branch_manager_cannot_write_out_of_scope_payment',
      false,
      'out-of-scope insert unexpectedly succeeded'
    );
  EXCEPTION WHEN others THEN
    INSERT INTO batch1_rls_results VALUES (
      'branch_manager_cannot_write_out_of_scope_payment',
      true,
      SQLERRM
    );
  END;
END $$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch1_rls_ids WHERE key = 'location'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO batch1_rls_results
SELECT 'location_manager_sees_only_location1_invoice',
       array_agg(invoice_number ORDER BY invoice_number) = ARRAY['B1-LOC1'],
       'invoices=' || COALESCE(array_agg(invoice_number ORDER BY invoice_number)::text, '{}')
FROM public.invoices
WHERE organization_id = (SELECT value FROM batch1_rls_ids WHERE key = 'org');

INSERT INTO batch1_rls_results
SELECT 'location_manager_cannot_see_location2',
       count(*) = 0,
       'loc2_count=' || count(*)
FROM public.invoices
WHERE location_id = (SELECT value FROM batch1_rls_ids WHERE key = 'loc2');

INSERT INTO batch1_rls_results
SELECT 'soft_deleted_invoice_hides_child_line_items',
       count(*) = 0,
       'deleted_parent_line_count=' || count(*)
FROM public.invoice_line_items
WHERE invoice_id = (SELECT value FROM batch1_rls_ids WHERE key = 'deleted_invoice');

INSERT INTO batch1_rls_results
SELECT 'soft_deleted_invoice_hides_documents_and_audit',
       (
         (SELECT count(*) FROM public.invoice_documents WHERE invoice_id = (SELECT value FROM batch1_rls_ids WHERE key = 'deleted_invoice')) = 0
         AND
         (SELECT count(*) FROM public.invoice_audit_events WHERE invoice_id = (SELECT value FROM batch1_rls_ids WHERE key = 'deleted_invoice')) = 0
         AND
         (SELECT count(*) FROM public.ledger_bills WHERE invoice_id = (SELECT value FROM batch1_rls_ids WHERE key = 'deleted_invoice')) = 0
         AND
         (SELECT count(*) FROM public.invoice_line_matches WHERE invoice_line_id = (SELECT value FROM batch1_rls_ids WHERE key = 'deleted_line')) = 0
       ),
       'documents/audit/bills/matches hidden'
;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.invoice_line_items (
      invoice_id, organization_id, item_name, quantity, unit_price, total_price
    ) VALUES (
      (SELECT value FROM batch1_rls_ids WHERE key = 'inv2'),
      (SELECT value FROM batch1_rls_ids WHERE key = 'org'),
      'Out of scope line',
      1,
      1,
      1
    );

    INSERT INTO batch1_rls_results VALUES (
      'location_manager_cannot_write_out_of_scope_line_item',
      false,
      'out-of-scope insert unexpectedly succeeded'
    );
  EXCEPTION WHEN others THEN
    INSERT INTO batch1_rls_results VALUES (
      'location_manager_cannot_write_out_of_scope_line_item',
      true,
      SQLERRM
    );
  END;
END $$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM batch1_rls_ids WHERE key = 'ground'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

INSERT INTO public.invoices (
  vendor_name, invoice_number, total_amount, status, ap_status,
  organization_id, brand_id, location_id, created_by, source
) VALUES (
  'Batch 1 Ground Vendor',
  'B1-GROUND-INSERT',
  7,
  'pending_review',
  'processing',
  (SELECT value FROM batch1_rls_ids WHERE key = 'org'),
  (SELECT value FROM batch1_rls_ids WHERE key = 'brand1'),
  (SELECT value FROM batch1_rls_ids WHERE key = 'loc1'),
  (SELECT value FROM batch1_rls_ids WHERE key = 'ground'),
  'manual_upload'
);

INSERT INTO batch1_rls_results VALUES (
  'ground_staff_can_insert_in_scope_invoice',
  true,
  'insert succeeded'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.invoices (
      vendor_name, invoice_number, total_amount, status, ap_status,
      organization_id, brand_id, location_id, created_by, source
    ) VALUES (
      'Batch 1 Ground Vendor',
      'B1-GROUND-OUT-SCOPE',
      8,
      'pending_review',
      'processing',
      (SELECT value FROM batch1_rls_ids WHERE key = 'org'),
      (SELECT value FROM batch1_rls_ids WHERE key = 'brand2'),
      (SELECT value FROM batch1_rls_ids WHERE key = 'loc2'),
      (SELECT value FROM batch1_rls_ids WHERE key = 'ground'),
      'manual_upload'
    );

    INSERT INTO batch1_rls_results VALUES (
      'ground_staff_cannot_insert_out_of_scope_invoice',
      false,
      'out-of-scope invoice insert unexpectedly succeeded'
    );
  EXCEPTION WHEN others THEN
    INSERT INTO batch1_rls_results VALUES (
      'ground_staff_cannot_insert_out_of_scope_invoice',
      true,
      SQLERRM
    );
  END;
END $$;

RESET ROLE;

SELECT *
FROM batch1_rls_results
ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM batch1_rls_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'Batch 1 hierarchical RLS acceptance test failed';
  END IF;
END $$;

ROLLBACK;
