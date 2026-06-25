BEGIN;

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
  v_ledger_payment_id UUID;
  v_source_payment_id UUID;
  v_key TEXT;
BEGIN
  IF COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  SELECT id, organization_id, name
    INTO v_vendor
  FROM public.vendors
  WHERE id = p_vendor_id;

  IF v_vendor.id IS NULL THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  PERFORM public.assert_financial_actor(v_vendor.organization_id);

  v_key := v_vendor.organization_id::TEXT || ':' || COALESCE(
    NULLIF(p_idempotency_key, ''),
    'ad-hoc-' || v_vendor.id::TEXT || '-' || p_amount::TEXT || '-' || COALESCE(p_memo, '')
  );
  v_source_payment_id := extensions.uuid_generate_v5('00000000-0000-0000-0000-000000000000'::UUID, v_key);

  SELECT id
    INTO v_ledger_payment_id
  FROM public.ledger_payments
  WHERE source_payment_id = v_source_payment_id
    AND organization_id = v_vendor.organization_id;

  IF v_ledger_payment_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'ledger_payment_id', v_ledger_payment_id, 'source_payment_id', v_source_payment_id, 'idempotent', true);
  END IF;

  INSERT INTO public.payments (
    id,
    organization_id,
    vendor_id,
    vendor_name,
    amount,
    status,
    payment_method,
    payment_date,
    notes,
    created_by
  ) VALUES (
    v_source_payment_id,
    v_vendor.organization_id,
    v_vendor.id,
    v_vendor.name,
    p_amount,
    'completed',
    COALESCE(NULLIF(p_payment_method, ''), 'manual'),
    CURRENT_DATE,
    p_memo,
    auth.uid()
  )
  ON CONFLICT (id) DO UPDATE
     SET updated_at = now()
  RETURNING id INTO v_source_payment_id;

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
    v_source_payment_id
  )
  RETURNING id INTO v_ledger_payment_id;

  INSERT INTO public.ledger_entries (
    organization_id,
    account_code,
    debit,
    credit,
    reference_type,
    reference_id
  ) VALUES
    (v_vendor.organization_id, '2000', p_amount, 0, 'ad_hoc_vendor_payment', v_ledger_payment_id),
    (v_vendor.organization_id, '1000', 0, p_amount, 'ad_hoc_vendor_payment', v_ledger_payment_id);

  RETURN jsonb_build_object(
    'success', true,
    'ledger_payment_id', v_ledger_payment_id,
    'bill_id', v_bill_id,
    'source_payment_id', v_source_payment_id,
    'idempotent', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_ad_hoc_vendor_payment(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.record_ad_hoc_vendor_payment(UUID, NUMERIC, TEXT, TEXT, TEXT) IS
  'Tenant-safe ad-hoc vendor payment RPC with deterministic source payment idempotency and valid ledger_payments.source_payment_id FK.';

COMMIT;
