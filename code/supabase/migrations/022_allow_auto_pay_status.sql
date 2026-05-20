-- ============================================================
-- 022: ALLOW AUTO-PAY STATUS
-- Drop the default payment_status check constraint and add a new
-- constraint that permits 'auto_pay' value.
-- ============================================================

-- Drop the old constraint
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_payment_status_check;

-- Create the new constraint permitting 'unpaid', 'partial', 'paid', and 'auto_pay'
ALTER TABLE public.invoices ADD CONSTRAINT invoices_payment_status_check 
  CHECK (payment_status = ANY (ARRAY['unpaid'::text, 'partial'::text, 'paid'::text, 'auto_pay'::text]));

-- Ensure the default value is 'unpaid'
ALTER TABLE public.invoices ALTER COLUMN payment_status SET DEFAULT 'unpaid';
