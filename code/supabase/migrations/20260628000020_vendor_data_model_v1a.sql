BEGIN;

-- V1a keeps the existing operational vendors.status axis intact and adds a
-- separate approval lifecycle used by validation/payment workflows.
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS dba_name text,
  ADD COLUMN IF NOT EXISTS vendor_type text,
  ADD COLUMN IF NOT EXISTS internal_vendor_id text,
  ADD COLUMN IF NOT EXISTS remittance_address_line1 text,
  ADD COLUMN IF NOT EXISTS remittance_address_line2 text,
  ADD COLUMN IF NOT EXISTS remittance_city text,
  ADD COLUMN IF NOT EXISTS remittance_state text,
  ADD COLUMN IF NOT EXISTS remittance_zip_code text,
  ADD COLUMN IF NOT EXISTS remittance_country text,
  ADD COLUMN IF NOT EXISTS mailing_address_line1 text,
  ADD COLUMN IF NOT EXISTS mailing_address_line2 text,
  ADD COLUMN IF NOT EXISTS mailing_city text,
  ADD COLUMN IF NOT EXISTS mailing_state text,
  ADD COLUMN IF NOT EXISTS mailing_zip_code text,
  ADD COLUMN IF NOT EXISTS mailing_country text,
  ADD COLUMN IF NOT EXISTS payment_recipient_name text,
  ADD COLUMN IF NOT EXISTS accepts_check boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepts_ach boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepts_electronic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepts_autopay boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_confirmation_email_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS custom_payment_terms_days integer,
  ADD COLUMN IF NOT EXISTS invoice_start_date date,
  ADD COLUMN IF NOT EXISTS due_date_calculation_method text,
  ADD COLUMN IF NOT EXISTS auto_schedule_payments boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_gl_code text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vendors_approval_status_check'
      AND conrelid = 'public.vendors'::regclass
  ) THEN
    ALTER TABLE public.vendors
      ADD CONSTRAINT vendors_approval_status_check
      CHECK (approval_status IN ('draft', 'pending_approval', 'approved', 'suspended', 'rejected'));
  END IF;
END $$;

-- Extend payment terms without removing existing values used by the app.
ALTER TABLE public.vendors
  DROP CONSTRAINT IF EXISTS vendors_payment_terms_check;

ALTER TABLE public.vendors
  ADD CONSTRAINT vendors_payment_terms_check
  CHECK (
    payment_terms IS NULL
    OR payment_terms IN (
      'net_7',
      'net_15',
      'net_30',
      'net_45',
      'net_60',
      'due_on_receipt',
      'custom'
    )
  );

CREATE TABLE IF NOT EXISTS public.vendor_tax_information (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  w9_status text NOT NULL DEFAULT 'not_collected'
    CHECK (w9_status IN ('not_collected', 'requested', 'received', 'verified', 'rejected')),
  tax_classification text,
  legal_name text,
  tax_id_last4 text,
  tax_id_full text,
  is_1099 boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.vendor_banking_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  account_number text,
  routing_number text,
  account_last4 text,
  verification_state text NOT NULL DEFAULT 'unverified'
    CHECK (verification_state IN ('unverified', 'pending', 'verified')),
  verified_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.vendor_payment_provider_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('dwolla', 'stripe', 'plaid')),
  provider_customer_ref text,
  provider_funding_ref text,
  provider_status text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS vendor_tax_information_vendor_id_idx
  ON public.vendor_tax_information (vendor_id);

