BEGIN;

-- 20260720000013_fix_tenant_super_admin_visibility.sql gated tenant_scope_visible
-- on (v_org_id IS DISTINCT FROM p_organization_id) BEFORE checking role, so
-- tenant_super_admin could never see a sibling organization's rows -- capped to
-- exactly one org, same as org_manager. tenant_super_admin's whole point (per
-- the organizations/brands/locations RLS in 20260718000002/20260718000003) is
-- TENANT-wide access via get_auth_tenant(), not single-org equality.
--
-- The local DB already has the correct fix applied directly (not through a
-- migration file -- there is no on-disk migration matching this body). This
-- migration exists to capture that live, already-verified fix as a tracked
-- file so it isn't lost on a rebuild/prod deploy. Function bodies below were
-- read back from the live DB via pg_get_functiondef, not re-derived.

CREATE OR REPLACE FUNCTION public.tenant_scope_visible(
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

  SELECT role, organization_id
    INTO v_role, v_org_id
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
    IF p_organization_id IS NULL THEN
      RETURN false;
    END IF;
    RETURN public.get_auth_tenant() = (SELECT tenant_id FROM public.organizations WHERE id = p_organization_id);
  END IF;

  IF p_organization_id IS NULL OR v_org_id IS DISTINCT FROM p_organization_id THEN
    RETURN false;
  END IF;

  IF v_role = 'org_manager' THEN
    RETURN true;
  END IF;

  IF p_brand_id IS NULL AND p_location_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_role = 'branch_manager' THEN
    RETURN (
      p_brand_id IN (SELECT id FROM public.get_my_accessible_brand_ids() id)
      OR p_location_id IN (SELECT id FROM public.get_my_accessible_location_ids() id)
    );
  END IF;

  IF v_role = 'location_manager' THEN
    RETURN p_location_id IN (SELECT id FROM public.get_my_accessible_location_ids() id);
  END IF;

  IF v_role = 'ground_staff' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = p_organization_id
        AND p.location_id = p_location_id
        AND (
          p_brand_id IS NULL
          OR p.brand_id IS NULL
          OR p.brand_id = p_brand_id
        )
        AND p.deleted_at IS NULL
    );
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tenant_scope_visible(uuid, uuid, uuid, timestamp with time zone) TO authenticated, service_role;

-- reference_scope_visible (vendors/products/recipes hybrid brand-shared
-- pattern) has the identical gap and the identical live fix already applied.
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

  SELECT role, organization_id
    INTO v_role, v_org_id
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
    IF p_organization_id IS NULL THEN
      RETURN false;
    END IF;
    RETURN public.get_auth_tenant() = (SELECT tenant_id FROM public.organizations WHERE id = p_organization_id);
  END IF;

  IF p_organization_id IS NULL OR v_org_id IS DISTINCT FROM p_organization_id THEN
    RETURN false;
  END IF;

  IF v_role = 'org_manager' THEN
    RETURN true;
  END IF;

  IF p_location_id IS NOT NULL THEN
    RETURN p_location_id IN (SELECT id FROM public.get_my_accessible_location_ids() id);
  END IF;

  IF p_brand_id IS NOT NULL THEN
    RETURN p_brand_id IN (SELECT id FROM public.get_my_accessible_brand_ids() id);
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reference_scope_visible(uuid, uuid, uuid, timestamp with time zone) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
