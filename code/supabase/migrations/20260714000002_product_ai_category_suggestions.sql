BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS category_source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS category_review_status TEXT DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS suggested_category TEXT,
  ADD COLUMN IF NOT EXISTS suggested_category_type TEXT,
  ADD COLUMN IF NOT EXISTS suggested_accounting_category TEXT,
  ADD COLUMN IF NOT EXISTS category_reason TEXT,
  ADD COLUMN IF NOT EXISTS category_suggested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS category_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS category_reviewed_by UUID;

DO $$
BEGIN
  ALTER TABLE public.products
    ADD CONSTRAINT products_category_source_check
    CHECK (category_source IN ('manual', 'rules', 'ai', 'approved'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.products
    ADD CONSTRAINT products_category_review_status_check
    CHECK (category_review_status IN ('pending', 'approved', 'rejected'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_category_review_status
  ON public.products (organization_id, category_review_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_uncategorized_review
  ON public.products (organization_id, updated_at)
  WHERE deleted_at IS NULL
    AND (
      NULLIF(trim(COALESCE(category, '')), '') IS NULL
      OR lower(trim(category)) = 'uncategorized'
      OR category_review_status = 'pending'
    );

CREATE OR REPLACE FUNCTION public.derive_product_category(p_category text, p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT
      lower(trim(COALESCE(p_category, ''))) AS category,
      lower(trim(COALESCE(p_name, ''))) AS name
  ),
  cleaned AS (
    SELECT
      category,
      regexp_replace(name, '[^a-z0-9]+', ' ', 'g') AS name
    FROM normalized
  )
  SELECT CASE
    WHEN NULLIF(category, '') IS NOT NULL
      AND category <> 'uncategorized'
      THEN initcap(category)

    WHEN name ~ '(arugula|asparagus|avocado|basil|bean sprouts?|beet|broccoli|cabbage|carrot|cauliflower|celery|cilantro|corn|cucumber|eggplant|garlic|ginger|greens?|herbs?|jalapeno|kale|lettuce|lime|lemon|mushroom|okra|onion|pepper|potato|produce|romaine|scallion|spinach|squash|tomato|zucchini)'
      THEN 'Produce'
    WHEN name ~ '(cheese|cream|creamer|dairy|egg|eggs|half half|milk|mozzarella|parmesan|provolone|sour cream|yogurt|butter|buttermilk)'
      THEN 'Dairy'
    WHEN name ~ '(chicken|breast|drumstick|tender|thigh|wing|wings|poultry|turkey)'
      THEN 'Poultry'
    WHEN name ~ '(beef|burger|bacon|brisket|chorizo|ham|hot dog|meat|patty|pepperoni|pork|ribeye|sausage|steak|veal)'
      THEN 'Meat'
    WHEN name ~ '(anchovy|catfish|clam|cod|crab|fish|haddock|lobster|mussel|oyster|salmon|scallop|seafood|shrimp|tilapia|tuna)'
      THEN 'Seafood'
    WHEN name ~ '(bagel|bakery|biscuit|bread|bun|cake|croissant|dough|muffin|pastry|pita|roll|tortilla)'
      THEN 'Bakery'
    WHEN name ~ '(appetizer|batter|bean|beans|breadcrumb|cereal|chip|chips|cornstarch|crouton|dry goods|flour|grocery|ketchup|macaroni|mayo|mayonnaise|mustard|oil|olive|pasta|pickle|rice|salt|sauce|seasoning|shortening|spice|sugar|syrup|vinegar)'
      THEN 'Grocery and Dry Goods'
    WHEN name ~ '(frozen|fries|fry|ice cream|iqf|nugget)'
      THEN 'Frozen'
    WHEN name ~ '(beer|ale|lager|ipa|stout|porter|pilsner|cider|seltzer|modelo|corona|budweiser|bud light|coors|miller|heineken)'
      THEN 'Beer'
    WHEN name ~ '(wine|pinot|chardonnay|cabernet|merlot|sauvignon|riesling|prosecco|champagne|moscato|malbec|zinfandel|rose)'
      THEN 'Wine'
    WHEN name ~ '(liquor|spirit|vodka|gin|rum|tequila|whiskey|whisky|bourbon|scotch|brandy|cognac|mezcal|liqueur|triple sec)'
      THEN 'Liquor'
    WHEN name ~ '(beverage|bib|coffee|fountain|juice|lemonade|non alcohol|nonalcohol|soda|tea|water)'
      THEN 'N/A Beverage'
    WHEN name ~ '(bleach|cleaner|cleaning|detergent|dish|sanitizer|soap|scrubber|sponge)'
      THEN 'Cleaning Supplies'
    WHEN name ~ '(bag|bags|box|container|cup|film|foil|lid|napkin|packaging|paper|plate|straw|takeout|towel|wrap)'
      THEN 'Paper and Packaging'
    WHEN name ~ '(apron|candle|equipment|glove|gloves|kit|label|lighter|pan|smallware|thermometer|utensil)'
      THEN 'Restaurant Supplies'
    WHEN name ~ '(apparel|gift card|giftcard|hat|merch|merchandise|retail|shirt)'
      THEN 'Retail'
    ELSE 'Uncategorized'
  END
  FROM cleaned;
$$;

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
    SELECT accounting, category, name, accounting || ' ' || category || ' ' || name AS text
    FROM normalized
  )
  SELECT CASE
    WHEN text ~ '(beer|ale|lager|ipa|stout|porter|pilsner|cider|seltzer|modelo|corona|budweiser|bud light|coors|miller|heineken)'
      THEN 'Beer'
    WHEN text ~ '(wine|pinot|chardonnay|cabernet|merlot|sauvignon|riesling|prosecco|champagne|moscato|malbec|zinfandel|rose)'
      THEN 'Wine'
    WHEN text ~ '(liquor|spirit|vodka|gin|rum|tequila|whiskey|whisky|bourbon|scotch|brandy|cognac|mezcal|liqueur|triple sec)'
      THEN 'Liquor'
    WHEN text ~ '(n/a bev|na beverage|non[- ]?alcohol|beverage|bib|coffee|fountain|juice|lemonade|soda|tea|water)'
      OR accounting LIKE '52%'
      OR accounting LIKE '%beverage%'
      THEN 'N/A Bev'
    WHEN text ~ '(retail|merchandise|gift card|giftcard|apparel|shirt|hat|merch)'
      THEN 'Retail'
    WHEN accounting LIKE '51%'
      OR accounting LIKE '%food%'
      OR accounting IN ('food', 'food_cogs', '5100')
      OR category ~ '(bakery|dairy|dry goods|frozen|grocery|meat|paper and packaging|poultry|produce|restaurant supplies|seafood)'
      THEN 'Food'
    ELSE 'Other'
  END
  FROM combined;
$$;

CREATE OR REPLACE FUNCTION public.apply_product_category_suggestion(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
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
    NULL,
    'location_manager'
  ) THEN
    RAISE EXCEPTION 'Not authorized to update this product';
  END IF;

  IF NULLIF(trim(COALESCE(v_product.suggested_category, '')), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No category suggestion is available');
  END IF;

  UPDATE public.products
     SET category = v_product.suggested_category,
         accounting_category = COALESCE(NULLIF(v_product.suggested_accounting_category, ''), accounting_category),
         category_confidence = v_product.category_confidence,
         category_source = 'approved',
         category_review_status = 'approved',
         category_reviewed_at = now(),
         category_reviewed_by = auth.uid(),
         updated_at = now()
   WHERE id = p_product_id;

  RETURN jsonb_build_object('success', true, 'product_id', p_product_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_product_category_suggestion(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
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
    NULL,
    'location_manager'
  ) THEN
    RAISE EXCEPTION 'Not authorized to update this product';
  END IF;

  UPDATE public.products
     SET category_review_status = 'rejected',
         category_reviewed_at = now(),
         category_reviewed_by = auth.uid(),
         updated_at = now()
   WHERE id = p_product_id;

  RETURN jsonb_build_object('success', true, 'product_id', p_product_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_product_category_suggestion(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_product_category_suggestion(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_product_verification_queue(
  p_organization_id uuid DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  vendor_item_id uuid,
  vendor_item_code text,
  vendor_item_name text,
  vendor_name text,
  vendor_unit text,
  last_price numeric,
  last_purchased_at date,
  mapping_id uuid,
  internal_product_id uuid,
  restops_product_id text,
  product_name text,
  category_type text,
  category text,
  match_confidence numeric,
  mapping_status text,
  needs_verification boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, public.get_auth_org());
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context is required';
  END IF;

  RETURN QUERY
  WITH vendor_queue AS (
    SELECT
      vi.id AS vendor_item_id,
      vi.vendor_item_code,
      vi.vendor_item_name,
      v.name AS vendor_name,
      vi.vendor_unit,
      vi.last_price,
      vi.last_purchased_at,
      vim.id AS mapping_id,
      vim.internal_product_id,
      p.product_id AS restops_product_id,
      p.name AS product_name,
      public.derive_product_category_type(p.accounting_category, p.category, COALESCE(p.name, vi.vendor_item_name)) AS category_type,
      COALESCE(NULLIF(p.suggested_category, ''), public.derive_product_category(p.category, COALESCE(p.name, vi.vendor_item_name))) AS category,
      COALESCE(p.category_confidence, vi.match_confidence, CASE WHEN vim.is_verified THEN 100 ELSE 0 END) AS match_confidence,
      COALESCE(vi.mapping_status, CASE WHEN vim.id IS NULL THEN 'unmapped' WHEN vim.is_verified THEN 'verified' ELSE 'suggested' END) AS mapping_status,
      (vim.id IS NULL OR COALESCE(vim.is_verified, false) = false OR COALESCE(vi.match_confidence, 0) < 90) AS needs_verification
    FROM public.vendor_items vi
    LEFT JOIN public.vendors v ON v.id = vi.vendor_id
    LEFT JOIN public.vendor_item_mappings vim ON vim.vendor_item_id = vi.id
    LEFT JOIN public.products p ON p.id = vim.internal_product_id AND p.deleted_at IS NULL
    WHERE vi.organization_id = v_org_id
      AND (p_search IS NULL OR vi.vendor_item_name ILIKE '%' || p_search || '%' OR COALESCE(p.name, '') ILIKE '%' || p_search || '%')
      AND (
        p_brand_id IS NULL
        OR p.brand_id IS NOT DISTINCT FROM p_brand_id
        OR p.id IS NULL
      )
      AND (
        p_location_id IS NULL
        OR p.location_id IS NOT DISTINCT FROM p_location_id
        OR p.id IS NULL
      )
  ),
  product_category_queue AS (
    SELECT
      NULL::uuid AS vendor_item_id,
      NULL::text AS vendor_item_code,
      p.name AS vendor_item_name,
      'Product Catalog'::text AS vendor_name,
      p.report_by_unit AS vendor_unit,
      p.latest_price AS last_price,
      p.updated_at::date AS last_purchased_at,
      NULL::uuid AS mapping_id,
      p.id AS internal_product_id,
      p.product_id AS restops_product_id,
      p.name AS product_name,
      COALESCE(p.suggested_category_type, public.derive_product_category_type(p.accounting_category, COALESCE(p.suggested_category, p.category), p.name)) AS category_type,
      COALESCE(NULLIF(p.suggested_category, ''), public.derive_product_category(p.category, p.name)) AS category,
      COALESCE(p.category_confidence, 0) AS match_confidence,
      CASE
        WHEN p.category_review_status = 'pending' THEN 'suggested'
        WHEN p.category_review_status = 'rejected' THEN 'rejected'
        ELSE 'unmapped'
      END AS mapping_status,
      true AS needs_verification
    FROM public.products p
    WHERE p.organization_id = v_org_id
      AND p.deleted_at IS NULL
      AND (p_brand_id IS NULL OR p.brand_id IS NOT DISTINCT FROM p_brand_id)
      AND (p_location_id IS NULL OR p.location_id IS NOT DISTINCT FROM p_location_id)
      AND public.reference_scope_visible(p.organization_id, p.brand_id, p.location_id, p.deleted_at)
      AND (
        p.category_review_status = 'pending'
        OR NULLIF(trim(COALESCE(p.category, '')), '') IS NULL
        OR lower(trim(p.category)) = 'uncategorized'
      )
      AND (p_search IS NULL OR p.name ILIKE '%' || p_search || '%' OR COALESCE(p.suggested_category, '') ILIKE '%' || p_search || '%')
  ),
  queue AS (
    SELECT * FROM vendor_queue vq WHERE vq.needs_verification
    UNION ALL
    SELECT * FROM product_category_queue
  )
  SELECT *
  FROM queue q
  WHERE (p_status IS NULL OR p_status = 'all' OR q.mapping_status = p_status)
  ORDER BY q.last_purchased_at DESC NULLS LAST, q.vendor_item_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_verification_queue(uuid, uuid, uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.product_accounting_category_for_type(p_category_type text, p_category text DEFAULT NULL)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
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

CREATE OR REPLACE FUNCTION public.normalize_product_category_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_category_type text;
  v_accounting_category text;
  v_should_set_accounting boolean := false;
BEGIN
  IF NULLIF(trim(COALESCE(NEW.category, '')), '') IS NULL
    OR lower(trim(NEW.category)) = 'uncategorized' THEN
    NEW.category := public.derive_product_category(NULL, NEW.name);
    IF NEW.category <> 'Uncategorized' THEN
      NEW.category_source := COALESCE(NULLIF(NEW.category_source, ''), 'rules');
      NEW.category_confidence := COALESCE(NEW.category_confidence, 75);
      NEW.category_review_status := COALESCE(NULLIF(NEW.category_review_status, ''), 'approved');
    END IF;
  END IF;

  v_category_type := public.derive_product_category_type(NEW.accounting_category, NEW.category, NEW.name);
  v_accounting_category := public.product_accounting_category_for_type(v_category_type, NEW.category);

  v_should_set_accounting :=
    TG_OP = 'INSERT'
    OR NULLIF(trim(COALESCE(NEW.accounting_category, '')), '') IS NULL
    OR (NEW.accounting_category = '5100' AND v_accounting_category <> '5110');

  IF TG_OP = 'UPDATE' THEN
    v_should_set_accounting := v_should_set_accounting
      OR (
        COALESCE(OLD.category, '') IS DISTINCT FROM COALESCE(NEW.category, '')
        AND COALESCE(OLD.accounting_category, '') = COALESCE(NEW.accounting_category, '')
      );
  END IF;

  IF v_should_set_accounting THEN
    NEW.accounting_category := v_accounting_category;
  END IF;

  IF NULLIF(trim(COALESCE(NEW.category, '')), '') IS NULL
    OR lower(trim(NEW.category)) = 'uncategorized' THEN
    NEW.category_review_status := 'pending';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_product_category_fields_trigger ON public.products;
CREATE TRIGGER normalize_product_category_fields_trigger
BEFORE INSERT OR UPDATE OF name, category, accounting_category
ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.normalize_product_category_fields();

UPDATE public.products p
   SET category = derived.category,
       accounting_category = public.product_accounting_category_for_type(
         public.derive_product_category_type(p.accounting_category, derived.category, p.name),
         derived.category
       ),
       category_source = 'rules',
       category_review_status = 'approved',
       category_confidence = 75,
       updated_at = now()
  FROM (
    SELECT id, public.derive_product_category(NULL, name) AS category
    FROM public.products
  ) derived
 WHERE p.id = derived.id
   AND p.deleted_at IS NULL
   AND (
     NULLIF(trim(COALESCE(p.category, '')), '') IS NULL
     OR lower(trim(p.category)) = 'uncategorized'
   )
   AND derived.category <> 'Uncategorized';

UPDATE public.products p
   SET category_review_status = 'pending',
       category_source = COALESCE(NULLIF(category_source, ''), 'rules'),
       updated_at = now()
 WHERE p.deleted_at IS NULL
   AND (
     NULLIF(trim(COALESCE(p.category, '')), '') IS NULL
     OR lower(trim(p.category)) = 'uncategorized'
   );

COMMIT;