CREATE INDEX IF NOT EXISTS vendor_tax_information_scope_idx
  ON public.vendor_tax_information (organization_id, brand_id, location_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS vendor_banking_details_vendor_id_idx
  ON public.vendor_banking_details (vendor_id);

CREATE INDEX IF NOT EXISTS vendor_banking_details_scope_idx
  ON public.vendor_banking_details (organization_id, brand_id, location_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS vendor_payment_provider_links_vendor_id_idx
  ON public.vendor_payment_provider_links (vendor_id);

CREATE INDEX IF NOT EXISTS vendor_payment_provider_links_scope_idx
  ON public.vendor_payment_provider_links (organization_id, brand_id, location_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vendor_payment_provider_links_vendor_provider_active_idx
  ON public.vendor_payment_provider_links (vendor_id, provider)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_vendor_sensitive_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organization_id uuid;
  v_brand_id uuid;
  v_location_id uuid;
BEGIN
  SELECT v.organization_id, v.brand_id, v.location_id
    INTO v_organization_id, v_brand_id, v_location_id
  FROM public.vendors v
  WHERE v.id = NEW.vendor_id;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Vendor % does not exist or has no organization scope', NEW.vendor_id;
  END IF;

  NEW.organization_id := v_organization_id;
  NEW.brand_id := v_brand_id;
  NEW.location_id := v_location_id;
  NEW.updated_at := now();

  IF TG_OP = 'INSERT' THEN
    NEW.created_at := COALESCE(NEW.created_at, now());
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;

  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.neutralize_vendor_bank_details()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- DROP at squash: guard legacy manager-readable column while V1a moves banking
  -- into isolated, column-protected tables.
  IF NEW.bank_details IS NOT NULL AND NEW.bank_details <> '{}'::jsonb THEN
    NEW.bank_details := '{}'::jsonb;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_vendor_tax_information_scope ON public.vendor_tax_information;
CREATE TRIGGER set_vendor_tax_information_scope
BEFORE INSERT OR UPDATE ON public.vendor_tax_information
FOR EACH ROW
EXECUTE FUNCTION public.set_vendor_sensitive_scope();

DROP TRIGGER IF EXISTS set_vendor_banking_details_scope ON public.vendor_banking_details;
CREATE TRIGGER set_vendor_banking_details_scope
BEFORE INSERT OR UPDATE ON public.vendor_banking_details
FOR EACH ROW
EXECUTE FUNCTION public.set_vendor_sensitive_scope();

DROP TRIGGER IF EXISTS set_vendor_payment_provider_links_scope ON public.vendor_payment_provider_links;
CREATE TRIGGER set_vendor_payment_provider_links_scope
BEFORE INSERT OR UPDATE ON public.vendor_payment_provider_links
FOR EACH ROW
EXECUTE FUNCTION public.set_vendor_sensitive_scope();

DROP TRIGGER IF EXISTS neutralize_vendor_bank_details ON public.vendors;
CREATE TRIGGER neutralize_vendor_bank_details
BEFORE INSERT OR UPDATE ON public.vendors
FOR EACH ROW
EXECUTE FUNCTION public.neutralize_vendor_bank_details();

ALTER TABLE public.vendor_tax_information ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_tax_information FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_banking_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_banking_details FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_payment_provider_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_payment_provider_links FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'vendor_tax_information',
        'vendor_banking_details',
        'vendor_payment_provider_links'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_record.policyname, policy_record.tablename);
  END LOOP;
END $$;

CREATE POLICY vendor_tax_information_admin_select
  ON public.vendor_tax_information
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND public.is_admin()
    AND organization_id = public.get_auth_org()
  );

CREATE POLICY vendor_tax_information_admin_insert
  ON public.vendor_tax_information
  FOR INSERT
  WITH CHECK (
    deleted_at IS NULL
    AND public.is_admin()
    AND organization_id = public.get_auth_org()
  );

CREATE POLICY vendor_tax_information_admin_update
  ON public.vendor_tax_information
  FOR UPDATE
  USING (
    deleted_at IS NULL
    AND public.is_admin()
    AND organization_id = public.get_auth_org()
  )
  WITH CHECK (
    deleted_at IS NULL
    AND public.is_admin()
    AND organization_id = public.get_auth_org()
  );

CREATE POLICY vendor_banking_details_branch_select
  ON public.vendor_banking_details
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND organization_id = public.get_auth_org()
    AND (
      public.is_admin()
      OR (
        public.get_auth_role() = 'branch_manager'
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
      )
    )
  );

CREATE POLICY vendor_banking_details_branch_insert
  ON public.vendor_banking_details
  FOR INSERT
  WITH CHECK (
    deleted_at IS NULL
    AND organization_id = public.get_auth_org()
    AND (
      public.is_admin()
      OR (
        public.get_auth_role() = 'branch_manager'
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
      )
    )
  );

