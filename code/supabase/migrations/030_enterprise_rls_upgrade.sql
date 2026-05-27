-- Migration 030: Enterprise RLS Upgrade (Phase 1)
-- Upgrades RLS to be database-driven rather than relying on stale JWT metadata.

-- 1. Create the new get_my_org() function as specified in the upgrade plan
CREATE OR REPLACE FUNCTION public.get_my_org()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT organization_id
  FROM public.profiles
  WHERE id = auth.uid();
$$;

-- 2. Overwrite the existing get_auth_org() function to use the database-driven approach.
-- This instantly upgrades all existing RLS policies that rely on get_auth_org() without needing to recreate them all.
CREATE OR REPLACE FUNCTION public.get_auth_org()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT public.get_my_org();
$$;

-- Note: Role-based helpers (is_manager_or_above, etc.) already query the profiles table directly via get_user_role(),
-- so they do not suffer from the stale JWT issue and require no changes.
