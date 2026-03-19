-- ============================================================
-- 007: MEVS SAAS READINESS - STORAGE SECURITY
-- ============================================================

-- NOTE: This migration assumes you will create these buckets in the Supabase Dashboard
-- or via the CLI. These policies secure them at the SQL level.

-- buckets: 'invoices', 'avatars'

-- 1. INVOICES BUCKET POLICIES
-- Only users from the same organization can view invoices
DROP POLICY IF EXISTS "Tenant Isolation Invoices View" ON storage.objects;
CREATE POLICY "Tenant Isolation Invoices View" ON storage.objects FOR SELECT USING (
    bucket_id = 'invoices' AND (
        (auth.jwt() -> 'user_metadata' ->> 'role' = 'platform_admin') OR
        ( (storage.foldername(name))[1] = (auth.jwt() -> 'user_metadata' ->> 'organization_id') )
    )
);

DROP POLICY IF EXISTS "Tenant Isolation Invoices Insert" ON storage.objects;
CREATE POLICY "Tenant Isolation Invoices Insert" ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'invoices' AND (
        (auth.jwt() -> 'user_metadata' ->> 'role' = 'platform_admin') OR
        ( (storage.foldername(name))[1] = (auth.jwt() -> 'user_metadata' ->> 'organization_id') )
    )
);

DROP POLICY IF EXISTS "Tenant Isolation Invoices Delete" ON storage.objects;
CREATE POLICY "Tenant Isolation Invoices Delete" ON storage.objects FOR DELETE USING (
    bucket_id = 'invoices' AND (
        (auth.jwt() -> 'user_metadata' ->> 'role' = 'platform_admin') OR
        ( (storage.foldername(name))[1] = (auth.jwt() -> 'user_metadata' ->> 'organization_id') )
    )
);

-- 2. AVATARS BUCKET POLICIES
-- Avatars are public to view, but only the organization owners can manage their org's avatars
DROP POLICY IF EXISTS "Public Avatars View" ON storage.objects;
CREATE POLICY "Public Avatars View" ON storage.objects FOR SELECT USING (
    bucket_id = 'avatars'
);

DROP POLICY IF EXISTS "Tenant Isolation Avatars Manage" ON storage.objects;
CREATE POLICY "Tenant Isolation Avatars Manage" ON storage.objects FOR ALL USING (
    bucket_id = 'avatars' AND (
        (auth.jwt() -> 'user_metadata' ->> 'role' = 'platform_admin') OR
        ( (storage.foldername(name))[1] = (auth.jwt() -> 'user_metadata' ->> 'organization_id') )
    )
);