CREATE POLICY vendor_banking_details_branch_update
  ON public.vendor_banking_details
  FOR UPDATE
  USING (
    deleted_at IS NULL
    AND organization_id = public.get_auth_org()
    AND (
      public.is_admin()
      OR (
        public.get_auth_role() = 'branch_manager'
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
      )
    )
  )
  WITH CHECK (
    deleted_at IS NULL
    AND organization_id = public.get_auth_org()
    AND (
      public.is_admin()
      OR (
        public.get_auth_role() = 'branch_manager'
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
      )
    )
  );

CREATE POLICY vendor_payment_provider_links_branch_select
  ON public.vendor_payment_provider_links
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND organization_id = public.get_auth_org()
    AND (
      public.is_admin()
      OR (
        public.get_auth_role() = 'branch_manager'
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
      )
    )
  );

CREATE POLICY vendor_payment_provider_links_branch_insert
  ON public.vendor_payment_provider_links
  FOR INSERT
  WITH CHECK (
    deleted_at IS NULL
    AND organization_id = public.get_auth_org()
    AND (
      public.is_admin()
      OR (
        public.get_auth_role() = 'branch_manager'
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
      )
    )
  );

CREATE POLICY vendor_payment_provider_links_branch_update
  ON public.vendor_payment_provider_links
  FOR UPDATE
  USING (
    deleted_at IS NULL
    AND organization_id = public.get_auth_org()
    AND (
      public.is_admin()
      OR (
        public.get_auth_role() = 'branch_manager'
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
      )
    )
  )
  WITH CHECK (
    deleted_at IS NULL
    AND organization_id = public.get_auth_org()
    AND (
      public.is_admin()
      OR (
        public.get_auth_role() = 'branch_manager'
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
      )
    )
  );

REVOKE ALL ON public.vendor_tax_information FROM anon, authenticated;
REVOKE ALL ON public.vendor_banking_details FROM anon, authenticated;
REVOKE ALL ON public.vendor_payment_provider_links FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.vendor_tax_information FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.vendor_banking_details FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.vendor_payment_provider_links FROM anon, authenticated;

GRANT SELECT (
  id,
  vendor_id,
  organization_id,
  brand_id,
  location_id,
  w9_status,
  tax_classification,
  legal_name,
  tax_id_last4,
  is_1099,
  created_by,
  updated_by,
  created_at,
  updated_at,
  deleted_at
) ON public.vendor_tax_information TO authenticated;

GRANT SELECT (
  id,
  vendor_id,
  organization_id,
  brand_id,
  location_id,
  account_last4,
  verification_state,
  verified_at,
  is_active,
  version,
  effective_from,
  effective_to,
  created_by,
  updated_by,
  created_at,
  updated_at,
  deleted_at
) ON public.vendor_banking_details TO authenticated;

GRANT SELECT (
  id,
  vendor_id,
  organization_id,
  brand_id,
  location_id,
  provider,
  provider_status,
  is_active,
  created_by,
  updated_by,
  created_at,
  updated_at,
  deleted_at
) ON public.vendor_payment_provider_links TO authenticated;

GRANT INSERT, UPDATE ON public.vendor_tax_information TO authenticated;
GRANT INSERT, UPDATE ON public.vendor_banking_details TO authenticated;
GRANT INSERT, UPDATE ON public.vendor_payment_provider_links TO authenticated;

GRANT ALL ON public.vendor_tax_information TO service_role;
GRANT ALL ON public.vendor_banking_details TO service_role;
GRANT ALL ON public.vendor_payment_provider_links TO service_role;

REVOKE SELECT (tax_id_full) ON public.vendor_tax_information FROM anon, authenticated;
REVOKE SELECT (account_number, routing_number) ON public.vendor_banking_details FROM anon, authenticated;
REVOKE SELECT (provider_customer_ref, provider_funding_ref) ON public.vendor_payment_provider_links FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_auth_org() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_auth_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_accessible_brand_ids() TO authenticated, service_role;

COMMIT;
