BEGIN;

UPDATE public.tenant_registry
SET read_mode = 'public',
    write_mode = 'public',
    status = CASE WHEN status = 'archived' THEN status ELSE 'active' END,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'schema_tenant_rpc_surface_retired_at', now(),
      'schema_tenant_rpc_surface_retired_by', '20260625000004_retire_schema_tenant_rpc_surface'
    ),
    updated_at = now()
WHERE read_mode IS DISTINCT FROM 'public'
   OR write_mode IS DISTINCT FROM 'public'
   OR status IN ('migrating', 'provisioning');

DO $$
DECLARE
  schema_record RECORD;
BEGIN
  FOR schema_record IN
    SELECT nspname AS schema_name
    FROM pg_namespace
    WHERE nspname = 'tenant_template'
       OR nspname ~ '^tenant_[a-z0-9_]+$'
  LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC, anon, authenticated', schema_record.schema_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM PUBLIC, anon, authenticated', schema_record.schema_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I FROM PUBLIC, anon, authenticated', schema_record.schema_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA %I FROM PUBLIC, anon, authenticated', schema_record.schema_name);
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS public.tenant_select_vendor_statements(UUID);
DROP FUNCTION IF EXISTS public.tenant_select_webhook_delivery_logs(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.tenant_insert_vendor_statement_lines(UUID, JSONB);

DROP FUNCTION IF EXISTS public.tenant_select_rows(TEXT, JSONB, JSONB, JSONB, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, BOOLEAN, BOOLEAN);
DROP FUNCTION IF EXISTS public.tenant_insert_row(TEXT, JSONB);
DROP FUNCTION IF EXISTS public.tenant_update_row(TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.tenant_delete_row(TEXT, TEXT, UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION public.update_vendor_ap_routing(
  p_vendor_id UUID,
  p_ap_routing_preference TEXT,
  p_organization_id UUID DEFAULT NULL,
  p_source TEXT DEFAULT 'reconciliation'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  target_org UUID;
  old_preference TEXT;
  updated_vendor JSONB;
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

  IF target_org IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF NOT (
    public.is_platform_admin()
    OR (SELECT auth.role()) = 'service_role'
    OR target_org = public.get_my_org()
  ) THEN
    RAISE EXCEPTION 'Organization is outside caller tenant scope';
  END IF;

  SELECT ap_routing_preference
  INTO old_preference
  FROM public.vendors
  WHERE id = p_vendor_id
    AND organization_id = target_org;

  IF old_preference IS NULL THEN
    RAISE EXCEPTION 'Vendor not found for organization';
  END IF;

  UPDATE public.vendors
     SET ap_routing_preference = p_ap_routing_preference,
         ap_routing_updated_at = now(),
         ap_routing_updated_by = auth.uid(),
         file_routing_preference = CASE
           WHEN p_ap_routing_preference IN ('payments', 'storage', 'accounting') THEN p_ap_routing_preference
           ELSE file_routing_preference
         END
   WHERE id = p_vendor_id
     AND organization_id = target_org
   RETURNING to_jsonb(public.vendors.*)
   INTO updated_vendor;

  INSERT INTO public.audit_logs (
    organization_id, user_id, action, table_name, record_id, module,
    entity_type, entity_id, field_changed, old_value, new_value, details, created_at
  ) VALUES (
    target_org, auth.uid(), 'vendor_ap_routing_changed', 'vendors', p_vendor_id, 'reconciliation',
    'vendor', p_vendor_id::TEXT, 'ap_routing_preference', old_preference, p_ap_routing_preference,
    'Vendor AP routing changed from ' || old_preference || ' to ' || p_ap_routing_preference || ' via ' || COALESCE(p_source, 'reconciliation'),
    now()
  );

  RETURN updated_vendor;
END;
$fn$;

REVOKE ALL ON FUNCTION public.update_vendor_ap_routing(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_vendor_ap_routing(UUID, TEXT, UUID, TEXT) TO authenticated, service_role;
DROP FUNCTION IF EXISTS public.apply_tenant_pilot_write_cutover(UUID, TEXT);
DROP FUNCTION IF EXISTS public.apply_tenant_pilot_read_cutover(UUID, TEXT);
DROP FUNCTION IF EXISTS public.prepare_tenant_pilot_cutover(UUID);
DROP FUNCTION IF EXISTS public.select_tenant_pilot_cutover(UUID, TEXT);
DROP FUNCTION IF EXISTS public.complete_tenant_pilot_cutover(UUID, TEXT);
DROP FUNCTION IF EXISTS public.abort_tenant_pilot_cutover(UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_tenant_pilot_cutovers(UUID);

DROP FUNCTION IF EXISTS public.set_tenant_write_mode(UUID, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.set_tenant_write_mode(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_tenant_write_cutover_status(UUID);
DROP FUNCTION IF EXISTS public.set_tenant_read_mode(UUID, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.get_tenant_cutover_status(UUID);

DROP FUNCTION IF EXISTS public.refresh_all_tenant_reporting_snapshots(INTEGER);
DROP FUNCTION IF EXISTS public.refresh_tenant_reporting_snapshot(UUID);
DROP FUNCTION IF EXISTS public.get_tenant_reporting_snapshots(UUID);

DROP FUNCTION IF EXISTS public.get_tenant_data_route(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS public.resolve_tenant_schema(UUID);
DROP FUNCTION IF EXISTS public.get_tenant_runtime(UUID);

COMMENT ON TABLE public.tenant_registry IS
  'Deprecated tenant control-plane registry retained for historical audit only. MEVS runtime tenancy is shared public tables scoped by organization_id/RLS/RBAC.';

COMMIT;
