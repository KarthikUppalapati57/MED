-- Vendor AP routing controls for reconciliation-driven payment routing.
-- Keeps historical invoice routing stable by resolving vendor rules onto invoices at approval time.

BEGIN;

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS ap_routing_preference TEXT NOT NULL DEFAULT 'payments',
  ADD COLUMN IF NOT EXISTS ap_routing_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ap_routing_updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS ap_routing_destination TEXT,
  ADD COLUMN IF NOT EXISTS ap_routing_resolved_at TIMESTAMPTZ;

ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS vendors_ap_routing_preference_check;
ALTER TABLE public.vendors
  ADD CONSTRAINT vendors_ap_routing_preference_check
  CHECK (ap_routing_preference IN ('payments', 'storage', 'accounting', 'manual_paid_only'));


ALTER TABLE public.vendors DROP CONSTRAINT IF EXISTS vendors_file_routing_preference_check;
ALTER TABLE public.vendors
  ADD CONSTRAINT vendors_file_routing_preference_check
  CHECK (file_routing_preference IS NULL OR file_routing_preference IN ('storage', 'payments', 'accounting'));
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_ap_routing_destination_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_ap_routing_destination_check
  CHECK (ap_routing_destination IS NULL OR ap_routing_destination IN ('payments', 'storage', 'accounting', 'manual_paid_only'));

COMMENT ON COLUMN public.vendors.ap_routing_preference IS
  'Controls where newly approved invoices from this vendor route: payments, storage, accounting, or manual_paid_only.';
COMMENT ON COLUMN public.invoices.ap_routing_destination IS
  'Resolved AP routing destination captured at approval time so historical invoices are stable if vendor settings change later.';

CREATE INDEX IF NOT EXISTS idx_vendors_org_ap_routing
  ON public.vendors (organization_id, ap_routing_preference);
CREATE INDEX IF NOT EXISTS idx_invoices_org_ap_routing_status
  ON public.invoices (organization_id, ap_routing_destination, status, payment_status);

ALTER TABLE tenant_template.vendors
  ADD COLUMN IF NOT EXISTS ap_routing_preference TEXT NOT NULL DEFAULT 'payments',
  ADD COLUMN IF NOT EXISTS ap_routing_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ap_routing_updated_by UUID;

ALTER TABLE tenant_template.invoices
  ADD COLUMN IF NOT EXISTS ap_routing_destination TEXT,
  ADD COLUMN IF NOT EXISTS ap_routing_resolved_at TIMESTAMPTZ;

ALTER TABLE tenant_template.vendors DROP CONSTRAINT IF EXISTS vendors_ap_routing_preference_check;
ALTER TABLE tenant_template.vendors
  ADD CONSTRAINT vendors_ap_routing_preference_check
  CHECK (ap_routing_preference IN ('payments', 'storage', 'accounting', 'manual_paid_only'));


ALTER TABLE tenant_template.vendors DROP CONSTRAINT IF EXISTS vendors_file_routing_preference_check;
ALTER TABLE tenant_template.vendors
  ADD CONSTRAINT vendors_file_routing_preference_check
  CHECK (file_routing_preference IS NULL OR file_routing_preference IN ('storage', 'payments', 'accounting'));
ALTER TABLE tenant_template.invoices DROP CONSTRAINT IF EXISTS invoices_ap_routing_destination_check;
ALTER TABLE tenant_template.invoices
  ADD CONSTRAINT invoices_ap_routing_destination_check
  CHECK (ap_routing_destination IS NULL OR ap_routing_destination IN ('payments', 'storage', 'accounting', 'manual_paid_only'));

CREATE INDEX IF NOT EXISTS idx_tenant_template_vendors_org_ap_routing
  ON tenant_template.vendors (organization_id, ap_routing_preference);
CREATE INDEX IF NOT EXISTS idx_tenant_template_invoices_org_ap_routing_status
  ON tenant_template.invoices (organization_id, ap_routing_destination, status, payment_status);

DO $$
DECLARE
  schema_record RECORD;
