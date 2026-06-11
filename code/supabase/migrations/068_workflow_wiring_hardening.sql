-- 068: Workflow wiring hardening
-- Aligns notification, payment, inventory, and ledger workflow columns used by the app.

BEGIN;

-- Notifications: support both the legacy UI shape and the newer service shape.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS body TEXT,
  ADD COLUMN IF NOT EXISTS message TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS read BOOLEAN DEFAULT false;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type IS NULL OR type IN (
      'invoice',
      'approval',
      'invoice_approved',
      'payment',
      'payment_failed',
      'order',
      'inventory',
      'low_inventory',
      'AI_alert',
      'vendor_update',
      'labor_alert',
      'system',
      'alert',
      'warning',
      'error'
    )
  );

UPDATE public.notifications
SET
  message = COALESCE(message, body),
  body = COALESCE(body, message),
  is_read = COALESCE(is_read, read, false),
  read = COALESCE(read, is_read, false);

CREATE INDEX IF NOT EXISTS idx_notifications_metadata ON public.notifications USING gin(metadata);

-- Invoice payment statuses used by the payment workflow.
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_payment_status_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_payment_status_check CHECK (
    payment_status IS NULL OR payment_status IN ('unpaid', 'partial', 'pending', 'paid', 'auto_pay')
  );

-- Payment workflow metadata.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sender_bank TEXT,
  ADD COLUMN IF NOT EXISTS bank_reference TEXT,
  ADD COLUMN IF NOT EXISTS cheque_number TEXT,
  ADD COLUMN IF NOT EXISTS payer_email TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_status_check CHECK (
    status IS NULL OR status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded')
  );

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_payment_method_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_payment_method_check CHECK (
    payment_method IS NULL OR payment_method IN ('stripe', 'paypal', 'bank_transfer', 'cheque', 'cash', 'manual')
  );

-- Inventory staging fields used after invoice approval.
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS pending_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pending_source_invoice TEXT;

-- Ledger payment link back to source payment.
ALTER TABLE public.ledger_payments
  ADD COLUMN IF NOT EXISTS source_payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_org ON public.payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_ledger_payments_source_payment ON public.ledger_payments(source_payment_id);

COMMIT;
