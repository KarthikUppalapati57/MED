-- 078: Unified invoice/AP ledger foundation
-- Adds canonical AP lifecycle fields, actionable exceptions, and payment accounts.

BEGIN;

CREATE TABLE IF NOT EXISTS public.payment_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.brands(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (
    account_type IN ('accounts_payable', 'checking', 'credit_card', 'petty_cash', 'internal_transfer', 'vendor_auto_pay', 'custom')
  ),
  payment_method TEXT,
  provider TEXT,
  provider_reference TEXT,
  last_four TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Payment accounts org read access" ON public.payment_accounts;
CREATE POLICY "Payment accounts org read access"
  ON public.payment_accounts FOR SELECT
  USING (
    public.is_platform_admin()
    OR organization_id = public.get_my_org()
    OR organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Payment accounts manager write access" ON public.payment_accounts;
CREATE POLICY "Payment accounts manager write access"
  ON public.payment_accounts FOR ALL
  USING (
    public.is_platform_admin()
    OR (
      public.is_manager_or_above()
      AND (
        organization_id = public.get_my_org()
        OR organization_id IN (
          SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (
      public.is_manager_or_above()
      AND (
        organization_id = public.get_my_org()
        OR organization_id IN (
          SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_payment_accounts_scope
  ON public.payment_accounts(organization_id, brand_id, location_id, is_active);

CREATE OR REPLACE FUNCTION public.touch_payment_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_accounts_updated_at ON public.payment_accounts;
CREATE TRIGGER trg_payment_accounts_updated_at
  BEFORE UPDATE ON public.payment_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_payment_accounts_updated_at();

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS ap_status TEXT NOT NULL DEFAULT 'processing',
  ADD COLUMN IF NOT EXISTS action_required_reason TEXT,
  ADD COLUMN IF NOT EXISTS action_required_details TEXT,
  ADD COLUMN IF NOT EXISTS assigned_reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_account_id UUID REFERENCES public.payment_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scheduled_payment_date DATE,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ap_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_ap_status_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_ap_status_check CHECK (
    ap_status IN ('processing', 'action_required', 'pending_approval', 'approved', 'scheduled', 'paid', 'closed', 'rejected')
  );

UPDATE public.invoices
SET ap_status = CASE
  WHEN status = 'rejected' THEN 'rejected'
  WHEN status = 'paid' OR payment_status = 'paid' THEN 'paid'
  WHEN status = 'approved' THEN 'approved'
  WHEN status IN ('flagged', 'duplicate') OR match_status IN ('needs_review', 'variance', 'missing_receipt', 'unmatched') THEN 'action_required'
  WHEN status = 'validated' THEN 'pending_approval'
  ELSE 'processing'
END
WHERE ap_status = 'processing';

UPDATE public.invoices
SET action_required_reason = CASE
  WHEN status = 'duplicate' THEN 'possible_duplicate'
  WHEN status = 'flagged' THEN 'validation_flag'
  WHEN match_status = 'missing_receipt' THEN 'missing_receipt'
  WHEN match_status = 'unmatched' THEN 'missing_purchase_order'
  WHEN match_status IN ('needs_review', 'variance') THEN 'reconciliation_variance'
  ELSE action_required_reason
END
WHERE ap_status = 'action_required' AND action_required_reason IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_ap_status ON public.invoices(organization_id, ap_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_action_required_reason ON public.invoices(organization_id, action_required_reason);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_account_id ON public.invoices(payment_account_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date_open ON public.invoices(organization_id, due_date)
  WHERE ap_status NOT IN ('paid', 'closed', 'rejected');

ALTER TABLE public.ledger_bills
  ADD COLUMN IF NOT EXISTS payment_account_id UUID REFERENCES public.payment_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scheduled_payment_date DATE;

COMMIT;
