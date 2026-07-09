-- Repair live invitation role constraint for tenant_super_admin invites.
-- Some environments already marked the role-model migration as applied, so this
-- fresh migration makes the canonical invitation role constraint explicit.

UPDATE public.invitations
SET role = CASE role
  WHEN 'owner' THEN 'org_manager'
  WHEN 'org_owner' THEN 'org_manager'
  WHEN 'manager' THEN 'location_manager'
  WHEN 'admin' THEN 'platform_admin'
  ELSE role
END
WHERE role IN ('owner', 'org_owner', 'manager', 'admin');

ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_role_check CHECK (
    role IN (
      'ground_staff',
      'location_manager',
      'brand_manager',
      'branch_manager',
      'org_manager',
      'tenant_super_admin',
      'platform_admin'
    )
  );

NOTIFY pgrst, 'reload schema';