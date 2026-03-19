-- ==========================================
-- DIAGNOSTIC & FORCE-FIX FOR ADMIN ACCESS
-- ==========================================

-- 1. Identify YOUR current account details
-- Run this and check the Results tab in Supabase
SELECT id, email, raw_user_meta_data->>'role' as metadata_role 
FROM auth.users 
WHERE email ILIKE '%uppalapati%';

-- 2. Identify your Profile record
SELECT id, email, role 
FROM public.profiles 
WHERE email ILIKE '%uppalapati%';

-- 3. FORCE FIX (The "Nuclear" Option)
-- This will find ANY user with your name in the email and force them to be Admin.
DO $$
DECLARE
    u RECORD;
BEGIN
    FOR u IN (SELECT id, email FROM auth.users WHERE email ILIKE '%uppalapati%')
    LOOP
        -- A. Ensuring the Profile exists AND is an Admin
        INSERT INTO public.profiles (id, email, role)
        VALUES (u.id, u.email, 'admin')
        ON CONFLICT (id) DO UPDATE SET role = 'admin';
        
        -- B. Ensuring the Auth Metadata is synced (for RLS)
        UPDATE auth.users 
        SET raw_user_meta_data = 
            COALESCE(raw_user_meta_data, '{}'::jsonb) || 
            jsonb_build_object('role', 'admin')
        WHERE id = u.id;
        
        RAISE NOTICE 'SUCCESS: Forced Admin role for %', u.email;
    END LOOP;
END $$;

-- 4. FINAL VERIFICATION
-- This should now show 'admin' for both
SELECT 
    a.email, 
    a.raw_user_meta_data->>'role' as jwt_role, 
    p.role as database_role
FROM auth.users a
LEFT JOIN public.profiles p ON a.id = p.id
WHERE a.email ILIKE '%uppalapati%';