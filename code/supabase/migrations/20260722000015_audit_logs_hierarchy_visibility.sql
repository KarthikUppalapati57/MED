BEGIN;

-- Audit log hierarchy visibility + filter columns + related bug fixes.
--
-- Root bug: audit_logs_admin_select (is_admin() AND organization_id = get_auth_org()) has no
-- platform_admin bypass -- platform_admin has no organization_id by design, so the Platform
-- Audit Logs page always showed zero rows (confirmed via live role impersonation). That policy
-- was copy-pasted from general_ledger_entries in 20260628000013_append_only_ledger_audit.sql
-- and never tailored for audit_logs' cross-org purpose.
--
-- Also extends the hierarchy model per product decision: org_manager sees their whole org,
-- branch_manager their whole brand, tenant_super_admin every org in their tenant,
-- platform_admin everything, location_manager/ground_staff limited to their own location.
-- Deliberately NOT the newer "exact active location only" rule that governs
-- invoices/payments/inventory -- that's a separate, later product decision for those
-- transactional tables (see 20260721190000_require_exact_location_match_for_org_wide_roles.sql).

-- 1. Schema: nullable brand_id/location_id (declarative partitioning auto-cascades
--    ADD COLUMN/CREATE INDEX/ADD CONSTRAINT to audit_logs_default/y2025/y2026).
ALTER TABLE public.audit_logs
  ADD COLUMN brand_id uuid,
  ADD COLUMN location_id uuid;

-- ON DELETE SET NULL (not RESTRICT like invoices/payments/inventory/auto_orders) --
-- deliberate: this is a historical record, a later brand/location deletion should null
-- the reference, never be blocked by the mere existence of old audit rows.
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  ADD CONSTRAINT audit_logs_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;

CREATE INDEX idx_audit_logs_brand_id ON public.audit_logs (brand_id);
CREATE INDEX idx_audit_logs_location_id ON public.audit_logs (location_id);

