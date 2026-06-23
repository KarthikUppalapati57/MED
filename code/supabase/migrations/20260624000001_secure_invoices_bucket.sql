-- Migration 20260624000001_secure_invoices_bucket.sql
-- Goal: Secure the 'invoices' storage bucket

BEGIN;

-- Ensure the bucket exists and make it private
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'invoices',
    'invoices',
    false,
    52428800, -- 50MB
    ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
    public = false;

-- Enable RLS on storage.objects if not already enabled (skipped as it is owned by supabase_storage_admin)

-- Drop existing policies on invoices bucket if any
DROP POLICY IF EXISTS "Authenticated users can upload invoices" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view invoices" ON storage.objects;

-- Create secure policies
-- 1. Upload policy: Only authenticated users can upload
CREATE POLICY "Authenticated users can upload invoices"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'invoices');

-- 2. View policy: Only authenticated users can view/download
CREATE POLICY "Authenticated users can view invoices"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'invoices');

-- 3. Delete policy: Only authenticated users can delete
CREATE POLICY "Authenticated users can delete invoices"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'invoices');

COMMIT;
