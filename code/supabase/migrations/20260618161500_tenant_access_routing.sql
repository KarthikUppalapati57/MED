-- Phase 4: Tenant access/routing foundation.
-- Adds secure resolver functions for future backend/Edge data access. These functions
-- do not switch application reads/writes and do not expose generic schema querying.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_tenant_runtime(p_organization_id UUID DEFAULT NULL)
RETURNS TABLE (
  organization_id UUID,
  schema_name TEXT,
  status TEXT,
  read_mode TEXT,
  write_mode TEXT,
  provisioned_at TIMESTAMPTZ,
  migrated_at TIMESTAMPTZ,
  last_validated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  caller_org UUID;
  target_org UUID;
BEGIN
  caller_org := public.get_my_org();
  target_org := COALESCE(p_organization_id, caller_org);

  IF target_org IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF NOT (public.is_platform_admin() OR (SELECT auth.role()) = 'service_role' OR target_org = caller_org) THEN
    RAISE EXCEPTION 'Cannot resolve tenant runtime outside caller organization';
  END IF;

  RETURN QUERY
  SELECT
    tr.organization_id,
    tr.schema_name,
    tr.status,
    tr.read_mode,
    tr.write_mode,
    tr.provisioned_at,
    tr.migrated_at,
    tr.last_validated_at
  FROM public.tenant_registry tr
  WHERE tr.organization_id = target_org;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_tenant_schema(p_organization_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  runtime_record RECORD;
BEGIN
  SELECT * INTO runtime_record
  FROM public.get_tenant_runtime(p_organization_id)
  LIMIT 1;

  IF runtime_record.organization_id IS NULL THEN
    RAISE EXCEPTION 'Tenant registry entry not found';
  END IF;

  IF runtime_record.status NOT IN ('active', 'migrating') THEN
    RAISE EXCEPTION 'Tenant schema is not ready. Current status: %', runtime_record.status;
  END IF;

  IF runtime_record.schema_name !~ '^tenant_[a-z0-9_]+$' OR length(runtime_record.schema_name) > 63 THEN
    RAISE EXCEPTION 'Unsafe tenant schema name: %', runtime_record.schema_name;
  END IF;

  RETURN runtime_record.schema_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_tenant_scope(
  p_organization_id UUID,
  p_brand_id UUID DEFAULT NULL,
  p_location_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  caller_org UUID;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  caller_org := public.get_my_org();

  IF NOT (public.is_platform_admin() OR (SELECT auth.role()) = 'service_role' OR p_organization_id = caller_org) THEN
    RAISE EXCEPTION 'Organization is outside caller tenant';
  END IF;

  IF p_brand_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.brands b
      WHERE b.brand_id = p_brand_id
        AND b.organization_id = p_organization_id
        AND (
          public.is_platform_admin()
          OR (SELECT auth.role()) = 'service_role'
          OR p_brand_id IN (SELECT public.get_my_accessible_brand_ids())
        )
    ) THEN
      RAISE EXCEPTION 'Brand is outside caller tenant scope';
    END IF;
  END IF;

  IF p_location_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.locations l
      WHERE l.id = p_location_id
        AND l.organization_id = p_organization_id
        AND (p_brand_id IS NULL OR l.brand_id = p_brand_id)
        AND (
          public.is_platform_admin()
          OR (SELECT auth.role()) = 'service_role'
          OR p_location_id IN (SELECT public.get_my_accessible_location_ids())
        )
    ) THEN
      RAISE EXCEPTION 'Location is outside caller tenant scope';
    END IF;
  END IF;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_data_route(
  p_organization_id UUID DEFAULT NULL,
  p_brand_id UUID DEFAULT NULL,
  p_location_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  runtime_record RECORD;
  target_org UUID;
BEGIN
  target_org := COALESCE(p_organization_id, public.get_my_org());

  PERFORM public.assert_tenant_scope(target_org, p_brand_id, p_location_id);

  SELECT * INTO runtime_record
  FROM public.get_tenant_runtime(target_org)
  LIMIT 1;

  IF runtime_record.organization_id IS NULL THEN
    RETURN jsonb_build_object(
      'organization_id', target_org,
      'schema_name', NULL,
      'status', 'unregistered',
      'read_mode', 'public',
      'write_mode', 'public',
      'read_source', 'public',
      'write_target', 'public'
    );
  END IF;

  RETURN jsonb_build_object(
    'organization_id', runtime_record.organization_id,
    'schema_name', runtime_record.schema_name,
    'status', runtime_record.status,
    'read_mode', runtime_record.read_mode,
    'write_mode', runtime_record.write_mode,
    'read_source', CASE WHEN runtime_record.read_mode = 'tenant_schema' THEN runtime_record.schema_name ELSE 'public' END,
    'write_target', CASE WHEN runtime_record.write_mode = 'tenant_schema' THEN runtime_record.schema_name ELSE 'public' END,
    'brand_id', p_brand_id,
    'location_id', p_location_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_runtime(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_runtime(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.resolve_tenant_schema(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_tenant_schema(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.assert_tenant_scope(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_tenant_scope(UUID, UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_tenant_data_route(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_data_route(UUID, UUID, UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_tenant_runtime(UUID) IS
  'Returns tenant registry runtime state for caller org, platform admins, or service role.';
COMMENT ON FUNCTION public.resolve_tenant_schema(UUID) IS
  'Service-role resolver for the provisioned tenant schema name. Not granted to browser clients.';
COMMENT ON FUNCTION public.assert_tenant_scope(UUID, UUID, UUID) IS
  'Validates organization/brand/location scope before backend code routes tenant data access.';
COMMENT ON FUNCTION public.get_tenant_data_route(UUID, UUID, UUID) IS
  'Returns current public-vs-tenant routing mode after validating caller scope. Does not perform generic data access.';

COMMIT;