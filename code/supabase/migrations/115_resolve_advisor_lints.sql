-- Phase 4 Migration: Resolve remaining Advisor lints

-- 1. Security: Move fuzzystrmatch to extensions schema
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION fuzzystrmatch SET SCHEMA extensions;

-- 2. Security: Revoke API access to mv_daily_sales_summary
REVOKE ALL ON public.mv_daily_sales_summary FROM anon, authenticated;

-- 3. Security: Fix permissive RLS policies on audit_logs and error_logs
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_logs' AND policyname = 'System can insert audit logs') THEN
        ALTER POLICY "System can insert audit logs" ON public.audit_logs WITH CHECK (auth.uid() IS NOT NULL);
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_logs' AND policyname = 'audit_logs_authenticated_insert') THEN
        ALTER POLICY "audit_logs_authenticated_insert" ON public.audit_logs WITH CHECK (auth.uid() IS NOT NULL);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'error_logs' AND policyname = 'error_logs_authenticated_insert') THEN
        ALTER POLICY "error_logs_authenticated_insert" ON public.error_logs WITH CHECK (auth.uid() IS NOT NULL);
    END IF;
END
$$;

-- 4. Performance: Fix auth_rls_initplan by wrapping auth.uid() and auth.role() in (select ...)
DO $$
DECLARE
    pol RECORD;
    new_qual text;
    new_with_check text;
    v_cmd text;
BEGIN
    FOR pol IN (
        SELECT policyname, tablename, roles, pg_policies.cmd as pcmd, qual, with_check 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND (qual ILIKE '%auth.uid()%' OR qual ILIKE '%auth.role()%' OR with_check ILIKE '%auth.uid()%' OR with_check ILIKE '%auth.role()%')
    ) LOOP
        new_qual := pol.qual;
        IF new_qual IS NOT NULL THEN
            -- unwrap first to prevent double-wrapping
            new_qual := regexp_replace(new_qual, '\(\s*select\s+auth\.uid\(\)\s*(?:as\s+\w+)?\s*\)', 'auth.uid()', 'ig');
            new_qual := regexp_replace(new_qual, '\(\s*select\s+auth\.role\(\)\s*(?:as\s+\w+)?\s*\)', 'auth.role()', 'ig');
            
            -- wrap
            new_qual := regexp_replace(new_qual, 'auth\.uid\(\)', '(select auth.uid())', 'ig');
            new_qual := regexp_replace(new_qual, 'auth\.role\(\)', '(select auth.role())', 'ig');
        END IF;

        new_with_check := pol.with_check;
        IF new_with_check IS NOT NULL THEN
            new_with_check := regexp_replace(new_with_check, '\(\s*select\s+auth\.uid\(\)\s*(?:as\s+\w+)?\s*\)', 'auth.uid()', 'ig');
            new_with_check := regexp_replace(new_with_check, '\(\s*select\s+auth\.role\(\)\s*(?:as\s+\w+)?\s*\)', 'auth.role()', 'ig');
            
            new_with_check := regexp_replace(new_with_check, 'auth\.uid\(\)', '(select auth.uid())', 'ig');
            new_with_check := regexp_replace(new_with_check, 'auth\.role\(\)', '(select auth.role())', 'ig');
        END IF;
        
        v_cmd := format('ALTER POLICY %I ON public.%I ', pol.policyname, pol.tablename);
        
        IF new_qual IS NOT NULL THEN
            v_cmd := v_cmd || format(' USING (%s) ', new_qual);
        END IF;
        
        IF new_with_check IS NOT NULL THEN
            v_cmd := v_cmd || format(' WITH CHECK (%s) ', new_with_check);
        END IF;

        -- only execute if changes were made to avoid unnecessary updates
        IF (new_qual IS DISTINCT FROM pol.qual) OR (new_with_check IS DISTINCT FROM pol.with_check) THEN
            EXECUTE v_cmd;
        END IF;
    END LOOP;
END
$$;
