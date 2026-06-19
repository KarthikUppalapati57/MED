-- Fix Phase 9 reporting snapshot manifest references.
-- The tenant_template_tables manifest uses copy_order/is_required from Phase 2.

BEGIN;

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

COMMIT;