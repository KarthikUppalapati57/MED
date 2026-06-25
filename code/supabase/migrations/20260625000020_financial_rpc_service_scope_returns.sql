BEGIN;

CREATE OR REPLACE FUNCTION public.assert_financial_actor(
  p_organization_id UUID,
  p_allowed_roles TEXT[] DEFAULT ARRAY['location_manager', 'branch_manager', 'org_owner', 'owner', 'admin', 'platform_admin']
)
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
    RAISE EXCEPTION 'Cross-organization financial access denied';
  END IF;

  IF NOT v_role = ANY(p_allowed_roles) THEN
    RAISE EXCEPTION 'Insufficient financial permissions';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_invoice_funds(
  p_invoice_id UUID,
  p_payout_method TEXT DEFAULT 'dwolla_ach',
  p_payment_account_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice RECORD;
  v_payment_method TEXT;
  v_final_account_id UUID;
  v_payment_id UUID;
  v_account_org UUID;
BEGIN
  SELECT *
    INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  PERFORM public.assert_financial_actor(v_invoice.organization_id);

  IF COALESCE(v_invoice.ap_routing_destination, 'payments') <> 'payments' THEN
    RAISE EXCEPTION 'Invoice is routed to %, not Payments', v_invoice.ap_routing_destination;
  END IF;

  IF COALESCE(v_invoice.payment_status, 'unpaid') IN ('paid', 'processing', 'auto_pay') OR v_invoice.status = 'paid' THEN
    RAISE EXCEPTION 'Invoice is already paid or processing';
  END IF;

  IF v_invoice.status NOT IN ('approved', 'scheduled', 'partially_paid') THEN
    RAISE EXCEPTION 'Invoice must be approved before releasing funds';
  END IF;

  v_final_account_id := COALESCE(p_payment_account_id, v_invoice.payment_account_id);

  IF v_final_account_id IS NULL THEN
    RAISE EXCEPTION 'A payment account is required to release funds';
  END IF;

  SELECT organization_id
    INTO v_account_org
  FROM public.payment_accounts
  WHERE id = v_final_account_id
    AND is_active IS DISTINCT FROM false;

  IF v_account_org IS NULL OR v_account_org IS DISTINCT FROM v_invoice.organization_id THEN
    RAISE EXCEPTION 'Payment account does not belong to the invoice organization';
  END IF;

  IF p_payout_method = 'dwolla_ach' THEN
    v_payment_method := 'bank_transfer';
  ELSIF p_payout_method IN ('checkbook_digital', 'checkbook_physical') THEN
    v_payment_method := 'check';
  ELSE
    RAISE EXCEPTION 'Invalid payout method';
  END IF;

  UPDATE public.invoices
     SET payment_status = 'processing',
         status = CASE WHEN status = 'approved' THEN 'scheduled' ELSE status END,
         payment_account_id = v_final_account_id,
         updated_at = now()
   WHERE id = p_invoice_id;

  INSERT INTO public.payments (
    invoice_id,
    vendor_id,
    vendor_name,
    invoice_number,
    amount,
    payment_method,
    status,
    payout_status,
    payment_date,
    payment_account_id,
    organization_id,
    brand_id,
    location_id,
    created_by
  ) VALUES (
    v_invoice.id,
    v_invoice.vendor_id,
    v_invoice.vendor_name,
    v_invoice.invoice_number,
    COALESCE(v_invoice.total_amount, 0) - COALESCE(v_invoice.paid_amount, 0),
    v_payment_method,
    'pending',
    'processing',
    CURRENT_DATE,
    v_final_account_id,
    v_invoice.organization_id,
    v_invoice.brand_id,
    v_invoice.location_id,
    auth.uid()
  )
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'invoice_id', p_invoice_id,
    'organization_id', v_invoice.organization_id,
    'payment_id', v_payment_id,
    'payout_method', p_payout_method
  );
END;
$$;

COMMIT;
