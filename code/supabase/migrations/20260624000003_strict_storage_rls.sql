-- Migration to harden storage RLS policies for the "invoices" bucket
BEGIN;

-- Remove the old policy we created previously
DROP POLICY IF EXISTS "invoices_bucket_authenticated_access" ON storage.objects;

-- Create strict policies

-- 1. Read Policy: Users can only read files within their organization's folder
CREATE POLICY "invoices_bucket_org_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoices' 
  AND (storage.foldername(name))[1] = auth.jwt()->>'user_org_id'
);

-- 2. Insert Policy: Users can only upload files into their organization's folder
CREATE POLICY "invoices_bucket_org_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'invoices' 
  AND (storage.foldername(name))[1] = auth.jwt()->>'user_org_id'
);

-- 3. Delete Policy: Users can only delete files within their organization's folder
CREATE POLICY "invoices_bucket_org_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'invoices' 
  AND (storage.foldername(name))[1] = auth.jwt()->>'user_org_id'
);

-- 4. Edge Function Internal Access: Allow service role to do anything
CREATE POLICY "invoices_bucket_service_role"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'invoices')
WITH CHECK (bucket_id = 'invoices');

COMMIT;
