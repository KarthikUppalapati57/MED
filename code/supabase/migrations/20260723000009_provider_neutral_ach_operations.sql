BEGIN;

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'vendor_funding'
    CHECK (purpose IN ('platform_billing', 'vendor_funding', 'vendor_receiving', 'backup', 'location_specific')),
  ADD COLUMN IF NOT EXISTS nickname text;

DROP INDEX IF EXISTS public.bank_accounts_owner_default_active_idx;

CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_owner_purpose_default_active_idx
  ON public.bank_accounts (
    tenant_id,
    organization_id,
    COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    owner_type,
    owner_id,
    purpose
  )
  WHERE default_for_owner = true AND is_active = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS bank_accounts_purpose_scope_idx
  ON public.bank_accounts (tenant_id, organization_id, brand_id, location_id, purpose, default_for_owner)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.clear_bank_account_default_for_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.default_for_owner IS TRUE AND NEW.is_active IS TRUE AND NEW.deleted_at IS NULL THEN
    UPDATE public.bank_accounts
       SET default_for_owner = false,
           updated_at = now()
     WHERE id <> NEW.id
       AND default_for_owner = true
       AND is_active = true
       AND deleted_at IS NULL
       AND COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(NEW.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
       AND COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(NEW.organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
       AND COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(NEW.brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
       AND COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(NEW.location_id, '00000000-0000-0000-0000-000000000000'::uuid)
       AND owner_type = NEW.owner_type
       AND owner_id = NEW.owner_id
       AND purpose = NEW.purpose;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clear_bank_account_default_for_scope ON public.bank_accounts;
CREATE TRIGGER clear_bank_account_default_for_scope
  BEFORE INSERT OR UPDATE OF default_for_owner, is_active, deleted_at, purpose, tenant_id, organization_id, brand_id, location_id, owner_type, owner_id
  ON public.bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_bank_account_default_for_scope();

CREATE OR REPLACE VIEW public.payment_fee_counters AS
SELECT
  tenant_id,
  organization_id,
  brand_id,
  location_id,
  provider,
  date_trunc('month', created_at)::date AS month,
  COALESCE(sum(total_fee_amount) FILTER (WHERE fee_paid_by = 'client'), 0)::numeric(12, 2) AS total_fees_charged_to_clients,
  COALESCE(sum(total_fee_amount) FILTER (WHERE fee_paid_by = 'platform'), 0)::numeric(12, 2) AS total_fees_paid_by_platform,
  COALESCE(sum(provider_fee_amount), 0)::numeric(12, 2) AS total_provider_fees,
  COALESCE(sum(total_fee_amount) FILTER (WHERE fee_paid_by = 'client'), 0)::numeric(12, 2)
    - COALESCE(sum(provider_fee_amount), 0)::numeric(12, 2) AS net_fee_recovery,
  count(*) AS fee_event_count
FROM public.payment_fee_events
GROUP BY tenant_id, organization_id, brand_id, location_id, provider, date_trunc('month', created_at)::date;

GRANT SELECT (
  id, tenant_id, organization_id, brand_id, location_id, owner_type, owner_id,
  purpose, nickname, payment_account_id, account_holder_name, bank_name, account_type,
  routing_last4, account_last4, verification_status, default_for_owner,
  is_active, created_by_user_id, created_by_role, approved_by_user_id,
  approved_by_role, approved_at, metadata, created_at, updated_at, deleted_at
) ON public.bank_accounts TO authenticated;

GRANT SELECT ON public.payment_fee_counters TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.clear_bank_account_default_for_scope() TO service_role;

COMMIT;
