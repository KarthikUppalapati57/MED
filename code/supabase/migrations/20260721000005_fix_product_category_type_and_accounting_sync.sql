BEGIN;

CREATE OR REPLACE FUNCTION public.derive_product_category_type(
  p_accounting_category text,
  p_category text DEFAULT NULL,
  p_name text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT
      lower(COALESCE(p_accounting_category, '')) AS accounting,
      lower(COALESCE(p_category, '')) AS category,
      lower(COALESCE(p_name, '')) AS name
  ),
  combined AS (
    SELECT
      accounting,
      category,
      name,
      category || ' ' || name AS category_name,
      accounting || ' ' || category || ' ' || name AS text
    FROM normalized
  )
  SELECT CASE
    WHEN category_name ~ '(paper|packaging|container|cup|lid|straw|napkin|towel|bag|box|plate|foil|wrap|cleaning|cleaner|soap|detergent|sanitizer|bleach|sponge|scrubber|glove|apron|scraper|blade|pan|utensil|equipment|smallware|thermometer|restaurant supplies)'
      THEN 'Other'
    WHEN category_name ~ '(beer|ale|lager|ipa|stout|porter|pilsner|cider|seltzer|blue moon|modelo|corona|budweiser|bud light|coors|miller|heineken)'
      OR accounting = '5230'
      THEN 'Beer'
    WHEN category_name ~ '(wine|pinot|chardonnay|cabernet|merlot|sauvignon|riesling|prosecco|champagne|moscato|malbec|zinfandel|rose\b)'
      OR accounting = '5240'
      THEN 'Wine'
    WHEN category_name ~ '(liquor|spirit|vodka|gin|rum|tequila|whiskey|whisky|bourbon|scotch|brandy|cognac|mezcal|liqueur|triple sec)'
      OR accounting = '5220'
      THEN 'Liquor'
    WHEN category_name ~ '(n/a bev|na beverage|non[- ]?alcohol|beverage|soda|juice|tea|coffee|lemonade|energy drink|water|syrup, fontn|fountain|bib)'
      OR accounting = '5210'
      OR accounting = '1220'
      THEN 'N/A Bev'
    WHEN category_name ~ '(retail|merchandise|gift card|giftcard|apparel|shirt|hat|merch)'
      OR accounting = '5300'
      THEN 'Retail'
    WHEN accounting LIKE '51%'
      OR accounting LIKE '%food%'
      OR accounting IN ('food', 'food_cogs', '5100')
      OR category ~ '(dairy|produce|poultry|grocery|meat|seafood|bakery|bread|frozen|dry goods)'
      THEN 'Food'
    ELSE 'Other'
  END
  FROM combined;
$$;

CREATE OR REPLACE FUNCTION public.product_accounting_category_for_type(
  p_category_type text,
  p_category text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN lower(COALESCE(p_category, '')) LIKE '%paper%'
      OR lower(COALESCE(p_category, '')) LIKE '%packaging%'
      OR lower(COALESCE(p_category, '')) LIKE '%cleaning%'
      OR lower(COALESCE(p_category, '')) LIKE '%restaurant supplies%'
      THEN '5110'
    WHEN p_category_type = 'Beer' THEN '5230'
    WHEN p_category_type = 'Wine' THEN '5240'
    WHEN p_category_type = 'Liquor' THEN '5220'
    WHEN p_category_type = 'N/A Bev' THEN '5210'
    WHEN p_category_type = 'Retail' THEN '5300'
    WHEN lower(COALESCE(p_category, '')) LIKE '%produce%' THEN '5150'
    WHEN lower(COALESCE(p_category, '')) LIKE '%dairy%' THEN '5140'
    WHEN lower(COALESCE(p_category, '')) LIKE '%poultry%' THEN '5120'
    WHEN lower(COALESCE(p_category, '')) LIKE '%seafood%' THEN '5130'
    WHEN lower(COALESCE(p_category, '')) LIKE '%frozen%' THEN '5160'
    WHEN lower(COALESCE(p_category, '')) LIKE '%grocery%' THEN '5170'
    WHEN lower(COALESCE(p_category, '')) LIKE '%dry goods%' THEN '5170'
    ELSE '5110'
  END;
$$;

CREATE OR REPLACE FUNCTION public.apply_product_category_suggestion(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_category_type text;
  v_accounting_category text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
    INTO v_product
  FROM public.products
  WHERE id = p_product_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_product.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Product not found');
  END IF;

  IF NOT public.reference_scope_writable(
    v_product.organization_id,
    v_product.brand_id,
    v_product.location_id,
    v_product.deleted_at,
    'location_manager'
  ) THEN
    RAISE EXCEPTION 'Not authorized to update this product';
  END IF;

  IF NULLIF(trim(COALESCE(v_product.suggested_category, '')), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No category suggestion is available');
  END IF;

  v_category_type := public.derive_product_category_type(NULL, v_product.suggested_category, v_product.name);
  v_accounting_category := public.product_accounting_category_for_type(v_category_type, v_product.suggested_category);

  UPDATE public.products
     SET category = v_product.suggested_category,
         accounting_category = v_accounting_category,
         category_confidence = v_product.category_confidence,
         category_source = 'approved',
         category_review_status = 'approved',
         category_reviewed_at = now(),
         category_reviewed_by = auth.uid(),
         updated_at = now()
   WHERE id = p_product_id;

  UPDATE public.inventory i
     SET category = v_product.suggested_category,
         accounting_category = v_accounting_category,
         updated_at = now()
   WHERE i.internal_product_id = p_product_id
     AND i.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'success', true,
    'product_id', p_product_id,
    'category', v_product.suggested_category,
    'accounting_category', v_accounting_category
  );
END;
$$;

UPDATE public.products p
   SET accounting_category = public.product_accounting_category_for_type(
         public.derive_product_category_type(NULL, p.category, p.name),
         p.category
       ),
       updated_at = now()
 WHERE p.deleted_at IS NULL
   AND NULLIF(trim(COALESCE(p.category, '')), '') IS NOT NULL
   AND p.accounting_category IS DISTINCT FROM public.product_accounting_category_for_type(
         public.derive_product_category_type(NULL, p.category, p.name),
         p.category
       )
   AND lower(p.category) ~ '(paper|packaging|cleaning supplies|restaurant supplies|produce|dairy|poultry|seafood|frozen|grocery|dry goods|beer|wine|liquor|n/a beverage|n/a bev|retail)';

UPDATE public.inventory i
   SET category = p.category,
       accounting_category = p.accounting_category,
       updated_at = now()
  FROM public.products p
 WHERE i.internal_product_id = p.id
   AND i.deleted_at IS NULL
   AND p.deleted_at IS NULL
   AND (
     i.category IS DISTINCT FROM p.category
     OR i.accounting_category IS DISTINCT FROM p.accounting_category
   );

GRANT EXECUTE ON FUNCTION public.apply_product_category_suggestion(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.derive_product_category_type(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.product_accounting_category_for_type(text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
