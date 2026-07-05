BEGIN;

ALTER TABLE public.invoices DISABLE TRIGGER trg_invoices_webhook;

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_invoice_id uuid;
  v_result jsonb;
  v_invoice public.invoices%ROWTYPE;
  v_eval_result jsonb;
  v_ai_org uuid;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
  VALUES (
    v_user,
    'phase32-column-drift-' || substr(v_user::text, 1, 8) || '@example.test',
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
  VALUES (v_org, 'Phase 3.2 Column Drift Org', 'phase32-column-drift-' || substr(v_org::text, 1, 8));

  UPDATE public.profiles
     SET organization_id = v_org,
         role = 'org_owner',
         email = 'phase32-column-drift-' || substr(v_user::text, 1, 8) || '@example.test',
         full_name = 'Phase 3.2 Column Drift'
   WHERE id = v_user;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org, v_user, 'org_owner');

  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user::text, 'role', 'authenticated')::text,
    true
  );

  SELECT public.save_invoice_workflow(
    NULL,
    jsonb_build_object(
      'organization_id', v_org,
      'vendor_name', 'Phase 3.2 Vendor',
      'invoice_number', 'PHASE32-COLUMN-DRIFT',
      'total_amount', 123.45,
      'status', 'pending_review',
      'ap_status', 'processing',
      'source', 'manual_upload',
      'raw_text', 'raw extraction output',
      'extraction_method', 'docling',
      'purchase_order_number', 'PO-12345',
      'vendor_address', 'ignored legacy address'
    ),
    '[]'::jsonb
  ) INTO v_result;

  v_invoice_id := (v_result->>'id')::uuid;

  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = v_invoice_id;

  IF v_invoice.raw_text IS DISTINCT FROM 'raw extraction output' THEN
    RAISE EXCEPTION 'raw_text was not saved, got %', v_invoice.raw_text;
  END IF;

  IF v_invoice.extraction_method IS DISTINCT FROM 'docling' THEN
    RAISE EXCEPTION 'extraction_method was not saved, got %', v_invoice.extraction_method;
  END IF;

  IF v_invoice.purchase_order_number IS DISTINCT FROM 'PO-12345' THEN
    RAISE EXCEPTION 'purchase_order_number was not saved, got %', v_invoice.purchase_order_number;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
      AND column_name = 'purchase_order'
  ) THEN
    RAISE EXCEPTION 'legacy invoices.purchase_order column exists';
  END IF;

  UPDATE public.invoices
     SET raw_text = 'updated raw text',
         extraction_method = 'gemini_vision_fallback'
   WHERE id = v_invoice_id;

  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = v_invoice_id;

  IF v_invoice.raw_text IS DISTINCT FROM 'updated raw text'
     OR v_invoice.extraction_method IS DISTINCT FROM 'gemini_vision_fallback' THEN
    RAISE EXCEPTION 'invoice-processing-style update did not persist raw_text/extraction_method';
  END IF;

  INSERT INTO public.approval_policies (organization_id, min_amount, max_amount, required_role)
  VALUES (v_org, 0, NULL, 'org_owner');

  SELECT public.evaluate_invoice_approval_policy(v_invoice_id) INTO v_eval_result;

  SELECT organization_id INTO v_ai_org
  FROM public.approval_instances
  WHERE invoice_id = v_invoice_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_ai_org IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'approval instance organization_id was not stamped from invoice, got % expected %', v_ai_org, v_org;
  END IF;

  RAISE NOTICE 'PASS save_invoice_workflow full payload result id=% purchase_order_number=%', v_invoice_id, v_invoice.purchase_order_number;
  RAISE NOTICE 'PASS vendor_address ignored without error';
  RAISE NOTICE 'PASS invoice-processing-style raw_text/extraction_method update';
  RAISE NOTICE 'PASS legacy purchase_order column absent';
  RAISE NOTICE 'PASS evaluate_invoice_approval_policy unchanged result=% approval_instance_org=%', v_eval_result, v_ai_org;
END $$;

ROLLBACK;
