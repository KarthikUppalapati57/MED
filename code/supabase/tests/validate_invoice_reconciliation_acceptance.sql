BEGIN;

-- ponytail: isolate the pre-existing unfiltered AFTER-UPDATE invoice webhook in tests.
-- Local SQL tests do not provide a webhook endpoint; production safety currently
-- rests on invoice-processing no-oping on validation-only writes because status
-- is unchanged. Backlog: scope the trigger with a WHEN clause after auditing
-- all invoice writers that depend on update webhooks.
ALTER TABLE public.invoices DISABLE TRIGGER trg_invoices_webhook;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_clean_invoice uuid;
  v_bad_line_invoice uuid;
  v_bad_total_invoice uuid;
  v_rounding_invoice uuid;
  v_bad_line_id uuid;
  v_result jsonb;
  v_saved jsonb;
  v_status_before text;
  v_status_after text;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
  VALUES (
    v_user,
    'val1-step1-' || substr(v_user::text, 1, 8) || '@example.test',
    'x',
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    'authenticated',
    'authenticated'
  );

  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org, 'VAL1 Reconciliation Org', 'val1-reconciliation-' || substr(v_org::text, 1, 8));

  UPDATE public.profiles
     SET organization_id = v_org,
         role = 'org_manager',
         email = 'val1-step1-' || substr(v_user::text, 1, 8) || '@example.test',
         full_name = 'VAL1 Reconciliation Owner'
   WHERE id = v_user;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org, v_user, 'org_manager');

  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user::text, 'role', 'authenticated')::text,
    true
  );

  INSERT INTO public.invoices (
    organization_id, vendor_name, invoice_number, subtotal, tax_amount,
    delivery_fee, fuel_surcharge, other_charges, total_amount, status,
    ap_status, source, validation_results
  ) VALUES (
    v_org, 'Clean Vendor', 'VAL1-CLEAN', 20.00, 1.50, 0.50, 0, 0, 22.00, 'pending_review', 'processing', 'manual_upload', '{"existing":"kept"}'::jsonb
  )
  RETURNING id INTO v_clean_invoice;

  INSERT INTO public.invoices (
    organization_id, vendor_name, invoice_number, subtotal, tax_amount,
    delivery_fee, fuel_surcharge, other_charges, total_amount, status,
    ap_status, source, validation_results
  ) VALUES (
    v_org, 'Bad Line Vendor', 'VAL1-BAD-LINE', 20.00, 0, 0, 0, 0, 20.00, 'pending_review', 'processing', 'manual_upload', '{}'::jsonb
  )
  RETURNING id INTO v_bad_line_invoice;

  INSERT INTO public.invoices (
    organization_id, vendor_name, invoice_number, subtotal, tax_amount,
    delivery_fee, fuel_surcharge, other_charges, total_amount, status,
    ap_status, source, validation_results
  ) VALUES (
    v_org, 'Bad Total Vendor', 'VAL1-BAD-TOTAL', 20.00, 1.00, 0, 0, 0, 20.00, 'pending_review', 'processing', 'manual_upload', '{}'::jsonb
  )
  RETURNING id INTO v_bad_total_invoice;

  INSERT INTO public.invoices (
    organization_id, vendor_name, invoice_number, subtotal, tax_amount,
    delivery_fee, fuel_surcharge, other_charges, total_amount, status,
    ap_status, source, validation_results
  ) VALUES (
    v_org, 'Rounding Vendor', 'VAL1-ROUNDING', 1.00, 0, 0, 0, 0, 1.00, 'pending_review', 'processing', 'manual_upload', '{}'::jsonb
  )
  RETURNING id INTO v_rounding_invoice;

  INSERT INTO public.invoice_line_items (invoice_id, organization_id, item_name, quantity, unit_price, total_price)
  VALUES (v_clean_invoice, v_org, 'Clean item', 2, 10.00, 20.00);

  INSERT INTO public.invoice_line_items (invoice_id, organization_id, item_name, quantity, unit_price, total_price)
  VALUES (v_bad_line_invoice, v_org, 'Bad line item', 2, 10.00, 19.50)
  RETURNING id INTO v_bad_line_id;

  INSERT INTO public.invoice_line_items (invoice_id, organization_id, item_name, quantity, unit_price, total_price)
  VALUES (v_bad_total_invoice, v_org, 'Bad total item', 2, 10.00, 20.00);

  INSERT INTO public.invoice_line_items (invoice_id, organization_id, item_name, quantity, unit_price, total_price)
  VALUES (v_rounding_invoice, v_org, 'Rounding item', 0.5, 1.99, 1.00);

  SELECT status INTO v_status_before
  FROM public.invoices
  WHERE id = v_clean_invoice;

  SELECT public.validate_invoice(v_clean_invoice) INTO v_result;

  SELECT status INTO v_status_after
  FROM public.invoices
  WHERE id = v_clean_invoice;

  IF v_status_after IS DISTINCT FROM v_status_before THEN
    RAISE EXCEPTION 'validate_invoice changed invoice status from % to %; webhook no-op assumption is no longer safe', v_status_before, v_status_after;
  END IF;

  IF v_result->>'line_math' IS DISTINCT FROM 'pass'
     OR v_result->>'total_math' IS DISTINCT FROM 'pass'
     OR jsonb_array_length(v_result->'discrepancies') <> 0 THEN
    RAISE EXCEPTION 'clean invoice expected pass/pass/no discrepancies, got %', v_result;
  END IF;

  SELECT validation_results INTO v_saved
  FROM public.invoices
  WHERE id = v_clean_invoice;

  IF v_saved->>'existing' IS DISTINCT FROM 'kept'
     OR v_saved->>'line_math' IS DISTINCT FROM 'pass'
     OR v_saved->>'total_math' IS DISTINCT FROM 'pass' THEN
    RAISE EXCEPTION 'validation_results was not merged/persisted correctly, got %', v_saved;
  END IF;

  SELECT public.validate_invoice(v_bad_line_invoice) INTO v_result;

  IF v_result->>'line_math' IS DISTINCT FROM 'fail' THEN
    RAISE EXCEPTION 'bad line invoice expected line_math fail, got %', v_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_result->'discrepancies') d
    WHERE d->>'line_id' = v_bad_line_id::text
      AND d->>'field' = 'total_price'
      AND (d->>'expected')::numeric = 20.00
      AND (d->>'got')::numeric = 19.50
  ) THEN
    RAISE EXCEPTION 'bad line discrepancy did not identify the broken line, got %', v_result;
  END IF;

  SELECT public.validate_invoice(v_bad_total_invoice) INTO v_result;

  IF v_result->>'total_math' IS DISTINCT FROM 'fail' THEN
    RAISE EXCEPTION 'bad total invoice expected total_math fail, got %', v_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_result->'discrepancies') d
    WHERE d->>'field' = 'total_amount'
      AND (d->>'expected')::numeric = 21.00
      AND (d->>'got')::numeric = 20.00
  ) THEN
    RAISE EXCEPTION 'bad total discrepancy did not identify total_amount mismatch, got %', v_result;
  END IF;

  SELECT public.validate_invoice(v_rounding_invoice) INTO v_result;

  IF v_result->>'line_math' IS DISTINCT FROM 'pass'
     OR v_result->>'total_math' IS DISTINCT FROM 'pass'
     OR jsonb_array_length(v_result->'discrepancies') <> 0 THEN
    RAISE EXCEPTION 'rounding invoice expected tolerance pass, got %', v_result;
  END IF;

  RAISE NOTICE 'VAL1 validate_invoice reconciliation assertions passed';
END $$;

ROLLBACK;
