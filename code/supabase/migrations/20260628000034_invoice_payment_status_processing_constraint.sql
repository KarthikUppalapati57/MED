BEGIN;

-- ponytail: payment_status carries the payout sublifecycle.
-- 'processing' means transfer in flight and is read by release_invoice_funds to prevent double-release.
-- 'scheduled' is deliberately excluded; scheduled-ness lives in status/ap_status/scheduled_payment_date.
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_payment_status_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_payment_status_check CHECK (
    payment_status IS NULL OR payment_status = ANY (ARRAY[
      'unpaid'::text,
      'partial'::text,
      'pending'::text,
      'paid'::text,
      'auto_pay'::text,
      'processing'::text
    ])
  );

COMMIT;
