-- ============================================================
-- 020: Restore Public INSERT Policies for Marketing Forms
-- ============================================================
-- Fixes:
--   [SECURITY/UX] RLS insertion violations when submitting 
--   "Request Demo", "Request Access", or "Contact Us" forms
--   from the public marketing landing page.
-- ============================================================

BEGIN;

-- Drop if exists to allow safe re-running of migrations
DROP POLICY IF EXISTS "Anon_Insert_Demo_Requests" ON public.demo_requests;
DROP POLICY IF EXISTS "Anon_Insert_Access_Requests" ON public.access_requests;
DROP POLICY IF EXISTS "Anon_Insert_Contact_Requests" ON public.contact_requests;

-- Allow public anonymous/authenticated users to insert new requests
CREATE POLICY "Anon_Insert_Demo_Requests" ON public.demo_requests 
FOR INSERT WITH CHECK (true);

CREATE POLICY "Anon_Insert_Access_Requests" ON public.access_requests 
FOR INSERT WITH CHECK (true);

CREATE POLICY "Anon_Insert_Contact_Requests" ON public.contact_requests 
FOR INSERT WITH CHECK (true);

COMMIT;
