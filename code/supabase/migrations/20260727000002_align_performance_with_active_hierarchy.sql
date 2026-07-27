BEGIN;

-- Align Performance with the existing organization -> active brand -> active
-- location context model. This migration is intentionally Performance-only.
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
  v_auth_brand uuid;
  v_auth_location uuid;
  v_location_org uuid;
  v_location_brand uuid;
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

  SELECT public.normalize_app_role(p.role),
         p.organization_id,
         p.brand_id,
         p.location_id
    INTO v_role, v_auth_org, v_auth_brand, v_auth_location
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.deleted_at IS NULL;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Authenticated profile not found'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_manager_or_above() THEN
    RAISE EXCEPTION 'Role is not authorized for Performance'
      USING ERRCODE = '42501';
  END IF;

  SELECT l.organization_id, l.brand_id
    INTO v_location_org, v_location_brand
  FROM public.locations l
  WHERE l.id = p_location_id
    AND l.deleted_at IS NULL;

  IF v_location_org IS NULL OR v_location_org IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'Location does not belong to the active organization'
      USING ERRCODE = '42501';
  END IF;

  -- platform_admin follows the existing project-wide cross-organization
  -- exception, but still must name a real location in the named organization.
  IF v_role <> 'platform_admin' AND (
    v_auth_org IS DISTINCT FROM p_organization_id
    OR v_auth_location IS DISTINCT FROM p_location_id
    OR v_auth_brand IS NULL
    OR v_auth_brand IS DISTINCT FROM v_location_brand
  ) THEN
    RAISE EXCEPTION 'Performance location is outside the active hierarchy context'
      USING ERRCODE = '42501';
  END IF;

  IF p_write AND NOT public.is_manager_or_above() THEN
    RAISE EXCEPTION 'Role is not authorized to manage Performance budgets'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_performance_location_access(uuid, uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_performance_location_access(uuid, uuid, boolean)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
