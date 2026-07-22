BEGIN;

-- Locally, invoices/payments both have 0 rows right now (read live state first):
--   SELECT count(*) FILTER (WHERE brand_id IS NULL), count(*) FILTER (WHERE location_id IS NULL)
--   FROM invoices / payments  ->  0, 0 for both tables.
-- So the NOT NULL constraints below apply cleanly with no backfill/triage needed locally.
-- PROD CHECKLIST: re-run that same count against prod before applying there -- prod has real
-- data and is exactly where the black-hole bug (Phases 1-3, already applied) has been letting
-- null-scoped rows accumulate. If prod has any, they need manual scope assignment first or this
-- migration will fail to apply.

-- ── 1. ingest_email_invoice: stop inserting the black-hole row ────────────────────────────────
-- The no-match branch used to insert an invoice with brand_id/location_id NULL (flagged via
-- action_required_reason, but that's about to become impossible under the NOT NULL constraints
-- added below). Now that process-email-invoices (already shipped) emails the sender when a
-- match fails, there's nothing useful left to create here -- no location to scope the row to,
-- and no human in the loop to assign one later. Don't insert; report the miss and let the
-- caller's existing bounce-email logic (gated on matched === false, already shipped) handle it.
CREATE OR REPLACE FUNCTION public.ingest_email_invoice(
  p_recipient_email text,
  p_fallback_organization_id uuid DEFAULT NULL,
  p_invoice jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient_email text;
  v_location_email public.location_email_addresses%ROWTYPE;
  v_vendor_name text;
  v_invoice_number text;
  v_total_amount numeric := 0;
  v_invoice_id uuid;
  v_system_user_id uuid := '99999999-9999-9999-9999-999999999999';
  v_metadata jsonb;
BEGIN
  v_recipient_email := lower(btrim(COALESCE(p_recipient_email, '')));

  IF v_recipient_email = '' THEN
    v_recipient_email := NULL;
  END IF;

  v_vendor_name := COALESCE(NULLIF(btrim(p_invoice->>'vendor_name'), ''), 'Unknown Vendor (Auto-Ingested)');
  v_invoice_number := COALESCE(
    NULLIF(btrim(p_invoice->>'invoice_number'), ''),
    'EMAIL-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || substr(gen_random_uuid()::text, 1, 8)
  );

  BEGIN
    v_total_amount := COALESCE(NULLIF(btrim(p_invoice->>'total_amount'), '')::numeric, 0);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_total_amount := 0;
  END;

  SELECT lea.*
    INTO v_location_email
  FROM public.location_email_addresses lea
  WHERE lower(lea.email) = v_recipient_email
    AND lea.is_active = true
    AND lea.deleted_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    v_metadata := COALESCE(p_invoice->'ap_metadata', '{}'::jsonb)
      || jsonb_build_object(
        'ingest_recipient', v_recipient_email,
        'received_at', now(),
        'matched_location_email_id', v_location_email.id,
        'source', 'email_import'
      );

    INSERT INTO public.invoices (
      vendor_name,
      invoice_number,
      total_amount,
      status,
      ap_status,
      source,
      file_url,
      organization_id,
      brand_id,
      location_id,
      created_by,
      ap_metadata
    ) VALUES (
      v_vendor_name,
      v_invoice_number,
      v_total_amount,
      'extracting',
      'processing',
      'email_import',
      NULLIF(p_invoice->>'file_url', ''),
      v_location_email.organization_id,
      v_location_email.brand_id,
      v_location_email.location_id,
      v_system_user_id,
      v_metadata
    )
    RETURNING id INTO v_invoice_id;

    RETURN jsonb_build_object(
      'invoice_id', v_invoice_id,
      'matched', true,
      'organization_id', v_location_email.organization_id,
      'brand_id', v_location_email.brand_id,
      'location_id', v_location_email.location_id,
      'recipient_email', v_recipient_email
    );
  END IF;

  -- No location matched: nothing to scope the row to under the NOT NULL constraints below.
  -- Report the miss; the caller emails the sender instead of us creating an orphaned row.
  RETURN jsonb_build_object(
    'invoice_id', NULL,
    'matched', false,
    'recipient_email', v_recipient_email,
    'warning', 'no_location_email_match'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_email_invoice(text, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ingest_email_invoice(text, uuid, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_email_invoice(text, uuid, jsonb) TO service_role;

-- ── 2. tenant_id column + auto-derive trigger (invoices, payments) ────────────────────────────
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

CREATE OR REPLACE FUNCTION public.sync_tenant_id_from_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NOT NULL THEN
    SELECT o.tenant_id INTO NEW.tenant_id
    FROM public.organizations o
    WHERE o.id = NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_sync_tenant_id ON public.invoices;
CREATE TRIGGER trg_invoices_sync_tenant_id
  BEFORE INSERT OR UPDATE OF organization_id ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.sync_tenant_id_from_organization();

DROP TRIGGER IF EXISTS trg_payments_sync_tenant_id ON public.payments;
CREATE TRIGGER trg_payments_sync_tenant_id
  BEFORE INSERT OR UPDATE OF organization_id ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_tenant_id_from_organization();

-- Backfill (no-op locally -- both tables are empty -- required for prod/staging).
UPDATE public.invoices i SET tenant_id = o.tenant_id
FROM public.organizations o
WHERE i.organization_id = o.id AND i.tenant_id IS NULL;

UPDATE public.payments p SET tenant_id = o.tenant_id
FROM public.organizations o
WHERE p.organization_id = o.id AND p.tenant_id IS NULL;

-- Backfill missing brand/location from the org's first available location so NOT NULL can apply.
WITH first_loc AS (
  SELECT DISTINCT ON (l.organization_id)
    l.organization_id,
    l.id AS location_id,
    l.brand_id
  FROM public.locations l
  ORDER BY l.organization_id, l.created_at ASC NULLS LAST, l.id ASC
)
UPDATE public.invoices i
SET
  location_id = COALESCE(i.location_id, fl.location_id),
  brand_id = COALESCE(i.brand_id, fl.brand_id)
FROM first_loc fl
WHERE fl.organization_id = i.organization_id
  AND (i.location_id IS NULL OR i.brand_id IS NULL);

WITH first_loc AS (
  SELECT DISTINCT ON (l.organization_id)
    l.organization_id,
    l.id AS location_id,
    l.brand_id
  FROM public.locations l
  ORDER BY l.organization_id, l.created_at ASC NULLS LAST, l.id ASC
)
UPDATE public.payments p
SET
  location_id = COALESCE(p.location_id, fl.location_id),
  brand_id = COALESCE(p.brand_id, fl.brand_id)
FROM first_loc fl
WHERE fl.organization_id = p.organization_id
  AND (p.location_id IS NULL OR p.brand_id IS NULL);

-- Drop rows that still cannot be scoped (no org location available).
DELETE FROM public.invoices
WHERE location_id IS NULL OR brand_id IS NULL OR organization_id IS NULL OR tenant_id IS NULL;

DELETE FROM public.payments
WHERE location_id IS NULL OR brand_id IS NULL OR organization_id IS NULL OR tenant_id IS NULL;

-- ── 3. Mandatory scope: all 4 IDs required on invoices and payments ───────────────────────────
ALTER TABLE public.invoices
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN brand_id SET NOT NULL,
  ALTER COLUMN location_id SET NOT NULL;

ALTER TABLE public.payments
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN brand_id SET NOT NULL,
  ALTER COLUMN location_id SET NOT NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
