-- Tenant Super Admin + Org Manager role model.
-- Adds a business tenant layer above organizations and migrates the
-- legacy customer-facing owner role to org_manager.

BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS tenant_id uuid;

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_status_check CHECK (status IN ('active', 'suspended', 'archived'))
);

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_tenant_id_fkey;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_tenant_id_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL;

ALTER TABLE public.invitations
  DROP CONSTRAINT IF EXISTS invitations_tenant_id_fkey;
ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'org_manager',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organizations_tenant_id ON public.organizations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON public.profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invitations_tenant_id ON public.invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_user_id ON public.tenant_members(user_id);

CREATE OR REPLACE FUNCTION public.normalize_app_role(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE COALESCE(NULLIF(p_role, ''), 'ground_staff')
    WHEN 'owner' THEN 'org_manager'
    WHEN 'org_owner' THEN 'org_manager'
    WHEN 'manager' THEN 'branch_manager'
    WHEN 'admin' THEN 'platform_admin'
    ELSE p_role
  END;
$$;

CREATE OR REPLACE FUNCTION public.touch_tenant_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_tenants_updated_at ON public.tenants;
CREATE TRIGGER trg_touch_tenants_updated_at
BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.touch_tenant_updated_at();

DROP TRIGGER IF EXISTS trg_touch_tenant_members_updated_at ON public.tenant_members;
CREATE TRIGGER trg_touch_tenant_members_updated_at
BEFORE UPDATE ON public.tenant_members
FOR EACH ROW EXECUTE FUNCTION public.touch_tenant_updated_at();

-- Backfill one business tenant per current organization owner where possible.
INSERT INTO public.tenants (name, slug, owner_id, metadata)
SELECT
  COALESCE(max(o.name) FILTER (WHERE o.owner_id IS NOT NULL), max(o.name), 'Tenant') AS name,
  left(
    'tenant_' ||
    regexp_replace(lower(COALESCE(max(o.slug), max(o.name), min(o.id::text))), '[^a-z0-9]+', '_', 'g') ||
    '_' || replace(left(min(o.id::text), 8), '-', ''),
    63
  ) AS slug,
  o.owner_id,
  jsonb_build_object('source', 'tenant_super_admin_org_manager_backfill')
FROM public.organizations o
WHERE o.tenant_id IS NULL
GROUP BY COALESCE(o.owner_id, o.id), o.owner_id
ON CONFLICT (slug) DO NOTHING;

UPDATE public.organizations o
SET tenant_id = t.id
FROM public.tenants t
WHERE o.tenant_id IS NULL
  AND (
    (o.owner_id IS NOT NULL AND t.owner_id = o.owner_id)
    OR t.slug = left(
      'tenant_' ||
      regexp_replace(lower(COALESCE(o.slug, o.name, o.id::text)), '[^a-z0-9]+', '_', 'g') ||
      '_' || replace(left(o.id::text, 8), '-', ''),
      63
    )
  );

INSERT INTO public.tenants (name, slug, owner_id, metadata)
SELECT
  COALESCE(o.name, 'Tenant'),
  left(
    'tenant_' ||
    regexp_replace(lower(COALESCE(o.slug, o.name, o.id::text)), '[^a-z0-9]+', '_', 'g') ||
    '_' || replace(left(o.id::text, 8), '-', ''),
    63
  ),
  o.owner_id,
  jsonb_build_object('source', 'tenant_super_admin_org_manager_backfill_fallback')
FROM public.organizations o
WHERE o.tenant_id IS NULL
ON CONFLICT (slug) DO NOTHING;

UPDATE public.organizations o
SET tenant_id = t.id
FROM public.tenants t
WHERE o.tenant_id IS NULL
  AND t.slug = left(
    'tenant_' ||
    regexp_replace(lower(COALESCE(o.slug, o.name, o.id::text)), '[^a-z0-9]+', '_', 'g') ||
    '_' || replace(left(o.id::text, 8), '-', ''),
    63
  );

UPDATE public.profiles p
SET tenant_id = o.tenant_id
FROM public.organizations o
WHERE p.organization_id = o.id
  AND p.tenant_id IS NULL;

UPDATE public.invitations i
SET tenant_id = o.tenant_id
FROM public.organizations o
WHERE i.organization_id = o.id
  AND i.tenant_id IS NULL;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE public.tenant_members DROP CONSTRAINT IF EXISTS tenant_members_role_check;

-- Normalize stored role values.
UPDATE public.profiles SET role = public.normalize_app_role(role) WHERE role IN ('owner', 'org_owner', 'manager', 'admin');
UPDATE public.invitations SET role = public.normalize_app_role(role) WHERE role IN ('owner', 'org_owner', 'manager', 'admin');
UPDATE public.organization_members SET role = public.normalize_app_role(role) WHERE role IN ('owner', 'org_owner', 'manager', 'admin');
UPDATE public.brand_members SET role = public.normalize_app_role(role) WHERE role IN ('owner', 'org_owner', 'manager', 'admin');
UPDATE public.location_members SET role = public.normalize_app_role(role) WHERE role IN ('owner', 'org_owner', 'manager', 'admin');

UPDATE auth.users
SET raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{role}', '"org_manager"'::jsonb, true)
WHERE raw_app_meta_data ->> 'role' = 'org_owner';

UPDATE auth.users
SET raw_user_meta_data = jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{role}', '"org_manager"'::jsonb, true)
WHERE raw_user_meta_data ->> 'role' = 'org_owner';

INSERT INTO public.tenant_members (tenant_id, user_id, role)
SELECT DISTINCT o.tenant_id, o.owner_id, 'tenant_super_admin'
FROM public.organizations o
WHERE o.tenant_id IS NOT NULL
  AND o.owner_id IS NOT NULL
ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.tenant_members (tenant_id, user_id, role)
SELECT DISTINCT p.tenant_id, p.id, p.role
FROM public.profiles p
WHERE p.tenant_id IS NOT NULL
  AND p.role IN ('tenant_super_admin', 'org_manager')
ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role;

UPDATE public.profiles p
SET role = 'tenant_super_admin'
FROM public.tenant_members tm
WHERE tm.user_id = p.id
  AND tm.role = 'tenant_super_admin'
  AND p.id IN (SELECT owner_id FROM public.organizations WHERE owner_id IS NOT NULL);



ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (
  role IN ('ground_staff', 'location_manager', 'brand_manager', 'branch_manager', 'org_manager', 'tenant_super_admin', 'platform_admin')
);

ALTER TABLE public.invitations ADD CONSTRAINT invitations_role_check CHECK (
  role IN ('ground_staff', 'location_manager', 'brand_manager', 'branch_manager', 'org_manager', 'tenant_super_admin', 'platform_admin')
);

ALTER TABLE public.tenant_members ADD CONSTRAINT tenant_members_role_check CHECK (
  role IN ('org_manager', 'tenant_super_admin')
);

-- Soft role checks for membership tables. Existing custom roles remain possible
-- through public.roles/user_roles, so these are not constrained here.

INSERT INTO public.roles (name, is_system)
VALUES
  ('ground_staff', true),
  ('location_manager', true),
  ('branch_manager', true),
  ('brand_manager', true),
  ('org_manager', true),
  ('tenant_super_admin', true),
  ('platform_admin', true)
ON CONFLICT (name) WHERE is_system = true DO UPDATE SET is_system = true;

DO $$
DECLARE
  v_legacy_owner_role_id uuid;
  v_org_manager_role_id uuid;
BEGIN
  SELECT id INTO v_legacy_owner_role_id FROM public.roles WHERE name = 'org_owner' LIMIT 1;
  SELECT id INTO v_org_manager_role_id FROM public.roles WHERE name = 'org_manager' LIMIT 1;

  IF v_legacy_owner_role_id IS NOT NULL AND v_org_manager_role_id IS NOT NULL THEN
    DELETE FROM public.user_roles legacy_ur
    WHERE legacy_ur.role_id = v_legacy_owner_role_id
      AND EXISTS (
        SELECT 1
        FROM public.user_roles manager_ur
        WHERE manager_ur.user_id = legacy_ur.user_id
          AND manager_ur.role_id = v_org_manager_role_id
      );

    UPDATE public.user_roles
    SET role_id = v_org_manager_role_id
    WHERE role_id = v_legacy_owner_role_id;

    DELETE FROM public.role_permissions
    WHERE role_id = v_legacy_owner_role_id;

    DELETE FROM public.roles
    WHERE id = v_legacy_owner_role_id;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.normalize_app_role(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(NULLIF(trim(p_role), ''))
    WHEN 'owner' THEN 'org_manager'
    WHEN 'manager' THEN 'branch_manager'
    WHEN 'admin' THEN 'platform_admin'
    ELSE lower(NULLIF(trim(p_role), ''))
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.normalize_app_role(COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()), 'ground_staff'));
$$;

