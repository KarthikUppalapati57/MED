BEGIN;

-- check_file_security() is SECURITY DEFINER (owned by postgres) but EXECUTE was never granted
-- to authenticated, even though it's called from the "Tenant Isolation Avatars Insert" storage
-- policy's WITH CHECK. Because Postgres evaluates every permissive policy attached to
-- storage.objects for a given command (not just the one whose bucket_id matches), calling this
-- function without permission throws "permission denied for function check_file_security" and
-- aborts the WHOLE insert -- for any authenticated user, in any bucket, not just avatars.
-- Confirmed live while testing the vendor_documents storage RLS fix this session.
GRANT EXECUTE ON FUNCTION public.check_file_security(text, jsonb) TO authenticated;

COMMIT;
