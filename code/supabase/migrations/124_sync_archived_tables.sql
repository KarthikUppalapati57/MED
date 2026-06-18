-- Migration 053: Sync Archived Tables Schema
-- Fix schema mismatch between main tables and archived tables after new columns were added.
-- The archive_record_on_delete trigger relies on exact column ordering.

DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY['organizations', 'brands', 'locations', 'profiles', 'invitations'])
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', 'archived_' || t);
        EXECUTE format('CREATE TABLE public.%I AS SELECT * FROM public.%I WHERE false', 'archived_' || t, t);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN archived_at TIMESTAMPTZ DEFAULT now()', 'archived_' || t);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN archived_by UUID', 'archived_' || t);
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'archived_' || t);
        EXECUTE format('CREATE POLICY "Platform admins can view archived records" ON public.%I FOR SELECT USING (auth.jwt() -> ''user_metadata'' ->> ''role'' = ''platform_admin'')', 'archived_' || t);
    END LOOP;
END $$;