CREATE OR REPLACE FUNCTION public.get_auth_tenant()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()),
    (SELECT o.tenant_id FROM public.profiles p JOIN public.organizations o ON o.id = p.organization_id WHERE p.id = auth.uid()),
    (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid() ORDER BY tm.created_at LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_auth_role() = 'tenant_super_admin';
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_auth_role() = 'platform_admin';
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_above()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_auth_role() IN (
    'location_manager',
    'branch_manager',
    'brand_manager',
    'org_manager',
    'tenant_super_admin',
    'platform_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_auth_role() IN ('org_manager', 'tenant_super_admin', 'platform_admin');
$$;

CREATE OR REPLACE FUNCTION public.is_owner_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_auth_role() IN ('org_manager', 'tenant_super_admin', 'platform_admin');
$$;

CREATE OR REPLACE FUNCTION public.access_role_rank(p_role text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE public.normalize_app_role(p_role)
    WHEN 'ground_staff' THEN 10
    WHEN 'location_manager' THEN 20
    WHEN 'branch_manager' THEN 30
    WHEN 'brand_manager' THEN 30
    WHEN 'org_manager' THEN 40
    WHEN 'tenant_super_admin' THEN 50
    WHEN 'platform_admin' THEN 60
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_invite_role(target_role text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text := public.get_auth_role();
  normalized_target text := public.normalize_app_role(target_role);
BEGIN
  IF caller_role = 'platform_admin' THEN
    RETURN normalized_target IN ('ground_staff', 'location_manager', 'brand_manager', 'branch_manager', 'org_manager', 'tenant_super_admin', 'platform_admin');
  END IF;

  IF caller_role = 'tenant_super_admin' THEN
    RETURN normalized_target IN ('ground_staff', 'location_manager', 'brand_manager', 'branch_manager', 'org_manager', 'tenant_super_admin');
  END IF;

  IF caller_role = 'org_manager' THEN
    RETURN normalized_target IN ('ground_staff', 'location_manager', 'brand_manager', 'branch_manager');
  END IF;

  IF caller_role IN ('brand_manager', 'branch_manager') THEN
    RETURN normalized_target IN ('ground_staff', 'location_manager');
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_accessible_brand_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.brand_id
  FROM public.brands b
  WHERE public.is_platform_admin()
     OR (
       public.get_auth_role() = 'tenant_super_admin'
       AND b.organization_id IN (
         SELECT o.id FROM public.organizations o WHERE o.tenant_id = public.get_auth_tenant()
       )
     )
     OR (
       public.get_auth_role() = 'org_manager'
       AND b.organization_id = public.get_auth_org()
     )
     OR (
       public.get_auth_role() IN ('brand_manager', 'branch_manager')
       AND b.brand_id = (SELECT p.brand_id FROM public.profiles p WHERE p.id = auth.uid())
     );
$$;

CREATE OR REPLACE FUNCTION public.get_my_accessible_location_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id
  FROM public.locations l
  WHERE public.is_platform_admin()
     OR (
       public.get_auth_role() = 'tenant_super_admin'
       AND l.organization_id IN (
         SELECT o.id FROM public.organizations o WHERE o.tenant_id = public.get_auth_tenant()
       )
     )
     OR (
       public.get_auth_role() = 'org_manager'
       AND l.organization_id = public.get_auth_org()
     )
     OR (
       public.get_auth_role() IN ('brand_manager', 'branch_manager')
       AND l.brand_id = (SELECT p.brand_id FROM public.profiles p WHERE p.id = auth.uid())
     )
     OR (
       public.get_auth_role() = 'location_manager'
       AND l.id = (SELECT p.location_id FROM public.profiles p WHERE p.id = auth.uid())
     );
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
  v_tenant uuid;
  v_brand uuid;
  v_location uuid;
  v_target_org uuid;
  v_target_tenant uuid;
  v_target_brand uuid;
  v_target_location uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF p_target_user = auth.uid() THEN
    RETURN true;
  END IF;

  SELECT p.role, p.organization_id, p.tenant_id, p.brand_id, p.location_id
    INTO v_role, v_org, v_tenant, v_brand, v_location
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.deleted_at IS NULL;

  v_role := public.normalize_app_role(v_role);

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  IF v_role = 'platform_admin' THEN
    RETURN true;
  END IF;

  SELECT p.organization_id, p.tenant_id, p.brand_id, p.location_id
    INTO v_target_org, v_target_tenant, v_target_brand, v_target_location
  FROM public.profiles p
  WHERE p.id = p_target_user;

  v_target_org := COALESCE(v_target_org, p_organization_id);
  v_target_location := COALESCE(v_target_location, p_location_id);
  v_target_brand := COALESCE(v_target_brand, p_brand_id);

  IF v_target_tenant IS NULL AND v_target_org IS NOT NULL THEN
    SELECT tenant_id INTO v_target_tenant FROM public.organizations WHERE id = v_target_org;
  END IF;

  IF v_tenant IS NULL AND v_org IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant FROM public.organizations WHERE id = v_org;
  END IF;

  IF v_target_brand IS NULL AND v_target_location IS NOT NULL THEN
    SELECT l.brand_id INTO v_target_brand FROM public.locations l WHERE l.id = v_target_location;
  END IF;

  IF v_role = 'tenant_super_admin' THEN
    RETURN v_tenant IS NOT NULL AND v_target_tenant = v_tenant;
  END IF;

  IF v_org IS NULL OR v_target_org IS DISTINCT FROM v_org THEN
    RETURN false;
  END IF;

  IF v_role = 'org_manager' THEN
    RETURN true;
  END IF;

  IF v_role IN ('brand_manager', 'branch_manager') THEN
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
  v_tenant uuid;
  v_brand uuid;
  v_location uuid;
  v_target_org uuid;
  v_target_tenant uuid;
  v_target_brand uuid;
  v_target_location uuid;
  v_granted_role text;
  v_caller_rank integer;
  v_grant_rank integer;
BEGIN
  IF auth.uid() IS NULL OR p_target_user IS NULL OR p_target_user = auth.uid() THEN
    RETURN false;
  END IF;

  SELECT p.role, p.organization_id, p.tenant_id, p.brand_id, p.location_id
    INTO v_role, v_org, v_tenant, v_brand, v_location
  FROM public.profiles p
  WHERE p.id = auth.uid();

  v_role := public.normalize_app_role(v_role);

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  SELECT p.organization_id, p.tenant_id, p.brand_id, p.location_id
    INTO v_target_org, v_target_tenant, v_target_brand, v_target_location
  FROM public.profiles p
  WHERE p.id = p_target_user;

  v_target_org := COALESCE(v_target_org, p_organization_id);
  v_target_location := COALESCE(v_target_location, p_location_id);
  v_target_brand := COALESCE(v_target_brand, p_brand_id);

  IF v_target_tenant IS NULL AND v_target_org IS NOT NULL THEN
    SELECT tenant_id INTO v_target_tenant FROM public.organizations WHERE id = v_target_org;
  END IF;

  IF v_tenant IS NULL AND v_org IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant FROM public.organizations WHERE id = v_org;
  END IF;

  IF v_target_brand IS NULL AND v_target_location IS NOT NULL THEN
    SELECT l.brand_id INTO v_target_brand FROM public.locations l WHERE l.id = v_target_location;
  END IF;

  v_granted_role := COALESCE(public.normalize_app_role(p_granted_role), 'ground_staff');
  v_caller_rank := public.access_role_rank(v_role);
  v_grant_rank := public.access_role_rank(v_granted_role);

  IF v_caller_rank = 0 OR v_grant_rank = 0 OR v_grant_rank >= v_caller_rank THEN
    RETURN false;
  END IF;

  IF v_role = 'platform_admin' THEN
    RETURN true;
  END IF;

  IF v_role = 'tenant_super_admin' THEN
    RETURN v_tenant IS NOT NULL AND v_target_tenant = v_tenant;
  END IF;

  IF v_org IS NULL OR v_target_org IS DISTINCT FROM v_org THEN
    RETURN false;
  END IF;

  IF v_role = 'org_manager' THEN
    RETURN v_granted_role IN ('ground_staff', 'location_manager', 'brand_manager', 'branch_manager');
  END IF;

  IF v_role IN ('brand_manager', 'branch_manager') THEN
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

CREATE OR REPLACE FUNCTION public.setup_organization_full(
  p_user_id uuid,
  p_org_name text,
  p_org_slug text,
  p_brand_name text,
  p_location_name text,
  p_location_address text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id uuid;
  v_org_id uuid;
  v_brand_id uuid;
  v_location_id uuid;
BEGIN
  IF auth.uid() != p_user_id AND public.get_auth_role() != 'platform_admin' THEN
    RAISE EXCEPTION 'Not authorized to onboard another user';
  END IF;

  INSERT INTO public.tenants (name, slug, owner_id, metadata)
  VALUES (
    p_org_name,
    left('tenant_' || regexp_replace(lower(p_org_slug), '[^a-z0-9]+', '_', 'g'), 63),
    p_user_id,
    jsonb_build_object('source', 'setup_organization_full')
  )
  ON CONFLICT (slug) DO UPDATE SET owner_id = EXCLUDED.owner_id
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.organizations (tenant_id, name, slug, owner_id)
  VALUES (v_tenant_id, p_org_name, p_org_slug, p_user_id)
  RETURNING id INTO v_org_id;

  INSERT INTO public.brands (organization_id, name)
  VALUES (v_org_id, p_brand_name)
  RETURNING brand_id INTO v_brand_id;

  INSERT INTO public.locations (organization_id, brand_id, name, address)
  VALUES (v_org_id, v_brand_id, p_location_name, p_location_address)
  RETURNING id INTO v_location_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (v_tenant_id, p_user_id, 'tenant_super_admin')
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org_id, p_user_id, 'tenant_super_admin')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.brand_members (brand_id, user_id, role)
  VALUES (v_brand_id, p_user_id, 'tenant_super_admin')
  ON CONFLICT (brand_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.location_members (location_id, user_id, role)
  VALUES (v_location_id, p_user_id, 'tenant_super_admin')
  ON CONFLICT (location_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.profiles
  SET tenant_id = v_tenant_id,
      organization_id = v_org_id,
      brand_id = v_brand_id,
      location_id = v_location_id,
      role = 'tenant_super_admin',
      access_level = 'organization',
      updated_at = now()
  WHERE id = p_user_id;

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', 'tenant_super_admin',
    'tenant_id', v_tenant_id::text,
    'organization_id', v_org_id::text,
    'brand_id', v_brand_id::text,
    'location_id', v_location_id::text
  )
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'org_id', v_org_id,
    'brand_id', v_brand_id,
    'location_id', v_location_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.setup_onboarding_hierarchy(
  p_user_id uuid,
  p_hierarchy jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  org_item jsonb;
  brand_item jsonb;
  location_item jsonb;
  v_tenant_id uuid;
  v_org_id uuid;
  v_brand_id uuid;
  v_location_id uuid;
  v_primary_org_id uuid;
  v_primary_brand_id uuid;
  v_primary_location_id uuid;
  v_created_orgs jsonb := '[]'::jsonb;
  v_created_brands jsonb := '[]'::jsonb;
  v_created_locations jsonb := '[]'::jsonb;
  v_org_name text;
  v_org_slug text;
  v_brand_name text;
  v_location_name text;
  v_location_address text;
  v_org_count integer := 0;
  v_brand_count integer := 0;
  v_location_count integer := 0;
  v_business_status text;
  v_payment_verified boolean;
  v_run_id uuid;
BEGIN
  IF auth.uid() != p_user_id AND public.get_auth_role() != 'platform_admin' THEN
    RAISE EXCEPTION 'Not authorized to onboard another user';
  END IF;

  SELECT business_verification_status, payment_verified
  INTO v_business_status, v_payment_verified
  FROM public.profiles
  WHERE id = p_user_id;

  IF COALESCE(v_business_status, 'not_started') <> 'verified' THEN
    RAISE EXCEPTION 'Business verification must be completed before hierarchy setup';
  END IF;

  IF COALESCE(v_payment_verified, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Payment method verification must be completed before hierarchy setup';
  END IF;

  IF p_hierarchy IS NULL OR COALESCE(jsonb_typeof(p_hierarchy), 'null') <> 'array' THEN
    RAISE EXCEPTION 'Onboarding hierarchy must be an array';
  END IF;

  IF jsonb_array_length(p_hierarchy) = 0 THEN
    RAISE EXCEPTION 'Onboarding hierarchy must include at least one organization';
  END IF;

  v_org_name := NULLIF(btrim((p_hierarchy->0)->>'name'), '');
  v_org_slug := NULLIF(btrim((p_hierarchy->0)->>'slug'), '');

  INSERT INTO public.tenants (name, slug, owner_id, metadata)
  VALUES (
    COALESCE(v_org_name, 'Tenant'),
    left('tenant_' || regexp_replace(lower(COALESCE(v_org_slug, gen_random_uuid()::text)), '[^a-z0-9]+', '_', 'g'), 63),
    p_user_id,
    jsonb_build_object('source', 'setup_onboarding_hierarchy')
  )
  ON CONFLICT (slug) DO UPDATE SET owner_id = EXCLUDED.owner_id
  RETURNING id INTO v_tenant_id;

  BEGIN
    v_run_id := public.get_or_create_onboarding_run(p_user_id);
  EXCEPTION WHEN undefined_function THEN
    v_run_id := NULL;
  END;

  FOR org_item IN SELECT value FROM jsonb_array_elements(p_hierarchy)
  LOOP
    v_org_name := NULLIF(btrim(org_item->>'name'), '');
    v_org_slug := NULLIF(btrim(org_item->>'slug'), '');

    IF v_org_name IS NULL OR v_org_slug IS NULL THEN
      RAISE EXCEPTION 'Each organization requires a name and slug';
    END IF;

    IF COALESCE(jsonb_typeof(org_item->'brands'), 'null') <> 'array'
       OR jsonb_array_length(org_item->'brands') = 0 THEN
      RAISE EXCEPTION 'Organization % requires at least one brand', v_org_name;
    END IF;

    INSERT INTO public.organizations (tenant_id, name, slug, owner_id)
    VALUES (v_tenant_id, v_org_name, v_org_slug, p_user_id)
    RETURNING id INTO v_org_id;

    v_org_count := v_org_count + 1;
    v_created_orgs := v_created_orgs || jsonb_build_array(jsonb_build_object('id', v_org_id, 'name', v_org_name, 'slug', v_org_slug));

    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_org_id, p_user_id, 'tenant_super_admin')
    ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;

    IF v_primary_org_id IS NULL THEN
      v_primary_org_id := v_org_id;
    END IF;

    FOR brand_item IN SELECT value FROM jsonb_array_elements(org_item->'brands')
    LOOP
      v_brand_name := NULLIF(btrim(brand_item->>'name'), '');

      IF v_brand_name IS NULL THEN
        RAISE EXCEPTION 'Every brand in organization % requires a name', v_org_name;
      END IF;

      IF COALESCE(jsonb_typeof(brand_item->'locations'), 'null') <> 'array'
         OR jsonb_array_length(brand_item->'locations') = 0 THEN
        RAISE EXCEPTION 'Brand % requires at least one location', v_brand_name;
      END IF;

      INSERT INTO public.brands (organization_id, name)
      VALUES (v_org_id, v_brand_name)
      RETURNING brand_id INTO v_brand_id;

      v_brand_count := v_brand_count + 1;
      v_created_brands := v_created_brands || jsonb_build_array(jsonb_build_object('id', v_brand_id, 'organization_id', v_org_id, 'name', v_brand_name));

      INSERT INTO public.brand_members (brand_id, user_id, role)
      VALUES (v_brand_id, p_user_id, 'tenant_super_admin')
      ON CONFLICT (brand_id, user_id) DO UPDATE SET role = EXCLUDED.role;

      IF v_primary_brand_id IS NULL THEN
        v_primary_brand_id := v_brand_id;
      END IF;

      FOR location_item IN SELECT value FROM jsonb_array_elements(brand_item->'locations')
      LOOP
        v_location_name := NULLIF(btrim(location_item->>'name'), '');
        v_location_address := COALESCE(NULLIF(btrim(location_item->>'address'), ''), 'Address pending');

        IF v_location_name IS NULL THEN
          RAISE EXCEPTION 'Every location in brand % requires a name', v_brand_name;
        END IF;

        INSERT INTO public.locations (organization_id, brand_id, name, address)
        VALUES (v_org_id, v_brand_id, v_location_name, v_location_address)
        RETURNING id INTO v_location_id;

        v_location_count := v_location_count + 1;
        v_created_locations := v_created_locations || jsonb_build_array(jsonb_build_object(
          'id', v_location_id,
          'organization_id', v_org_id,
          'brand_id', v_brand_id,
          'name', v_location_name,
          'address', v_location_address
        ));

        INSERT INTO public.location_members (location_id, user_id, role)
        VALUES (v_location_id, p_user_id, 'tenant_super_admin')
        ON CONFLICT (location_id, user_id) DO UPDATE SET role = EXCLUDED.role;

        IF v_primary_location_id IS NULL THEN
          v_primary_location_id := v_location_id;
        END IF;
      END LOOP;
    END LOOP;

    INSERT INTO public.onboarding_progress (organization_id, current_step, completed_steps, is_completed)
    VALUES (v_org_id, 'hierarchy_created', ARRAY['organizations', 'brands', 'locations'], false)
    ON CONFLICT DO NOTHING;
  END LOOP;

  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (v_tenant_id, p_user_id, 'tenant_super_admin')
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.profiles
  SET tenant_id = v_tenant_id,
      organization_id = v_primary_org_id,
      brand_id = v_primary_brand_id,
      location_id = v_primary_location_id,
      role = 'tenant_super_admin',
      access_level = 'organization',
      onboarding_status = 'completed',
      onboarding_current_step = 'completed',
      onboarding_completed_at = now(),
      updated_at = now()
  WHERE id = p_user_id;

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', 'tenant_super_admin',
    'tenant_id', v_tenant_id::text,
    'organization_id', v_primary_org_id::text,
    'brand_id', v_primary_brand_id::text,
    'location_id', v_primary_location_id::text
  )
  WHERE id = p_user_id;

  UPDATE public.business_verifications SET organization_id = v_primary_org_id, updated_at = now()
  WHERE user_id = p_user_id AND organization_id IS NULL;
  UPDATE public.organization_addresses SET organization_id = v_primary_org_id, updated_at = now()
  WHERE user_id = p_user_id AND organization_id IS NULL;
  UPDATE public.onboarding_payment_methods SET organization_id = v_primary_org_id, updated_at = now()
  WHERE user_id = p_user_id AND organization_id IS NULL;
  UPDATE public.onboarding_coupon_redemptions SET organization_id = v_primary_org_id
  WHERE user_id = p_user_id AND organization_id IS NULL;

  IF v_run_id IS NOT NULL THEN
    UPDATE public.onboarding_workflow_runs
    SET organization_id = v_primary_org_id,
        status = 'completed',
        current_step = 'completed',
        completed_at = now(),
        last_activity_at = now()
    WHERE id = v_run_id;

    PERFORM public.record_onboarding_event(
      v_run_id,
      p_user_id,
      'hierarchy_setup',
      'completed',
      'completed',
      jsonb_build_object('tenant_id', v_tenant_id, 'primary_org_id', v_primary_org_id)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'primary_org_id', v_primary_org_id,
    'primary_brand_id', v_primary_brand_id,
    'primary_location_id', v_primary_location_id,
    'organizations', v_created_orgs,
    'brands', v_created_brands,
    'locations', v_created_locations,
    'counts', jsonb_build_object('organizations', v_org_count, 'brands', v_brand_count, 'locations', v_location_count)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invite record;
  v_user_id uuid;
  v_user_email text;
  v_role text;
  v_tenant_id uuid;
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
    AND closed_at IS NULL
    AND lower(email) = lower(v_user_email)
    AND (expires_at IS NULL OR expires_at > now());

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid, expired, or already-accepted invitation';
  END IF;

  v_role := public.normalize_app_role(v_invite.role);
  v_tenant_id := v_invite.tenant_id;

  IF v_tenant_id IS NULL AND v_invite.organization_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_id FROM public.organizations WHERE id = v_invite.organization_id;
  END IF;

  IF v_role = 'tenant_super_admin' AND v_tenant_id IS NULL THEN
    INSERT INTO public.tenants (name, owner_id, metadata)
    VALUES (COALESCE(split_part(v_user_email, '@', 1), 'Tenant'), v_user_id, jsonb_build_object('source', 'accept_invitation'))
    RETURNING id INTO v_tenant_id;
  END IF;

  IF v_role = 'tenant_super_admin' AND v_tenant_id IS NOT NULL THEN
    INSERT INTO public.tenant_members (tenant_id, user_id, role)
    VALUES (v_tenant_id, v_user_id, 'tenant_super_admin')
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  IF v_invite.organization_id IS NOT NULL THEN
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_invite.organization_id, v_user_id, v_role)
    ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  IF v_invite.brand_id IS NOT NULL THEN
    INSERT INTO public.brand_members (brand_id, user_id, role)
    VALUES (v_invite.brand_id, v_user_id, v_role)
    ON CONFLICT (brand_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  IF v_invite.location_id IS NOT NULL THEN
    INSERT INTO public.location_members (location_id, user_id, role)
    VALUES (v_invite.location_id, v_user_id, v_role)
    ON CONFLICT (location_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  UPDATE public.profiles
  SET tenant_id = COALESCE(v_tenant_id, tenant_id),
      role = v_role,
      organization_id = COALESCE(v_invite.organization_id, organization_id),
      brand_id = COALESCE(v_invite.brand_id, brand_id),
      location_id = COALESCE(v_invite.location_id, location_id),
      updated_at = now()
  WHERE id = v_user_id;

  UPDATE public.invitations
  SET accepted_at = now(),
      accepted_by = v_user_id,
      role = v_role,
      tenant_id = COALESCE(tenant_id, v_tenant_id)
  WHERE id = v_invite.id;

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', v_role,
    'tenant_id', COALESCE(v_tenant_id::text, ''),
    'organization_id', COALESCE(v_invite.organization_id::text, '')
  )
  WHERE id = v_user_id;

  RETURN jsonb_build_object('success', true, 'role', v_role, 'tenant_id', v_tenant_id, 'organization_id', v_invite.organization_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user_role(
  target_user_id uuid,
  new_role text DEFAULT NULL,
  new_status text DEFAULT NULL,
  new_department text DEFAULT NULL,
  new_location text DEFAULT NULL,
  new_brand_id uuid DEFAULT NULL,
  new_location_id uuid DEFAULT NULL,
  new_access_level text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_role text;
  caller_org uuid;
  caller_tenant uuid;
  target_org uuid;
  target_tenant uuid;
  normalized_role text;
BEGIN
  IF new_location IS NOT NULL THEN
    -- Backward-compatible no-op.
  END IF;

  caller_role := public.get_auth_role();
  caller_org := public.get_auth_org();
  caller_tenant := public.get_auth_tenant();
  normalized_role := CASE WHEN new_role IS NULL THEN NULL ELSE public.normalize_app_role(new_role) END;

  IF caller_role NOT IN ('org_manager', 'tenant_super_admin', 'platform_admin') THEN
    RAISE EXCEPTION 'Insufficient permissions: org_manager, tenant_super_admin, or platform_admin required';
  END IF;

  SELECT p.organization_id, COALESCE(p.tenant_id, o.tenant_id)
  INTO target_org, target_tenant
  FROM public.profiles p
  LEFT JOIN public.organizations o ON o.id = p.organization_id
  WHERE p.id = target_user_id;

  IF caller_role = 'tenant_super_admin' AND target_tenant IS DISTINCT FROM caller_tenant THEN
    RAISE EXCEPTION 'Cannot modify users outside your tenant';
  END IF;

  IF caller_role = 'org_manager' AND target_org IS DISTINCT FROM caller_org THEN
    RAISE EXCEPTION 'Cannot modify users outside your organization';
  END IF;

  IF caller_role != 'platform_admin' AND normalized_role IS NOT NULL THEN
    IF NOT public.can_invite_role(normalized_role) THEN
      RAISE EXCEPTION 'Cannot assign a role equal to or above your own';
    END IF;
  END IF;

  IF target_user_id = auth.uid() AND normalized_role IS NOT NULL AND normalized_role <> caller_role THEN
    RAISE EXCEPTION 'Cannot change your own role';
  END IF;

  IF normalized_role = 'tenant_super_admin' AND target_tenant IS NOT NULL THEN
    INSERT INTO public.tenant_members (tenant_id, user_id, role)
    VALUES (target_tenant, target_user_id, 'tenant_super_admin')
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  IF normalized_role IS NOT NULL AND target_org IS NOT NULL THEN
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (target_org, target_user_id, normalized_role)
    ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  UPDATE public.profiles
  SET role = COALESCE(normalized_role, role),
      status = COALESCE(new_status, status),
      department = COALESCE(new_department, department),
      brand_id = COALESCE(new_brand_id, brand_id),
      location_id = COALESCE(new_location_id, location_id),
      access_level = COALESCE(new_access_level, access_level),
      tenant_id = COALESCE(tenant_id, target_tenant),
      updated_at = now()
  WHERE id = target_user_id;

  IF (SELECT raw_app_meta_data->>'organization_id' FROM auth.users WHERE id = target_user_id) = target_org::text THEN
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
      'role', COALESCE(normalized_role, (SELECT role FROM public.profiles WHERE id = target_user_id)),
      'tenant_id', COALESCE(target_tenant::text, '')
    )
    WHERE id = target_user_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

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
  v_tenant_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.organizations WHERE id = p_organization_id;

  SELECT role INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_user_id;

  IF v_role IS NULL AND public.get_auth_role() = 'tenant_super_admin' AND v_tenant_id = public.get_auth_tenant() THEN
    v_role := 'tenant_super_admin';
  END IF;

  IF v_role IS NULL AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'User is not a member of this organization';
  END IF;

  IF v_role IS NULL THEN
    v_role := 'platform_admin';
  END IF;

  v_role := public.normalize_app_role(v_role);

  IF p_brand_id IS NOT NULL
     AND NOT (p_brand_id = ANY (ARRAY(SELECT public.get_my_accessible_brand_ids()))) THEN
    RAISE EXCEPTION 'Brand % not in your accessible scope', p_brand_id;
  END IF;

  IF p_location_id IS NOT NULL
     AND NOT (p_location_id = ANY (ARRAY(SELECT public.get_my_accessible_location_ids()))) THEN
    RAISE EXCEPTION 'Location % not in your accessible scope', p_location_id;
  END IF;

  UPDATE public.profiles
  SET tenant_id = COALESCE(v_tenant_id, tenant_id),
      organization_id = p_organization_id,
      brand_id = p_brand_id,
      location_id = p_location_id,
      role = v_role,
      updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'role', v_role,
    'tenant_id', v_tenant_id,
    'organization_id', p_organization_id,
    'brand_id', p_brand_id,
    'location_id', p_location_id
  );
END;
$$;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenants_select_scope ON public.tenants;
CREATE POLICY tenants_select_scope ON public.tenants
FOR SELECT USING (
  public.is_platform_admin()
  OR id = public.get_auth_tenant()
);

DROP POLICY IF EXISTS tenants_write_scope ON public.tenants;
CREATE POLICY tenants_write_scope ON public.tenants
FOR ALL USING (
  public.is_platform_admin()
  OR (public.is_tenant_super_admin() AND id = public.get_auth_tenant())
)
WITH CHECK (
  public.is_platform_admin()
  OR (public.is_tenant_super_admin() AND id = public.get_auth_tenant())
);

DROP POLICY IF EXISTS tenant_members_select_scope ON public.tenant_members;
CREATE POLICY tenant_members_select_scope ON public.tenant_members
FOR SELECT USING (
  public.is_platform_admin()
  OR tenant_id = public.get_auth_tenant()
  OR user_id = auth.uid()
);

DROP POLICY IF EXISTS tenant_members_write_scope ON public.tenant_members;
CREATE POLICY tenant_members_write_scope ON public.tenant_members
FOR ALL USING (
  public.is_platform_admin()
  OR (public.is_tenant_super_admin() AND tenant_id = public.get_auth_tenant() AND user_id <> auth.uid())
)
WITH CHECK (
  public.is_platform_admin()
  OR (public.is_tenant_super_admin() AND tenant_id = public.get_auth_tenant() AND user_id <> auth.uid())
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants, public.tenant_members TO authenticated;
GRANT ALL ON public.tenants, public.tenant_members TO service_role;

GRANT EXECUTE ON FUNCTION public.normalize_app_role(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_auth_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_auth_tenant() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_tenant_super_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_manager_or_above() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_owner_or_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.access_role_rank(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_invite_role(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.setup_organization_full(uuid, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.setup_onboarding_hierarchy(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_user_role(uuid, text, text, text, text, uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.switch_user_context(uuid, uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

