-- Phase 9: Tenant migration reporting snapshots.
-- Adds read-only reporting infrastructure for platform admins to monitor the
-- schema-per-tenant rollout without exposing tenant data across organizations.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_reporting_snapshots (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  organization_name TEXT,
  schema_name TEXT,
  status TEXT NOT NULL,
  read_mode TEXT NOT NULL,
  write_mode TEXT NOT NULL,
  schema_exists BOOLEAN NOT NULL DEFAULT false,
  latest_backfill_run_id UUID,
  latest_backfill_status TEXT,
  latest_backfill_finished_at TIMESTAMPTZ,
  latest_cutover_event_id UUID,
  latest_cutover_type TEXT,
  latest_cutover_status TEXT,
  latest_cutover_at TIMESTAMPTZ,
  public_row_count BIGINT NOT NULL DEFAULT 0,
  tenant_schema_row_count BIGINT NOT NULL DEFAULT 0,
  row_count_delta BIGINT NOT NULL DEFAULT 0,
  ready_for_tenant_schema_reads BOOLEAN NOT NULL DEFAULT false,
  ready_for_tenant_schema_writes BOOLEAN NOT NULL DEFAULT false,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_reporting_snapshots_status_check CHECK (status IN ('planned', 'provisioning', 'active', 'migrating', 'failed', 'archived')),
  CONSTRAINT tenant_reporting_snapshots_read_mode_check CHECK (read_mode IN ('public', 'dual', 'tenant_schema')),
  CONSTRAINT tenant_reporting_snapshots_write_mode_check CHECK (write_mode IN ('public', 'dual', 'tenant_schema'))
);

CREATE INDEX IF NOT EXISTS idx_tenant_reporting_snapshots_status_modes
  ON public.tenant_reporting_snapshots(status, read_mode, write_mode);

CREATE INDEX IF NOT EXISTS idx_tenant_reporting_snapshots_refreshed_at
  ON public.tenant_reporting_snapshots(refreshed_at DESC);

ALTER TABLE public.tenant_reporting_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_reporting_snapshots_platform_admin_all" ON public.tenant_reporting_snapshots;
CREATE POLICY "tenant_reporting_snapshots_platform_admin_all"
ON public.tenant_reporting_snapshots
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "tenant_reporting_snapshots_org_read" ON public.tenant_reporting_snapshots;
CREATE POLICY "tenant_reporting_snapshots_org_read"
ON public.tenant_reporting_snapshots
FOR SELECT
USING (organization_id = public.get_my_org());