-- 2. New hierarchy predicate. Structured like tenant_scope_visible()/reference_scope_visible()
--    (one profile lookup up front) but each role gets its own real rule rather than collapsing
--    to one -- so the NULL-tier (org-level, brand+location both NULL) behavior falls out for
--    free: org_manager/tenant_super_admin never look at brand/location at all (see it),
--    branch_manager/location_manager/ground_staff all hard-require their column non-null
--    (don't see it) -- no special-cased carve-out needed, unlike tenant_scope_visible().
--
--    ground_staff note: get_my_accessible_location_ids() has no ground_staff branch (it's
--    manager-tier only, matching is_manager_or_above() excluding ground_staff elsewhere on
--    purpose) -- composing it alone would silently give ground_staff zero visibility. Fixed
--    with a local OR-fallback against the caller's own profiles.location_id (already fetched
--    above for the org-match guard, so this is free) instead of touching the shared helper,
--    which has unrelated callers across many other migrations.
CREATE OR REPLACE FUNCTION public.audit_log_scope_visible(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL::uuid,
  p_location_id uuid DEFAULT NULL::uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_org_id uuid;
  v_location_id uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT role, organization_id, location_id
    INTO v_role, v_org_id, v_location_id
  FROM public.profiles
  WHERE id = auth.uid()
    AND deleted_at IS NULL;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  IF v_role = 'platform_admin' THEN
    RETURN true;
  END IF;

  IF v_role = 'tenant_super_admin' THEN
    RETURN p_organization_id IS NOT NULL
       AND p_organization_id IN (
         SELECT o.id FROM public.organizations o WHERE o.tenant_id = public.get_auth_tenant()
       );
  END IF;

  IF v_role = 'org_manager' THEN
    RETURN p_organization_id IS NOT NULL AND p_organization_id = v_org_id;
  END IF;

  IF v_role IN ('branch_manager', 'brand_manager') THEN
    RETURN p_organization_id IS NOT NULL AND p_organization_id = v_org_id
       AND p_brand_id IS NOT NULL
       AND p_brand_id IN (SELECT id FROM public.get_my_accessible_brand_ids() id);
  END IF;

  IF v_role IN ('location_manager', 'ground_staff') THEN
    RETURN p_organization_id IS NOT NULL AND p_organization_id = v_org_id
       AND p_location_id IS NOT NULL
       AND (
         p_location_id IN (SELECT id FROM public.get_my_accessible_location_ids() id)
         OR p_location_id = v_location_id
       );
  END IF;

  RETURN false;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.audit_log_scope_visible(uuid, uuid, uuid) TO authenticated;

-- 3. Drop all 4 existing policies (parent + 3 partitions -- this table does NOT rely on
--    policy inheritance, all 4 currently carry an identical explicit predicate), replace
--    with the hierarchy version.
DROP POLICY IF EXISTS audit_logs_admin_select ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_default_admin_select ON public.audit_logs_default;
DROP POLICY IF EXISTS audit_logs_y2025_admin_select ON public.audit_logs_y2025;
DROP POLICY IF EXISTS audit_logs_y2026_admin_select ON public.audit_logs_y2026;

CREATE POLICY audit_logs_hierarchy_select ON public.audit_logs
  FOR SELECT USING (public.audit_log_scope_visible(organization_id, brand_id, location_id));
CREATE POLICY audit_logs_default_hierarchy_select ON public.audit_logs_default
  FOR SELECT USING (public.audit_log_scope_visible(organization_id, brand_id, location_id));
CREATE POLICY audit_logs_y2025_hierarchy_select ON public.audit_logs_y2025
  FOR SELECT USING (public.audit_log_scope_visible(organization_id, brand_id, location_id));
CREATE POLICY audit_logs_y2026_hierarchy_select ON public.audit_logs_y2026
  FOR SELECT USING (public.audit_log_scope_visible(organization_id, brand_id, location_id));

-- 4. Trigger fix: remove JWT user_metadata fallback (the exact JWT-vs-profiles anti-pattern
--    this repo's hardening eliminated elsewhere -- profiles/the row itself wins), capture
--    brand_id/location_id. Attached only to invoices/payments/inventory/auto_orders -- all 4
--    confirmed to have their own brand_id/location_id columns. process_onboarding_audit_log()
--    needs NO changes -- it's attached only to pre-org/org-level tables with no brand/location
--    of their own, so those rows correctly land in the NULL tier already.
CREATE OR REPLACE FUNCTION public.process_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_logs (organization_id, brand_id, location_id, user_id, action, table_name, record_id, old_data)
        VALUES (OLD.organization_id, OLD.brand_id, OLD.location_id, v_user_id, 'DELETE', TG_TABLE_NAME, OLD.id, row_to_json(OLD)::jsonb);
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO public.audit_logs (organization_id, brand_id, location_id, user_id, action, table_name, record_id, old_data, new_data)
        VALUES (NEW.organization_id, NEW.brand_id, NEW.location_id, v_user_id, 'UPDATE', TG_TABLE_NAME, NEW.id, row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb);
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO public.audit_logs (organization_id, brand_id, location_id, user_id, action, table_name, record_id, new_data)
        VALUES (NEW.organization_id, NEW.brand_id, NEW.location_id, v_user_id, 'INSERT', TG_TABLE_NAME, NEW.id, row_to_json(NEW)::jsonb);
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$function$;

-- 5. RPC fix: log_audit_event() accepts brand_id/location_id, same COALESCE pattern as every
--    other field. Everything else in the body is unchanged. log_audit_events() needs no edit
--    -- it just loops calling this per array element.
CREATE OR REPLACE FUNCTION public.log_audit_event(p_entry JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id UUID;
  v_brand_id UUID;
  v_location_id UUID;
  v_record_id UUID;
  v_row public.audit_logs%ROWTYPE;
  v_details TEXT;
BEGIN
  IF p_entry IS NULL OR jsonb_typeof(p_entry) <> 'object' THEN
    RAISE EXCEPTION 'Audit entry must be a JSON object';
  END IF;

  v_org_id := NULLIF(COALESCE(p_entry->>'organization_id', p_entry->>'org_id', p_entry->>'orgId'), '')::UUID;
  v_brand_id := NULLIF(COALESCE(p_entry->>'brand_id', p_entry->>'brandId'), '')::UUID;
  v_location_id := NULLIF(COALESCE(p_entry->>'location_id', p_entry->>'locationId'), '')::UUID;

  IF v_org_id IS NOT NULL THEN
    PERFORM public.assert_org_actor(v_org_id);
  ELSIF auth.role() <> 'service_role' AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'organization_id is required for non-platform audit events';
  END IF;

  v_record_id := CASE
    WHEN COALESCE(p_entry->>'record_id', p_entry->>'recordId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN COALESCE(p_entry->>'record_id', p_entry->>'recordId')::UUID
    ELSE NULL
  END;

  v_details := CASE
    WHEN p_entry ? 'details' AND jsonb_typeof(p_entry->'details') IN ('object', 'array') THEN (p_entry->'details')::TEXT
    WHEN p_entry ? 'details' THEN p_entry->>'details'
    ELSE NULL
  END;

  INSERT INTO public.audit_logs (
    organization_id,
    brand_id,
    location_id,
    user_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data,
    ip_address,
    user_agent,
    entity_type,
    entity_id,
    module,
    field_changed,
    old_value,
    new_value,
    user_email,
    details
  ) VALUES (
    v_org_id,
    v_brand_id,
    v_location_id,
    COALESCE(NULLIF(p_entry->>'user_id', '')::UUID, auth.uid()),
    COALESCE(NULLIF(p_entry->>'action', ''), 'audit'),
    COALESCE(NULLIF(p_entry->>'table_name', ''), NULLIF(p_entry->>'tableName', ''), NULLIF(p_entry->>'entity_type', ''), NULLIF(p_entry->>'entityType', ''), NULLIF(p_entry->>'module', ''), 'system'),
    v_record_id,
    CASE WHEN p_entry ? 'old_data' THEN p_entry->'old_data' WHEN p_entry ? 'oldData' THEN p_entry->'oldData' ELSE NULL END,
    CASE WHEN p_entry ? 'new_data' THEN p_entry->'new_data' WHEN p_entry ? 'newData' THEN p_entry->'newData' ELSE NULL END,
    NULLIF(p_entry->>'ip_address', ''),
    NULLIF(p_entry->>'user_agent', ''),
    COALESCE(NULLIF(p_entry->>'entity_type', ''), NULLIF(p_entry->>'entityType', ''), NULLIF(p_entry->>'action', ''), 'unknown'),
    COALESCE(NULLIF(p_entry->>'entity_id', ''), NULLIF(p_entry->>'entityId', ''), NULLIF(p_entry->>'target_user_id', ''), NULLIF(p_entry->>'record_id', ''), NULLIF(p_entry->>'recordId', '')),
    NULLIF(p_entry->>'module', ''),
    COALESCE(NULLIF(p_entry->>'field_changed', ''), NULLIF(p_entry->>'fieldChanged', '')),
    COALESCE(NULLIF(p_entry->>'old_value', ''), NULLIF(p_entry->>'oldValue', '')),
    COALESCE(NULLIF(p_entry->>'new_value', ''), NULLIF(p_entry->>'newValue', '')),
    COALESCE(NULLIF(p_entry->>'user_email', ''), NULLIF(p_entry->>'userEmail', '')),
    v_details
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

-- 6. assert_org_actor() recognizes tenant_super_admin's tenant-wide scope, not just an exact
--    own-org match -- needed now that log_audit_event() can be called for any org within a
--    tenant_super_admin's tenant. Everything else unchanged.
CREATE OR REPLACE FUNCTION public.assert_org_actor(p_organization_id UUID)
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role TEXT;
  v_profile_org UUID;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role, organization_id
    INTO v_role, v_profile_org
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  IF v_role = 'platform_admin' THEN
    RETURN;
  END IF;

  IF v_role = 'tenant_super_admin' THEN
    IF p_organization_id IN (SELECT o.id FROM public.organizations o WHERE o.tenant_id = public.get_auth_tenant()) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Cross-organization access denied';
  END IF;

  IF v_profile_org IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'Cross-organization access denied';
  END IF;
END;
$function$;

-- 7. Realtime was silently dead on both audit-log pages: audit_logs was never added to the
--    supabase_realtime publication (confirmed: 0 rows in pg_publication_tables for it), so
--    their postgres_changes subscriptions never fired. Register it (auto-cascades to
--    partitions).
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;

COMMIT;
