BEGIN;

-- Stock Counts can be saved without a count sheet ("All Inventory" or category
-- scopes). The older parent-inherited count_sessions policy only checked
-- count_sheet_id, so those rows failed RLS when count_sheet_id was NULL.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'count_sessions'
      AND policyname = 'count_sessions_stock_count_scope_select'
  ) THEN
    CREATE POLICY count_sessions_stock_count_scope_select
      ON public.count_sessions
      FOR SELECT
      USING (
        count_sheet_id IS NULL
        AND public.tenant_scope_visible(organization_id, brand_id, location_id, deleted_at)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'count_sessions'
      AND policyname = 'count_sessions_stock_count_scope_insert'
  ) THEN
    CREATE POLICY count_sessions_stock_count_scope_insert
      ON public.count_sessions
      FOR INSERT
      WITH CHECK (
        count_sheet_id IS NULL
        AND public.tenant_scope_writable(organization_id, brand_id, location_id, NULL, true)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'count_sessions'
      AND policyname = 'count_sessions_stock_count_scope_update'
  ) THEN
    CREATE POLICY count_sessions_stock_count_scope_update
      ON public.count_sessions
      FOR UPDATE
      USING (
        count_sheet_id IS NULL
        AND public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, true)
      )
      WITH CHECK (
        count_sheet_id IS NULL
        AND public.tenant_scope_writable(organization_id, brand_id, location_id, deleted_at, true)
      );
  END IF;
END $$;

COMMIT;