CREATE OR REPLACE FUNCTION public.count_tenant_reporting_rows(
  p_schema_name TEXT,
  p_table_name TEXT,
  p_organization_id UUID
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  row_count BIGINT := 0;
  has_org_column BOOLEAN := false;
BEGIN
  IF p_schema_name IS NULL OR p_table_name IS NULL THEN
    RETURN 0;
  END IF;

  IF p_schema_name !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' OR p_table_name !~ '^[a-zA-Z_][a-zA-Z0-9_]*$' THEN
    RAISE EXCEPTION 'Unsafe schema or table name for tenant reporting count';
  END IF;

  IF to_regclass(format('%I.%I', p_schema_name, p_table_name)) IS NULL THEN
    RETURN 0;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = p_schema_name
      AND c.table_name = p_table_name
      AND c.column_name = 'organization_id'
  ) INTO has_org_column;

  IF has_org_column THEN
    EXECUTE format('SELECT count(*) FROM %I.%I WHERE organization_id = $1', p_schema_name, p_table_name)
    INTO row_count
    USING p_organization_id;
  ELSE
    EXECUTE format('SELECT count(*) FROM %I.%I', p_schema_name, p_table_name)
    INTO row_count;
  END IF;

  RETURN COALESCE(row_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_tenant_reporting_snapshot(p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  registry_record RECORD;
  organization_record RECORD;
  latest_backfill RECORD;
  latest_cutover RECORD;
  read_status JSONB;
  write_status JSONB;
  combined_blockers JSONB := '[]'::jsonb;
  public_counts JSONB := '{}'::jsonb;
  tenant_counts JSONB := '{}'::jsonb;
  table_record RECORD;
  public_table_count BIGINT := 0;
  tenant_table_count BIGINT := 0;
  total_public_count BIGINT := 0;
  total_tenant_count BIGINT := 0;
  schema_available BOOLEAN := false;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF NOT (public.is_platform_admin() OR (SELECT auth.role()) = 'service_role' OR p_organization_id = public.get_my_org()) THEN
    RAISE EXCEPTION 'Insufficient permissions to refresh tenant reporting snapshot';
  END IF;

  SELECT tr.* INTO registry_record
  FROM public.tenant_registry tr
  WHERE tr.organization_id = p_organization_id;

  IF registry_record.organization_id IS NULL THEN
    RAISE EXCEPTION 'Tenant registry entry not found for organization %', p_organization_id;
  END IF;

  SELECT o.id, o.name INTO organization_record
  FROM public.organizations o
  WHERE o.id = p_organization_id;

  schema_available := registry_record.schema_name IS NOT NULL
    AND registry_record.schema_name ~ '^tenant_[a-z0-9_]+$'
    AND to_regnamespace(registry_record.schema_name) IS NOT NULL;

  SELECT br.* INTO latest_backfill
  FROM public.tenant_backfill_runs br
  WHERE br.organization_id = p_organization_id
  ORDER BY br.started_at DESC
  LIMIT 1;

  SELECT ce.* INTO latest_cutover
  FROM public.tenant_cutover_events ce
  WHERE ce.organization_id = p_organization_id
  ORDER BY ce.created_at DESC
  LIMIT 1;

  read_status := public.get_tenant_cutover_status(p_organization_id);
  write_status := public.get_tenant_write_cutover_status(p_organization_id);

  combined_blockers := COALESCE(read_status->'blockers', '[]'::jsonb)
    || COALESCE(write_status->'blockers', '[]'::jsonb);

  FOR table_record IN
    SELECT table_name
    FROM public.tenant_template_tables
    ORDER BY copy_order, table_name
  LOOP
    public_table_count := public.count_tenant_reporting_rows('public', table_record.table_name, p_organization_id);
    tenant_table_count := CASE
      WHEN schema_available THEN public.count_tenant_reporting_rows(registry_record.schema_name, table_record.table_name, p_organization_id)
      ELSE 0
    END;

    total_public_count := total_public_count + public_table_count;
    total_tenant_count := total_tenant_count + tenant_table_count;
    public_counts := public_counts || jsonb_build_object(table_record.table_name, public_table_count);
    tenant_counts := tenant_counts || jsonb_build_object(table_record.table_name, tenant_table_count);
  END LOOP;

  INSERT INTO public.tenant_reporting_snapshots (
    organization_id,
    organization_name,
    schema_name,
    status,
    read_mode,
    write_mode,
    schema_exists,
    latest_backfill_run_id,
    latest_backfill_status,
    latest_backfill_finished_at,
    latest_cutover_event_id,
    latest_cutover_type,
    latest_cutover_status,
    latest_cutover_at,
    public_row_count,
    tenant_schema_row_count,
    row_count_delta,
    ready_for_tenant_schema_reads,
    ready_for_tenant_schema_writes,
    blockers,
    metrics,
    refreshed_at
  ) VALUES (
    p_organization_id,
    organization_record.name,
    registry_record.schema_name,
    registry_record.status,
    registry_record.read_mode,
    registry_record.write_mode,
    schema_available,
    latest_backfill.id,
    latest_backfill.status,
    latest_backfill.completed_at,
    latest_cutover.id,
    latest_cutover.cutover_type,
    latest_cutover.status,
    latest_cutover.created_at,
    total_public_count,
    total_tenant_count,
    total_public_count - total_tenant_count,
    COALESCE((read_status->>'ready_for_tenant_schema_reads')::BOOLEAN, false),
    COALESCE((write_status->>'ready_for_tenant_schema_writes')::BOOLEAN, false),
    combined_blockers,
    jsonb_build_object(
      'public_counts_by_table', public_counts,
      'tenant_counts_by_table', tenant_counts,
      'read_status', read_status,
      'write_status', write_status
    ),
    now()
  )
  ON CONFLICT (organization_id) DO UPDATE
  SET organization_name = EXCLUDED.organization_name,
      schema_name = EXCLUDED.schema_name,
      status = EXCLUDED.status,
      read_mode = EXCLUDED.read_mode,
      write_mode = EXCLUDED.write_mode,
      schema_exists = EXCLUDED.schema_exists,
      latest_backfill_run_id = EXCLUDED.latest_backfill_run_id,
      latest_backfill_status = EXCLUDED.latest_backfill_status,
      latest_backfill_finished_at = EXCLUDED.latest_backfill_finished_at,
      latest_cutover_event_id = EXCLUDED.latest_cutover_event_id,
      latest_cutover_type = EXCLUDED.latest_cutover_type,
      latest_cutover_status = EXCLUDED.latest_cutover_status,
      latest_cutover_at = EXCLUDED.latest_cutover_at,
      public_row_count = EXCLUDED.public_row_count,
      tenant_schema_row_count = EXCLUDED.tenant_schema_row_count,
      row_count_delta = EXCLUDED.row_count_delta,
      ready_for_tenant_schema_reads = EXCLUDED.ready_for_tenant_schema_reads,
      ready_for_tenant_schema_writes = EXCLUDED.ready_for_tenant_schema_writes,
      blockers = EXCLUDED.blockers,
      metrics = EXCLUDED.metrics,
      refreshed_at = EXCLUDED.refreshed_at;

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', p_organization_id,
    'schema_name', registry_record.schema_name,
    'status', registry_record.status,
    'read_mode', registry_record.read_mode,
    'write_mode', registry_record.write_mode,
    'schema_exists', schema_available,
    'public_row_count', total_public_count,
    'tenant_schema_row_count', total_tenant_count,
    'row_count_delta', total_public_count - total_tenant_count,
    'ready_for_tenant_schema_reads', COALESCE((read_status->>'ready_for_tenant_schema_reads')::BOOLEAN, false),
    'ready_for_tenant_schema_writes', COALESCE((write_status->>'ready_for_tenant_schema_writes')::BOOLEAN, false),
    'blocker_count', jsonb_array_length(combined_blockers)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_all_tenant_reporting_snapshots(p_limit INTEGER DEFAULT 25)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  tenant_record RECORD;
  refreshed_count INTEGER := 0;
  results JSONB := '[]'::jsonb;
BEGIN
  IF NOT (public.is_platform_admin() OR (SELECT auth.role()) = 'service_role') THEN
    RAISE EXCEPTION 'Insufficient permissions: only platform_admin or service_role can refresh all tenant reporting snapshots';
  END IF;

  FOR tenant_record IN
    SELECT tr.organization_id
    FROM public.tenant_registry tr
    ORDER BY tr.updated_at DESC NULLS LAST, tr.created_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 100))
  LOOP
    refreshed_count := refreshed_count + 1;
    results := results || jsonb_build_array(public.refresh_tenant_reporting_snapshot(tenant_record.organization_id));
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'refreshed_count', refreshed_count,
    'results', results
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_reporting_snapshots(p_organization_id UUID DEFAULT NULL)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  schema_name TEXT,
  status TEXT,
  read_mode TEXT,
  write_mode TEXT,
  schema_exists BOOLEAN,
  latest_backfill_status TEXT,
  latest_cutover_type TEXT,
  latest_cutover_status TEXT,
  public_row_count BIGINT,
  tenant_schema_row_count BIGINT,
  row_count_delta BIGINT,
  ready_for_tenant_schema_reads BOOLEAN,
  ready_for_tenant_schema_writes BOOLEAN,
  blocker_count INTEGER,
  blockers JSONB,
  refreshed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.is_platform_admin() OR (SELECT auth.role()) = 'service_role' THEN
    RETURN QUERY
    SELECT
      trs.organization_id,
      trs.organization_name,
      trs.schema_name,
      trs.status,
      trs.read_mode,
      trs.write_mode,
      trs.schema_exists,
      trs.latest_backfill_status,
      trs.latest_cutover_type,
      trs.latest_cutover_status,
      trs.public_row_count,
      trs.tenant_schema_row_count,
      trs.row_count_delta,
      trs.ready_for_tenant_schema_reads,
      trs.ready_for_tenant_schema_writes,
      jsonb_array_length(trs.blockers)::INTEGER AS blocker_count,
      trs.blockers,
      trs.refreshed_at
    FROM public.tenant_reporting_snapshots trs
    WHERE p_organization_id IS NULL OR trs.organization_id = p_organization_id
    ORDER BY trs.refreshed_at DESC, trs.organization_name ASC NULLS LAST;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    trs.organization_id,
    trs.organization_name,
    trs.schema_name,
    trs.status,
    trs.read_mode,
    trs.write_mode,
    trs.schema_exists,
    trs.latest_backfill_status,
    trs.latest_cutover_type,
    trs.latest_cutover_status,
    trs.public_row_count,
    trs.tenant_schema_row_count,
    trs.row_count_delta,
    trs.ready_for_tenant_schema_reads,
    trs.ready_for_tenant_schema_writes,
    jsonb_array_length(trs.blockers)::INTEGER AS blocker_count,
    trs.blockers,
    trs.refreshed_at
  FROM public.tenant_reporting_snapshots trs
  WHERE trs.organization_id = public.get_my_org()
    AND (p_organization_id IS NULL OR trs.organization_id = p_organization_id)
  ORDER BY trs.refreshed_at DESC;
