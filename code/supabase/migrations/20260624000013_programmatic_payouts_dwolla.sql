-- 20260624000013_programmatic_payouts_dwolla.sql

BEGIN;

-- 1. Update Vendors for Dwolla Onboarding
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS dwolla_customer_url TEXT;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS dwolla_onboarding_status TEXT DEFAULT 'unverified';
-- Enforce valid statuses
ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS valid_dwolla_onboarding_status;
ALTER TABLE public.vendors ADD CONSTRAINT valid_dwolla_onboarding_status 
  CHECK (dwolla_onboarding_status IN ('unverified', 'verified', 'document_required', 'suspended'));

-- 2. Update Payments for Dwolla Transfer Tracking
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS dwolla_transfer_url TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payout_status TEXT DEFAULT 'pending_approval';
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS valid_payout_status;
ALTER TABLE public.payments ADD CONSTRAINT valid_payout_status
  CHECK (payout_status IN ('pending_approval', 'processing', 'in_transit', 'cleared', 'failed', 'cancelled'));

-- 3. Update Payment Accounts for Dwolla Funding Source
ALTER TABLE public.payment_accounts ADD COLUMN IF NOT EXISTS dwolla_funding_source_url TEXT;

-- 4. RPC to securely release funds for an invoice
CREATE OR REPLACE FUNCTION public.release_invoice_funds(p_invoice_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice RECORD;
  v_role TEXT;
  v_org_id UUID;
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
    'bank_transfer',
    'pending',
    'processing',
    CURRENT_DATE,
    v_invoice.payment_account_id,
    v_invoice.organization_id,
    v_invoice.brand_id,
    v_invoice.location_id,
    auth.uid()
  );

  RETURN jsonb_build_object('status', 'success', 'invoice_id', p_invoice_id);
END;
$$;

COMMIT;
