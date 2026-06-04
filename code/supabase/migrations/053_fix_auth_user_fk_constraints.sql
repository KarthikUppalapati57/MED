-- ============================================================
-- Migration 053: Fix auth.users foreign key constraints
-- 
-- Fixes "Database error deleting user" by updating all tables 
-- that reference auth.users to use ON DELETE SET NULL.
-- ============================================================

BEGIN;

DO $$ 
DECLARE
    rec record;
BEGIN
    -- Loop through all foreign keys that reference auth.users(id)
    FOR rec IN 
        SELECT 
            tc.table_schema, 
            tc.table_name, 
            kcu.column_name, 
            tc.constraint_name
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' 
          AND ccu.table_schema = 'auth'
          AND ccu.table_name = 'users'
          AND ccu.column_name = 'id'
          -- Exclude tables that already use CASCADE correctly
          AND tc.table_name NOT IN ('profiles', 'organization_members', 'brand_members', 'location_members', 'notifications', 'role_permissions', 'user_organizations')
    LOOP
        -- Drop the existing strict constraint
        EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I;', rec.table_schema, rec.table_name, rec.constraint_name);
        
        -- Add the relaxed constraint with ON DELETE SET NULL
        EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE SET NULL;', 
            rec.table_schema, rec.table_name, rec.constraint_name, rec.column_name);
            
        RAISE NOTICE 'Updated constraint % on table %', rec.constraint_name, rec.table_name;
    END LOOP;
END $$;

COMMIT;