END;
$$;

REVOKE ALL ON TABLE public.tenant_reporting_snapshots FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.tenant_reporting_snapshots TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.tenant_reporting_snapshots TO service_role;

REVOKE ALL ON FUNCTION public.count_tenant_reporting_rows(TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_tenant_reporting_rows(TEXT, TEXT, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.refresh_tenant_reporting_snapshot(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_tenant_reporting_snapshot(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.refresh_all_tenant_reporting_snapshots(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_all_tenant_reporting_snapshots(INTEGER) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_tenant_reporting_snapshots(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_reporting_snapshots(UUID) TO authenticated, service_role;

COMMENT ON TABLE public.tenant_reporting_snapshots IS
  'Cached migration health snapshots for the schema-per-tenant rollout. Stores counts and readiness metadata, not tenant business records.';
COMMENT ON FUNCTION public.refresh_tenant_reporting_snapshot(UUID) IS
  'Refreshes a single tenant migration reporting snapshot. Tenant users can refresh their own tenant only; platform admins/service role can refresh any tenant.';
COMMENT ON FUNCTION public.refresh_all_tenant_reporting_snapshots(INTEGER) IS
  'Refreshes migration reporting snapshots for recent tenant registry entries. Platform admin/service role only.';
COMMENT ON FUNCTION public.get_tenant_reporting_snapshots(UUID) IS
  'Reads tenant migration reporting snapshots. Platform admins see all; tenant users see only their own organization.';

COMMIT;