-- Migration 063: Fix Cascading Deletes
-- Ensures all tables referencing organizations have ON DELETE CASCADE so that org deletion works cleanly.

BEGIN;

DO $$
DECLARE
    tbl TEXT;
    fk_name TEXT;
BEGIN
    FOR tbl IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND column_name = 'organization_id'
    LOOP
        -- Find the foreign key constraint name for organization_id
        SELECT tc.constraint_name INTO fk_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name = tbl
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'organization_id'
        LIMIT 1;

        IF fk_name IS NOT NULL THEN
            -- Drop existing constraint
            EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', tbl, fk_name);
            -- Add new constraint with CASCADE
            EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE', tbl, fk_name);
        END IF;
    END LOOP;
END;
$$;

COMMIT;
