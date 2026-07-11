-- Backfill accepted tenant super admin invites where platform admin disabled business verification.
-- New accepts already do this in accept_invitation; this fixes older/stuck test users.

UPDATE public.profiles p
SET business_verification_status = 'verified',
    onboarding_current_step = CASE
      WHEN p.organization_id IS NULL THEN 'hierarchy_setup'
      ELSE p.onboarding_current_step
    END,
    updated_at = now()
FROM public.invitations i
WHERE i.accepted_by = p.id
  AND public.normalize_app_role(i.role) = 'tenant_super_admin'
  AND COALESCE((i.metadata->>'business_verification_required')::boolean, true) IS FALSE
  AND COALESCE(p.business_verification_status, 'not_started') <> 'verified';

NOTIFY pgrst, 'reload schema';
