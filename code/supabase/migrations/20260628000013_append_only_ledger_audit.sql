BEGIN;

-- Batch 3c-2: restore append-only immutability for GL and audit tables.
-- Direct authenticated INSERT is removed. Writes go through service_role or SECURITY DEFINER RPCs.

DO $$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'general_ledger_entries',
        'audit_logs',
        'audit_logs_default',
        'audit_logs_y2025',
        'audit_logs_y2026'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy.policyname, v_policy.tablename);
  END LOOP;
END $$;

REVOKE ALL PRIVILEGES ON public.general_ledger_entries, public.audit_logs, public.audit_logs_default, public.audit_logs_y2025, public.audit_logs_y2026 FROM anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.general_ledger_entries, public.audit_logs, public.audit_logs_default, public.audit_logs_y2025, public.audit_logs_y2026 FROM anon, authenticated;

GRANT SELECT ON public.general_ledger_entries, public.audit_logs, public.audit_logs_default, public.audit_logs_y2025, public.audit_logs_y2026 TO authenticated;
GRANT SELECT, INSERT ON public.general_ledger_entries, public.audit_logs, public.audit_logs_default, public.audit_logs_y2025, public.audit_logs_y2026 TO service_role;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_org() TO authenticated;

CREATE POLICY general_ledger_entries_admin_select
  ON public.general_ledger_entries
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY audit_logs_admin_select
  ON public.audit_logs
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY audit_logs_default_admin_select
  ON public.audit_logs_default
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY audit_logs_y2025_admin_select
  ON public.audit_logs_y2025
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

CREATE POLICY audit_logs_y2026_admin_select
  ON public.audit_logs_y2026
  FOR SELECT
  USING (public.is_admin() AND organization_id = public.get_auth_org());

COMMIT;