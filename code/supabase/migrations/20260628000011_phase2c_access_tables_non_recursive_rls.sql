BEGIN;

-- Phase 2c: access-defining tables need hand-written, non-recursive RLS.
-- profiles is the recursion root: standard helpers resolve through profiles, so
-- profile policies use only auth.uid(), direct columns, and these definer helpers.

CREATE OR REPLACE FUNCTION public.my_profile_org()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.organization_id
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.my_profile_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.my_profile_brand()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.brand_id
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.my_profile_location()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.location_id
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.access_role_rank(p_role text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_role
    WHEN 'ground_staff' THEN 10
    WHEN 'location_manager' THEN 20
    WHEN 'branch_manager' THEN 30
    WHEN 'org_owner' THEN 40
    WHEN 'platform_admin' THEN 50
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.access_membership_readable(
  p_target_user uuid,
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_org uuid;
  v_brand uuid;
  v_location uuid;
  v_target_org uuid;
  v_target_brand uuid;
  v_target_location uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF p_target_user = auth.uid() THEN
    RETURN true;
  END IF;

  SELECT p.role, p.organization_id, p.brand_id, p.location_id
    INTO v_role, v_org, v_brand, v_location
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.deleted_at IS NULL;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  IF v_role = 'platform_admin' THEN
    RETURN true;
  END IF;

  SELECT p.organization_id, p.brand_id, p.location_id
    INTO v_target_org, v_target_brand, v_target_location
  FROM public.profiles p
  WHERE p.id = p_target_user
    AND p.deleted_at IS NULL;

  v_target_org := COALESCE(v_target_org, p_organization_id);
  v_target_location := COALESCE(v_target_location, p_location_id);
  v_target_brand := COALESCE(v_target_brand, p_brand_id);

  IF v_target_brand IS NULL AND v_target_location IS NOT NULL THEN
    SELECT l.brand_id INTO v_target_brand
    FROM public.locations l
    WHERE l.id = v_target_location;
  END IF;

  IF v_org IS NULL OR v_target_org IS DISTINCT FROM v_org THEN
    RETURN false;
  END IF;

  IF v_role = 'org_owner' THEN
    RETURN true;
  END IF;

  IF v_role = 'branch_manager' THEN
    RETURN v_brand IS NOT NULL AND v_target_brand = v_brand;
  END IF;

  IF v_role = 'location_manager' THEN
    RETURN v_location IS NOT NULL AND v_target_location = v_location;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.access_membership_writable(
  p_target_user uuid,
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_granted_role text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_org uuid;
  v_brand uuid;
  v_location uuid;
  v_target_org uuid;
  v_target_brand uuid;
  v_target_location uuid;
  v_granted_role text;
  v_caller_rank integer;
  v_grant_rank integer;
BEGIN
  IF auth.uid() IS NULL OR p_target_user IS NULL OR p_target_user = auth.uid() THEN
    RETURN false;
  END IF;

  SELECT p.role, p.organization_id, p.brand_id, p.location_id
    INTO v_role, v_org, v_brand, v_location
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.deleted_at IS NULL;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  SELECT p.organization_id, p.brand_id, p.location_id
    INTO v_target_org, v_target_brand, v_target_location
  FROM public.profiles p
  WHERE p.id = p_target_user
    AND p.deleted_at IS NULL;

  v_target_org := COALESCE(v_target_org, p_organization_id);
  v_target_location := COALESCE(v_target_location, p_location_id);
  v_target_brand := COALESCE(v_target_brand, p_brand_id);

  IF v_target_brand IS NULL AND v_target_location IS NOT NULL THEN
    SELECT l.brand_id INTO v_target_brand
    FROM public.locations l
    WHERE l.id = v_target_location;
  END IF;

  v_granted_role := COALESCE(p_granted_role, 'ground_staff');
  v_caller_rank := public.access_role_rank(v_role);
  v_grant_rank := public.access_role_rank(v_granted_role);

  IF v_caller_rank = 0 OR v_grant_rank = 0 OR v_grant_rank >= v_caller_rank THEN
    RETURN false;
  END IF;

  IF v_role = 'platform_admin' THEN
    RETURN true;
  END IF;

  IF v_org IS NULL OR v_target_org IS DISTINCT FROM v_org THEN
    RETURN false;
  END IF;

  IF v_role = 'org_owner' THEN
    RETURN true;
  END IF;

  IF v_role = 'branch_manager' THEN
    RETURN v_grant_rank <= public.access_role_rank('location_manager')
       AND v_brand IS NOT NULL
       AND v_target_brand = v_brand;
  END IF;

  IF v_role = 'location_manager' THEN
    RETURN v_granted_role = 'ground_staff'
       AND v_location IS NOT NULL
       AND v_target_location = v_location;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.access_user_role_name(p_role_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.name
  FROM public.roles r
  WHERE r.id = p_role_id;
$$;

REVOKE EXECUTE ON FUNCTION public.my_profile_org() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_profile_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_profile_brand() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_profile_location() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.access_role_rank(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.access_membership_readable(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.access_membership_writable(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.access_user_role_name(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.my_profile_org() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_profile_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_profile_brand() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_profile_location() TO authenticated;
GRANT EXECUTE ON FUNCTION public.access_role_rank(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.access_membership_readable(uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.access_membership_writable(uuid, uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.access_user_role_name(uuid) TO authenticated;

DO $$
DECLARE
  v_table text;
  v_policy record;
  v_tables text[] := ARRAY[
    'profiles',
    'organization_members',
    'brand_members',
    'location_members',
    'user_roles'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    FOR v_policy IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = v_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy.policyname, v_table);
    END LOOP;
  END LOOP;
END $$;

REVOKE ALL PRIVILEGES ON public.profiles, public.organization_members, public.brand_members, public.location_members, public.user_roles FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.profiles, public.organization_members, public.brand_members, public.location_members, public.user_roles FROM anon, authenticated;

GRANT SELECT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members, public.brand_members, public.location_members, public.user_roles TO authenticated;

CREATE POLICY profiles_nonrecursive_select ON public.profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR public.my_profile_role() = 'platform_admin'
    OR (
      organization_id = public.my_profile_org()
      AND public.my_profile_role() IN ('location_manager', 'branch_manager', 'org_owner')
    )
  );

CREATE POLICY profiles_self_update_nonsecurity ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_owner_delete_nonrecursive ON public.profiles
  FOR DELETE
  USING (
    id <> auth.uid()
    AND (
      public.my_profile_role() = 'platform_admin'
      OR (
        public.my_profile_role() = 'org_owner'
        AND organization_id = public.my_profile_org()
      )
    )
  );

CREATE POLICY organization_members_select_scope ON public.organization_members
  FOR SELECT
  USING (public.access_membership_readable(user_id, organization_id, NULL, NULL));

CREATE POLICY organization_members_insert_cascade_down ON public.organization_members
  FOR INSERT
  WITH CHECK (public.access_membership_writable(user_id, organization_id, NULL, NULL, role));

CREATE POLICY organization_members_update_cascade_down ON public.organization_members
  FOR UPDATE
  USING (public.access_membership_writable(user_id, organization_id, NULL, NULL, role))
  WITH CHECK (public.access_membership_writable(user_id, organization_id, NULL, NULL, role));

CREATE POLICY organization_members_delete_cascade_down ON public.organization_members
  FOR DELETE
  USING (public.access_membership_writable(user_id, organization_id, NULL, NULL, role));

CREATE POLICY brand_members_select_scope ON public.brand_members
  FOR SELECT
  USING (public.access_membership_readable(user_id, organization_id, brand_id, NULL));

CREATE POLICY brand_members_insert_cascade_down ON public.brand_members
  FOR INSERT
  WITH CHECK (public.access_membership_writable(user_id, organization_id, brand_id, NULL, role));

CREATE POLICY brand_members_update_cascade_down ON public.brand_members
  FOR UPDATE
  USING (public.access_membership_writable(user_id, organization_id, brand_id, NULL, role))
  WITH CHECK (public.access_membership_writable(user_id, organization_id, brand_id, NULL, role));

CREATE POLICY brand_members_delete_cascade_down ON public.brand_members
  FOR DELETE
  USING (public.access_membership_writable(user_id, organization_id, brand_id, NULL, role));

CREATE POLICY location_members_select_scope ON public.location_members
  FOR SELECT
  USING (public.access_membership_readable(user_id, organization_id, NULL, location_id));

CREATE POLICY location_members_insert_cascade_down ON public.location_members
  FOR INSERT
  WITH CHECK (public.access_membership_writable(user_id, organization_id, NULL, location_id, role));

CREATE POLICY location_members_update_cascade_down ON public.location_members
  FOR UPDATE
  USING (public.access_membership_writable(user_id, organization_id, NULL, location_id, role))
  WITH CHECK (public.access_membership_writable(user_id, organization_id, NULL, location_id, role));

CREATE POLICY location_members_delete_cascade_down ON public.location_members
  FOR DELETE
  USING (public.access_membership_writable(user_id, organization_id, NULL, location_id, role));

CREATE POLICY user_roles_select_scope ON public.user_roles
  FOR SELECT
  USING (public.access_membership_readable(user_id, organization_id, NULL, location_id));

CREATE POLICY user_roles_insert_cascade_down ON public.user_roles
  FOR INSERT
  WITH CHECK (
    public.access_membership_writable(
      user_id,
      organization_id,
      NULL,
      location_id,
      public.access_user_role_name(role_id)
    )
  );

CREATE POLICY user_roles_update_cascade_down ON public.user_roles
  FOR UPDATE
  USING (
    public.access_membership_writable(
      user_id,
      organization_id,
      NULL,
      location_id,
      public.access_user_role_name(role_id)
    )
  )
  WITH CHECK (
    public.access_membership_writable(
      user_id,
      organization_id,
      NULL,
      location_id,
      public.access_user_role_name(role_id)
    )
  );

CREATE POLICY user_roles_delete_cascade_down ON public.user_roles
  FOR DELETE
  USING (
    public.access_membership_writable(
      user_id,
      organization_id,
      NULL,
      location_id,
      public.access_user_role_name(role_id)
    )
  );

COMMIT;
