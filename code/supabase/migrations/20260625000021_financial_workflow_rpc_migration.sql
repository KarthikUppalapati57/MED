BEGIN;

CREATE OR REPLACE FUNCTION public.assert_org_actor(p_organization_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_role TEXT;
  v_profile_org UUID;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role, organization_id
    INTO v_role, v_profile_org
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  IF v_role <> 'platform_admin' AND v_profile_org IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'Cross-organization access denied';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_org_actor(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_org_actor(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.save_invoice_workflow(
  p_invoice_id UUID DEFAULT NULL,
  p_invoice JSONB DEFAULT '{}'::jsonb,
  p_line_items JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.invoices%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_payload JSONB;
  v_org_id UUID;
BEGIN
  v_payload := COALESCE(p_invoice, '{}'::jsonb)
    - 'id'
    - 'created_at'
    - 'updated_at'
    - 'deleted_at'
    - 'deleted_by';

  IF p_invoice_id IS NULL THEN
    v_org_id := NULLIF(v_payload->>'organization_id', '')::UUID;

    IF v_org_id IS NULL THEN
      v_org_id := public.get_my_org();
      v_payload := jsonb_set(v_payload, '{organization_id}', to_jsonb(v_org_id), true);
    END IF;

    PERFORM public.assert_org_actor(v_org_id);

    v_invoice := jsonb_populate_record(NULL::public.invoices, v_payload);

    INSERT INTO public.invoices (
      vendor_name,
      invoice_number,
      total_amount,
      status,
      account_number,
      subtotal,
      organization_id,
      location_id,
      payment_status,
      vendor_id,
      due_date,
      delivery_fee,
      fuel_surcharge,
      other_charges,
      tax_amount,
      currency,
      source,
      file_url,
      line_items,
      validation_results,
      validation_notes,
      approved_by,
      approved_date,
      location,
      created_by,
      extraction_method,
      raw_text,
      vendor_address,
      purchase_order,
      invoice_date,
      payment_terms,
      file_destination,
      purchase_order_id,
      matched_order_id,
      match_status,
      brand_id,
      ap_status,
      action_required_reason,
      action_required_details,
      assigned_reviewer_id,
      payment_account_id,
      scheduled_payment_date,
      closed_at,
      closed_by,
      ap_metadata,
      paid_amount,
      payment_reference,
      credit_applied,
      credit_reason,
      version_number,
      ap_routing_destination,
      ap_routing_resolved_at
    ) VALUES (
      v_invoice.vendor_name,
      v_invoice.invoice_number,
      v_invoice.total_amount,
      COALESCE(v_invoice.status, 'pending_review'),
      v_invoice.account_number,
      v_invoice.subtotal,
      v_org_id,
      v_invoice.location_id,
      COALESCE(v_invoice.payment_status, 'unpaid'),
      v_invoice.vendor_id,
      v_invoice.due_date,
      v_invoice.delivery_fee,
      v_invoice.fuel_surcharge,
      v_invoice.other_charges,
      v_invoice.tax_amount,
      COALESCE(v_invoice.currency, 'USD'),
      v_invoice.source,
      v_invoice.file_url,
      COALESCE(v_invoice.line_items, '[]'::jsonb),
      COALESCE(v_invoice.validation_results, '{}'::jsonb),
      v_invoice.validation_notes,
      v_invoice.approved_by,
      v_invoice.approved_date,
      v_invoice.location,
      COALESCE(v_invoice.created_by, auth.uid()),
      v_invoice.extraction_method,
      v_invoice.raw_text,
      v_invoice.vendor_address,
      v_invoice.purchase_order,
      v_invoice.invoice_date,
      v_invoice.payment_terms,
      v_invoice.file_destination,
      v_invoice.purchase_order_id,
      v_invoice.matched_order_id,
      v_invoice.match_status,
      v_invoice.brand_id,
      v_invoice.ap_status,
      v_invoice.action_required_reason,
      v_invoice.action_required_details,
      v_invoice.assigned_reviewer_id,
      v_invoice.payment_account_id,
      v_invoice.scheduled_payment_date,
      v_invoice.closed_at,
      v_invoice.closed_by,
      COALESCE(v_invoice.ap_metadata, '{}'::jsonb),
      COALESCE(v_invoice.paid_amount, 0),
      v_invoice.payment_reference,
      COALESCE(v_invoice.credit_applied, 0),
      v_invoice.credit_reason,
      COALESCE(v_invoice.version_number, 1),
      v_invoice.ap_routing_destination,
      v_invoice.ap_routing_resolved_at
    )
    RETURNING * INTO v_invoice;
  ELSE
    SELECT *
      INTO v_existing
    FROM public.invoices
    WHERE id = p_invoice_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF v_existing.id IS NULL THEN
      RAISE EXCEPTION 'Invoice not found';
    END IF;

    PERFORM public.assert_org_actor(v_existing.organization_id);

    IF v_payload ? 'organization_id'
      AND NULLIF(v_payload->>'organization_id', '')::UUID IS DISTINCT FROM v_existing.organization_id THEN
      RAISE EXCEPTION 'Invoice organization cannot be changed';
    END IF;

    v_invoice := jsonb_populate_record(v_existing, v_payload);

    UPDATE public.invoices
       SET vendor_name = v_invoice.vendor_name,
           invoice_number = v_invoice.invoice_number,
           total_amount = v_invoice.total_amount,
           status = v_invoice.status,
           account_number = v_invoice.account_number,
           subtotal = v_invoice.subtotal,
           location_id = v_invoice.location_id,
           payment_status = v_invoice.payment_status,
           vendor_id = v_invoice.vendor_id,
           due_date = v_invoice.due_date,
           delivery_fee = v_invoice.delivery_fee,
           fuel_surcharge = v_invoice.fuel_surcharge,
           other_charges = v_invoice.other_charges,
           tax_amount = v_invoice.tax_amount,
           currency = v_invoice.currency,
           source = v_invoice.source,
           file_url = v_invoice.file_url,
           line_items = v_invoice.line_items,
           validation_results = v_invoice.validation_results,
           validation_notes = v_invoice.validation_notes,
           approved_by = v_invoice.approved_by,
           approved_date = v_invoice.approved_date,
           location = v_invoice.location,
           extraction_method = v_invoice.extraction_method,
           raw_text = v_invoice.raw_text,
           vendor_address = v_invoice.vendor_address,
           purchase_order = v_invoice.purchase_order,
           invoice_date = v_invoice.invoice_date,
           payment_terms = v_invoice.payment_terms,
           file_destination = v_invoice.file_destination,
           purchase_order_id = v_invoice.purchase_order_id,
           matched_order_id = v_invoice.matched_order_id,
           match_status = v_invoice.match_status,
           brand_id = v_invoice.brand_id,
           ap_status = v_invoice.ap_status,
           action_required_reason = v_invoice.action_required_reason,
           action_required_details = v_invoice.action_required_details,
           assigned_reviewer_id = v_invoice.assigned_reviewer_id,
           payment_account_id = v_invoice.payment_account_id,
           scheduled_payment_date = v_invoice.scheduled_payment_date,
           closed_at = v_invoice.closed_at,
           closed_by = v_invoice.closed_by,
           ap_metadata = v_invoice.ap_metadata,
           paid_amount = v_invoice.paid_amount,
           payment_reference = v_invoice.payment_reference,
           credit_applied = v_invoice.credit_applied,
           credit_reason = v_invoice.credit_reason,
           version_number = COALESCE(v_existing.version_number, 1) + 1,
           ap_routing_destination = v_invoice.ap_routing_destination,
           ap_routing_resolved_at = v_invoice.ap_routing_resolved_at,
           updated_at = now()
     WHERE id = p_invoice_id
     RETURNING * INTO v_invoice;
  END IF;

  IF jsonb_typeof(COALESCE(p_line_items, '[]'::jsonb)) = 'array' AND jsonb_array_length(COALESCE(p_line_items, '[]'::jsonb)) > 0 THEN
    PERFORM public.upsert_invoice_line_items(v_invoice.id, p_line_items);
  END IF;

  RETURN to_jsonb(v_invoice);
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_invoice_workflow(p_invoice_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice RECORD;
BEGIN
  SELECT id, organization_id
    INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  PERFORM public.assert_financial_actor(v_invoice.organization_id);

  UPDATE public.invoices
     SET deleted_at = now(),
         deleted_by = auth.uid(),
         updated_at = now()
   WHERE id = p_invoice_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_invoice_allocation_splits(
  p_original_allocation_id UUID,
  p_splits JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_original RECORD;
  v_split JSONB;
  v_inserted JSONB;
BEGIN
  IF jsonb_typeof(COALESCE(p_splits, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Splits must be a JSON array';
  END IF;

  SELECT *
    INTO v_original
  FROM public.invoice_allocations
  WHERE id = p_original_allocation_id
  FOR UPDATE;

  IF v_original.id IS NULL THEN
    RAISE EXCEPTION 'Allocation not found';
  END IF;

  PERFORM public.assert_org_actor(v_original.organization_id);

  DELETE FROM public.invoice_allocations
  WHERE id = p_original_allocation_id;

  FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits) LOOP
    INSERT INTO public.invoice_allocations (
      invoice_id,
      organization_id,
      allocation_type,
      category_name,
      gl_code,
      location_id,
      amount,
      percentage
    ) VALUES (
      v_original.invoice_id,
      v_original.organization_id,
      v_original.allocation_type,
      v_split->>'category_name',
      v_split->>'gl_code',
      v_original.location_id,
      COALESCE((v_split->>'amount')::NUMERIC, 0),
      NULLIF(v_split->>'percentage', '')::NUMERIC
    );
  END LOOP;

  SELECT COALESCE(jsonb_agg(to_jsonb(ia) ORDER BY ia.created_at), '[]'::jsonb)
    INTO v_inserted
  FROM public.invoice_allocations ia
  WHERE ia.invoice_id = v_original.invoice_id
    AND ia.organization_id = v_original.organization_id;

  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_payment_account_workflow(p_account JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id UUID;
  v_account RECORD;
  v_last_four TEXT;
BEGIN
  v_org_id := COALESCE(NULLIF(p_account->>'organization_id', '')::UUID, public.get_my_org());
  PERFORM public.assert_financial_actor(v_org_id);

  v_last_four := COALESCE(NULLIF(p_account->>'last_four', ''), NULLIF(p_account->>'account_number_last4', ''));

  INSERT INTO public.payment_accounts (
    organization_id,
    brand_id,
    location_id,
    name,
    account_type,
    payment_method,
    provider,
    provider_reference,
    last_four,
    is_default,
    is_active,
    metadata,
    created_by,
    updated_by
  ) VALUES (
    v_org_id,
    NULLIF(p_account->>'brand_id', '')::UUID,
    NULLIF(p_account->>'location_id', '')::UUID,
    NULLIF(trim(p_account->>'name'), ''),
    COALESCE(NULLIF(p_account->>'account_type', ''), 'checking'),
    NULLIF(p_account->>'payment_method', ''),
    NULLIF(p_account->>'provider', ''),
    NULLIF(p_account->>'provider_reference', ''),
    v_last_four,
    COALESCE((p_account->>'is_default')::BOOLEAN, false),
    true,
    COALESCE(p_account->'metadata', '{}'::jsonb) || jsonb_build_object(
      'routing_number_last4', NULLIF(p_account->>'routing_number_last4', ''),
      'account_number_last4', NULLIF(p_account->>'account_number_last4', '')
    ),
    auth.uid(),
    auth.uid()
  )
  RETURNING * INTO v_account;

  IF v_account.name IS NULL THEN
    RAISE EXCEPTION 'Payment account name is required';
  END IF;

  RETURN to_jsonb(v_account);
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_payment_account_workflow(p_payment_account_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account RECORD;
BEGIN
  SELECT *
    INTO v_account
  FROM public.payment_accounts
  WHERE id = p_payment_account_id
  FOR UPDATE;

  IF v_account.id IS NULL THEN
    RAISE EXCEPTION 'Payment account not found';
  END IF;

  PERFORM public.assert_financial_actor(v_account.organization_id);

  UPDATE public.payment_accounts
     SET is_active = false,
         updated_by = auth.uid(),
         updated_at = now()
   WHERE id = p_payment_account_id
   RETURNING * INTO v_account;

  RETURN to_jsonb(v_account);
END;
$$;

CREATE OR REPLACE FUNCTION public.request_invoice_credit_workflow(
  p_invoice_id UUID,
  p_requested_amount NUMERIC,
  p_reason TEXT,
  p_photo_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice RECORD;
  v_credit RECORD;
  v_new_total NUMERIC;
BEGIN
  IF COALESCE(p_requested_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be greater than zero';
  END IF;

  IF NULLIF(trim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Credit reason is required';
  END IF;

  SELECT *
    INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  PERFORM public.assert_org_actor(v_invoice.organization_id);

  INSERT INTO public.credit_requests (
    organization_id,
    location_id,
    invoice_id,
    vendor_id,
    requested_amount,
    reason,
    photo_url,
    status,
    created_by
  ) VALUES (
    v_invoice.organization_id,
    v_invoice.location_id,
    v_invoice.id,
    v_invoice.vendor_id,
    p_requested_amount,
    trim(p_reason),
    p_photo_url,
    'pending',
    auth.uid()
  )
  RETURNING * INTO v_credit;

  v_new_total := GREATEST(0, COALESCE(v_invoice.total_amount, 0) - p_requested_amount);

  UPDATE public.invoices
     SET total_amount = v_new_total,
         status = 'needs_review',
         credit_applied = COALESCE(credit_applied, 0) + p_requested_amount,
         credit_reason = trim(p_reason),
         updated_at = now()
   WHERE id = v_invoice.id;

  INSERT INTO public.audit_logs (
    organization_id,
    user_id,
    action,
    table_name,
    record_id,
    details
  ) VALUES (
    v_invoice.organization_id,
    auth.uid(),
    'credit_request_created',
    'invoices',
    v_invoice.id,
    jsonb_build_object(
      'credit_request_id', v_credit.id,
      'requested_amount', p_requested_amount,
      'reason', trim(p_reason),
      'vendor_id', v_invoice.vendor_id
    )::TEXT
  );

  RETURN to_jsonb(v_credit);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_ad_hoc_vendor_payment(
  p_vendor_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_memo TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_vendor RECORD;
  v_bill_id UUID;
  v_payment_id UUID;
  v_reference UUID;
  v_key TEXT;
BEGIN
  IF COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  SELECT id, organization_id
    INTO v_vendor
  FROM public.vendors
  WHERE id = p_vendor_id;

  IF v_vendor.id IS NULL THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  PERFORM public.assert_financial_actor(v_vendor.organization_id);

  v_key := COALESCE(NULLIF(p_idempotency_key, ''), 'ad-hoc-' || v_vendor.id::TEXT || '-' || p_amount::TEXT || '-' || COALESCE(p_memo, ''));
  v_reference := extensions.uuid_generate_v5('00000000-0000-0000-0000-000000000000'::UUID, v_key);

  SELECT id
    INTO v_payment_id
  FROM public.ledger_payments
  WHERE source_payment_id = v_reference
    AND organization_id = v_vendor.organization_id;

  IF v_payment_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'ledger_payment_id', v_payment_id, 'idempotent', true);
  END IF;

  INSERT INTO public.ledger_bills (
    organization_id,
    vendor_id,
    invoice_id,
    subtotal,
    tax,
    total,
    due_date,
    status
  ) VALUES (
    v_vendor.organization_id,
    v_vendor.id,
    NULL,
    p_amount,
    0,
    p_amount,
    CURRENT_DATE,
    'paid'
  )
  RETURNING id INTO v_bill_id;

  INSERT INTO public.ledger_payments (
    organization_id,
    bill_id,
    payment_account_id,
    payment_method,
    amount,
    payment_date,
    status,
    created_by,
    source_payment_id
  ) VALUES (
    v_vendor.organization_id,
    v_bill_id,
    NULL,
    COALESCE(NULLIF(p_payment_method, ''), 'manual'),
    p_amount,
    now(),
    'completed',
    auth.uid(),
    v_reference
  )
  RETURNING id INTO v_payment_id;

  INSERT INTO public.ledger_entries (
    organization_id,
    account_code,
    debit,
    credit,
    reference_type,
    reference_id
  ) VALUES
    (v_vendor.organization_id, '2000', p_amount, 0, 'ad_hoc_vendor_payment', v_payment_id),
    (v_vendor.organization_id, '1000', 0, p_amount, 'ad_hoc_vendor_payment', v_payment_id);

  RETURN jsonb_build_object('success', true, 'ledger_payment_id', v_payment_id, 'bill_id', v_bill_id, 'idempotent', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_invoice_workflow(UUID, JSONB, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_invoice_workflow(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_invoice_allocation_splits(UUID, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_payment_account_workflow(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deactivate_payment_account_workflow(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_invoice_credit_workflow(UUID, NUMERIC, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_ad_hoc_vendor_payment(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.save_invoice_workflow(UUID, JSONB, JSONB) IS
  'Tenant-safe invoice create/update RPC that saves invoice header and line items in one guarded transaction.';
COMMENT ON FUNCTION public.request_invoice_credit_workflow(UUID, NUMERIC, TEXT, TEXT) IS
  'Tenant-safe credit request workflow. Inserts credit request, short-pays invoice, and writes audit log atomically.';
COMMENT ON FUNCTION public.record_ad_hoc_vendor_payment(UUID, NUMERIC, TEXT, TEXT, TEXT) IS
  'Tenant-safe ad-hoc vendor payment RPC with deterministic idempotency key support.';

COMMIT;
