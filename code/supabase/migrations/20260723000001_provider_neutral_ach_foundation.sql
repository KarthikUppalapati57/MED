BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  owner_type text NOT NULL CHECK (owner_type IN ('client', 'vendor', 'organization', 'location')),
  owner_id uuid NOT NULL,
  payment_account_id uuid REFERENCES public.payment_accounts(id) ON DELETE SET NULL,
  account_holder_name text,
  bank_name text,
  account_type text NOT NULL DEFAULT 'checking' CHECK (account_type IN ('checking', 'savings')),
  routing_last4 text,
  account_last4 text,
  fingerprint_hash text NOT NULL,
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'failed', 'disabled', 'requires_authorization', 'requires_callback')),
  default_for_owner boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  secret_id uuid,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_role text,
  approved_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by_role text,
  approved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT bank_accounts_owner_scope_required CHECK (
    organization_id IS NOT NULL OR tenant_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_owner_default_active_idx
  ON public.bank_accounts (tenant_id, organization_id, owner_type, owner_id)
  WHERE default_for_owner = true AND is_active = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS bank_accounts_scope_idx
  ON public.bank_accounts (tenant_id, organization_id, brand_id, location_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS bank_accounts_owner_idx
  ON public.bank_accounts (owner_type, owner_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS bank_accounts_fingerprint_idx
  ON public.bank_accounts (tenant_id, organization_id, fingerprint_hash)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.bank_account_provider_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_use text NOT NULL CHECK (provider_use IN ('collection', 'payout', 'check')),
  provider_owner_ref text,
  provider_bank_ref text,
  provider_mandate_ref text,
  provider_status text NOT NULL DEFAULT 'not_configured',
  requirements_due jsonb NOT NULL DEFAULT '{}'::jsonb,
  payouts_enabled boolean,
  charges_enabled boolean,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS bank_account_provider_links_active_idx
  ON public.bank_account_provider_links (bank_account_id, provider, provider_use)
  WHERE is_active = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS bank_account_provider_links_scope_idx
  ON public.bank_account_provider_links (tenant_id, organization_id, brand_id, location_id, provider, provider_use)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.payment_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  collection_provider text NOT NULL DEFAULT 'not_configured',
  payout_provider text NOT NULL DEFAULT 'not_configured',
  check_provider text NOT NULL DEFAULT 'checkbook',
  enabled boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_provider_configs_scope_idx
  ON public.payment_provider_configs (
    COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.payment_provider_compliance_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_use text NOT NULL CHECK (provider_use IN ('collection', 'payout', 'check')),
  requires_terms_acceptance boolean NOT NULL DEFAULT false,
  requires_ach_authorization boolean NOT NULL DEFAULT false,
  requires_kyc boolean NOT NULL DEFAULT false,
  requires_country_eligibility boolean NOT NULL DEFAULT false,
  requires_fraud_review boolean NOT NULL DEFAULT false,
  requires_requirements_remediation boolean NOT NULL DEFAULT false,
  requires_active_account_fee_tracking boolean NOT NULL DEFAULT false,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_use)
);

INSERT INTO public.payment_provider_compliance_profiles (
  provider,
  provider_use,
  requires_terms_acceptance,
  requires_ach_authorization,
  requires_kyc,
  requires_country_eligibility,
  requires_fraud_review,
  requires_requirements_remediation,
  requires_active_account_fee_tracking
)
VALUES
  ('not_configured', 'collection', false, false, false, false, false, false, false),
  ('not_configured', 'payout', false, false, false, false, false, false, false),
  ('stripe_ach_debit', 'collection', true, true, false, true, false, true, false),
  ('stripe_connect_custom', 'payout', true, false, true, true, true, true, true),
  ('checkbook', 'check', true, false, false, true, false, true, false)
ON CONFLICT (provider, provider_use) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.payment_terms_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  owner_type text NOT NULL CHECK (owner_type IN ('client', 'vendor', 'platform_user', 'organization', 'location')),
  owner_id uuid NOT NULL,
  provider text NOT NULL,
  terms_type text NOT NULL CHECK (terms_type IN ('platform_terms', 'stripe_services_agreement', 'ach_authorization', 'payout_authorization', 'provider_terms')),
  terms_version text NOT NULL,
  accepted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address inet,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_terms_acceptances_lookup_idx
  ON public.payment_terms_acceptances (owner_type, owner_id, provider, terms_type, terms_version, accepted_at DESC);

CREATE TABLE IF NOT EXISTS public.provider_country_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_use text NOT NULL CHECK (provider_use IN ('collection', 'payout', 'check')),
  platform_country text NOT NULL,
  connected_account_country text,
  self_serve_allowed boolean NOT NULL DEFAULT true,
  requires_sales_review boolean NOT NULL DEFAULT false,
  allowed_charge_types text[] NOT NULL DEFAULT ARRAY[]::text[],
  notes text,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_country_rules_lookup_idx
  ON public.provider_country_rules (provider, provider_use, platform_country, connected_account_country, effective_from, effective_to);

CREATE TABLE IF NOT EXISTS public.provider_requirement_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  provider text NOT NULL,
  owner_type text NOT NULL CHECK (owner_type IN ('vendor', 'client', 'organization', 'location')),
  owner_id uuid NOT NULL,
  provider_owner_ref text,
  charges_enabled boolean,
  payouts_enabled boolean,
  disabled_reason text,
  currently_due jsonb NOT NULL DEFAULT '[]'::jsonb,
  eventually_due jsonb NOT NULL DEFAULT '[]'::jsonb,
  past_due jsonb NOT NULL DEFAULT '[]'::jsonb,
  requirements_hash text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_requirement_snapshots_latest_idx
  ON public.provider_requirement_snapshots (provider, owner_type, owner_id, synced_at DESC);

CREATE TABLE IF NOT EXISTS public.provider_risk_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  owner_type text NOT NULL CHECK (owner_type IN ('vendor', 'client', 'organization', 'location')),
  owner_id uuid NOT NULL,
  provider text NOT NULL,
  risk_status text NOT NULL DEFAULT 'pending' CHECK (risk_status IN ('pending', 'approved', 'rejected', 'manual_review')),
  risk_score numeric,
  review_reason text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_risk_reviews_owner_idx
  ON public.provider_risk_reviews (provider, owner_type, owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.provider_active_account_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  provider text NOT NULL,
  provider_owner_ref text NOT NULL,
  owner_type text NOT NULL CHECK (owner_type IN ('vendor', 'client', 'organization', 'location')),
  owner_id uuid NOT NULL,
  month date NOT NULL,
  successful_payout_count integer NOT NULL DEFAULT 0,
  active_account_fee numeric(12, 2) NOT NULL DEFAULT 0,
  fee_policy text NOT NULL DEFAULT 'platform_absorbs',
  recovered_from text NOT NULL DEFAULT 'platform' CHECK (recovered_from IN ('client', 'vendor', 'platform')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_owner_ref, month)
);

CREATE TABLE IF NOT EXISTS public.payment_fee_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  fee_paid_by text NOT NULL DEFAULT 'client' CHECK (fee_paid_by IN ('client', 'vendor', 'platform')),
  collection_fee_mode text NOT NULL DEFAULT 'pass_through' CHECK (collection_fee_mode IN ('pass_through', 'absorbed', 'markup')),
  payout_fee_mode text NOT NULL DEFAULT 'pass_through' CHECK (payout_fee_mode IN ('pass_through', 'absorbed', 'markup')),
  disclosure_text text,
  contract_version text,
  enabled boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS payment_fee_policies_scope_idx
  ON public.payment_fee_policies (tenant_id, organization_id, brand_id, location_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.payment_fee_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  payer_type text NOT NULL DEFAULT 'client' CHECK (payer_type IN ('client', 'vendor', 'platform')),
  fee_paid_by text NOT NULL DEFAULT 'client' CHECK (fee_paid_by IN ('client', 'vendor', 'platform')),
  provider text NOT NULL,
  provider_fee_type text NOT NULL DEFAULT 'other' CHECK (provider_fee_type IN ('ach_debit', 'connect_payout', 'bank_validation', 'failed_payment', 'dispute', 'active_account', 'other')),
  base_amount numeric(12, 2) NOT NULL DEFAULT 0,
  provider_fee_amount numeric(12, 2) NOT NULL DEFAULT 0,
  platform_markup_amount numeric(12, 2) NOT NULL DEFAULT 0,
  total_fee_amount numeric(12, 2) GENERATED ALWAYS AS (provider_fee_amount + platform_markup_amount) STORED,
  total_debit_amount numeric(12, 2) NOT NULL DEFAULT 0,
  fee_formula text,
  fee_policy_id uuid REFERENCES public.payment_fee_policies(id) ON DELETE SET NULL,
  contract_version text,
  displayed_to_user_at timestamptz,
  accepted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by_user_at timestamptz,
  provider_balance_transaction_ref text,
  provider_reported_fee_amount numeric(12, 2),
  reconciliation_status text NOT NULL DEFAULT 'expected' CHECK (reconciliation_status IN ('expected', 'matched', 'mismatch', 'adjusted')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_fee_events_scope_idx
  ON public.payment_fee_events (tenant_id, organization_id, brand_id, location_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.payment_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  provider text NOT NULL,
  provider_event_type text NOT NULL,
  provider_event_ref text,
  owner_type text,
  owner_id uuid,
  bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'received',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_provider_events_scope_idx
  ON public.payment_provider_events (tenant_id, organization_id, brand_id, location_id, provider, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_provider_neutral_payment_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'bank_accounts',
    'bank_account_provider_links',
    'payment_provider_configs',
    'payment_provider_compliance_profiles',
    'provider_risk_reviews',
    'provider_active_account_fees',
    'payment_fee_policies'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS touch_%I_updated_at ON public.%I', v_table, v_table);
    EXECUTE format(
      'CREATE TRIGGER touch_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_provider_neutral_payment_updated_at()',
      v_table,
      v_table
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.sync_provider_neutral_tenant_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NOT NULL AND NEW.tenant_id IS NULL THEN
    SELECT tenant_id INTO NEW.tenant_id
    FROM public.organizations
    WHERE id = NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'bank_accounts',
    'bank_account_provider_links',
    'payment_provider_configs',
    'payment_terms_acceptances',
    'provider_requirement_snapshots',
    'provider_risk_reviews',
    'provider_active_account_fees',
    'payment_fee_policies',
    'payment_fee_events',
    'payment_provider_events'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS sync_%I_tenant_scope ON public.%I', v_table, v_table);
    EXECUTE format(
      'CREATE TRIGGER sync_%I_tenant_scope BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.sync_provider_neutral_tenant_scope()',
      v_table,
      v_table
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.resolve_payment_provider_config(
  p_tenant_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT jsonb_build_object(
      'id', ppc.id,
      'tenant_id', ppc.tenant_id,
      'organization_id', ppc.organization_id,
      'brand_id', ppc.brand_id,
      'location_id', ppc.location_id,
      'collection_provider', ppc.collection_provider,
      'payout_provider', ppc.payout_provider,
      'check_provider', ppc.check_provider,
      'enabled', ppc.enabled,
      'settings', ppc.settings
    )
    FROM public.payment_provider_configs ppc
    WHERE ppc.enabled = true
      AND ppc.deleted_at IS NULL
      AND (ppc.tenant_id IS NULL OR ppc.tenant_id = p_tenant_id)
      AND (ppc.organization_id IS NULL OR ppc.organization_id = p_organization_id)
      AND (ppc.brand_id IS NULL OR ppc.brand_id = p_brand_id)
      AND (ppc.location_id IS NULL OR ppc.location_id = p_location_id)
    ORDER BY
      CASE WHEN ppc.location_id IS NOT NULL THEN 1 ELSE 0 END DESC,
      CASE WHEN ppc.brand_id IS NOT NULL THEN 1 ELSE 0 END DESC,
      CASE WHEN ppc.organization_id IS NOT NULL THEN 1 ELSE 0 END DESC,
      CASE WHEN ppc.tenant_id IS NOT NULL THEN 1 ELSE 0 END DESC,
      ppc.updated_at DESC
    LIMIT 1
  ), jsonb_build_object(
    'collection_provider', 'not_configured',
    'payout_provider', 'not_configured',
    'check_provider', 'checkbook',
    'enabled', false,
    'settings', '{}'::jsonb
  ));
$$;

CREATE OR REPLACE FUNCTION public.store_bank_account_secret(
  p_bank_account_id uuid,
  p_account_number text,
  p_routing_number text,
  p_fingerprint_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret_name text := 'bank_' || p_bank_account_id::text;
  v_secret_id uuid;
  v_row public.bank_accounts%ROWTYPE;
  v_account text;
  v_routing text;
  v_payload text;
BEGIN
  SELECT *
    INTO v_row
  FROM public.bank_accounts
  WHERE id = p_bank_account_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Bank account row % not found', p_bank_account_id;
  END IF;

  v_account := regexp_replace(COALESCE(p_account_number, ''), '\D', '', 'g');
  v_routing := regexp_replace(COALESCE(p_routing_number, ''), '\D', '', 'g');

  IF v_account !~ '^\d{4,17}$' THEN
    RAISE EXCEPTION 'A valid bank account number is required';
  END IF;

  IF v_routing !~ '^\d{9}$' THEN
    RAISE EXCEPTION 'A valid 9-digit routing number is required';
  END IF;

  IF NULLIF(btrim(COALESCE(p_fingerprint_hash, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A backend-generated fingerprint hash is required';
  END IF;

  v_payload := jsonb_build_object(
    'account_number', v_account,
    'routing_number', v_routing,
    'account_holder_name', v_row.account_holder_name,
    'account_type', v_row.account_type
  )::text;

  SELECT id INTO v_secret_id
  FROM vault.secrets
  WHERE name = v_secret_name;

  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;

  SELECT * INTO v_secret_id
  FROM vault.create_secret(v_payload, v_secret_name, 'provider-neutral bank account');

  UPDATE public.bank_accounts
     SET secret_id = v_secret_id,
         account_last4 = right(v_account, 4),
         routing_last4 = right(v_routing, 4),
         fingerprint_hash = p_fingerprint_hash,
         updated_at = now()
   WHERE id = p_bank_account_id;

  RETURN jsonb_build_object(
    'bank_account_id', p_bank_account_id,
    'secret_id', v_secret_id,
    'account_last4', right(v_account, 4),
    'routing_last4', right(v_routing, 4)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_bank_account_secret_for_provider(
  p_bank_account_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret_id uuid;
  v_secret text;
BEGIN
  SELECT secret_id INTO v_secret_id
  FROM public.bank_accounts
  WHERE id = p_bank_account_id
    AND is_active = true
    AND deleted_at IS NULL;

  IF v_secret_id IS NULL THEN
    RAISE EXCEPTION 'Bank account secret for row % not found', p_bank_account_id;
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE id = v_secret_id;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'Vault secret % not found', v_secret_id;
  END IF;

  INSERT INTO public.payment_provider_events (
    tenant_id,
    organization_id,
    brand_id,
    location_id,
    provider,
    provider_event_type,
    owner_type,
    owner_id,
    bank_account_id,
    status,
    payload
  )
  SELECT
    tenant_id,
    organization_id,
    brand_id,
    location_id,
    'internal',
    'bank_secret_retrieved_for_provider',
    owner_type,
    owner_id,
    id,
    'processed',
    jsonb_build_object('bank_account_id', id, 'retrieved_at', now())
  FROM public.bank_accounts
  WHERE id = p_bank_account_id;

  RETURN v_secret::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_payment_provider_event(
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.payment_provider_events (
    tenant_id,
    organization_id,
    brand_id,
    location_id,
    provider,
    provider_event_type,
    provider_event_ref,
    owner_type,
    owner_id,
    bank_account_id,
    payment_id,
    invoice_id,
    status,
    payload
  )
  VALUES (
    NULLIF(p_payload->>'tenant_id', '')::uuid,
    NULLIF(p_payload->>'organization_id', '')::uuid,
    NULLIF(p_payload->>'brand_id', '')::uuid,
    NULLIF(p_payload->>'location_id', '')::uuid,
    COALESCE(NULLIF(p_payload->>'provider', ''), 'internal'),
    COALESCE(NULLIF(p_payload->>'provider_event_type', ''), 'generic_event'),
    NULLIF(p_payload->>'provider_event_ref', ''),
    NULLIF(p_payload->>'owner_type', ''),
    NULLIF(p_payload->>'owner_id', '')::uuid,
    NULLIF(p_payload->>'bank_account_id', '')::uuid,
    NULLIF(p_payload->>'payment_id', '')::uuid,
    NULLIF(p_payload->>'invoice_id', '')::uuid,
    COALESCE(NULLIF(p_payload->>'status', ''), 'received'),
    COALESCE(p_payload->'payload', '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'bank_accounts',
    'bank_account_provider_links',
    'payment_provider_configs',
    'payment_provider_compliance_profiles',
    'payment_terms_acceptances',
    'provider_country_rules',
    'provider_requirement_snapshots',
    'provider_risk_reviews',
    'provider_active_account_fees',
    'payment_fee_policies',
    'payment_fee_events',
    'payment_provider_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_table);
  END LOOP;
END $$;

CREATE POLICY bank_accounts_scope_select ON public.bank_accounts
  FOR SELECT USING (
    deleted_at IS NULL
    AND (
      public.get_auth_role() = 'platform_admin'
      OR organization_id = public.get_auth_org()
      OR (tenant_id IS NOT NULL AND tenant_id = public.get_auth_tenant())
    )
  );

CREATE POLICY bank_accounts_scope_insert ON public.bank_accounts
  FOR INSERT WITH CHECK (
    public.get_auth_role() = 'platform_admin'
    OR public.reference_scope_writable(organization_id, brand_id, location_id, NULL, 'location_manager')
    OR (tenant_id IS NOT NULL AND tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'tenant_super_admin')
  );

CREATE POLICY bank_accounts_scope_update ON public.bank_accounts
  FOR UPDATE USING (
    public.get_auth_role() = 'platform_admin'
    OR public.reference_scope_writable(organization_id, brand_id, location_id, deleted_at, 'location_manager')
    OR (tenant_id IS NOT NULL AND tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'tenant_super_admin')
  )
  WITH CHECK (
    public.get_auth_role() = 'platform_admin'
    OR public.reference_scope_writable(organization_id, brand_id, location_id, deleted_at, 'location_manager')
    OR (tenant_id IS NOT NULL AND tenant_id = public.get_auth_tenant() AND public.get_auth_role() = 'tenant_super_admin')
  );

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'bank_account_provider_links',
    'payment_provider_configs',
    'payment_terms_acceptances',
    'provider_requirement_snapshots',
    'provider_risk_reviews',
    'provider_active_account_fees',
    'payment_fee_policies',
    'payment_fee_events',
    'payment_provider_events'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (public.get_auth_role() = ''platform_admin'' OR organization_id = public.get_auth_org() OR (tenant_id IS NOT NULL AND tenant_id = public.get_auth_tenant()))',
      v_table || '_scope_select',
      v_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (public.get_auth_role() = ''platform_admin'' OR public.reference_scope_writable(organization_id, brand_id, location_id, NULL, ''location_manager'') OR (tenant_id IS NOT NULL AND tenant_id = public.get_auth_tenant() AND public.get_auth_role() = ''tenant_super_admin''))',
      v_table || '_scope_insert',
      v_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE USING (public.get_auth_role() = ''platform_admin'' OR public.reference_scope_writable(organization_id, brand_id, location_id, NULL, ''location_manager'') OR (tenant_id IS NOT NULL AND tenant_id = public.get_auth_tenant() AND public.get_auth_role() = ''tenant_super_admin'')) WITH CHECK (public.get_auth_role() = ''platform_admin'' OR public.reference_scope_writable(organization_id, brand_id, location_id, NULL, ''location_manager'') OR (tenant_id IS NOT NULL AND tenant_id = public.get_auth_tenant() AND public.get_auth_role() = ''tenant_super_admin''))',
      v_table || '_scope_update',
      v_table
    );
  END LOOP;
END $$;

CREATE POLICY payment_provider_compliance_profiles_read ON public.payment_provider_compliance_profiles
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY provider_country_rules_read ON public.provider_country_rules
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

REVOKE ALL ON public.bank_accounts FROM anon, authenticated;
REVOKE ALL ON public.bank_account_provider_links FROM anon, authenticated;
REVOKE ALL ON public.payment_provider_configs FROM anon, authenticated;
REVOKE ALL ON public.payment_terms_acceptances FROM anon, authenticated;
REVOKE ALL ON public.provider_requirement_snapshots FROM anon, authenticated;
REVOKE ALL ON public.provider_risk_reviews FROM anon, authenticated;
REVOKE ALL ON public.provider_active_account_fees FROM anon, authenticated;
REVOKE ALL ON public.payment_fee_policies FROM anon, authenticated;
REVOKE ALL ON public.payment_fee_events FROM anon, authenticated;
REVOKE ALL ON public.payment_provider_events FROM anon, authenticated;

GRANT SELECT (
  id, tenant_id, organization_id, brand_id, location_id, owner_type, owner_id,
  payment_account_id, account_holder_name, bank_name, account_type,
  routing_last4, account_last4, verification_status, default_for_owner,
  is_active, created_by_user_id, created_by_role, approved_by_user_id,
  approved_by_role, approved_at, metadata, created_at, updated_at, deleted_at
) ON public.bank_accounts TO authenticated;

GRANT SELECT ON public.bank_account_provider_links TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payment_provider_configs TO authenticated;
GRANT SELECT ON public.payment_provider_compliance_profiles TO authenticated;
GRANT SELECT, INSERT ON public.payment_terms_acceptances TO authenticated;
GRANT SELECT ON public.provider_country_rules TO authenticated;
GRANT SELECT ON public.provider_requirement_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.provider_risk_reviews TO authenticated;
GRANT SELECT ON public.provider_active_account_fees TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payment_fee_policies TO authenticated;
GRANT SELECT, INSERT ON public.payment_fee_events TO authenticated;
GRANT SELECT ON public.payment_provider_events TO authenticated;

GRANT ALL ON public.bank_accounts TO service_role;
GRANT ALL ON public.bank_account_provider_links TO service_role;
GRANT ALL ON public.payment_provider_configs TO service_role;
GRANT ALL ON public.payment_provider_compliance_profiles TO service_role;
GRANT ALL ON public.payment_terms_acceptances TO service_role;
GRANT ALL ON public.provider_country_rules TO service_role;
GRANT ALL ON public.provider_requirement_snapshots TO service_role;
GRANT ALL ON public.provider_risk_reviews TO service_role;
GRANT ALL ON public.provider_active_account_fees TO service_role;
GRANT ALL ON public.payment_fee_policies TO service_role;
GRANT ALL ON public.payment_fee_events TO service_role;
GRANT ALL ON public.payment_provider_events TO service_role;

REVOKE ALL ON FUNCTION public.store_bank_account_secret(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_bank_account_secret_for_provider(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.resolve_payment_provider_config(uuid, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_payment_provider_event(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.store_bank_account_secret(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_bank_account_secret_for_provider(uuid) TO service_role;

COMMIT;


