BEGIN;

-- Batch 3c-3: admin-only RLS for payout-account and API-key config.
-- scheduled_payments is intentionally excluded for Phase 3 payment-limit handling.
-- api_keys and developer_api_keys store key_hash/prefix only; no raw key column exists.

DO $$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('payment_accounts', 'api_keys', 'developer_api_keys')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy.policyname, v_policy.tablename);
  END LOOP;
END $$;

REVOKE ALL PRIVILEGES ON public.payment_accounts, public.api_keys, public.developer_api_keys FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.payment_accounts, public.api_keys, public.developer_api_keys FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_accounts, public.api_keys, public.developer_api_keys TO authenticated;
GRANT ALL PRIVILEGES ON public.payment_accounts, public.api_keys, public.developer_api_keys TO service_role;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_org() TO authenticated;

CREATE POLICY payment_accounts_admin_select
  ON public.payment_accounts
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY payment_accounts_admin_insert
  ON public.payment_accounts
  FOR INSERT
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY payment_accounts_admin_update
  ON public.payment_accounts
  FOR UPDATE
  USING (public.is_admin() AND organization_id = public.get_auth_org())
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY payment_accounts_admin_delete
  ON public.payment_accounts
  FOR DELETE
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY api_keys_admin_select
  ON public.api_keys
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY api_keys_admin_insert
  ON public.api_keys
  FOR INSERT
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY api_keys_admin_update
  ON public.api_keys
  FOR UPDATE
  USING (public.is_admin() AND organization_id = public.get_auth_org())
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY api_keys_admin_delete
  ON public.api_keys
  FOR DELETE
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY developer_api_keys_admin_select
  ON public.developer_api_keys
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY developer_api_keys_admin_insert
  ON public.developer_api_keys
  FOR INSERT
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY developer_api_keys_admin_update
  ON public.developer_api_keys
  FOR UPDATE
  USING (public.is_admin() AND organization_id = public.get_auth_org())
  WITH CHECK (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY developer_api_keys_admin_delete
  ON public.developer_api_keys
  FOR DELETE
  USING (public.is_admin() AND organization_id = public.get_auth_org());

COMMIT;