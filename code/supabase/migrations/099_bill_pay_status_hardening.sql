-- 099: Bill Pay status hardening
-- Makes scheduled and partial payment states first-class so AP workflows do not fail on constraints.

BEGIN;

-- Clean up any invalid statuses before applying the constraint
UPDATE public.invoices 
SET status = 'pending_review' 
WHERE status IS NOT NULL AND status NOT IN (
  'pending_review',
  'validated',
  'pending_approval',
  'approved',
  'scheduled',
  'partially_paid',
  'paid',
  'rejected',
  'duplicate',
  'flagged'
);

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_status_check CHECK (
    status IS NULL OR status IN (
      'pending_review',
      'validated',
      'pending_approval',
      'approved',
      'scheduled',
      'partially_paid',
      'paid',
      'rejected',
      'duplicate',
      'flagged'
    )
  );

-- Clean up any invalid payment statuses before applying the constraint
UPDATE public.invoices 
SET payment_status = 'unpaid' 
WHERE payment_status IS NOT NULL AND payment_status NOT IN (
  'unpaid',
  'partial',
  'pending',
  'paid',
  'auto_pay'
);

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_payment_status_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_payment_status_check CHECK (
    payment_status IS NULL OR payment_status IN (
      'unpaid',
      'partial',
      'pending',
      'paid',
      'auto_pay'
    )
  );

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_status_check CHECK (
    status IS NULL OR status IN (
      'pending',
      'processing',
      'completed',
      'failed',
      'cancelled',
      'refunded'
    )
  );

CREATE INDEX IF NOT EXISTS idx_invoices_bill_pay_queue
  ON public.invoices(organization_id, status, payment_status, due_date);

CREATE INDEX IF NOT EXISTS idx_invoices_scheduled_payment
  ON public.invoices(organization_id, scheduled_payment_date)
  WHERE scheduled_payment_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_payment_account
  ON public.payments(organization_id, payment_account_id, payment_date);

COMMIT;
