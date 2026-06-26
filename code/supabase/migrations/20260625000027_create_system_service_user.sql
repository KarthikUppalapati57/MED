-- Create System Service User for Edge Functions
-- Sequenced as 20260625000027

BEGIN;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

DO $$
DECLARE
    system_uid UUID := '99999999-9999-9999-9999-999999999999';
BEGIN
    -- Check if system user already exists in auth.users
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = system_uid) THEN
        INSERT INTO auth.users (
            id,
            instance_id,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            role,
            aud,
            confirmation_token
        ) VALUES (
            system_uid,
            '00000000-0000-0000-0000-000000000000',
            'system.worker@restops.test',
            crypt('system-worker-password-not-used-directly', gen_salt('bf')),
            now(),
            '{"role": "platform_admin"}'::jsonb,
            '{"role": "platform_admin", "full_name": "System Worker"}'::jsonb,
            now(),
            now(),
            'authenticated',
            'authenticated',
            ''
        );
    END IF;

    -- Ensure profile exists
    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        role,
        status,
        access_level,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        system_uid,
        'system.worker@restops.test',
        'System Worker',
        'platform_admin',
        'active',
        'platform',
        true,
        now(),
        now()
    ) ON CONFLICT (id) DO UPDATE SET
        role = 'platform_admin',
        status = 'active',
        access_level = 'platform',
        is_active = true,
        updated_at = now();

END $$;

COMMIT;
