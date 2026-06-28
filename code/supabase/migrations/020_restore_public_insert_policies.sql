-- ============================================================
-- 020: Restore Public INSERT Policies for Marketing Forms
-- ============================================================
-- Fixes:
--   [SECURITY/UX] RLS insertion violations when submitting 
--   "Request Demo", "Request Access", or "Contact Us" forms
--   from the public marketing landing page.
-- ============================================================

BEGIN;

DO $guard$
BEGIN
    -- Drop/create only when optional public form tables exist.
    IF to_regclass('public.demo_requests') IS NOT NULL THEN
        DROP POLICY IF EXISTS "Anon_Insert_Demo_Requests" ON public.demo_requests;
        CREATE POLICY "Anon_Insert_Demo_Requests" ON public.demo_requests
        FOR INSERT WITH CHECK (true);
    END IF;

    IF to_regclass('public.access_requests') IS NOT NULL THEN
        DROP POLICY IF EXISTS "Anon_Insert_Access_Requests" ON public.access_requests;
        CREATE POLICY "Anon_Insert_Access_Requests" ON public.access_requests
        FOR INSERT WITH CHECK (true);
    END IF;

    IF to_regclass('public.contact_requests') IS NOT NULL THEN
        DROP POLICY IF EXISTS "Anon_Insert_Contact_Requests" ON public.contact_requests;
        CREATE POLICY "Anon_Insert_Contact_Requests" ON public.contact_requests
        FOR INSERT WITH CHECK (true);
    END IF;
END $guard$;

COMMIT;