-- Fix profiles RLS: org_owner -> org_manager rename (20260708000002) never propagated here.
-- profiles_nonrecursive_select / profiles_owner_delete_nonrecursive still gate on the dead
-- 'org_owner' string, so org_manager and tenant_super_admin cannot see or remove other users'
-- profiles in their own org. Closes CLAUDE.md's open Phase 2c item.
--
-- Fix: route through the already-correct access_membership_readable/writable() functions
-- (20260708000002...sql:458/:550), the same primitives organization_members/brand_members/
-- location_members already use. No new role logic — just reuse what's already correct.

BEGIN;

DROP POLICY IF EXISTS profiles_nonrecursive_select ON public.profiles;
DROP POLICY IF EXISTS profiles_owner_delete_nonrecursive ON public.profiles;

CREATE POLICY profiles_nonrecursive_select ON public.profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR public.access_membership_readable(id, organization_id, brand_id, location_id)
  );

CREATE POLICY profiles_owner_delete_nonrecursive ON public.profiles
  FOR DELETE
  USING (
    id <> auth.uid()
    AND public.access_membership_writable(id, organization_id, brand_id, location_id)
  );

COMMIT;
