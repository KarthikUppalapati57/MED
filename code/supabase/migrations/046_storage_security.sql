-- Migration 046: Storage Security Policies
-- Enforces file type (MIME) and file size constraints on uploads to prevent malicious payloads

-- 1. Create a secure database-driven helper for platform_admin role
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'platform_admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.check_file_security(bucket text, metadata jsonb)
RETURNS boolean AS $$
DECLARE
    file_size int;
    mime_type text;
BEGIN
    file_size := (metadata->>'size')::int;
    mime_type := metadata->>'mimetype';

    -- 1. Restrict File Size to 10MB (10 * 1024 * 1024 = 10485760 bytes)
    IF file_size > 10485760 THEN
        RETURN false;
    END IF;

    -- 2. Restrict MIME Types
    IF bucket = 'avatars' THEN
        IF mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
            RETURN false;
        END IF;
    ELSIF bucket = 'invoices' THEN
        IF mime_type NOT IN ('application/pdf', 'image/jpeg', 'image/png', 'text/csv') THEN
            RETURN false;
        END IF;
    ELSE
        -- Fallback for any future bucket
        IF mime_type NOT IN ('application/pdf', 'image/jpeg', 'image/png', 'text/csv', 'image/webp') THEN
            RETURN false;
        END IF;
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add CHECK constraints directly to existing INSERT and UPDATE policies
-- For 'invoices' bucket
DROP POLICY IF EXISTS "Tenant Isolation Invoices Insert" ON storage.objects;
CREATE POLICY "Tenant Isolation Invoices Insert" ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'invoices' AND (
        (public.is_platform_admin()) OR
        ( (storage.foldername(name))[1] = public.get_my_org()::text )
    ) AND public.check_file_security(bucket_id, metadata)
);

-- For 'avatars' bucket
-- Note: 'avatars' manage policy is an ALL policy, we must split it or add a specific INSERT policy
-- Since 008 created an ALL policy, we can redefine it
DROP POLICY IF EXISTS "Tenant Isolation Avatars Manage" ON storage.objects;

-- Recreate SELECT/UPDATE/DELETE
DROP POLICY IF EXISTS "Tenant Isolation Avatars Update" ON storage.objects;
CREATE POLICY "Tenant Isolation Avatars Update" ON storage.objects FOR UPDATE USING (
    bucket_id = 'avatars' AND (
        (public.is_platform_admin()) OR
        ( (storage.foldername(name))[1] = public.get_my_org()::text )
    )
);

DROP POLICY IF EXISTS "Tenant Isolation Avatars Delete" ON storage.objects;
CREATE POLICY "Tenant Isolation Avatars Delete" ON storage.objects FOR DELETE USING (
    bucket_id = 'avatars' AND (
        (public.is_platform_admin()) OR
        ( (storage.foldername(name))[1] = public.get_my_org()::text )
    )
);

-- Recreate INSERT with security check
DROP POLICY IF EXISTS "Tenant Isolation Avatars Insert" ON storage.objects;
CREATE POLICY "Tenant Isolation Avatars Insert" ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND (
        (public.is_platform_admin()) OR
        ( (storage.foldername(name))[1] = public.get_my_org()::text )
    ) AND public.check_file_security(bucket_id, metadata)
);
