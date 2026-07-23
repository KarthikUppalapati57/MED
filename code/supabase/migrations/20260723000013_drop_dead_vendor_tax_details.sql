BEGIN;

-- vendor_tax_details (VO-RULE-037): superseded by vendor_tax_information, zero rows live,
-- zero references anywhere in code/src or code/supabase/functions, and its RLS still uses the
-- pre-hardening current_setting('app.current_tenant_id') pattern CLAUDE.md §1/§2 retired in
-- favor of get_auth_org()/profiles-based resolution. Confirmed dead, not just unused.
DROP TABLE IF EXISTS public.vendor_tax_details;

COMMIT;
