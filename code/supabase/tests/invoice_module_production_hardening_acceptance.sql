-- Acceptance test for 20260721000020_invoice_module_production_hardening.sql
--
-- Proves the production hardening controls that close the invoice checklist's
-- highest-risk gaps: no public invoice storage policy, self-approval blocked,
-- status/ap_status normalization, approved/paid invoice immutability, duplicate
-- payment references blocked, and rejected invoices blocked from payment.

BEGIN;

DO $$
DECLARE
  v_trigger text;
BEGIN
  FOR v_trigger IN
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid = 'public.invoices'::regclass
      AND tgname IN ('trg_invoices_webhook', 'trg_invoices_webhook_insert', 'trg_invoices_webhook_update')
  LOOP
    EXECUTE format('ALTER TABLE public.invoices DISABLE TRIGGER %I', v_trigger);
  END LOOP;
END $$;
CREATE TEMP TABLE imph_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE imph_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

GRANT SELECT, INSERT, UPDATE, DELETE ON imph_ids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON imph_results TO authenticated;

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_submitter uuid := gen_random_uuid();
  v_approver uuid := gen_random_uuid();
  v_vendor uuid;
BEGIN
  INSERT INTO imph_ids(key, value) VALUES
    ('tenant', v_tenant),
    ('org', v_org),
    ('brand', v_brand),
    ('location', v_location),
    ('submitter', v_submitter),
    ('approver', v_approver);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (v_submitter, 'authenticated', 'authenticated', 'imph-submitter@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_approver, 'authenticated', 'authenticated', 'imph-approver@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.tenants (id, name, slug, owner_id)
  VALUES (v_tenant, 'IMPH Tenant', 'imph-tenant-' || substr(v_tenant::text, 1, 8), v_approver);

  INSERT INTO public.organizations (id, tenant_id, name, slug, owner_id)
  VALUES (v_org, v_tenant, 'IMPH Org', 'imph-org-' || substr(v_org::text, 1, 8), v_approver);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand, v_org, 'IMPH Brand');

  INSERT INTO public.locations (id, brand_id, organization_id, name)
  VALUES (v_location, v_brand, v_org, 'IMPH Location');

  INSERT INTO public.profiles (
    id, email, full_name, role, status, organization_id, tenant_id,
    brand_id, location_id, invoice_approval_limit, has_unlimited_approval
  ) VALUES
    (v_submitter, 'imph-submitter@example.test', 'IMPH Submitter', 'location_manager', 'active', v_org, v_tenant, v_brand, v_location, 100000, true),
    (v_approver, 'imph-approver@example.test', 'IMPH Approver', 'location_manager', 'active', v_org, v_tenant, v_brand, v_location, 100000, true)
  ON CONFLICT (id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    tenant_id = EXCLUDED.tenant_id,
    brand_id = EXCLUDED.brand_id,
    location_id = EXCLUDED.location_id,
    role = EXCLUDED.role,
    invoice_approval_limit = EXCLUDED.invoice_approval_limit,
    has_unlimited_approval = EXCLUDED.has_unlimited_approval;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES
    (v_org, v_submitter, 'location_manager'),
    (v_org, v_approver, 'location_manager')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.vendors (organization_id, name, autopay_enabled)
  VALUES (v_org, 'IMPH Vendor', false)
  RETURNING id INTO v_vendor;

  INSERT INTO imph_ids(key, value) VALUES ('vendor', v_vendor);
END $$;

-- No broad public SELECT policy should remain on invoice bucket objects.
INSERT INTO imph_results
SELECT 'invoice_storage_has_no_public_select_policy',
       NOT EXISTS (
         SELECT 1
         FROM pg_policies
         WHERE schemaname = 'storage'
           AND tablename = 'objects'
           AND cmd = 'SELECT'
           AND roles::text LIKE '%public%'
           AND qual LIKE '%invoices%'
       ),
       'public SELECT policies=' || (
         SELECT count(*)
         FROM pg_policies
         WHERE schemaname = 'storage'
           AND tablename = 'objects'
           AND cmd = 'SELECT'
           AND roles::text LIKE '%public%'
           AND qual LIKE '%invoices%'
       );

-- Self-approval is blocked even when the submitter has approval limit/scope.
DO $$
DECLARE
  v_invoice uuid;
BEGIN
  INSERT INTO public.invoices (
    organization_id, brand_id, location_id, vendor_id, vendor_name,
    invoice_number, total_amount, status, ap_status, payment_status, created_by, source
  ) VALUES (
    (SELECT value FROM imph_ids WHERE key = 'org'),
    (SELECT value FROM imph_ids WHERE key = 'brand'),
    (SELECT value FROM imph_ids WHERE key = 'location'),
    (SELECT value FROM imph_ids WHERE key = 'vendor'),
    'IMPH Vendor', 'IMPH-SELF-APPROVAL', 50, 'pending_review', 'processing', 'unpaid',
    (SELECT value FROM imph_ids WHERE key = 'submitter'), 'manual_upload'
  ) RETURNING id INTO v_invoice;

  INSERT INTO imph_ids VALUES ('self_invoice', v_invoice);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM imph_ids WHERE key = 'submitter'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', (SELECT value::text FROM imph_ids WHERE key = 'submitter'), 'role', 'authenticated')::text, true);

DO $$
BEGIN
  BEGIN
    PERFORM public.approve_invoice_with_limit(
      (SELECT value FROM imph_ids WHERE key = 'self_invoice'),
      (SELECT value FROM imph_ids WHERE key = 'submitter'),
      50
    );
    INSERT INTO imph_results VALUES ('self_approval_blocked', false, 'self approval unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO imph_results VALUES ('self_approval_blocked', SQLERRM LIKE '%cannot approve their own%', SQLERRM);
  END;
END $$;

RESET ROLE;

-- A different scoped approver can approve; ap_status normalizes to approved.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM imph_ids WHERE key = 'approver'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', (SELECT value::text FROM imph_ids WHERE key = 'approver'), 'role', 'authenticated')::text, true);

SELECT public.approve_invoice_with_limit(
  (SELECT value FROM imph_ids WHERE key = 'self_invoice'),
  (SELECT value FROM imph_ids WHERE key = 'approver'),
  50
);

RESET ROLE;

INSERT INTO imph_results
SELECT 'approval_sets_status_and_ap_status',
       status = 'approved' AND ap_status = 'approved',
       'status=' || status || ', ap_status=' || COALESCE(ap_status, 'NULL')
FROM public.invoices
WHERE id = (SELECT value FROM imph_ids WHERE key = 'self_invoice');

-- Approved invoice financial fields and line items are immutable.
DO $$
BEGIN
  BEGIN
    UPDATE public.invoices
       SET total_amount = 55
     WHERE id = (SELECT value FROM imph_ids WHERE key = 'self_invoice');
    INSERT INTO imph_results VALUES ('approved_invoice_financial_edit_blocked', false, 'total_amount update unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO imph_results VALUES ('approved_invoice_financial_edit_blocked', SQLERRM LIKE '%financial fields are immutable%', SQLERRM);
  END;

  BEGIN
    INSERT INTO public.invoice_line_items (invoice_id, organization_id, item_name, quantity, unit_price, total_price)
    VALUES ((SELECT value FROM imph_ids WHERE key = 'self_invoice'), (SELECT value FROM imph_ids WHERE key = 'org'), 'Late Line', 1, 1, 1);
    INSERT INTO imph_results VALUES ('approved_invoice_line_item_insert_blocked', false, 'line insert unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO imph_results VALUES ('approved_invoice_line_item_insert_blocked', SQLERRM LIKE '%line items are immutable%', SQLERRM);
  END;
END $$;

-- Payment recording: first payment succeeds, duplicate reference and rejected invoice payment fail.
DO $$
DECLARE
  v_invoice uuid;
  v_rejected uuid;
BEGIN
  INSERT INTO public.invoices (
    organization_id, brand_id, location_id, vendor_id, vendor_name,
    invoice_number, total_amount, status, ap_status, payment_status, created_by, source
  ) VALUES (
    (SELECT value FROM imph_ids WHERE key = 'org'),
    (SELECT value FROM imph_ids WHERE key = 'brand'),
    (SELECT value FROM imph_ids WHERE key = 'location'),
    (SELECT value FROM imph_ids WHERE key = 'vendor'),
    'IMPH Vendor', 'IMPH-PAYMENT-1', 100, 'pending_review', 'processing', 'unpaid',
    (SELECT value FROM imph_ids WHERE key = 'submitter'), 'manual_upload'
  ) RETURNING id INTO v_invoice;

  INSERT INTO public.invoices (
    organization_id, brand_id, location_id, vendor_id, vendor_name,
    invoice_number, total_amount, status, ap_status, payment_status, created_by, source
  ) VALUES (
    (SELECT value FROM imph_ids WHERE key = 'org'),
    (SELECT value FROM imph_ids WHERE key = 'brand'),
    (SELECT value FROM imph_ids WHERE key = 'location'),
    (SELECT value FROM imph_ids WHERE key = 'vendor'),
    'IMPH Vendor', 'IMPH-REJECTED-1', 100, 'pending_review', 'processing', 'unpaid',
    (SELECT value FROM imph_ids WHERE key = 'submitter'), 'manual_upload'
  ) RETURNING id INTO v_rejected;

  INSERT INTO imph_ids VALUES ('payment_invoice', v_invoice), ('rejected_invoice', v_rejected);
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM imph_ids WHERE key = 'approver'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', (SELECT value::text FROM imph_ids WHERE key = 'approver'), 'role', 'authenticated')::text, true);

SELECT public.approve_invoice_with_limit(
  (SELECT value FROM imph_ids WHERE key = 'payment_invoice'),
  (SELECT value FROM imph_ids WHERE key = 'approver'),
  100
);

SELECT public.record_invoice_payment(
  (SELECT value FROM imph_ids WHERE key = 'payment_invoice'),
  25,
  'IMPH-REF-001',
  'manual'
);

DO $$
BEGIN
  BEGIN
    PERFORM public.record_invoice_payment(
      (SELECT value FROM imph_ids WHERE key = 'payment_invoice'),
      25,
      'IMPH-REF-001',
      'manual'
    );
    INSERT INTO imph_results VALUES ('duplicate_payment_reference_blocked', false, 'duplicate reference unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO imph_results VALUES ('duplicate_payment_reference_blocked', SQLERRM LIKE '%already been recorded%', SQLERRM);
  END;
END $$;

RESET ROLE;

UPDATE public.invoices
   SET status = 'rejected'
 WHERE id = (SELECT value FROM imph_ids WHERE key = 'rejected_invoice');

INSERT INTO imph_results
SELECT 'rejected_status_normalizes_ap_status',
       status = 'rejected' AND ap_status = 'rejected',
       'status=' || status || ', ap_status=' || COALESCE(ap_status, 'NULL')
FROM public.invoices
WHERE id = (SELECT value FROM imph_ids WHERE key = 'rejected_invoice');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT value::text FROM imph_ids WHERE key = 'approver'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', (SELECT value::text FROM imph_ids WHERE key = 'approver'), 'role', 'authenticated')::text, true);

DO $$
BEGIN
  BEGIN
    PERFORM public.record_invoice_payment(
      (SELECT value FROM imph_ids WHERE key = 'rejected_invoice'),
      25,
      'IMPH-REF-REJECTED',
      'manual'
    );
    INSERT INTO imph_results VALUES ('rejected_invoice_payment_blocked', false, 'payment unexpectedly succeeded');
  EXCEPTION WHEN others THEN
    INSERT INTO imph_results VALUES ('rejected_invoice_payment_blocked', SQLERRM LIKE '%Rejected invoices cannot receive payments%', SQLERRM);
  END;
END $$;

RESET ROLE;

-- The anomaly view should expose manually inserted historical bad states without blocking migration replay.
ALTER TABLE public.invoices DISABLE TRIGGER normalize_invoice_ap_state;
INSERT INTO public.invoices (
  organization_id, brand_id, location_id, vendor_id, vendor_name,
  invoice_number, total_amount, status, ap_status, payment_status, paid_amount, created_by, source
) VALUES (
  (SELECT value FROM imph_ids WHERE key = 'org'),
  (SELECT value FROM imph_ids WHERE key = 'brand'),
  (SELECT value FROM imph_ids WHERE key = 'location'),
  (SELECT value FROM imph_ids WHERE key = 'vendor'),
  'IMPH Vendor', 'IMPH-HISTORICAL-BAD', 100, 'approved', 'processing', 'unpaid', 0,
  (SELECT value FROM imph_ids WHERE key = 'submitter'), 'manual_upload'
);
ALTER TABLE public.invoices ENABLE TRIGGER enforce_invoice_approval_authorization;
ALTER TABLE public.invoices ENABLE TRIGGER normalize_invoice_ap_state;

INSERT INTO imph_results
SELECT 'invoice_anomaly_view_surfaces_desync',
       EXISTS (SELECT 1 FROM public.invoice_production_anomalies WHERE invoice_number = 'IMPH-HISTORICAL-BAD'),
       'anomalies=' || (SELECT count(*) FROM public.invoice_production_anomalies WHERE invoice_number = 'IMPH-HISTORICAL-BAD');

SELECT * FROM imph_results ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM imph_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'invoice_module_production_hardening_acceptance failed';
  END IF;
END $$;

ROLLBACK;