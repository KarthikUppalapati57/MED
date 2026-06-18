-- ============================================================
-- Fix Supabase Storage constraints blocking user deletion
-- ============================================================

BEGIN;

-- 1. Fix storage.objects owner
ALTER TABLE storage.objects DROP CONSTRAINT IF EXISTS objects_owner_fkey;
ALTER TABLE storage.objects ADD CONSTRAINT objects_owner_fkey 
    FOREIGN KEY (owner) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Fix storage.buckets owner (just in case they created a bucket)
ALTER TABLE storage.buckets DROP CONSTRAINT IF EXISTS buckets_owner_fkey;
ALTER TABLE storage.buckets ADD CONSTRAINT buckets_owner_fkey 
    FOREIGN KEY (owner) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Explicitly fix the archived_users constraint just in case it was missed
ALTER TABLE public.archived_users DROP CONSTRAINT IF EXISTS archived_users_deleted_by_fkey;
ALTER TABLE public.archived_users ADD CONSTRAINT archived_users_deleted_by_fkey 
    FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

COMMIT;
