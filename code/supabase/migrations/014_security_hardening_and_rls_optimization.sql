-- ============================================================
-- 014: Security Hardening & RLS Optimization
-- ============================================================
-- Implementation Plan Phase 1: Secure SECURITY DEFINER functions
-- Implementation Plan Phase 2: Optimize RLS InitPlans
-- ============================================================

BEGIN;

-- ╔══════════════════════════════════════════════════════════╗
-- ║  PHASE 1: Securing SECURITY DEFINER Functions           ║
-- ╚══════════════════════════════════════════════════════════╝

-- ────────────────────────────────────────────────────────────
-- 1A: Revoke public execution rights from sensitive functions
--
-- By default, Postgres grants EXECUTE to PUBLIC on new functions.
-- These SECURITY DEFINER functions run with the OWNER's elevated
-- privileges, so they must NOT be callable by anon or public.
-- ────────────────────────────────────────────────────────────

-- Core JWT helpers (used by RLS policies — must stay callable by authenticated)
REVOKE EXECUTE ON FUNCTION public.get_auth_role()              FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.get_auth_role()              TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_auth_org()               FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.get_auth_org()               TO authenticated, service_role;

-- Invitation hierarchy check
REVOKE EXECUTE ON FUNCTION public.can_invite_role(TEXT)         FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.can_invite_role(TEXT)         TO authenticated, service_role;

-- Accessor functions (used in RLS policies)
REVOKE EXECUTE ON FUNCTION public.get_my_accessible_brand_ids()    FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_accessible_brand_ids()    TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_my_accessible_location_ids() FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_accessible_location_ids() TO authenticated, service_role;

-- Onboarding RPC (only authenticated users should call this)
REVOKE EXECUTE ON FUNCTION public.setup_organization_full(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.setup_organization_full(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- Invitation acceptance (only authenticated users)
REVOKE EXECUTE ON FUNCTION public.accept_invitation(TEXT)      FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.accept_invitation(TEXT)      TO authenticated, service_role;

-- Admin role update (only authenticated users — function internally enforces org_owner+)
REVOKE EXECUTE ON FUNCTION public.admin_update_user_role(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, UUID, TEXT) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.admin_update_user_role(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, UUID, TEXT) TO authenticated, service_role;


-- ────────────────────────────────────────────────────────────
-- 1B: Secure function search paths
--
-- Functions without SET search_path are vulnerable to search_path
-- injection. Adding SET search_path = '' forces fully-qualified
-- table references and prevents object hijacking.
-- ────────────────────────────────────────────────────────────

-- Recreate get_auth_role with secure search_path
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS TEXT AS $$
  SELECT COALESCE(auth.jwt() -> 'user_metadata' ->> 'role', 'ground_staff');
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '';

-- Recreate get_auth_org with secure search_path
CREATE OR REPLACE FUNCTION public.get_auth_org()
RETURNS UUID AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'organization_id')::uuid;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '';

-- Fix set_updated_at trigger function (if it exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.set_updated_at()
      RETURNS TRIGGER AS $t$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $t$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = '';
    $fn$;
  END IF;
END $$;

-- Fix set_updated_at_metadata trigger function (if it exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at_metadata') THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.set_updated_at_metadata()
      RETURNS TRIGGER AS $t$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $t$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = '';
    $fn$;
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────
-- 1C: Secure the health_monitor view
--
-- The current view uses SECURITY DEFINER semantics and exposes
-- aggregate counts to any authenticated user. Replace with
-- SECURITY INVOKER so it respects the caller's RLS context.
-- ────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.health_monitor;
CREATE VIEW public.health_monitor
WITH (security_invoker = true) AS
SELECT
  (SELECT count(*) FROM public.organizations)  AS total_orgs,
  (SELECT count(*) FROM public.profiles)       AS total_users,
  (SELECT count(*) FROM public.invoices)       AS total_invoices,
  public.get_auth_role()                       AS active_role,
  public.get_auth_org()                        AS active_org_id;

-- Only platform admins and authenticated users should see this
GRANT SELECT ON public.health_monitor TO authenticated;
REVOKE SELECT ON public.health_monitor FROM anon;

-- Also secure the system_health_check view if it exists
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'system_health_check' AND schemaname = 'public') THEN
    REVOKE SELECT ON public.system_health_check FROM anon;
  END IF;
END $$;


-- ╔══════════════════════════════════════════════════════════╗
-- ║  PHASE 2: Optimize RLS Policies (InitPlan Warnings)     ║
-- ╚══════════════════════════════════════════════════════════╝
--
-- Problem: Policies using auth.uid() directly force Postgres to
--          evaluate the function for EVERY ROW (InitPlan warning).
-- Fix:     Wrap in (SELECT auth.uid()) to cache the value once
--          per query execution.
-- ────────────────────────────────────────────────────────────

-- 2A: profiles_self_select — auth.uid() → (select auth.uid())
DROP POLICY IF EXISTS "profiles_self_select" ON public.profiles;
CREATE POLICY "profiles_self_select"
  ON public.profiles FOR SELECT
  USING (id = (SELECT auth.uid()));

-- 2B: profiles_self_update — auth.uid() → (select auth.uid())
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
CREATE POLICY "profiles_self_update"
  ON public.profiles FOR UPDATE
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- 2C: profiles_org_owner_delete — auth.uid() → (select auth.uid())
DROP POLICY IF EXISTS "profiles_org_owner_delete" ON public.profiles;
CREATE POLICY "profiles_org_owner_delete"
  ON public.profiles FOR DELETE
  USING (
    (SELECT public.get_auth_role()) = 'org_owner'
    AND organization_id = (SELECT public.get_auth_org())
    AND id != (SELECT auth.uid())  -- cannot delete self
  );

-- 2D: invitations_cancel_own — auth.uid() → (select auth.uid())
DROP POLICY IF EXISTS "invitations_cancel_own" ON public.invitations;
CREATE POLICY "invitations_cancel_own"
  ON public.invitations FOR DELETE
  USING (
    organization_id = (SELECT public.get_auth_org())
    AND (
      invited_by = (SELECT auth.uid())
      OR (SELECT public.get_auth_role()) = 'org_owner'
    )
  );

-- 2E: Also fix the legacy Profile_Self_Access if it still exists
DROP POLICY IF EXISTS "Profile_Self_Access" ON public.profiles;
DROP POLICY IF EXISTS "Profile_Org_Visibility" ON public.profiles;


COMMIT;
