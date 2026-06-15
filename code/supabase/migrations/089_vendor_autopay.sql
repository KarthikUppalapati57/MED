-- 089: Add AutoPay to Vendors

BEGIN;

ALTER TABLE public.vendors
ADD COLUMN IF NOT EXISTS autopay_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS default_payment_method TEXT DEFAULT 'stripe' CHECK (default_payment_method IN ('stripe', 'paypal', 'check'));

COMMIT;
