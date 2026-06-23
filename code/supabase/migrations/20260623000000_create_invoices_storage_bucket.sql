-- ============================================================
-- Create Storage Bucket for Invoices
-- ============================================================

BEGIN;

-- 1. Create the bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', true)
ON CONFLICT (id) DO NOTHING;

-- 2. (Skipped: RLS is enabled by default in Supabase storage)

-- 3. Policy: Public Access to View Invoices
-- (Since the bucket is public, we allow anyone to read the objects)
DROP POLICY IF EXISTS "Public Access to View Invoices" ON storage.objects;
CREATE POLICY "Public Access to View Invoices"
ON storage.objects FOR SELECT
USING ( bucket_id = 'invoices' );

-- 4. Policy: Authenticated Users can Upload Invoices
DROP POLICY IF EXISTS "Authenticated Users can Upload Invoices" ON storage.objects;
CREATE POLICY "Authenticated Users can Upload Invoices"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'invoices' );

-- 5. Policy: Authenticated Users can Delete Invoices
DROP POLICY IF EXISTS "Authenticated Users can Delete Invoices" ON storage.objects;
CREATE POLICY "Authenticated Users can Delete Invoices"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'invoices' );

COMMIT;
