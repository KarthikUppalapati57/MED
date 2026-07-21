BEGIN;

-- Extends the exact-location-match rule (20260721190000) to reference data
-- (vendors/products/recipes). Confirmed explicitly: no aggregate org/brand-wide view for
-- org_manager/tenant_super_admin/branch_manager here either, despite this being a genuinely
-- different data shape (CLAUDE.md section 4's brand-shared reference model, not transactional).
--
-- A brand-shared row (location_id NULL, brand_id set -- "every location under this brand
-- carries it") isn't removed by this change, just re-anchored: instead of being visible to
-- anyone with access to that brand, it's now visible only when it matches the BRAND of
-- whichever location the caller currently has active. Seeing the shared catalog still requires
-- being "at" a location, consistently with everything else -- it doesn't become unreachable.
--
-- Incidental gap fix, not introduced here: get_my_accessible_brand_ids() has no
-- location_manager branch, so today a location_manager cannot see brand-shared rows at all.
-- The new brand match is computed directly from the caller's own active location instead of
-- that role-keyed helper, so this now works identically for every role, including them.
--
-- reference_scope_writable() is unchanged -- it already checks the role + the TARGET row's
-- declared scope (who may create a brand-shared vs location-specific row), which is orthogonal
-- to visibility and correctly stays where it is.

CREATE OR REPLACE FUNCTION public.reference_scope_visible(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_deleted_at timestamp with time zone DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_org_id uuid;
  v_location_id uuid;
  v_active_location_brand_id uuid;
BEGIN
  IF p_deleted_at IS NOT NULL THEN
    RETURN false;
  END IF;

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

  IF p_organization_id IS NULL OR p_organization_id IS DISTINCT FROM v_org_id THEN
    RETURN false;
  END IF;

  -- No exceptions: every role needs an active location, same rule as tenant_scope_visible().
  IF v_location_id IS NULL THEN
    RETURN false;
  END IF;

  -- Location-specific reference row: exact match.
  IF p_location_id IS NOT NULL THEN
    RETURN p_location_id = v_location_id;
  END IF;

  -- Brand-shared reference row (location intentionally NULL): visible when it matches the
  -- brand of the caller's currently active location.
  IF p_brand_id IS NOT NULL THEN
    SELECT l.brand_id INTO v_active_location_brand_id
    FROM public.locations l
    WHERE l.id = v_location_id;

    RETURN p_brand_id IS NOT NULL AND p_brand_id = v_active_location_brand_id;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reference_scope_visible(uuid, uuid, uuid, timestamp with time zone) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
