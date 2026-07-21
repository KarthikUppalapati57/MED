-- Acceptance test for 20260721000017_mandatory_invoice_payment_scope_ids.sql.
--
-- Proves: tenant_id auto-populates from organization_id via trigger on both invoices and
-- payments; NOT NULL now rejects a missing organization_id/brand_id/location_id on either
-- table; ingest_email_invoice's matched path still creates a correctly-scoped invoice with
-- tenant_id auto-filled; its no-match path no longer inserts a row at all (the black-hole
-- insert is gone), returning matched:false/invoice_id:null instead.

BEGIN;

CREATE TEMP TABLE mand_ids (
  key text PRIMARY KEY,
  value uuid NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE mand_results (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text
) ON COMMIT DROP;

-- trg_invoices_webhook needs this to fire on invoice INSERT.
INSERT INTO private.workflow_runtime_settings (setting_name, setting_value, updated_at)
VALUES ('service_role_key', 'rollback-test-service-role-key', now())
ON CONFLICT (setting_name) DO UPDATE
   SET setting_value = EXCLUDED.setting_value,
       updated_at = now();

DO $$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_org uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
BEGIN
  INSERT INTO mand_ids(key, value) VALUES
    ('tenant', v_tenant), ('org', v_org), ('brand', v_brand),
    ('location', v_location), ('owner', v_owner);

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    v_owner, 'authenticated', 'authenticated', 'mand-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

  INSERT INTO public.tenants (id, name, slug, owner_id)
  VALUES (v_tenant, 'Mandatory IDs Tenant', 'mandatory-ids-tenant', v_owner);

  INSERT INTO public.organizations (id, tenant_id, name, slug, owner_id)
  VALUES (v_org, v_tenant, 'Mandatory IDs Org', 'mandatory-ids-org', v_owner);

  INSERT INTO public.brands (brand_id, organization_id, name)
  VALUES (v_brand, v_org, 'Mandatory IDs Brand');

  INSERT INTO public.locations (id, brand_id, organization_id, name)
  VALUES (v_location, v_brand, v_org, 'Mandatory IDs Location');

  INSERT INTO public.location_email_addresses (email, organization_id, brand_id, location_id, is_active)
  VALUES ('mandatory-ids-location@example.test', v_org, v_brand, v_location, true);
END $$;

-- ===================== tenant_id auto-populate (invoices) =====================

DO $$
DECLARE
  v_org uuid := (SELECT value FROM mand_ids WHERE key = 'org');
  v_brand uuid := (SELECT value FROM mand_ids WHERE key = 'brand');
  v_location uuid := (SELECT value FROM mand_ids WHERE key = 'location');
  v_tenant uuid := (SELECT value FROM mand_ids WHERE key = 'tenant');
  v_new_id uuid;
  v_got_tenant uuid;
BEGIN
  INSERT INTO public.invoices (
    vendor_name, invoice_number, total_amount, status, ap_status,
    organization_id, brand_id, location_id, created_by, source
  ) VALUES (
    'Mandatory IDs Vendor', 'MAND-TENANT-SYNC', 12, 'pending_review', 'processing',
    v_org, v_brand, v_location, (SELECT value FROM mand_ids WHERE key = 'owner'), 'manual_upload'
  ) RETURNING id INTO v_new_id;

  SELECT tenant_id INTO v_got_tenant FROM public.invoices WHERE id = v_new_id;

  INSERT INTO mand_results VALUES (
    'invoice_tenant_id_auto_populates',
    v_got_tenant = v_tenant,
    'tenant_id=' || COALESCE(v_got_tenant::text, 'NULL')
  );
END $$;

-- ===================== NOT NULL rejects missing scope (invoices) =====================

DO $$
BEGIN
  BEGIN
    INSERT INTO public.invoices (
      vendor_name, invoice_number, total_amount, status, ap_status,
      organization_id, brand_id, location_id, created_by, source
    ) VALUES (
      'Mandatory IDs Vendor', 'MAND-NO-LOCATION', 5, 'pending_review', 'processing',
      (SELECT value FROM mand_ids WHERE key = 'org'), (SELECT value FROM mand_ids WHERE key = 'brand'), NULL,
      (SELECT value FROM mand_ids WHERE key = 'owner'), 'manual_upload'
    );
    INSERT INTO mand_results VALUES ('invoice_missing_location_rejected', false, 'insert unexpectedly succeeded');
  EXCEPTION WHEN not_null_violation THEN
    INSERT INTO mand_results VALUES ('invoice_missing_location_rejected', true, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.invoices (
      vendor_name, invoice_number, total_amount, status, ap_status,
      organization_id, brand_id, location_id, created_by, source
    ) VALUES (
      'Mandatory IDs Vendor', 'MAND-NO-BRAND', 5, 'pending_review', 'processing',
      (SELECT value FROM mand_ids WHERE key = 'org'), NULL, (SELECT value FROM mand_ids WHERE key = 'location'),
      (SELECT value FROM mand_ids WHERE key = 'owner'), 'manual_upload'
    );
    INSERT INTO mand_results VALUES ('invoice_missing_brand_rejected', false, 'insert unexpectedly succeeded');
  EXCEPTION WHEN not_null_violation THEN
    INSERT INTO mand_results VALUES ('invoice_missing_brand_rejected', true, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.invoices (
      vendor_name, invoice_number, total_amount, status, ap_status,
      organization_id, brand_id, location_id, created_by, source
    ) VALUES (
      'Mandatory IDs Vendor', 'MAND-NO-ORG', 5, 'pending_review', 'processing',
      NULL, (SELECT value FROM mand_ids WHERE key = 'brand'), (SELECT value FROM mand_ids WHERE key = 'location'),
      (SELECT value FROM mand_ids WHERE key = 'owner'), 'manual_upload'
    );
    INSERT INTO mand_results VALUES ('invoice_missing_org_rejected', false, 'insert unexpectedly succeeded');
  EXCEPTION WHEN not_null_violation THEN
    INSERT INTO mand_results VALUES ('invoice_missing_org_rejected', true, SQLERRM);
  END;
END $$;

-- ===================== tenant_id auto-populate + NOT NULL (payments) =====================

DO $$
DECLARE
  v_org uuid := (SELECT value FROM mand_ids WHERE key = 'org');
  v_brand uuid := (SELECT value FROM mand_ids WHERE key = 'brand');
  v_location uuid := (SELECT value FROM mand_ids WHERE key = 'location');
  v_tenant uuid := (SELECT value FROM mand_ids WHERE key = 'tenant');
  v_new_id uuid;
  v_got_tenant uuid;
BEGIN
  INSERT INTO public.payments (amount, organization_id, brand_id, location_id, created_by)
  VALUES (7, v_org, v_brand, v_location, (SELECT value FROM mand_ids WHERE key = 'owner'))
  RETURNING id INTO v_new_id;

  SELECT tenant_id INTO v_got_tenant FROM public.payments WHERE id = v_new_id;

  INSERT INTO mand_results VALUES (
    'payment_tenant_id_auto_populates',
    v_got_tenant = v_tenant,
    'tenant_id=' || COALESCE(v_got_tenant::text, 'NULL')
  );

  BEGIN
    INSERT INTO public.payments (amount, organization_id, brand_id, location_id, created_by)
    VALUES (7, v_org, v_brand, NULL, (SELECT value FROM mand_ids WHERE key = 'owner'));
    INSERT INTO mand_results VALUES ('payment_missing_location_rejected', false, 'insert unexpectedly succeeded');
  EXCEPTION WHEN not_null_violation THEN
    INSERT INTO mand_results VALUES ('payment_missing_location_rejected', true, SQLERRM);
  END;
END $$;

-- ===================== ingest_email_invoice: matched path still works =====================

DO $$
DECLARE
  v_result jsonb;
  v_org uuid := (SELECT value FROM mand_ids WHERE key = 'org');
  v_brand uuid := (SELECT value FROM mand_ids WHERE key = 'brand');
  v_location uuid := (SELECT value FROM mand_ids WHERE key = 'location');
  v_tenant uuid := (SELECT value FROM mand_ids WHERE key = 'tenant');
  v_got_tenant uuid;
BEGIN
  v_result := public.ingest_email_invoice(
    'mandatory-ids-location@example.test',
    NULL,
    jsonb_build_object('vendor_name', 'Email Vendor', 'file_url', 'auto-ingested/test.pdf')
  );

  INSERT INTO mand_results VALUES (
    'email_matched_creates_scoped_invoice',
    (v_result->>'matched')::boolean = true
      AND (v_result->>'organization_id')::uuid = v_org
      AND (v_result->>'brand_id')::uuid = v_brand
      AND (v_result->>'location_id')::uuid = v_location,
    v_result::text
  );

  SELECT tenant_id INTO v_got_tenant FROM public.invoices WHERE id = (v_result->>'invoice_id')::uuid;

  INSERT INTO mand_results VALUES (
    'email_matched_invoice_tenant_id_auto_populates',
    v_got_tenant = v_tenant,
    'tenant_id=' || COALESCE(v_got_tenant::text, 'NULL')
  );
END $$;

-- ===================== ingest_email_invoice: no-match path creates nothing =====================

DO $$
DECLARE
  v_result jsonb;
  v_count_before int;
  v_count_after int;
BEGIN
  SELECT count(*) INTO v_count_before FROM public.invoices;

  v_result := public.ingest_email_invoice(
    'nobody-registered@example.test',
    NULL,
    jsonb_build_object('vendor_name', 'Unmatched Vendor', 'file_url', 'auto-ingested/unmatched.pdf')
  );

  SELECT count(*) INTO v_count_after FROM public.invoices;

  INSERT INTO mand_results VALUES (
    'email_unmatched_returns_no_invoice_id',
    (v_result->>'matched')::boolean = false AND v_result->>'invoice_id' IS NULL,
    v_result::text
  );

  INSERT INTO mand_results VALUES (
    'email_unmatched_creates_no_row',
    v_count_after = v_count_before,
    'before=' || v_count_before || ' after=' || v_count_after
  );
END $$;

-- ===================== verdict =====================

SELECT *
FROM mand_results
ORDER BY test_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM mand_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'mandatory_invoice_payment_scope_ids_acceptance failed';
  END IF;
END $$;

ROLLBACK;
