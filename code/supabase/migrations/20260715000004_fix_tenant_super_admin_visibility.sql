BEGIN;

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

  IF p_organization_id IS NULL OR v_org_id IS DISTINCT FROM p_organization_id THEN
    RETURN false;
  END IF;

  IF v_role IN ('tenant_super_admin', 'org_manager', 'org_owner') THEN
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

NOTIFY pgrst, 'reload schema';

COMMIT;
