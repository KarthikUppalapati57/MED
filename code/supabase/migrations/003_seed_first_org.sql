-- ============================================================
-- MEVS SAAS: SEED FIRST ORG & PROMOTE ADMIN
-- ============================================================

DO $$
DECLARE
    v_org_id UUID;
    v_user_id UUID;
    v_user_email TEXT;
    t text;
BEGIN
    -- 1. Identify your primary account (SaaS Provider)
    -- We look for the email pattern used in your previous AuthContext
    SELECT id, email INTO v_user_id, v_user_email 
    FROM auth.users 
    WHERE email ILIKE '%uppalapati%' 
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE NOTICE 'Admin user not found. Please update the email filter in this script.';
    ELSE
        -- 2. Create the first Organization (Your corporate account)
        INSERT INTO public.organizations (name, slug, owner_id, subscription_status, subscription_plan)
        VALUES ('System Provider', 'system-provider', v_user_id, 'active', 'enterprise')
        ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_org_id;

        -- 3. Promote you to Platform Admin
        UPDATE public.profiles 
        SET 
            role = 'platform_admin',
            organization_id = v_org_id,
            access_level = 'platform'
        WHERE id = v_user_id;

        -- Also sync to auth.users metadata for RLS/JWT
        UPDATE auth.users 
        SET raw_user_meta_data = 
            COALESCE(raw_user_meta_data, '{}'::jsonb) || 
            jsonb_build_object(
                'role', 'platform_admin',
                'organization_id', v_org_id
            )
        WHERE id = v_user_id;

        -- 4. Migrate existing data to this Organization
        -- This ensures you don't lose access to your current data now that RLS is on
        FOR t IN SELECT unnest(ARRAY['vendors', 'products', 'invoices', 'payments', 'inventory', 'wastage_logs', 'recipes', 'auto_orders', 'notifications', 'invitations'])
        LOOP
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
                EXECUTE format('UPDATE public.%I SET organization_id = %L WHERE organization_id IS NULL', t, v_org_id);
            END IF;
        END LOOP;

        RAISE NOTICE 'Success: Organization % created and user % promoted to platform_admin', v_org_id, v_user_email;
    END IF;
END $$;
