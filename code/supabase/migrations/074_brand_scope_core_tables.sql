-- Adds brand scope to legacy core workflow tables so brand switching can filter data
-- without relying only on location-level scope.

DO $$
DECLARE
  v_table_name text;
BEGIN
  FOR v_table_name IN SELECT unnest(ARRAY[
    'vendors',
    'products',
    'invoices',
    'payments',
    'inventory',
    'wastage_logs',
    'recipes',
    'auto_orders',
    'notifications',
    'invitations'
  ])
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = v_table_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL',
        v_table_name
      );

      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = v_table_name
          AND column_name = 'location_id'
      ) THEN
        EXECUTE format(
          'UPDATE public.%I AS scoped
           SET brand_id = locations.brand_id
           FROM public.locations
           WHERE scoped.location_id = locations.id
             AND scoped.brand_id IS NULL',
          v_table_name
        );
      END IF;

      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I(organization_id, brand_id)',
        'idx_' || v_table_name || '_org_brand',
        v_table_name
      );
    END IF;
  END LOOP;
END $$;
