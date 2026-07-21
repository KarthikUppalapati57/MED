-- Repair vendor operational columns required by vendor list, onboarding,
-- AP routing, and accounting controls. This is intentionally idempotent so
-- drifted live databases can be brought back to the app contract safely.

BEGIN;

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS zip_code text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'USA',
  ADD COLUMN IF NOT EXISTS payment_terms text DEFAULT 'net_30',
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS whatsapp_number text,
  ADD COLUMN IF NOT EXISTS total_orders integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_status text DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS ap_routing_preference text NOT NULL DEFAULT 'payments',
  ADD COLUMN IF NOT EXISTS ap_routing_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS ap_routing_updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_commissary_vendor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_internal_transfer_vendor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allowed_expense_categories text[],
  ADD COLUMN IF NOT EXISTS use_org_accounting_defaults boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS exclude_from_accounting boolean NOT NULL DEFAULT false;

ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS vendors_ap_routing_preference_check;
ALTER TABLE public.vendors
  ADD CONSTRAINT vendors_ap_routing_preference_check
  CHECK (ap_routing_preference IN ('payments', 'storage', 'accounting', 'manual_paid_only')) NOT VALID;

ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS vendors_file_routing_preference_check;
ALTER TABLE public.vendors
  ADD CONSTRAINT vendors_file_routing_preference_check
  CHECK (file_routing_preference IS NULL OR file_routing_preference IN ('storage', 'payments', 'accounting')) NOT VALID;

ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS vendors_payment_terms_check;
ALTER TABLE public.vendors
  ADD CONSTRAINT vendors_payment_terms_check
  CHECK (payment_terms IS NULL OR payment_terms IN ('net_15', 'net_30', 'net_45', 'net_60', 'due_on_receipt')) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_vendors_org_ap_routing
  ON public.vendors (organization_id, ap_routing_preference);

DO $$
BEGIN
  IF to_regclass('tenant_template.vendors') IS NOT NULL THEN
    ALTER TABLE tenant_template.vendors
      ADD COLUMN IF NOT EXISTS contact_name text,
      ADD COLUMN IF NOT EXISTS phone text,
      ADD COLUMN IF NOT EXISTS address text,
      ADD COLUMN IF NOT EXISTS city text,
      ADD COLUMN IF NOT EXISTS state text,
      ADD COLUMN IF NOT EXISTS zip_code text,
      ADD COLUMN IF NOT EXISTS country text DEFAULT 'USA',
      ADD COLUMN IF NOT EXISTS payment_terms text DEFAULT 'net_30',
      ADD COLUMN IF NOT EXISTS notes text,
      ADD COLUMN IF NOT EXISTS whatsapp_number text,
      ADD COLUMN IF NOT EXISTS total_orders integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS onboarding_status text DEFAULT 'completed',
      ADD COLUMN IF NOT EXISTS ap_routing_preference text NOT NULL DEFAULT 'payments',
      ADD COLUMN IF NOT EXISTS ap_routing_updated_at timestamptz,
      ADD COLUMN IF NOT EXISTS ap_routing_updated_by uuid,
      ADD COLUMN IF NOT EXISTS is_commissary_vendor boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_internal_transfer_vendor boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS allowed_expense_categories text[],
      ADD COLUMN IF NOT EXISTS use_org_accounting_defaults boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS exclude_from_accounting boolean NOT NULL DEFAULT false;

    ALTER TABLE tenant_template.vendors DROP CONSTRAINT IF EXISTS vendors_ap_routing_preference_check;
    ALTER TABLE tenant_template.vendors
      ADD CONSTRAINT vendors_ap_routing_preference_check
      CHECK (ap_routing_preference IN ('payments', 'storage', 'accounting', 'manual_paid_only')) NOT VALID;

    ALTER TABLE tenant_template.vendors DROP CONSTRAINT IF EXISTS vendors_file_routing_preference_check;
    ALTER TABLE tenant_template.vendors
      ADD CONSTRAINT vendors_file_routing_preference_check
      CHECK (file_routing_preference IS NULL OR file_routing_preference IN ('storage', 'payments', 'accounting')) NOT VALID;

    ALTER TABLE tenant_template.vendors DROP CONSTRAINT IF EXISTS vendors_payment_terms_check;
    ALTER TABLE tenant_template.vendors
      ADD CONSTRAINT vendors_payment_terms_check
      CHECK (payment_terms IS NULL OR payment_terms IN ('net_15', 'net_30', 'net_45', 'net_60', 'due_on_receipt')) NOT VALID;

    CREATE INDEX IF NOT EXISTS idx_tenant_template_vendors_org_ap_routing
      ON tenant_template.vendors (organization_id, ap_routing_preference);
  END IF;
