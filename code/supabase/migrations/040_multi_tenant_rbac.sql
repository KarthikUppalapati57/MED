-- ============================================================
-- Migration 040: Multi-Tenant Multi-Role Architecture
-- ============================================================

BEGIN;

-- 1. Create Membership Tables
CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'ground_staff',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.brand_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'ground_staff',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(brand_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.location_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'ground_staff',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(location_id, user_id)
);

-- Enable RLS
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_members ENABLE ROW LEVEL SECURITY;

-- Basic RLS for viewing memberships
DROP POLICY IF EXISTS "Users can view own organization_members" ON public.organization_members;
CREATE POLICY "Users can view own organization_members" ON public.organization_members FOR SELECT USING (user_id = auth.uid() OR organization_id = public.get_auth_org() OR public.get_auth_role() = 'platform_admin');

DROP POLICY IF EXISTS "Users can view own brand_members" ON public.brand_members;
CREATE POLICY "Users can view own brand_members" ON public.brand_members FOR SELECT USING (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin' OR EXISTS (SELECT 1 FROM public.brands WHERE id = brand_id AND organization_id = public.get_auth_org()));

DROP POLICY IF EXISTS "Users can view own location_members" ON public.location_members;
CREATE POLICY "Users can view own location_members" ON public.location_members FOR SELECT USING (user_id = auth.uid() OR public.get_auth_role() = 'platform_admin' OR EXISTS (SELECT 1 FROM public.locations WHERE id = location_id AND organization_id = public.get_auth_org()));

-- 2. Data Migration: Copy existing users from `profiles` to membership tables
INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT organization_id, id, role
FROM public.profiles
WHERE organization_id IS NOT NULL
ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.brand_members (brand_id, user_id, role)
SELECT brand_id, id, role
FROM public.profiles
WHERE brand_id IS NOT NULL
ON CONFLICT (brand_id, user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.location_members (location_id, user_id, role)
SELECT location_id, id, role
FROM public.profiles
WHERE location_id IS NOT NULL
ON CONFLICT (location_id, user_id) DO UPDATE SET role = EXCLUDED.role;

-- 3. Context Switcher RPC
CREATE OR REPLACE FUNCTION public.switch_user_context(
    p_organization_id UUID,
    p_brand_id UUID DEFAULT NULL,
    p_location_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Verify membership in the organization
    SELECT role INTO v_role
    FROM public.organization_members
    WHERE organization_id = p_organization_id AND user_id = v_user_id;

    IF v_role IS NULL AND (SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') != 'platform_admin') THEN
        RAISE EXCEPTION 'User is not a member of this organization';
    END IF;

    IF v_role IS NULL THEN
        -- If platform admin, keep their role
        v_role := 'platform_admin';
    END IF;

    -- Update app_metadata for fast RLS checks (Preserves existing workflow)
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
        'role', v_role,
        'organization_id', p_organization_id::text,
        'brand_id', COALESCE(p_brand_id::text, null),
        'location_id', COALESCE(p_location_id::text, null)
    )
    WHERE id = v_user_id;

    -- Also update profile to keep legacy queries from breaking
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

-- 4. Update setup_organization_full to insert into members table
CREATE OR REPLACE FUNCTION public.setup_organization_full(
  p_user_id UUID,
  p_org_name TEXT,
  p_org_slug TEXT,
  p_brand_name TEXT,
  p_location_name TEXT,
  p_location_address TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id UUID;
  v_brand_id UUID;
  v_location_id UUID;
BEGIN
  IF auth.uid() != p_user_id AND public.get_auth_role() != 'platform_admin' THEN
    RAISE EXCEPTION 'Not authorized to onboard another user';
  END IF;

  INSERT INTO public.organizations (name, slug, owner_id)
  VALUES (p_org_name, p_org_slug, p_user_id)
  RETURNING id INTO v_org_id;

  INSERT INTO public.brands (organization_id, name)
  VALUES (v_org_id, p_brand_name)
  RETURNING id INTO v_brand_id;

  INSERT INTO public.locations (organization_id, brand_id, name, address)
  VALUES (v_org_id, v_brand_id, p_location_name, p_location_address)
  RETURNING id INTO v_location_id;

  -- Insert into new multi-tenant tables
  INSERT INTO public.organization_members (organization_id, user_id, role) VALUES (v_org_id, p_user_id, 'org_owner');
  INSERT INTO public.brand_members (brand_id, user_id, role) VALUES (v_brand_id, p_user_id, 'org_owner');
  INSERT INTO public.location_members (location_id, user_id, role) VALUES (v_location_id, p_user_id, 'org_owner');

  -- Update profiles for fallback
  UPDATE public.profiles
  SET organization_id = v_org_id,
      brand_id        = v_brand_id,
      location_id     = v_location_id,
      role            = 'org_owner',
      access_level    = 'organization',
      updated_at      = now()
  WHERE id = p_user_id;

  -- Update app_metadata
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', 'org_owner',
    'organization_id', v_org_id::text
  )
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'org_id',      v_org_id,
    'brand_id',    v_brand_id,
    'location_id', v_location_id
  );
END;
$$;

-- 5. Update accept_invitation to insert into members table
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invite RECORD;
  v_user_id UUID;
  v_user_email TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  SELECT * INTO v_invite
  FROM public.invitations
  WHERE token::text = p_token
    AND accepted_at IS NULL
    AND LOWER(email) = LOWER(v_user_email);

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid, expired, or already-accepted invitation';
  END IF;

  -- Insert into new multi-tenant tables
  INSERT INTO public.organization_members (organization_id, user_id, role) 
  VALUES (v_invite.organization_id, v_user_id, v_invite.role)
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  
  IF v_invite.brand_id IS NOT NULL THEN
      INSERT INTO public.brand_members (brand_id, user_id, role) 
      VALUES (v_invite.brand_id, v_user_id, v_invite.role)
      ON CONFLICT (brand_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  IF v_invite.location_id IS NOT NULL THEN
      INSERT INTO public.location_members (location_id, user_id, role) 
      VALUES (v_invite.location_id, v_user_id, v_invite.role)
      ON CONFLICT (location_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  UPDATE public.profiles
  SET role            = v_invite.role,
      organization_id = v_invite.organization_id,
      brand_id        = COALESCE(v_invite.brand_id, brand_id),
      location_id     = COALESCE(v_invite.location_id, location_id),
      updated_at      = now()
  WHERE id = v_user_id;

  UPDATE public.invitations
  SET accepted_at = now(),
      accepted_by = v_user_id
  WHERE id = v_invite.id;

  -- Update app_metadata for fast RLS
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', v_invite.role,
    'organization_id', v_invite.organization_id::text
  )
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success',         true,
    'role',            v_invite.role,
    'organization_id', v_invite.organization_id
  );
END;
$$;

-- 6. Update admin_update_user_role to update members table
CREATE OR REPLACE FUNCTION public.admin_update_user_role(
  target_user_id    UUID,
  new_role          TEXT,
  new_status        TEXT         DEFAULT NULL,
  new_department    TEXT         DEFAULT NULL,
  new_location      TEXT         DEFAULT NULL,
  new_permissions   JSONB        DEFAULT NULL,
  new_brand_id      UUID         DEFAULT NULL,
  new_location_id   UUID         DEFAULT NULL,
  new_access_level  TEXT         DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_role TEXT;
  caller_org  UUID;
  target_org  UUID;
BEGIN
  caller_role := public.get_auth_role();
  caller_org  := public.get_auth_org();

  IF caller_role NOT IN ('org_owner', 'platform_admin') THEN
    RAISE EXCEPTION 'Insufficient permissions: only org_owner or platform_admin can update user roles';
  END IF;

  SELECT organization_id INTO target_org
  FROM public.profiles
  WHERE id = target_user_id;

  IF caller_role = 'org_owner' AND target_org IS DISTINCT FROM caller_org THEN
    RAISE EXCEPTION 'Cannot modify users outside your organization';
  END IF;

  IF caller_role != 'platform_admin' AND new_role IS NOT NULL THEN
    IF NOT public.can_invite_role(new_role) THEN
      RAISE EXCEPTION 'Cannot assign a role equal to or above your own';
    END IF;
  END IF;

  IF target_user_id = auth.uid() AND caller_role = 'org_owner' AND new_role != 'org_owner' THEN
    RAISE EXCEPTION 'Cannot change your own role. Transfer ownership first.';
  END IF;
  
  -- Update membership tables
  IF new_role IS NOT NULL AND target_org IS NOT NULL THEN
      INSERT INTO public.organization_members (organization_id, user_id, role)
      VALUES (target_org, target_user_id, new_role)
      ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  UPDATE public.profiles
  SET role         = COALESCE(new_role, role),
      status       = COALESCE(new_status, status),
      department   = COALESCE(new_department, department),
      permissions  = COALESCE(new_permissions, permissions),
      brand_id     = COALESCE(new_brand_id, brand_id),
      location_id  = COALESCE(new_location_id, location_id),
      access_level = COALESCE(new_access_level, access_level),
      updated_at   = now()
  WHERE id = target_user_id;

  -- Only update app_metadata if this is their ACTIVE org, otherwise let it be
  -- (If we update their app_metadata here blindly, we might kick them out of their current context)
  IF (SELECT raw_app_meta_data->>'organization_id' FROM auth.users WHERE id = target_user_id) = target_org::text THEN
      UPDATE auth.users
      SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
        'role', COALESCE(new_role, (SELECT role FROM public.profiles WHERE id = target_user_id))
      )
      WHERE id = target_user_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 7. Add fetch_user_access_tree RPC for Frontend Context Initialization
CREATE OR REPLACE FUNCTION public.fetch_user_access_tree()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_agg(
    jsonb_build_object(
      'organization', row_to_json(o.*),
      'role', om.role,
      'brands', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'brand', row_to_json(b.*),
            'role', bm.role,
            'locations', (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'location', row_to_json(l.*),
                  'role', lm.role
                )
              )
              FROM public.location_members lm
              JOIN public.locations l ON l.id = lm.location_id
              WHERE lm.user_id = auth.uid() AND l.brand_id = b.id
            )
          )
        )
        FROM public.brand_members bm
        JOIN public.brands b ON b.id = bm.brand_id
        WHERE bm.user_id = auth.uid() AND b.organization_id = o.id
      )
    )
  )
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.user_id = auth.uid();
$$;

COMMIT;
