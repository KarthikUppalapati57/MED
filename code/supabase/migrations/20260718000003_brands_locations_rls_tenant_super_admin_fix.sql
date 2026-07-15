-- Fix brands/locations RLS: 20260628000003_harden_context_plumbing.sql predates the
-- tenant_super_admin/org_manager role model (20260708000002) and was never revisited.
--   - SELECT: get_auth_role() = 'org_owner' (dead string) OR'd with an outer
--     organization_id = get_auth_org() AND that silently collapses tenant_super_admin's
--     cross-org visibility down to one org.
--   - INSERT/UPDATE/DELETE: get_auth_role() IN ('branch_manager', 'org_owner') -- neither
--     org_manager nor tenant_super_admin can create/edit/delete a brand or location at all.
--
-- Depends on 20260718000002 (organizations RLS) being applied first: the INSERT/UPDATE
-- WITH CHECK clauses below run an inline subquery against public.organizations, which is
-- itself subject to organizations' RLS (not a SECURITY DEFINER call) -- see the plan's
-- Ordering note.
--
-- Rebuilt on the already-correct get_my_accessible_brand_ids()/get_my_accessible_location_ids()
-- (20260708000002...sql:402/:428), which already do full per-role scoping including
-- tenant-wide for tenant_super_admin. brand_id is brands' PK (renamed from id in
-- 114_rename_brands_id.sql); locations keeps id as PK with locations.brand_id as the FK.
--
-- Product decision: branch_manager manages brands/locations already assigned to them but does
-- NOT get brand-creation rights -- only org_manager and above can INSERT a brand. A
-- branch_manager CAN insert a new location under a brand they already manage.

BEGIN;

DROP POLICY IF EXISTS "brands_hierarchical_select" ON public.brands;
DROP POLICY IF EXISTS "brands_hierarchical_insert" ON public.brands;
DROP POLICY IF EXISTS "brands_hierarchical_update" ON public.brands;
DROP POLICY IF EXISTS "brands_hierarchical_delete" ON public.brands;

DROP POLICY IF EXISTS "locations_hierarchical_select" ON public.locations;
DROP POLICY IF EXISTS "locations_hierarchical_insert" ON public.locations;
DROP POLICY IF EXISTS "locations_hierarchical_update" ON public.locations;
DROP POLICY IF EXISTS "locations_hierarchical_delete" ON public.locations;

-- ===== brands =====

CREATE POLICY "brands_hierarchical_select"
ON public.brands
FOR SELECT
USING (
  public.is_platform_admin()
  OR brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
);

CREATE POLICY "brands_hierarchical_insert"
ON public.brands
FOR INSERT
WITH CHECK (
  public.access_role_rank(public.get_auth_role()) >= public.access_role_rank('org_manager')
  AND (
    public.is_platform_admin()
    OR (
      public.get_auth_role() = 'tenant_super_admin'
      AND organization_id IN (
        SELECT id FROM public.organizations WHERE tenant_id = public.get_auth_tenant()
      )
    )
    OR (
      public.get_auth_role() = 'org_manager'
      AND organization_id = public.get_auth_org()
    )
  )
);

CREATE POLICY "brands_hierarchical_update"
ON public.brands
FOR UPDATE
USING (
  public.is_platform_admin()
  OR (
    public.access_role_rank(public.get_auth_role()) >= public.access_role_rank('branch_manager')
    AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR (
    public.access_role_rank(public.get_auth_role()) >= public.access_role_rank('branch_manager')
    AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
    AND (
      (public.get_auth_role() = 'tenant_super_admin'
        AND organization_id IN (SELECT id FROM public.organizations WHERE tenant_id = public.get_auth_tenant()))
      OR (public.get_auth_role() IN ('org_manager', 'branch_manager')
        AND organization_id = public.get_auth_org())
    )
  )
);

CREATE POLICY "brands_hierarchical_delete"
ON public.brands
FOR DELETE
USING (
  public.is_platform_admin()
  OR (
    public.access_role_rank(public.get_auth_role()) >= public.access_role_rank('branch_manager')
    AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
  )
);

-- ===== locations =====

CREATE POLICY "locations_hierarchical_select"
ON public.locations
FOR SELECT
USING (
  public.is_platform_admin()
  OR id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
);

CREATE POLICY "locations_hierarchical_insert"
ON public.locations
FOR INSERT
WITH CHECK (
  public.access_role_rank(public.get_auth_role()) >= public.access_role_rank('branch_manager')
  AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
  AND organization_id IN (
    SELECT b.organization_id FROM public.brands b WHERE b.brand_id = locations.brand_id
  )
);

CREATE POLICY "locations_hierarchical_update"
ON public.locations
FOR UPDATE
USING (
  public.is_platform_admin()
  OR (
    public.access_role_rank(public.get_auth_role()) >= public.access_role_rank('branch_manager')
    AND id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR (
    public.access_role_rank(public.get_auth_role()) >= public.access_role_rank('branch_manager')
    AND brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))
    AND organization_id IN (
      SELECT b.organization_id FROM public.brands b WHERE b.brand_id = locations.brand_id
    )
  )
);

CREATE POLICY "locations_hierarchical_delete"
ON public.locations
FOR DELETE
USING (
  public.is_platform_admin()
  OR (
    public.access_role_rank(public.get_auth_role()) >= public.access_role_rank('branch_manager')
    AND id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))
  )
);

COMMIT;
