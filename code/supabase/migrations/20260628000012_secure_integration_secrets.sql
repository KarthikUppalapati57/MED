BEGIN;

-- Batch 3c-1: urgent secret exposure fix for integrations and webhook_endpoints.
-- PostgreSQL table-level SELECT grants include every column, so secret protection
-- requires revoking table-level SELECT and granting SELECT only on safe columns.

DO $$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('integrations', 'webhook_endpoints')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy.policyname, v_policy.tablename);
  END LOOP;
END $$;

REVOKE ALL PRIVILEGES ON public.integrations, public.webhook_endpoints FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.integrations, public.webhook_endpoints FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_org() TO authenticated;

-- Service role keeps full access for edge functions and webhook dispatch.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integrations, public.webhook_endpoints TO service_role;

-- Authenticated admins can read/write only non-secret columns directly.
GRANT SELECT (id, organization_id, provider, is_active, connected_at, updated_at)
  ON public.integrations TO authenticated;
GRANT INSERT (id, organization_id, provider, is_active, connected_at, updated_at)
  ON public.integrations TO authenticated;
GRANT UPDATE (provider, is_active, connected_at, updated_at)
  ON public.integrations TO authenticated;
GRANT DELETE ON public.integrations TO authenticated;

GRANT SELECT (id, organization_id, url, status, created_at, secret_prefix)
  ON public.webhook_endpoints TO authenticated;
GRANT INSERT (id, organization_id, url, status, created_at, secret_prefix)
  ON public.webhook_endpoints TO authenticated;
GRANT UPDATE (url, status, secret_prefix)
  ON public.webhook_endpoints TO authenticated;
GRANT DELETE ON public.webhook_endpoints TO authenticated;

CREATE POLICY integrations_admin_select
  ON public.integrations
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY integrations_admin_insert
  ON public.integrations
  FOR INSERT
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY integrations_admin_update
  ON public.integrations
  FOR UPDATE
  USING (public.is_admin() AND organization_id = public.get_auth_org())
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY integrations_admin_delete
  ON public.integrations
  FOR DELETE
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY webhook_endpoints_admin_select
  ON public.webhook_endpoints
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY webhook_endpoints_admin_insert
  ON public.webhook_endpoints
  FOR INSERT
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY webhook_endpoints_admin_update
  ON public.webhook_endpoints
  FOR UPDATE
  USING (public.is_admin() AND organization_id = public.get_auth_org())
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY webhook_endpoints_admin_delete
  ON public.webhook_endpoints
  FOR DELETE
  USING (public.is_admin() AND organization_id = public.get_auth_org());

COMMIT;