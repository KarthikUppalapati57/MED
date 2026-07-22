BEGIN;

-- Invoice intake/document RPCs still depend on assert_org_actor(), which only
-- allowed profile.organization_id unless the caller was platform_admin. Tenant
-- super admins can switch into sibling organizations in the same tenant, so the
-- org guard must honor tenant ownership instead of treating that as cross-org.
CREATE OR REPLACE FUNCTION public.assert_org_actor(p_organization_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_role TEXT;
  v_profile_org UUID;
  v_profile_tenant UUID;
  v_org_tenant UUID;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization context is required';
  END IF;

  SELECT public.normalize_app_role(p.role), p.organization_id, p.tenant_id
    INTO v_role, v_profile_org, v_profile_tenant
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.deleted_at IS NULL;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  IF v_role = 'platform_admin' THEN
    RETURN;
  END IF;

  IF v_role = 'tenant_super_admin' THEN
    SELECT o.tenant_id
      INTO v_org_tenant
    FROM public.organizations o
    WHERE o.id = p_organization_id;

    IF COALESCE(v_profile_tenant, public.get_auth_tenant()) IS NOT DISTINCT FROM v_org_tenant THEN
      RETURN;
    END IF;

    RAISE EXCEPTION 'Cross-tenant access denied';
  END IF;

  IF v_profile_org IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'Cross-organization access denied';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_org_actor(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_org_actor(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