BEGIN
  FOR schema_record IN
    SELECT schema_name
    FROM public.tenant_registry
    WHERE schema_name IS NOT NULL
      AND schema_name ~ '^tenant_[a-z0-9_]+$'
      AND to_regnamespace(schema_name) IS NOT NULL
  LOOP
    EXECUTE format('ALTER TABLE %I.vendors ADD COLUMN IF NOT EXISTS ap_routing_preference TEXT NOT NULL DEFAULT ''payments'';', schema_record.schema_name);
    EXECUTE format('ALTER TABLE %I.vendors ADD COLUMN IF NOT EXISTS ap_routing_updated_at TIMESTAMPTZ;', schema_record.schema_name);
    EXECUTE format('ALTER TABLE %I.vendors ADD COLUMN IF NOT EXISTS ap_routing_updated_by UUID;', schema_record.schema_name);
    EXECUTE format('ALTER TABLE %I.invoices ADD COLUMN IF NOT EXISTS ap_routing_destination TEXT;', schema_record.schema_name);
    EXECUTE format('ALTER TABLE %I.invoices ADD COLUMN IF NOT EXISTS ap_routing_resolved_at TIMESTAMPTZ;', schema_record.schema_name);

    EXECUTE format('ALTER TABLE %I.vendors DROP CONSTRAINT IF EXISTS vendors_ap_routing_preference_check;', schema_record.schema_name);
    EXECUTE format('ALTER TABLE %I.vendors ADD CONSTRAINT vendors_ap_routing_preference_check CHECK (ap_routing_preference IN (''payments'', ''storage'', ''accounting'', ''manual_paid_only''));', schema_record.schema_name);
    EXECUTE format('ALTER TABLE %I.vendors DROP CONSTRAINT IF EXISTS vendors_file_routing_preference_check;', schema_record.schema_name);
    EXECUTE format('ALTER TABLE %I.vendors ADD CONSTRAINT vendors_file_routing_preference_check CHECK (file_routing_preference IS NULL OR file_routing_preference IN (''storage'', ''payments'', ''accounting''));', schema_record.schema_name);
    EXECUTE format('ALTER TABLE %I.invoices DROP CONSTRAINT IF EXISTS invoices_ap_routing_destination_check;', schema_record.schema_name);
    EXECUTE format('ALTER TABLE %I.invoices ADD CONSTRAINT invoices_ap_routing_destination_check CHECK (ap_routing_destination IS NULL OR ap_routing_destination IN (''payments'', ''storage'', ''accounting'', ''manual_paid_only''));', schema_record.schema_name);

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.vendors (organization_id, ap_routing_preference);', 'idx_' || left(schema_record.schema_name, 30) || '_vendors_ap_routing', schema_record.schema_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.invoices (organization_id, ap_routing_destination, status, payment_status);', 'idx_' || left(schema_record.schema_name, 30) || '_invoices_ap_route_status', schema_record.schema_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.update_vendor_ap_routing(
  p_vendor_id UUID,
  p_ap_routing_preference TEXT,
  p_organization_id UUID DEFAULT NULL,
  p_source TEXT DEFAULT 'reconciliation'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = ''
AS $$
DECLARE
  target_org UUID;
  route JSONB;
  target_schema TEXT;
  old_preference TEXT;
  updated_vendor JSONB;
  sql TEXT;
BEGIN
  IF p_vendor_id IS NULL THEN
    RAISE EXCEPTION 'vendor id is required';
  END IF;

  IF p_ap_routing_preference NOT IN ('payments', 'storage', 'accounting', 'manual_paid_only') THEN
    RAISE EXCEPTION 'Invalid AP routing preference: %', p_ap_routing_preference;
  END IF;

  IF NOT public.is_manager_or_above() AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Insufficient permissions to update vendor AP routing';
  END IF;

  target_org := COALESCE(p_organization_id, public.get_my_org());
  PERFORM public.assert_tenant_scope(target_org, NULL, NULL);

  route := public.get_tenant_data_route(target_org, NULL, NULL);
  target_schema := COALESCE(route->>'write_target', 'public');

  IF target_schema <> 'public' AND target_schema !~ '^tenant_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Unsafe tenant target schema: %', target_schema;
  END IF;

  IF to_regclass(format('%I.vendors', target_schema)) IS NULL THEN
    RAISE EXCEPTION 'Routed vendor table does not exist: %.vendors', target_schema;
  END IF;

  sql := format('SELECT ap_routing_preference FROM %I.vendors WHERE id = $1 AND organization_id = $2', target_schema);
  EXECUTE sql USING p_vendor_id, target_org INTO old_preference;

  IF old_preference IS NULL THEN
    RAISE EXCEPTION 'Vendor not found for organization';
  END IF;

  sql := format(
    'UPDATE %I.vendors
       SET ap_routing_preference = $1,
           ap_routing_updated_at = now(),
           ap_routing_updated_by = auth.uid(),
           file_routing_preference = CASE
             WHEN $1 IN (''payments'', ''storage'', ''accounting'') THEN $1
             ELSE file_routing_preference
           END
     WHERE id = $2 AND organization_id = $3
     RETURNING to_jsonb(%I.vendors.*)',
    target_schema,
    target_schema
  );
  EXECUTE sql USING p_ap_routing_preference, p_vendor_id, target_org INTO updated_vendor;

  INSERT INTO public.audit_logs (
    organization_id,
    user_id,
    action,
    table_name,
    record_id,
    module,
    entity_type,
    entity_id,
    field_changed,
    old_value,
    new_value,
    details,
    created_at
  ) VALUES (
    target_org,
    auth.uid(),
    'vendor_ap_routing_changed',
    'vendors',
    p_vendor_id,
    'reconciliation',
    'vendor',
    p_vendor_id::TEXT,
    'ap_routing_preference',
    old_preference,
    p_ap_routing_preference,
    'Vendor AP routing changed from ' || old_preference || ' to ' || p_ap_routing_preference || ' via ' || COALESCE(p_source, 'reconciliation'),
    now()
  );

  RETURN updated_vendor;
END;
$$;

REVOKE ALL ON FUNCTION public.update_vendor_ap_routing(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_vendor_ap_routing(UUID, TEXT, UUID, TEXT) TO authenticated, service_role;

COMMIT;


