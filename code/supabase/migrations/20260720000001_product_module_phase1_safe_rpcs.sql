BEGIN;

-- Product module Phase 1: safe reporting and workflow RPCs.
-- This migration is intentionally additive: it reuses existing product,
-- invoice, vendor item, and mapping tables.

CREATE OR REPLACE FUNCTION public.normalize_product_report_unit(p_unit text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN NULLIF(trim(COALESCE(p_unit, '')), '') IS NULL THEN 'Each'
    WHEN lower(trim(p_unit)) IN ('ea', 'each', 'unit', 'units') THEN 'Each'
    WHEN lower(trim(p_unit)) IN ('cs', 'case', 'cases') THEN 'Case'
    WHEN lower(trim(p_unit)) IN ('lb', 'lbs', 'pound', 'pounds') THEN 'Pound'
    WHEN lower(trim(p_unit)) IN ('oz', 'ounce', 'ounces') THEN 'Ounce'
    WHEN lower(trim(p_unit)) IN ('gal', 'gallon', 'gallons') THEN 'Gallon'
    WHEN lower(trim(p_unit)) IN ('qt', 'quart', 'quarts') THEN 'Quart'
    WHEN lower(trim(p_unit)) IN ('pt', 'pint', 'pints') THEN 'Pint'
    WHEN lower(trim(p_unit)) IN ('floz', 'fl oz', 'fluid ounce', 'fluid ounces') THEN 'Fluid Ounce'
    WHEN lower(trim(p_unit)) IN ('kg', 'kilogram', 'kilograms') THEN 'Kilogram'
    WHEN lower(trim(p_unit)) IN ('g', 'gram', 'grams') THEN 'Gram'
    WHEN lower(trim(p_unit)) IN ('box', 'boxes') THEN 'Box'
    WHEN lower(trim(p_unit)) IN ('bag', 'bags') THEN 'Bag'
    WHEN lower(trim(p_unit)) IN ('btl', 'bottle', 'bottles') THEN 'Bottle'
    WHEN lower(trim(p_unit)) IN ('can', 'cans') THEN 'Can'
    ELSE initcap(trim(p_unit))
  END;
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
  SELECT CASE
    WHEN lower(COALESCE(p_accounting_category, '')) LIKE '52%'
      OR lower(COALESCE(p_accounting_category, '')) LIKE '%beverage%'
      OR lower(COALESCE(p_category, '')) IN ('beer', 'wine', 'liquor', 'beverage', 'beverages')
      OR lower(COALESCE(p_name, '')) ~ '(beer|wine|liquor|vodka|gin|rum|tequila|whiskey|syrup, fontn|soda)'
      THEN 'Beverage'
    WHEN lower(COALESCE(p_accounting_category, '')) LIKE '51%'
      OR lower(COALESCE(p_accounting_category, '')) LIKE '%food%'
      OR lower(COALESCE(p_accounting_category, '')) IN ('food', 'food_cogs', '5100')
      THEN 'Food'
    ELSE 'Other'
  END;
$$;

CREATE OR REPLACE FUNCTION public.derive_product_category(p_category text, p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN NULLIF(trim(COALESCE(p_category, '')), '') IS NOT NULL
      AND lower(trim(p_category)) <> 'uncategorized'
      THEN trim(p_category)
    WHEN lower(COALESCE(p_name, '')) ~ '(lettuce|tomato|potato|onion|pepper|celery|carrot|cucumber|lemon|okra|coleslaw|produce)'
      THEN 'Produce'
    WHEN lower(COALESCE(p_name, '')) ~ '(cheese|milk|cream|butter|buttermilk|dairy)'
      THEN 'Dairy'
    WHEN lower(COALESCE(p_name, '')) ~ '(chicken|wing|breast|tender|poultry)'
      THEN 'Poultry'
    WHEN lower(COALESCE(p_name, '')) ~ '(beef|bacon|pork|meat|patty)'
      THEN 'Meat'
    WHEN lower(COALESCE(p_name, '')) ~ '(beer|ale|lager)'
      THEN 'Beer'
    WHEN lower(COALESCE(p_name, '')) ~ '(wine|pinot|cabernet|chardonnay)'
      THEN 'Wine'
    WHEN lower(COALESCE(p_name, '')) ~ '(vodka|gin|rum|tequila|whiskey|liquor)'
      THEN 'Liquor'
    WHEN lower(COALESCE(p_name, '')) ~ '(container|towel|scrubber|glove|kit, ctly|napkin|paper|bleach)'
      THEN 'Restaurant Supplies'
    WHEN lower(COALESCE(p_name, '')) ~ '(flour|bread|roll|macaroni|ketchup|mayonnaise|sauce|shortening|tortilla|breade?r|syrup)'
      THEN 'Grocery and Dry Goods'
    ELSE 'Uncategorized'
  END;
$$;

CREATE OR REPLACE FUNCTION public.generate_restops_product_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('public.products.product_id'));

  SELECT COALESCE(MAX(((regexp_match(product_id, '^PRD-([0-9]+)$'))[1])::bigint), 0) + 1
    INTO v_next
  FROM public.products
  WHERE product_id ~ '^PRD-[0-9]+$';

  RETURN 'PRD-' || lpad(v_next::text, 6, '0');
END;
$$;

WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY created_at NULLS FIRST, id) AS rn,
    COALESCE((
      SELECT MAX(((regexp_match(product_id, '^PRD-([0-9]+)$'))[1])::bigint)
      FROM public.products
      WHERE product_id ~ '^PRD-[0-9]+$'
    ), 0) AS base_num
  FROM public.products
  WHERE NULLIF(trim(COALESCE(product_id, '')), '') IS NULL
)
UPDATE public.products p
   SET product_id = 'PRD-' || lpad((numbered.base_num + numbered.rn)::text, 6, '0'),
       updated_at = now()
  FROM numbered
 WHERE p.id = numbered.id;

