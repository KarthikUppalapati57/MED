-- 20260624000014_programmatic_payouts_checkbook.sql

BEGIN;

-- 1. Update Vendors for Checkbook.io
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS preferred_payout_method TEXT DEFAULT 'manual';
ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS valid_preferred_payout_method;
ALTER TABLE public.vendors ADD CONSTRAINT valid_preferred_payout_method 
  CHECK (preferred_payout_method IN ('manual', 'dwolla_ach', 'checkbook_digital', 'checkbook_physical'));

-- 2. Update Payments for Checkbook Tracking
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS checkbook_check_id TEXT;

-- 3. Modify RPC to accept a payout method
CREATE OR REPLACE FUNCTION public.release_invoice_funds(p_invoice_id UUID, p_payout_method TEXT DEFAULT 'dwolla_ach')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice RECORD;
  v_role TEXT;
  v_org_id UUID;
  v_payment_method TEXT;
BEGIN
  -- Verify the invoice exists
  SELECT * INTO v_invoice 
  FROM public.invoices 
  WHERE id = p_invoice_id;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  -- Verify User Role (Must be location_manager, brand_manager, or org_owner equivalent)
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid() AND organization_id = v_invoice.organization_id;

  IF v_role NOT IN ('location_manager', 'branch_manager', 'org_owner', 'owner', 'admin', 'platform_admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only Managers or Owners can release funds';
  END IF;

  IF v_invoice.status NOT IN ('scheduled') THEN
    RAISE EXCEPTION 'Invoice must be in scheduled status to release funds';
  END IF;

  -- Determine payment method based on argument
  IF p_payout_method = 'dwolla_ach' THEN
    v_payment_method := 'bank_transfer';
  ELSIF p_payout_method IN ('checkbook_digital', 'checkbook_physical') THEN
    v_payment_method := 'check';
  ELSE
    RAISE EXCEPTION 'Invalid payout method';
  END IF;

  -- Update invoice status to processing to prevent double-firing
  UPDATE public.invoices
  SET payment_status = 'processing',
      updated_at = now()
  WHERE id = p_invoice_id;

  -- Create a pending payment record that the Edge Function will update
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
    v_invoice.payment_account_id,
    v_invoice.organization_id,
    v_invoice.brand_id,
    v_invoice.location_id,
    auth.uid()
  );

  RETURN jsonb_build_object('status', 'success', 'invoice_id', p_invoice_id, 'payout_method', p_payout_method);
END;
$$;

COMMIT;
