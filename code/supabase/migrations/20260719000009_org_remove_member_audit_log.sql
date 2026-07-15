-- 20260719000009: org_remove_member writes an audit log entry
--
-- Closes tracker item 16.3: org_remove_member (20260709000002_fix_legacy_roles_in_access_
-- functions.sql) detaches org/brand/location membership and resets the target's role to
-- ground_staff, but writes no audit trail at all -- unlike admin_delete_user, which archives
-- the removed user's details to archived_users before deleting.
--
-- Decision made during planning: keep the detach-and-reset behavior as-is (a hard delete at
-- the org level isn't warranted here -- this repo's data-integrity rule is soft-delete-only,
-- and admin_delete_user's actual account deletion is deliberately reserved for platform_admin
-- only). The fix is just to make the action leave a record, reusing the existing common
-- audit_logs / log_audit_event path (the same one 9.9 will later route invoice_audit_events
-- through) instead of inventing a bespoke insert.

BEGIN;

CREATE OR REPLACE FUNCTION public.org_remove_member(
  target_user_id uuid,
  target_org_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role TEXT;
  caller_org  UUID;
BEGIN
  caller_role := public.get_auth_role();
  caller_org  := COALESCE(target_org_id, public.get_auth_org());

  IF caller_role NOT IN ('org_manager', 'tenant_super_admin', 'platform_admin') THEN
    RAISE EXCEPTION 'Insufficient permissions: only org_manager, tenant_super_admin, or platform_admin can remove users';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot remove yourself. Transfer ownership first.';
  END IF;

  -- Remove from organization_members
  DELETE FROM public.organization_members
  WHERE user_id = target_user_id AND organization_id = caller_org;

  -- Remove from brand_members for this org
  DELETE FROM public.brand_members
  WHERE user_id = target_user_id
    AND brand_id IN (SELECT id FROM public.brands WHERE organization_id = caller_org);

  -- Remove from location_members for this org
  DELETE FROM public.location_members
  WHERE user_id = target_user_id
    AND location_id IN (SELECT id FROM public.locations WHERE organization_id = caller_org);

  -- Update profiles if this was their active org
  UPDATE public.profiles
  SET organization_id = NULL, brand_id = NULL, location_id = NULL, role = 'ground_staff'
  WHERE id = target_user_id AND organization_id = caller_org;

  -- Update app_metadata if this is their active context
  IF (SELECT raw_app_meta_data->>'organization_id' FROM auth.users WHERE id = target_user_id) = caller_org::text THEN
      UPDATE auth.users
      SET raw_app_meta_data = raw_app_meta_data - 'organization_id' - 'role' - 'brand_id' - 'location_id'
      WHERE id = target_user_id;
  END IF;

  PERFORM public.log_audit_event(jsonb_build_object(
    'organization_id', caller_org,
    'user_id', auth.uid(),
    'action', 'org_member_removed',
    'table_name', 'organization_members',
    'entity_type', 'user',
    'entity_id', target_user_id::text,
    'record_id', target_user_id::text,
    'details', jsonb_build_object('removed_user_id', target_user_id, 'removed_from_org', caller_org)
  ));

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMIT;
