-- Enterprise hardening for developer secrets.
-- Secrets are generated server-side and only a prefix is exposed to the UI.

ALTER TABLE public.webhook_endpoints
  ADD COLUMN IF NOT EXISTS secret_prefix TEXT;

UPDATE public.webhook_endpoints
SET secret_prefix = left(secret, 12)
WHERE secret_prefix IS NULL AND secret IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_api_keys_org_created
  ON public.api_keys(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_org_created
  ON public.webhook_endpoints(organization_id, created_at DESC);
