-- Migration 029: Standardize RLS to use organization_id
-- Cleans up redundant columns (e.g. org_id) from audit_logs that were added by mistake in previous migrations.

-- 1. audit_logs already has organization_id. Let's drop org_id if it exists.
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='org_id') THEN
        ALTER TABLE public.audit_logs DROP COLUMN org_id CASCADE;
    END IF;
END $$;

-- 2. Drop the index if it exists
DROP INDEX IF EXISTS public.idx_audit_logs_org_id;
