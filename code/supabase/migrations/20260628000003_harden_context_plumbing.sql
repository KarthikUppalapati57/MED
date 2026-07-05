BEGIN;

-- Step 1: Harden switch_user_context so client-supplied brand/location scope
-- is validated against the caller's current profile-derived access before any
-- profile context is updated.
CREATE OR REPLACE FUNCTION public.switch_user_context(
    p_organization_id uuid,
    p_brand_id uuid DEFAULT NULL,
    p_location_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_role text;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT role INTO v_role
    FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND user_id = v_user_id;

    IF v_role IS NULL AND NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'User is not a member of this organization';
    END IF;

    IF v_role IS NULL THEN
        v_role := 'platform_admin';
    END IF;

    IF p_brand_id IS NOT NULL
       AND NOT (p_brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))) THEN
        RAISE EXCEPTION 'Brand % not in your accessible scope', p_brand_id;
    END IF;

    IF p_location_id IS NOT NULL
       AND NOT (p_location_id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))) THEN
        RAISE EXCEPTION 'Location % not in your accessible scope', p_location_id;
    END IF;

    IF p_brand_id IS NOT NULL
       AND p_location_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM public.locations l
           WHERE l.id = p_location_id
             AND l.brand_id = p_brand_id
             AND l.organization_id = p_organization_id
       ) THEN
        RAISE EXCEPTION 'Location % is not in brand %', p_location_id, p_brand_id;
    END IF;

    UPDATE public.profiles
       SET organization_id = p_organization_id,
           brand_id = p_brand_id,
           location_id = p_location_id,
           role = v_role,
           updated_at = now()
     WHERE id = v_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'role', v_role,
        'organization_id', p_organization_id,
        'brand_id', p_brand_id,
        'location_id', p_location_id
    );
END;
$$;

-- Step 2: Replace current org-wide brands/locations policies with hierarchical
-- policies based on the canonical accessible brand/location helpers.
DROP POLICY IF EXISTS "Owners can create brands for their organizations" ON public.brands;
DROP POLICY IF EXISTS "RLS_SaaS_Isolation_brands" ON public.brands;
DROP POLICY IF EXISTS "Tenant Isolation Brands" ON public.brands;

DROP POLICY IF EXISTS "Owners can create locations for their organizations" ON public.locations;
DROP POLICY IF EXISTS "RLS_SaaS_Isolation_locations" ON public.locations;
DROP POLICY IF EXISTS "Tenant Isolation Locations" ON public.locations;
DROP POLICY IF EXISTS "Tenant_Isolation_locations_DELETE" ON public.locations;
DROP POLICY IF EXISTS "Tenant_Isolation_locations_INSERT" ON public.locations;
DROP POLICY IF EXISTS "Tenant_Isolation_locations_SELECT" ON public.locations;
DROP POLICY IF EXISTS "Tenant_Isolation_locations_UPDATE" ON public.locations;

DROP POLICY IF EXISTS "brands_hierarchical_select" ON public.brands;
DROP POLICY IF EXISTS "brands_hierarchical_insert" ON public.brands;
DROP POLICY IF EXISTS "brands_hierarchical_update" ON public.brands;
DROP POLICY IF EXISTS "brands_hierarchical_delete" ON public.brands;

DROP POLICY IF EXISTS "locations_hierarchical_select" ON public.locations;
DROP POLICY IF EXISTS "locations_hierarchical_insert" ON public.locations;
DROP POLICY IF EXISTS "locations_hierarchical_update" ON public.locations;
DROP POLICY IF EXISTS "locations_hierarchical_delete" ON public.locations;

CREATE POLICY "brands_hierarchical_select"
ON public.brands
FOR SELECT
USING (
    public.is_platform_admin()
    OR (
        organization_id = public.get_auth_org()
        AND (
            public.get_auth_role() = 'org_owner'
            OR brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
        )
    )
);

CREATE POLICY "brands_hierarchical_insert"
ON public.brands
FOR INSERT
WITH CHECK (
    public.is_platform_admin()
    OR (
        organization_id = public.get_auth_org()
        AND public.get_auth_role() = 'org_owner'
    )
);

CREATE POLICY "brands_hierarchical_update"
ON public.brands
FOR UPDATE
USING (
    public.is_platform_admin()
    OR (
        organization_id = public.get_auth_org()
        AND public.get_auth_role() IN ('branch_manager', 'org_owner')
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
    )
)
WITH CHECK (
    public.is_platform_admin()
    OR (
        organization_id = public.get_auth_org()
        AND public.get_auth_role() IN ('branch_manager', 'org_owner')
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
    )
);

CREATE POLICY "brands_hierarchical_delete"
ON public.brands
FOR DELETE
USING (
    public.is_platform_admin()
    OR (
        organization_id = public.get_auth_org()
        AND public.get_auth_role() IN ('branch_manager', 'org_owner')
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
    )
);

CREATE POLICY "locations_hierarchical_select"
ON public.locations
FOR SELECT
USING (
    public.is_platform_admin()
    OR (
        organization_id = public.get_auth_org()
        AND (
            public.get_auth_role() = 'org_owner'
            OR id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
        )
    )
);

CREATE POLICY "locations_hierarchical_insert"
ON public.locations
FOR INSERT
WITH CHECK (
    public.is_platform_admin()
    OR (
        organization_id = public.get_auth_org()
        AND public.get_auth_role() IN ('branch_manager', 'org_owner')
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
    )
);

CREATE POLICY "locations_hierarchical_update"
ON public.locations
FOR UPDATE
USING (
    public.is_platform_admin()
    OR (
        organization_id = public.get_auth_org()
        AND public.get_auth_role() IN ('branch_manager', 'org_owner')
        AND id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
    )
)
WITH CHECK (
    public.is_platform_admin()
    OR (
        organization_id = public.get_auth_org()
        AND public.get_auth_role() IN ('branch_manager', 'org_owner')
        AND id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
        AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
    )
);

CREATE POLICY "locations_hierarchical_delete"
ON public.locations
FOR DELETE
USING (
    public.is_platform_admin()
    OR (
        organization_id = public.get_auth_org()
        AND public.get_auth_role() IN ('branch_manager', 'org_owner')
        AND id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
    )
);

-- Step 3: Normalize grants so authenticated can read context sources and call
-- the hardened switch RPC, while anon/authenticated cannot use unsafe table privileges.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.brands, public.locations FROM anon, authenticated;
GRANT SELECT ON public.brands, public.locations TO authenticated;

REVOKE ALL ON FUNCTION public.switch_user_context(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.switch_user_context(uuid, uuid, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_auth_org() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_accessible_brand_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_accessible_location_ids() TO authenticated;

COMMIT;
