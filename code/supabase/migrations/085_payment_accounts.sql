-- 085: Payment Accounts and Bill Pay
-- Introduces payment accounts, bill scheduling, and partial payment tracking.

BEGIN;

-- 1. Payment Accounts Table (Already created in 078_unified_invoice_ap_ledger)

-- 2. Add Bill Pay columns to Invoices
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_account_id UUID REFERENCES public.payment_accounts(id);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS scheduled_payment_date DATE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_reference TEXT;

-- 3. Add Payment Account Link to Payments
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_account_id UUID REFERENCES public.payment_accounts(id);
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

-- 4. RPC to Schedule Payment
CREATE OR REPLACE FUNCTION public.schedule_invoice_payment(
  p_invoice_id UUID, 
  p_payment_account_id UUID, 
  p_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice_status TEXT;
  v_org_id UUID;
BEGIN
  -- Verify the invoice exists and get its status/org
  SELECT status, organization_id INTO v_invoice_status, v_org_id 
  FROM public.invoices WHERE id = p_invoice_id;

  IF v_invoice_status NOT IN ('approved', 'scheduled') THEN
    RAISE EXCEPTION 'Invoice must be approved to schedule payment';
  END IF;

  -- Update the invoice
  UPDATE public.invoices
  SET payment_account_id = p_payment_account_id,
      scheduled_payment_date = p_date,
      status = CASE WHEN status = 'approved' THEN 'scheduled' ELSE status END,
      ap_status = CASE WHEN ap_status = 'approved' THEN 'scheduled' ELSE ap_status END,
      updated_at = now()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object('status', 'scheduled', 'scheduled_payment_date', p_date);
END;
$$;

-- 5. RPC to Record Payment
CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id UUID,
  p_amount NUMERIC,
  p_reference TEXT,
  p_payment_method TEXT DEFAULT 'manual'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice RECORD;
  v_new_paid_amount NUMERIC;
  v_new_status TEXT;
  v_payment_id UUID;
BEGIN
  -- Lock the row to prevent race conditions on payment processing
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  v_new_paid_amount := COALESCE(v_invoice.paid_amount, 0) + p_amount;
  
  -- Determine new payment status based on remaining balance
  IF v_new_paid_amount >= v_invoice.total_amount THEN
    v_new_status := 'paid';
  ELSE
    v_new_status := 'partially_paid'; -- or keep 'scheduled' / 'approved'
  END IF;

  -- Update invoice
  UPDATE public.invoices
  SET paid_amount = v_new_paid_amount,
      payment_status = CASE WHEN v_new_paid_amount >= total_amount THEN 'paid' ELSE 'partial' END,
      status = CASE WHEN v_new_paid_amount >= total_amount THEN 'paid' ELSE 'partially_paid' END,
      ap_status = CASE WHEN v_new_paid_amount >= total_amount THEN 'paid' ELSE ap_status END,
      payment_reference = p_reference,
      updated_at = now()
  WHERE id = p_invoice_id;

  -- Create a payment record in the ledger
  INSERT INTO public.payments (
    invoice_id, vendor_id, vendor_name, invoice_number,
    amount, payment_method, status, transaction_id, payment_date,
    payment_account_id, organization_id, created_by
  )
  VALUES (
    v_invoice.id, v_invoice.vendor_id, v_invoice.vendor_name, v_invoice.invoice_number,
    p_amount, p_payment_method, 'completed', p_reference, CURRENT_DATE,
    v_invoice.payment_account_id, v_invoice.organization_id, auth.uid()
  )
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object(
    'status', v_new_status,
    'paid_amount', v_new_paid_amount,
    'payment_id', v_payment_id
  );
END;
$$;

-- Create default accounts for all existing organizations (so they have something out of the box)
INSERT INTO public.payment_accounts (organization_id, name, account_type)
SELECT id, 'Main Operating Checking', 'checking' FROM public.organizations
ON CONFLICT DO NOTHING;

COMMIT;