END $$;

DO $$
DECLARE
  schema_record record;
BEGIN
  IF to_regclass('public.tenant_registry') IS NULL THEN
    RETURN;
  END IF;

  FOR schema_record IN
    SELECT schema_name
    FROM public.tenant_registry
    WHERE schema_name IS NOT NULL
      AND schema_name ~ '^tenant_[a-z0-9_]+$'
      AND to_regnamespace(schema_name) IS NOT NULL
      AND to_regclass(format('%I.vendors', schema_name)) IS NOT NULL
  LOOP
    EXECUTE format($sql$
      ALTER TABLE %I.vendors
        ADD COLUMN IF NOT EXISTS contact_name text,
        ADD COLUMN IF NOT EXISTS phone text,
        ADD COLUMN IF NOT EXISTS address text,
        ADD COLUMN IF NOT EXISTS city text,
        ADD COLUMN IF NOT EXISTS state text,
        ADD COLUMN IF NOT EXISTS zip_code text,
        ADD COLUMN IF NOT EXISTS country text DEFAULT 'USA',
        ADD COLUMN IF NOT EXISTS payment_terms text DEFAULT 'net_30',
        ADD COLUMN IF NOT EXISTS notes text,
        ADD COLUMN IF NOT EXISTS whatsapp_number text,
        ADD COLUMN IF NOT EXISTS total_orders integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS onboarding_status text DEFAULT 'completed',
        ADD COLUMN IF NOT EXISTS ap_routing_preference text NOT NULL DEFAULT 'payments',
        ADD COLUMN IF NOT EXISTS ap_routing_updated_at timestamptz,
        ADD COLUMN IF NOT EXISTS ap_routing_updated_by uuid,
        ADD COLUMN IF NOT EXISTS is_commissary_vendor boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS is_internal_transfer_vendor boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS allowed_expense_categories text[],
        ADD COLUMN IF NOT EXISTS use_org_accounting_defaults boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS exclude_from_accounting boolean NOT NULL DEFAULT false;
    $sql$, schema_record.schema_name);

    EXECUTE format('ALTER TABLE %I.vendors DROP CONSTRAINT IF EXISTS vendors_ap_routing_preference_check;', schema_record.schema_name);
    EXECUTE format('ALTER TABLE %I.vendors ADD CONSTRAINT vendors_ap_routing_preference_check CHECK (ap_routing_preference IN (''payments'', ''storage'', ''accounting'', ''manual_paid_only'')) NOT VALID;', schema_record.schema_name);
    EXECUTE format('ALTER TABLE %I.vendors DROP CONSTRAINT IF EXISTS vendors_file_routing_preference_check;', schema_record.schema_name);
    EXECUTE format('ALTER TABLE %I.vendors ADD CONSTRAINT vendors_file_routing_preference_check CHECK (file_routing_preference IS NULL OR file_routing_preference IN (''storage'', ''payments'', ''accounting'')) NOT VALID;', schema_record.schema_name);
    EXECUTE format('ALTER TABLE %I.vendors DROP CONSTRAINT IF EXISTS vendors_payment_terms_check;', schema_record.schema_name);
    EXECUTE format('ALTER TABLE %I.vendors ADD CONSTRAINT vendors_payment_terms_check CHECK (payment_terms IS NULL OR payment_terms IN (''net_15'', ''net_30'', ''net_45'', ''net_60'', ''due_on_receipt'')) NOT VALID;', schema_record.schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.vendors (organization_id, ap_routing_preference);', 'idx_' || left(schema_record.schema_name, 30) || '_vendors_ap_routing', schema_record.schema_name);
  END LOOP;
END $$;

COMMIT;