CREATE OR REPLACE FUNCTION public.soft_delete_product_safe(p_product_id uuid)
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
    RAISE EXCEPTION 'Not authorized to delete this product';
  END IF;

  UPDATE public.products
     SET deleted_at = now(),
         deleted_by = auth.uid(),
         updated_at = now()
   WHERE id = p_product_id;

  RETURN jsonb_build_object('success', true, 'product_id', p_product_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_product_dashboard_summary(
  p_organization_id uuid DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL
)
RETURNS TABLE (
  total_products bigint,
  inventoried_count bigint,
  tax_exempt_count bigint,
  category_count bigint,
  missing_product_id_count bigint,
  uncategorized_count bigint,
  unmapped_vendor_item_count bigint,
  price_variance_count bigint
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
  WITH product_scope AS (
    SELECT p.*
    FROM public.products p
    WHERE p.organization_id = v_org_id
      AND p.deleted_at IS NULL
      AND (p_brand_id IS NULL OR p.brand_id IS NOT DISTINCT FROM p_brand_id)
      AND (p_location_id IS NULL OR p.location_id IS NOT DISTINCT FROM p_location_id)
      AND public.reference_scope_visible(p.organization_id, p.brand_id, p.location_id, p.deleted_at)
  ),
  vendor_scope AS (
    SELECT vi.*
    FROM public.vendor_items vi
    WHERE vi.organization_id = v_org_id
  )
  SELECT
    (SELECT count(*) FROM product_scope),
    (SELECT count(*) FROM product_scope WHERE COALESCE(is_inventoried, false)),
    (SELECT count(*) FROM product_scope WHERE COALESCE(is_tax_exempt, false)),
    (SELECT count(DISTINCT public.derive_product_category(category, name)) FROM product_scope),
    (SELECT count(*) FROM product_scope WHERE NULLIF(trim(COALESCE(product_id, '')), '') IS NULL),
    (SELECT count(*) FROM product_scope WHERE public.derive_product_category(category, name) = 'Uncategorized'),
    (
      SELECT count(*)
      FROM vendor_scope vi
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.vendor_item_mappings vim
        WHERE vim.vendor_item_id = vi.id
      )
    ),
    (SELECT count(*) FROM vendor_scope WHERE COALESCE(price_variance_flag, false));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_product_purchase_report(
  p_organization_id uuid DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_category_type text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  restaurant text,
  product_id uuid,
  restops_product_id text,
  product_name text,
  category_type text,
  category text,
  report_by text,
  invoice_count bigint,
  line_count bigint,
  purchased_units numeric,
  purchased_amount numeric,
  latest_cost numeric,
  avg_cost numeric,
  last_purchased_at date
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
  WITH approved_lines AS (
    SELECT
      i.id AS invoice_id,
      i.invoice_date,
      i.organization_id,
      i.brand_id,
      i.location_id,
      i.vendor_id,
      ili.id AS line_id,
      ili.item_name,
      ili.quantity,
      ili.unit_price,
      ili.total_price,
      ili.vendor_unit,
      ili.internal_product_id,
      ili.inventory_item_id
    FROM public.invoices i
    JOIN public.invoice_line_items ili ON ili.invoice_id = i.id
    WHERE i.organization_id = v_org_id
      AND i.deleted_at IS NULL
      AND (i.status = 'approved' OR i.ap_status = 'approved')
      AND (p_brand_id IS NULL OR i.brand_id IS NOT DISTINCT FROM p_brand_id)
      AND (p_location_id IS NULL OR i.location_id IS NOT DISTINCT FROM p_location_id)
      AND (p_start_date IS NULL OR i.invoice_date >= p_start_date)
      AND (p_end_date IS NULL OR i.invoice_date <= p_end_date)
      AND public.tenant_scope_visible(i.organization_id, i.brand_id, i.location_id, i.deleted_at)
      AND public.tenant_scope_visible(ili.organization_id, i.brand_id, i.location_id, NULL)
  ),
  enriched AS (
    SELECT
      COALESCE(l.name, 'Current Store') AS restaurant,
      p.id AS product_id,
      p.product_id AS restops_product_id,
      COALESCE(p.name, al.item_name) AS product_name,
      public.derive_product_category_type(p.accounting_category, p.category, COALESCE(p.name, al.item_name)) AS category_type,
      public.derive_product_category(p.category, COALESCE(p.name, al.item_name)) AS category,
      public.normalize_product_report_unit(COALESCE(p.report_by_unit, al.vendor_unit)) AS report_by,
      al.invoice_id,
      al.line_id,
      COALESCE(al.quantity, 0) AS quantity,
      COALESCE(al.total_price, COALESCE(al.quantity, 0) * COALESCE(al.unit_price, 0)) AS total_price,
      COALESCE(al.unit_price, 0) AS unit_price,
      al.invoice_date
    FROM approved_lines al
    LEFT JOIN public.products p
      ON p.id = al.internal_product_id
      OR (al.inventory_item_id IS NOT NULL AND p.product_id = al.inventory_item_id)
    LEFT JOIN public.locations l ON l.id = al.location_id
    WHERE (p_search IS NULL OR COALESCE(p.name, al.item_name, '') ILIKE '%' || p_search || '%')
  )
  SELECT
    e.restaurant,
    e.product_id,
    e.restops_product_id,
    e.product_name,
    e.category_type,
    e.category,
    e.report_by,
    count(DISTINCT e.invoice_id) AS invoice_count,
    count(e.line_id) AS line_count,
    round(sum(e.quantity), 4) AS purchased_units,
    round(sum(e.total_price), 2) AS purchased_amount,
    (array_agg(e.unit_price ORDER BY e.invoice_date DESC NULLS LAST, e.line_id DESC))[1] AS latest_cost,
    round(sum(e.total_price) / NULLIF(sum(e.quantity), 0), 4) AS avg_cost,
    max(e.invoice_date) AS last_purchased_at
  FROM enriched e
  WHERE (p_category_type IS NULL OR p_category_type = 'all' OR e.category_type = p_category_type)
    AND (p_category IS NULL OR p_category = 'all' OR e.category = p_category)
  GROUP BY
    e.restaurant,
    e.product_id,
    e.restops_product_id,
    e.product_name,
    e.category_type,
    e.category,
    e.report_by
  ORDER BY e.product_name;
END;
$$;

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
  WITH queue AS (
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
      public.derive_product_category(p.category, COALESCE(p.name, vi.vendor_item_name)) AS category,
      COALESCE(vi.match_confidence, CASE WHEN vim.is_verified THEN 100 ELSE 0 END) AS match_confidence,
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
  )
  SELECT *
  FROM queue q
  WHERE q.needs_verification
    AND (p_status IS NULL OR p_status = 'all' OR q.mapping_status = p_status)
  ORDER BY q.last_purchased_at DESC NULLS LAST, q.vendor_item_name;
END;
$$;

-- Preserve the current invoice approval behavior while ensuring invoice-created
-- products receive a user-facing Restops Product ID.
CREATE OR REPLACE FUNCTION public.sync_invoice_products(p_invoice_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice RECORD;
  v_item RECORD;
  v_product_id UUID;
  v_vendor_item_id UUID;
  v_mapping_id UUID;
  v_previous_price NUMERIC;
  v_threshold NUMERIC := 10;
  v_price_variance_flag BOOLEAN;
  v_price_variance_percent NUMERIC;
  v_line_hash TEXT;
  v_existing_hash TEXT;
  v_updates_count INT := 0;
BEGIN
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id;

  IF v_invoice IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Invoice not found');
  END IF;

  SELECT md5(COALESCE(jsonb_agg(jsonb_build_object(
      'id', ili.id,
      'item_name', ili.item_name,
      'quantity', ili.quantity,
      'unit_price', ili.unit_price,
      'total_price', ili.total_price,
      'vendor_item_code', ili.vendor_item_code,
      'vendor_unit', ili.vendor_unit
    ) ORDER BY ili.id)::TEXT, '[]'))
    INTO v_line_hash
  FROM public.invoice_line_items ili
  WHERE ili.invoice_id = p_invoice_id;

  SELECT hash INTO v_existing_hash
  FROM public.invoice_sync_log
  WHERE invoice_id = p_invoice_id
    AND operation = 'sync_invoice_products'
  ORDER BY processed_at DESC
  LIMIT 1;

  IF v_existing_hash IS NOT NULL AND v_existing_hash = v_line_hash THEN
    RETURN jsonb_build_object('status', 'success', 'updates_count', 0, 'idempotent', true);
  END IF;

  FOR v_item IN
    SELECT *
    FROM public.invoice_line_items
    WHERE invoice_id = p_invoice_id
      AND NULLIF(trim(COALESCE(item_name, '')), '') IS NOT NULL
  LOOP
    v_product_id := v_item.internal_product_id;
    v_vendor_item_id := NULL;
    v_mapping_id := NULL;
    v_price_variance_flag := false;
    v_price_variance_percent := 0;

    IF v_product_id IS NULL THEN
      SELECT id INTO v_product_id
      FROM public.products
      WHERE organization_id = v_invoice.organization_id
        AND lower(name) = lower(v_item.item_name)
        AND deleted_at IS NULL
        AND (
          brand_id IS NOT DISTINCT FROM v_invoice.brand_id
          OR brand_id IS NULL
        )
      ORDER BY CASE WHEN brand_id IS NOT DISTINCT FROM v_invoice.brand_id THEN 0 ELSE 1 END
      LIMIT 1;

      IF v_product_id IS NULL THEN
        INSERT INTO public.products (
          organization_id,
          brand_id,
          location_id,
          product_id,
          name,
          category,
          accounting_category,
          report_by_unit,
          base_unit,
          latest_price,
          is_inventoried,
          created_from_invoice_id
        ) VALUES (
          v_invoice.organization_id,
          v_invoice.brand_id,
          v_invoice.location_id,
          public.generate_restops_product_id(),
          v_item.item_name,
          public.derive_product_category(NULL, v_item.item_name),
          CASE
            WHEN public.derive_product_category_type(NULL, NULL, v_item.item_name) = 'Beverage' THEN '5200'
            ELSE '5100'
          END,
          COALESCE(NULLIF(v_item.vendor_unit, ''), 'ea'),
          COALESCE(NULLIF(v_item.vendor_unit, ''), 'ea'),
          COALESCE(v_item.unit_price, 0),
          false,
          p_invoice_id
        )
        RETURNING id INTO v_product_id;
      ELSE
        UPDATE public.products
           SET product_id = COALESCE(NULLIF(product_id, ''), public.generate_restops_product_id()),
               latest_price = CASE
                 WHEN COALESCE(v_item.unit_price, 0) > 0 THEN v_item.unit_price
                 ELSE latest_price
               END,
               category = CASE
                 WHEN NULLIF(trim(COALESCE(category, '')), '') IS NULL OR lower(category) = 'uncategorized'
                   THEN public.derive_product_category(category, v_item.item_name)
                 ELSE category
               END,
               brand_id = COALESCE(brand_id, v_invoice.brand_id),
               location_id = COALESCE(location_id, v_invoice.location_id),
               updated_at = now()
         WHERE id = v_product_id;
      END IF;
    END IF;

    IF v_invoice.vendor_id IS NOT NULL THEN
      SELECT id, last_price, price_variance_threshold_percent
        INTO v_vendor_item_id, v_previous_price, v_threshold
      FROM public.vendor_items
      WHERE organization_id = v_invoice.organization_id
        AND vendor_id = v_invoice.vendor_id
        AND lower(vendor_item_name) = lower(v_item.item_name)
        AND COALESCE(vendor_item_code, '') = COALESCE(v_item.vendor_item_code, '')
      LIMIT 1;

      v_threshold := COALESCE(v_threshold, 10);

      IF v_vendor_item_id IS NOT NULL THEN
        IF COALESCE(v_previous_price, 0) > 0 AND COALESCE(v_item.unit_price, 0) > 0 THEN
          v_price_variance_percent := ((v_item.unit_price - v_previous_price) / v_previous_price) * 100;
          v_price_variance_flag := abs(v_price_variance_percent) >= v_threshold;
        END IF;

        UPDATE public.vendor_items
           SET vendor_unit = COALESCE(NULLIF(v_item.vendor_unit, ''), vendor_unit),
               previous_price = last_price,
               last_price = COALESCE(v_item.unit_price, last_price),
               last_invoice_id = p_invoice_id,
               last_invoice_line_id = v_item.id,
               last_purchased_at = COALESCE(v_invoice.invoice_date, CURRENT_DATE),
               last_price_change_percent = v_price_variance_percent,
               price_variance_flag = v_price_variance_flag,
               updated_at = now()
         WHERE id = v_vendor_item_id;
      ELSE
        INSERT INTO public.vendor_items (
          organization_id,
          vendor_id,
          vendor_item_code,
          vendor_item_name,
          vendor_unit,
          default_price,
          last_price,
          last_invoice_id,
          last_invoice_line_id,
          last_purchased_at,
          updated_at
        ) VALUES (
          v_invoice.organization_id,
          v_invoice.vendor_id,
          NULLIF(v_item.vendor_item_code, ''),
          v_item.item_name,
          NULLIF(v_item.vendor_unit, ''),
          v_item.unit_price,
          v_item.unit_price,
          p_invoice_id,
          v_item.id,
          COALESCE(v_invoice.invoice_date, CURRENT_DATE),
          now()
        )
        RETURNING id INTO v_vendor_item_id;
      END IF;

      IF v_product_id IS NOT NULL AND v_vendor_item_id IS NOT NULL THEN
        INSERT INTO public.vendor_item_mappings (
          organization_id,
          vendor_item_id,
          internal_product_id,
          conversion_multiplier,
          is_verified,
          updated_at
        ) VALUES (
          v_invoice.organization_id,
          v_vendor_item_id,
          v_product_id,
          1,
          false,
          now()
        )
        ON CONFLICT (vendor_item_id, internal_product_id)
        DO UPDATE SET updated_at = now()
        RETURNING id INTO v_mapping_id;
      END IF;
    END IF;

    UPDATE public.invoice_line_items
       SET vendor_id = v_invoice.vendor_id,
           vendor_item_id = v_vendor_item_id,
           internal_product_id = v_product_id,
           price_variance_flag = v_price_variance_flag,
           price_variance_percent = v_price_variance_percent
     WHERE id = v_item.id;

    v_updates_count := v_updates_count + 1;
  END LOOP;

  INSERT INTO public.invoice_event_log (invoice_id, event_type, new_value, actor_id)
  VALUES (
    p_invoice_id,
    'product_catalog_synced',
    jsonb_build_object('updates_count', v_updates_count),
    COALESCE(p_user_id, auth.uid())
  );

  INSERT INTO public.invoice_sync_log (invoice_id, operation, hash)
  VALUES (p_invoice_id, 'sync_invoice_products', v_line_hash);

  RETURN jsonb_build_object('status', 'success', 'updates_count', v_updates_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_dashboard_summary(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_purchase_report(uuid, uuid, uuid, date, date, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_verification_queue(uuid, uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_product_safe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_invoice_products(uuid, uuid) TO authenticated;

COMMIT;
