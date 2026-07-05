BEGIN;

ALTER TABLE public.vendor_payment_provider_links
  DROP CONSTRAINT IF EXISTS vendor_payment_provider_links_provider_check;

ALTER TABLE public.vendor_payment_provider_links
  ADD CONSTRAINT vendor_payment_provider_links_provider_check
  CHECK (provider IN ('dwolla', 'stripe', 'plaid', 'checkbook'));

COMMENT ON COLUMN public.vendors.dwolla_customer_url IS
  'Legacy Dwolla vendor/destination customer ref. Retire in V1c-b after edge readers migrate to vendor_payment_provider_links.';
COMMENT ON COLUMN public.vendors.dwolla_onboarding_status IS
  'Legacy Dwolla vendor/destination provider status. Retire in V1c-b after edge readers migrate to vendor_payment_provider_links.';
COMMENT ON COLUMN public.payment_accounts.dwolla_funding_source_url IS
  'Dwolla tenant/source funding ref for transfers. Intentionally remains on payment_accounts; vendor_payment_provider_links stores destination/vendor keys only.';
COMMENT ON COLUMN public.payments.dwolla_transfer_url IS
  'Dwolla per-transfer ref; not a reusable vendor provider key and not migrated to vendor_payment_provider_links.';
COMMENT ON COLUMN public.payments.checkbook_check_id IS
  'Checkbook per-check ref; not a reusable vendor provider key and not migrated to vendor_payment_provider_links.';

INSERT INTO public.vendor_payment_provider_links (
  vendor_id,
  organization_id,
  brand_id,
  location_id,
  provider,
  provider_customer_ref,
  provider_status,
  is_active,
  created_at,
  updated_at
)
SELECT
  v.id,
  v.organization_id,
  v.brand_id,
  v.location_id,
  'dwolla',
  NULLIF(btrim(v.dwolla_customer_url), ''),
  NULLIF(btrim(v.dwolla_onboarding_status), ''),
  true,
  now(),
  now()
FROM public.vendors v
WHERE NULLIF(btrim(v.dwolla_customer_url), '') IS NOT NULL
ON CONFLICT (vendor_id, provider) WHERE deleted_at IS NULL
DO UPDATE SET
  provider_customer_ref = EXCLUDED.provider_customer_ref,
  provider_status = EXCLUDED.provider_status,
  is_active = true,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.get_vendor_provider_link(
  p_vendor_id uuid,
  p_provider text
)
RETURNS TABLE (
  id uuid,
  vendor_id uuid,
  organization_id uuid,
  brand_id uuid,
  location_id uuid,
  provider text,
  provider_customer_ref text,
  provider_funding_ref text,
  provider_status text,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Ponytail: provider-links hold vendor/destination keys only. Tenant/source
  -- funding refs stay on payment_accounts. Checkbook creates a row here only
  -- if a future adapter registers a reusable vendor token to store.
  SELECT vpl.id,
         vpl.vendor_id,
         vpl.organization_id,
         vpl.brand_id,
         vpl.location_id,
         vpl.provider,
         vpl.provider_customer_ref,
         vpl.provider_funding_ref,
         vpl.provider_status,
         vpl.is_active
  FROM public.vendor_payment_provider_links vpl
  WHERE vpl.vendor_id = p_vendor_id
    AND vpl.provider = lower(btrim(p_provider))
    AND vpl.is_active = true
    AND vpl.deleted_at IS NULL
  ORDER BY vpl.updated_at DESC, vpl.created_at DESC, vpl.id DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_vendor_provider_link(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_vendor_provider_link(uuid, text) TO service_role;

COMMIT;