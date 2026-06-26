-- Add pre-payment business verification and payment-method onboarding state.
-- This supports the new onboarding order:
-- business/address verification -> payment method -> plan -> hierarchy.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS business_verification_status TEXT DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS business_verification_score INTEGER,
  ADD COLUMN IF NOT EXISTS business_verification_provider TEXT,
  ADD COLUMN IF NOT EXISTS business_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS business_type TEXT,
  ADD COLUMN IF NOT EXISTS tax_identifier_type TEXT,
  ADD COLUMN IF NOT EXISTS tax_identifier_last4 TEXT,
  ADD COLUMN IF NOT EXISTS payment_method_type TEXT,
  ADD COLUMN IF NOT EXISTS payment_method_verified_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_business_verification_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_business_verification_status_check
      CHECK (business_verification_status IN ('not_started', 'pending_review', 'verified', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_tax_identifier_type_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_tax_identifier_type_check
      CHECK (tax_identifier_type IS NULL OR tax_identifier_type IN ('ein', 'ssn'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_payment_method_type_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_payment_method_type_check
      CHECK (payment_method_type IS NULL OR payment_method_type IN ('card', 'ach'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.business_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  legal_business_name TEXT NOT NULL,
  business_type TEXT NOT NULL,
  identifier_type TEXT NOT NULL CHECK (identifier_type IN ('ein', 'ssn')),
  identifier_last4 TEXT,
  provider_name TEXT NOT NULL,
  provider_reference_id TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (verification_status IN ('pending_review', 'verified', 'failed')),
  trust_score INTEGER CHECK (trust_score BETWEEN 0 AND 100),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  address_type TEXT NOT NULL CHECK (address_type IN ('business', 'mailing', 'service')),
  location_name TEXT,
  address_line_1 TEXT NOT NULL,
  address_line_2 TEXT,
  city TEXT NOT NULL,
  county TEXT,
  state TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  zip_plus4 TEXT,
  country TEXT NOT NULL DEFAULT 'US',
  usps_verified BOOLEAN NOT NULL DEFAULT false,
  usps_standardized BOOLEAN NOT NULL DEFAULT false,
  usps_validation_code TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  timezone TEXT,
  place_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_verifications_user_id ON public.business_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_business_verifications_organization_id ON public.business_verifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_business_verifications_status ON public.business_verifications(verification_status);
CREATE INDEX IF NOT EXISTS idx_organization_addresses_user_id ON public.organization_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_addresses_organization_id ON public.organization_addresses(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_addresses_type ON public.organization_addresses(address_type);

ALTER TABLE public.business_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business_verifications_self_select" ON public.business_verifications;
CREATE POLICY "business_verifications_self_select"
  ON public.business_verifications FOR SELECT
  USING (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "business_verifications_self_insert" ON public.business_verifications;
CREATE POLICY "business_verifications_self_insert"
  ON public.business_verifications FOR INSERT
  WITH CHECK (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "business_verifications_admin_update" ON public.business_verifications;
CREATE POLICY "business_verifications_admin_update"
  ON public.business_verifications FOR UPDATE
  USING (public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "organization_addresses_self_select" ON public.organization_addresses;
CREATE POLICY "organization_addresses_self_select"
  ON public.organization_addresses FOR SELECT
  USING (user_id = auth.uid() OR public.get_auth_role() IN ('platform_admin', 'org_owner'));

DROP POLICY IF EXISTS "organization_addresses_self_insert" ON public.organization_addresses;
CREATE POLICY "organization_addresses_self_insert"
  ON public.organization_addresses FOR INSERT
  WITH CHECK (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "organization_addresses_owner_update" ON public.organization_addresses;
CREATE POLICY "organization_addresses_owner_update"
  ON public.organization_addresses FOR UPDATE
  USING (user_id = auth.uid() OR public.get_auth_role() IN ('platform_admin', 'org_owner'));

COMMIT;
