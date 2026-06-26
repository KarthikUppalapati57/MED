BEGIN;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.global_vendor_items FROM anon, authenticated;
GRANT SELECT ON TABLE public.global_vendor_items TO authenticated;
GRANT ALL ON TABLE public.global_vendor_items TO service_role;

DROP POLICY IF EXISTS global_vendor_items_authenticated_write ON public.global_vendor_items;
DROP POLICY IF EXISTS "Authenticated users can write global items" ON public.global_vendor_items;
DROP POLICY IF EXISTS "Platform admins can manage global items" ON public.global_vendor_items;

-- Raw writes are intentionally service-role/backend-job only. Platform UI should
-- approve candidates through a reviewed RPC/job, not direct table mutation.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'global_vendor_items_confidence_score_range'
      AND conrelid = 'public.global_vendor_items'::regclass
  ) THEN
    ALTER TABLE public.global_vendor_items
      ADD CONSTRAINT global_vendor_items_confidence_score_range
      CHECK (confidence_score BETWEEN 0 AND 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'global_vendor_items_mapping_count_nonnegative'
      AND conrelid = 'public.global_vendor_items'::regclass
  ) THEN
    ALTER TABLE public.global_vendor_items
      ADD CONSTRAINT global_vendor_items_mapping_count_nonnegative
      CHECK (mapping_count >= 0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.normalize_global_vendor_category(p_category TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_category = ANY (ARRAY[
      '5100', '5110', '5120', '5130', '5140', '5150', '5160', '5170', '5190',
      '5200', '5210', '5220', '5230', '5240', '5290',
      '5300'
    ]) THEN p_category
    WHEN p_category = 'food_cogs' THEN '5100'
    WHEN p_category = 'beverage_cogs' THEN '5200'
    WHEN p_category = 'merchandise_cogs' THEN '5300'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_trusted_global_vendor_item_suggestions()
RETURNS TABLE (
  id UUID,
  item_name TEXT,
  mapping_count INTEGER,
  most_common_category TEXT,
  confidence_score INTEGER
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    gvi.id,
    gvi.item_name,
    gvi.mapping_count,
    public.normalize_global_vendor_category(gvi.most_common_category) AS most_common_category,
    gvi.confidence_score
  FROM public.global_vendor_items gvi
  WHERE gvi.mapping_count >= 50
    AND gvi.confidence_score >= 90
    AND public.normalize_global_vendor_category(gvi.most_common_category) IS NOT NULL
  ORDER BY gvi.mapping_count DESC
  LIMIT 500;
$$;

REVOKE ALL ON FUNCTION public.normalize_global_vendor_category(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_global_vendor_category(TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_trusted_global_vendor_item_suggestions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_trusted_global_vendor_item_suggestions() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_trusted_global_vendor_item_suggestions() IS
  'Returns only high-confidence, high-count, COGS-category global vendor item suggestions. Tenant clients must not read raw global mappings for auto-apply decisions.';

COMMIT;
