-- EMERGENCY MANUAL ROLLBACK ONLY.
-- Do not place this file in supabase/migrations and do not run it as part of
-- normal deployment. It reverses Performance migrations 00003 and 00002, in
-- that order, without changing business data or shared report functions.

BEGIN;

-- Reverse 00003: restore the original secured wrapper without evidence
-- enrichment. The shared base get_inventory_usage_report remains unchanged.
CREATE OR REPLACE FUNCTION public.get_location_inventory_usage_report(
  p_organization_id uuid,
  p_location_id uuid,
  p_date_from date,
  p_date_to date,
  p_category_names text[] DEFAULT NULL,
  p_timezone text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_performance_location_access(
    p_organization_id, p_location_id, false
  );
  RETURN public.get_inventory_usage_report(
    p_organization_id,
    ARRAY[p_location_id],
    p_date_from,
    p_date_to,
    p_category_names,
    p_timezone
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_location_inventory_usage_report(
  uuid, uuid, date, date, text[], text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_location_inventory_usage_report(
  uuid, uuid, date, date, text[], text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_location_inventory_usage_report(
  uuid, uuid, date, date, text[], text
) IS
  'Secured single-location Performance Inventory Usage wrapper.';

-- Reverse 00002: restore the pre-alignment accessible-location behavior.
-- This is intentionally less strict than active-context matching and should be
-- used only if the strict context assertion causes a production incident.
CREATE OR REPLACE FUNCTION public.assert_performance_location_access(
  p_organization_id uuid,
  p_location_id uuid,
  p_write boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_auth_org uuid;
  v_location_org uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    IF p_organization_id IS NULL OR p_location_id IS NULL THEN
      RAISE EXCEPTION 'Performance requires organization and location context'
        USING ERRCODE = '22023';
    END IF;
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NULL OR p_location_id IS NULL THEN
    RAISE EXCEPTION 'Performance requires one selected location'
      USING ERRCODE = '22023';
  END IF;

  SELECT public.normalize_app_role(p.role), p.organization_id
    INTO v_role, v_auth_org
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.deleted_at IS NULL;

  IF v_role IS NULL OR NOT public.is_manager_or_above() THEN
    RAISE EXCEPTION 'Role is not authorized for Performance'
      USING ERRCODE = '42501';
  END IF;

  SELECT l.organization_id
    INTO v_location_org
  FROM public.locations l
  WHERE l.id = p_location_id
    AND l.deleted_at IS NULL;

  IF v_location_org IS NULL OR v_location_org IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'Location does not belong to the requested organization'
      USING ERRCODE = '42501';
  END IF;

  IF v_role <> 'platform_admin' AND (
    v_auth_org IS DISTINCT FROM p_organization_id
    OR NOT (
      p_location_id = ANY (
        ARRAY(SELECT public.get_my_accessible_location_ids())
      )
    )
  ) THEN
    RAISE EXCEPTION 'Location is outside the caller accessible scope'
      USING ERRCODE = '42501';
  END IF;

  IF p_write AND NOT public.is_manager_or_above() THEN
    RAISE EXCEPTION 'Role is not authorized to manage Performance budgets'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_performance_location_access(
  uuid, uuid, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_performance_location_access(
  uuid, uuid, boolean
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
