-- 090: Add Vendor Credits and Invoice Credit Fields

BEGIN;

ALTER TABLE public.vendors
ADD COLUMN IF NOT EXISTS credit_balance DECIMAL(12,2) DEFAULT 0;

ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS credit_applied DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS credit_reason TEXT;

COMMIT;
