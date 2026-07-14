BEGIN;

-- Vendor-level flags: commissary/internal-transfer tagging, category restrictions,
-- and accounting-inheritance toggles (MarginEdge parity gap fixes).
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS is_commissary_vendor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_internal_transfer_vendor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allowed_expense_categories text[],
  ADD COLUMN IF NOT EXISTS use_org_accounting_defaults boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS exclude_from_accounting boolean NOT NULL DEFAULT false;

-- Company-wide vendor defaults (MarginEdge "Configure Defaults" equivalent).
-- One row per organization; app does get-or-create-on-first-save.
CREATE TABLE IF NOT EXISTS public.organization_vendor_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  misc_charge_rules jsonb NOT NULL DEFAULT '{
    "taxes_pst": {"method": "proportionate", "category": null, "locked": false},
    "delivery_freight": {"method": "proportionate", "category": null, "locked": false},
    "other": {"method": "proportionate", "category": null, "locked": false},
    "credit": {"method": "proportionate", "category": null, "locked": false}
  }'::jsonb,
  default_handwritten_credit_process text NOT NULL DEFAULT 'combined'
    CHECK (default_handwritten_credit_process IN ('separate', 'combined')),
  default_payment_account_id uuid REFERENCES public.payment_accounts(id) ON DELETE SET NULL,
  default_payment_terms text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_vendor_defaults_org_idx
  ON public.organization_vendor_defaults (organization_id);

ALTER TABLE public.organization_vendor_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_vendor_defaults FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_vendor_defaults'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.organization_vendor_defaults', policy_record.policyname);
  END LOOP;
END $$;

CREATE POLICY organization_vendor_defaults_admin_select
  ON public.organization_vendor_defaults
  FOR SELECT
  USING (
    organization_id = public.get_auth_org()
  );

CREATE POLICY organization_vendor_defaults_admin_insert
  ON public.organization_vendor_defaults
  FOR INSERT
  WITH CHECK (
    public.is_admin()
    AND organization_id = public.get_auth_org()
  );

CREATE POLICY organization_vendor_defaults_admin_update
  ON public.organization_vendor_defaults
  FOR UPDATE
  USING (
    public.is_admin()
    AND organization_id = public.get_auth_org()
  )
  WITH CHECK (
    public.is_admin()
    AND organization_id = public.get_auth_org()
  );

REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.organization_vendor_defaults FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.organization_vendor_defaults TO authenticated;
GRANT ALL ON public.organization_vendor_defaults TO service_role;

COMMIT;
