-- ============================================================
-- 015: Create error_logs Table & Misc Hardening
-- ============================================================
-- Fixes:
--   [SYNC REPORT #3] errorMonitor.js writes to error_logs but
--                     no migration creates the table.
--   [AUDIT]           Adds RLS to error_logs and audit_log INSERT policy.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- STEP 1: Create the error_logs table
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.error_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message         TEXT NOT NULL,
  stack           TEXT,
  component_stack TEXT,
  route           TEXT,
  user_id         UUID REFERENCES auth.users(id),
  severity        TEXT DEFAULT 'error'
                    CHECK (severity IN ('info', 'warning', 'error', 'fatal')),
  metadata        JSONB,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- Authenticated users can INSERT error logs (the frontend logger)
CREATE POLICY "error_logs_authenticated_insert"
  ON public.error_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only platform admins can READ error logs
CREATE POLICY "error_logs_platform_admin_select"
  ON public.error_logs FOR SELECT
  USING ((SELECT public.get_auth_role()) = 'platform_admin');

-- Platform admins can manage (delete old logs, etc.)
CREATE POLICY "error_logs_platform_admin_manage"
  ON public.error_logs FOR DELETE
  USING ((SELECT public.get_auth_role()) = 'platform_admin');

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at
  ON public.error_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_severity
  ON public.error_logs (severity);


-- ────────────────────────────────────────────────────────────
-- STEP 2: Ensure audit_logs has an INSERT policy
--
-- The existing audit_logs table only has a SELECT policy.
-- The frontend audit.js needs to INSERT rows.
-- ────────────────────────────────────────────────────────────

-- Allow authenticated users to INSERT audit entries
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_logs'
      AND policyname = 'audit_logs_authenticated_insert'
  ) THEN
    CREATE POLICY "audit_logs_authenticated_insert"
      ON public.audit_logs FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

-- Platform admin full access to audit logs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_logs'
      AND policyname = 'audit_logs_platform_admin_full'
  ) THEN
    CREATE POLICY "audit_logs_platform_admin_full"
      ON public.audit_logs FOR ALL
      USING ((SELECT public.get_auth_role()) = 'platform_admin');
  END IF;
END $$;

-- Add missing columns to audit_logs that audit.js expects
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_id TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS module TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS field_changed TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS old_value TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS new_value TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details TEXT;

-- Index for org-scoped queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id
  ON public.audit_logs (org_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_module
  ON public.audit_logs (module);


COMMIT;
