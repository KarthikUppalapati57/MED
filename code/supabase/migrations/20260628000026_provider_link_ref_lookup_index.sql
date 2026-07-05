BEGIN;

-- Money movement webhook invariant: each provider/customer ref maps to exactly
-- one non-deleted vendor provider link. No is_active predicate because provider
-- webhooks may arrive after a link is deactivated.
CREATE UNIQUE INDEX IF NOT EXISTS vendor_payment_provider_links_provider_customer_ref_uidx
  ON public.vendor_payment_provider_links (provider, provider_customer_ref)
  WHERE deleted_at IS NULL;

COMMIT;