-- 079: Invoice action reasons and batch operations support
-- Creates structured action reasons table for AP exceptions.

BEGIN;

CREATE TABLE IF NOT EXISTS public.invoice_action_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  severity TEXT CHECK (severity IN ('info', 'warning', 'critical')) DEFAULT 'warning',
  requires_manual_resolution BOOLEAN DEFAULT true,
  resolution_route TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.invoice_action_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Invoice action reasons read access" ON public.invoice_action_reasons;
CREATE POLICY "Invoice action reasons read access"
  ON public.invoice_action_reasons FOR SELECT
  USING (true); -- Reference data, readable by all authenticated users

CREATE OR REPLACE FUNCTION public.touch_invoice_action_reasons_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoice_action_reasons_updated_at ON public.invoice_action_reasons;
CREATE TRIGGER trg_invoice_action_reasons_updated_at
  BEFORE UPDATE ON public.invoice_action_reasons
  FOR EACH ROW EXECUTE FUNCTION public.touch_invoice_action_reasons_updated_at();

-- Seed basic reasons
INSERT INTO public.invoice_action_reasons (code, label, severity, resolution_route) VALUES
  ('possible_duplicate', 'Possible Duplicate', 'critical', '/invoices/review/duplicate'),
  ('validation_flag', 'Validation Flag', 'warning', '/invoices/review/validation'),
  ('missing_receipt', 'Missing Receipt', 'warning', '/orders/receiving'),
  ('missing_purchase_order', 'Missing Purchase Order', 'warning', '/orders/new'),
  ('reconciliation_variance', 'Reconciliation Variance', 'critical', '/invoices/review/reconciliation')
ON CONFLICT (code) DO NOTHING;

-- Ensure action_required_reason on invoices references this table if it exists as a column (already added as TEXT in 078)
-- We'll keep it as TEXT for loose coupling, but it's populated with these codes.
-- Let's just create an index on the foreign key if we want to enforce it later, but right now TEXT is fine.

COMMIT;
