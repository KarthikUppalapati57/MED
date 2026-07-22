-- Resolve remaining plpgsql_check warnings after the runtime lint cleanup.

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS report_unit_quantity numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS report_unit_source_price numeric;

UPDATE public.products
   SET report_unit_quantity = COALESCE(NULLIF(report_unit_quantity, 0), 1),
       report_unit_source_price = COALESCE(report_unit_source_price, latest_price, 0)
 WHERE report_unit_quantity IS NULL
    OR report_unit_quantity = 0
    OR report_unit_source_price IS NULL;
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
CREATE OR REPLACE FUNCTION public.product_unit_is_generic(p_unit text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(trim(COALESCE(p_unit, '')), '') IS NULL
    OR lower(trim(p_unit)) IN ('ea', 'each', 'other', 'unit', 'units');
$$;

CREATE OR REPLACE FUNCTION public.format_product_unit_quantity(p_quantity numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(regexp_replace(COALESCE(p_quantity, 0)::text, '0+$', ''), '\.$', '');
$$;

CREATE OR REPLACE FUNCTION public.normalize_product_unit_label(p_unit text, p_quantity numeric DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_unit text := upper(regexp_replace(trim(COALESCE(p_unit, '')), '[^A-Z]', '', 'g'));
  v_plural boolean := COALESCE(p_quantity, 2) <> 1;
BEGIN
  IF v_unit = '' THEN
    RETURN NULL;
  END IF;

  RETURN CASE
    WHEN v_unit IN ('EA', 'EACH', 'EACHES', 'CT', 'COUNT', 'CN') THEN 'Each'
    WHEN v_unit IN ('CS', 'CASE', 'CASES') THEN 'Case'
    WHEN v_unit IN ('LB', 'LBS', 'POUND', 'POUNDS') THEN CASE WHEN v_plural THEN 'Pounds' ELSE 'Pound' END
    WHEN v_unit IN ('OZ', 'OZS', 'OUNCE', 'OUNCES') THEN CASE WHEN v_plural THEN 'Ounces' ELSE 'Ounce' END
    WHEN v_unit IN ('GA', 'GAL', 'GALS', 'GALLON', 'GALLONS') THEN CASE WHEN v_plural THEN 'Gallons' ELSE 'Gallon' END
    WHEN v_unit IN ('L', 'LT', 'LTR', 'LTRS', 'LITER', 'LITERS', 'LITRE', 'LITRES') THEN CASE WHEN v_plural THEN 'Liters' ELSE 'Liter' END
    WHEN v_unit IN ('ML', 'MLS', 'MILLILITER', 'MILLILITERS') THEN CASE WHEN v_plural THEN 'Milliliters' ELSE 'Milliliter' END
    WHEN v_unit IN ('G', 'GM', 'GRAM', 'GRAMS') THEN CASE WHEN v_plural THEN 'Grams' ELSE 'Gram' END
    WHEN v_unit IN ('KG', 'KGS', 'KILOGRAM', 'KILOGRAMS') THEN CASE WHEN v_plural THEN 'Kilograms' ELSE 'Kilogram' END
    WHEN v_unit IN ('BTL', 'BTLS', 'BOTTLE', 'BOTTLES') THEN CASE WHEN v_plural THEN 'Bottles' ELSE 'Bottle' END
    WHEN v_unit IN ('CAN', 'CANS') THEN CASE WHEN v_plural THEN 'Cans' ELSE 'Can' END
    WHEN v_unit IN ('BAG', 'BAGS') THEN CASE WHEN v_plural THEN 'Bags' ELSE 'Bag' END
    WHEN v_unit IN ('BOX', 'BOXES', 'BX') THEN CASE WHEN v_plural THEN 'Boxes' ELSE 'Box' END
    WHEN v_unit IN ('PK', 'PKG', 'PACK', 'PACKAGE') THEN CASE WHEN v_plural THEN 'Packs' ELSE 'Pack' END
    WHEN v_unit IN ('DOZ', 'DOZEN') THEN 'Dozen'
    WHEN v_unit IN ('FLAT', 'FLATS') THEN CASE WHEN v_plural THEN 'Flats' ELSE 'Flat' END
    WHEN v_unit IN ('CUP', 'CUPS') THEN CASE WHEN v_plural THEN 'Cups' ELSE 'Cup' END
    WHEN v_unit IN ('QT', 'QTS', 'QUART', 'QUARTS') THEN CASE WHEN v_plural THEN 'Quarts' ELSE 'Quart' END
    ELSE initcap(lower(v_unit))
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.derive_product_report_unit(p_vendor_unit text DEFAULT NULL, p_pack_size text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_pack text := upper(regexp_replace(trim(COALESCE(p_pack_size, '')), '[^A-Z0-9./ ]', ' ', 'g'));
  v_vendor text := trim(COALESCE(p_vendor_unit, ''));
  v_vendor_label text := public.normalize_product_unit_label(v_vendor);
BEGIN
  IF v_pack = '' AND v_vendor ~ '[0-9]' THEN
    v_pack := upper(regexp_replace(v_vendor, '[^A-Z0-9./ ]', ' ', 'g'));
  END IF;

  IF v_pack <> '' THEN
    RETURN COALESCE(public.normalize_product_unit_label(v_pack), v_pack);
  END IF;

  RETURN COALESCE(v_vendor_label, NULLIF(v_vendor, ''), 'Each');
END;
$$;
CREATE OR REPLACE FUNCTION public.assert_can_approve_vendor_scope(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text;
  v_auth_org uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_role := public.get_auth_role();
  v_auth_org := public.get_auth_org();

  IF v_role = 'platform_admin' THEN
    RETURN;
  END IF;

  IF v_role = 'tenant_super_admin' THEN
    IF public.get_auth_tenant() = (SELECT tenant_id FROM public.organizations WHERE id = p_organization_id) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Cross-tenant vendor approval denied';
  END IF;

  IF p_organization_id IS NULL OR v_auth_org IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'Cross-organization vendor approval denied';
  END IF;

  IF v_role = 'org_manager' THEN
    RETURN;
  END IF;

  IF v_role = 'branch_manager'
     AND p_brand_id IS NOT NULL
     AND public.reference_scope_writable(
       p_organization_id,
       p_brand_id,
       p_location_id,
       NULL,
       'branch_manager'
     ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'Vendor approval denied for role % outside accessible brand scope', v_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_onboarding_hierarchy(p_user_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_hierarchy JSONB;
  v_result JSONB;
BEGIN
  IF public.get_auth_role() <> 'platform_admin' THEN
    RAISE EXCEPTION 'Platform admin access required';
  END IF;

  SELECT hierarchy_payload INTO v_hierarchy
  FROM public.onboarding_hierarchy_submissions
  WHERE user_id = p_user_id AND status = 'pending_review';

  IF v_hierarchy IS NULL THEN
    RAISE EXCEPTION 'No pending hierarchy submission for this tenant';
  END IF;

  v_result := public.setup_onboarding_hierarchy(p_user_id, v_hierarchy);

  UPDATE public.onboarding_hierarchy_submissions
  SET status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = NULLIF(btrim(COALESCE(p_note, '')), ''),
      updated_at = now()
  WHERE user_id = p_user_id AND status = 'pending_review';

  UPDATE public.profiles SET hierarchy_review_status = 'approved' WHERE id = p_user_id;

  INSERT INTO public.notifications(user_id, organization_id, type, title, message, is_read)
  SELECT p_user_id, (v_result->>'primary_org_id')::uuid, 'system', 'Workspace approved',
         'Your organization workspace has been approved and created.', false;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ingest_email_invoice(
  p_recipient_email text,
  p_fallback_organization_id uuid DEFAULT NULL,
  p_invoice jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient_email text;
  v_location_email public.location_email_addresses%ROWTYPE;
  v_vendor_name text;
  v_invoice_number text;
  v_total_amount numeric := 0;
  v_invoice_id uuid;
  v_system_user_id uuid := '99999999-9999-9999-9999-999999999999'::uuid;
  v_metadata jsonb;
BEGIN
  v_recipient_email := lower(btrim(COALESCE(p_recipient_email, '')));

  IF v_recipient_email = '' THEN
    v_recipient_email := NULL;
  END IF;

  v_vendor_name := COALESCE(NULLIF(btrim(p_invoice->>'vendor_name'), ''), 'Unknown Vendor (Auto-Ingested)');
  v_invoice_number := COALESCE(
    NULLIF(btrim(p_invoice->>'invoice_number'), ''),
    'EMAIL-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || substr(gen_random_uuid()::text, 1, 8)
  );

  BEGIN
    v_total_amount := COALESCE(NULLIF(btrim(p_invoice->>'total_amount'), '')::numeric, 0);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    v_total_amount := 0;
  END;

  SELECT lea.*
    INTO v_location_email
  FROM public.location_email_addresses lea
  WHERE lower(lea.email) = v_recipient_email
    AND lea.is_active = true
    AND lea.deleted_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    v_metadata := COALESCE(p_invoice->'ap_metadata', '{}'::jsonb)
      || jsonb_build_object(
        'ingest_recipient', v_recipient_email,
        'received_at', now(),
        'matched_location_email_id', v_location_email.id,
        'source', 'email_import'
      );

    INSERT INTO public.invoices (
      vendor_name,
      invoice_number,
      total_amount,
      status,
      ap_status,
      source,
      file_url,
      organization_id,
      brand_id,
      location_id,
      created_by,
      ap_metadata
    ) VALUES (
      v_vendor_name,
      v_invoice_number,
      v_total_amount,
      'extracting',
      'processing',
      'email_import',
      NULLIF(p_invoice->>'file_url', ''),
      v_location_email.organization_id,
      v_location_email.brand_id,
      v_location_email.location_id,
      v_system_user_id,
      v_metadata
    )
    RETURNING id INTO v_invoice_id;

    RETURN jsonb_build_object(
      'invoice_id', v_invoice_id,
      'matched', true,
      'organization_id', v_location_email.organization_id,
      'brand_id', v_location_email.brand_id,
      'location_id', v_location_email.location_id,
      'recipient_email', v_recipient_email
    );
  END IF;

  RETURN jsonb_build_object(
    'invoice_id', NULL,
    'matched', false,
    'organization_id', p_fallback_organization_id,
    'recipient_email', v_recipient_email,
    'warning', 'no_location_email_match'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_email_invoice(text, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ingest_email_invoice(text, uuid, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_email_invoice(text, uuid, jsonb) TO service_role;

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
  v_previous_price NUMERIC;
  v_threshold NUMERIC := 10;
  v_price_variance_flag BOOLEAN;
  v_price_variance_percent NUMERIC;
  v_line_hash TEXT;
  v_existing_hash TEXT;
  v_updates_count INT := 0;
  v_report_unit TEXT;
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
    v_price_variance_flag := false;
    v_price_variance_percent := 0;
    v_report_unit := public.derive_product_report_unit(v_item.vendor_unit, NULL);

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
          report_unit_quantity,
          report_unit_source_price,
          is_inventoried
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
          COALESCE(v_report_unit, 'Each'),
          COALESCE(v_report_unit, 'Each'),
          COALESCE(v_item.unit_price, 0),
          1,
          COALESCE(v_item.unit_price, 0),
          false
        )
        ON CONFLICT ON CONSTRAINT products_org_name_key
        DO UPDATE SET
          deleted_at = NULL,
          report_by_unit = CASE
            WHEN public.product_unit_is_generic(products.report_by_unit) THEN COALESCE(EXCLUDED.report_by_unit, products.report_by_unit)
            ELSE products.report_by_unit
          END,
          base_unit = CASE
            WHEN public.product_unit_is_generic(products.base_unit) THEN COALESCE(EXCLUDED.base_unit, products.base_unit)
            ELSE products.base_unit
          END,
          report_unit_source_price = CASE
            WHEN COALESCE(EXCLUDED.report_unit_source_price, 0) > 0 THEN EXCLUDED.report_unit_source_price
            ELSE products.report_unit_source_price
          END,
          latest_price = CASE
            WHEN COALESCE(EXCLUDED.latest_price, 0) > 0 THEN EXCLUDED.latest_price
            ELSE products.latest_price
          END,
          updated_at = now()
        RETURNING id INTO v_product_id;
      ELSE
        UPDATE public.products
           SET product_id = COALESCE(NULLIF(product_id, ''), public.generate_restops_product_id()),
               report_by_unit = CASE
                 WHEN public.product_unit_is_generic(report_by_unit) THEN COALESCE(v_report_unit, report_by_unit)
                 ELSE report_by_unit
               END,
               base_unit = CASE
                 WHEN public.product_unit_is_generic(base_unit) THEN COALESCE(v_report_unit, base_unit)
                 ELSE base_unit
               END,
               report_unit_source_price = CASE
                 WHEN COALESCE(v_item.unit_price, 0) > 0 THEN v_item.unit_price
                 ELSE report_unit_source_price
               END,
               latest_price = CASE
                 WHEN COALESCE(v_item.unit_price, 0) > 0 THEN v_item.unit_price / GREATEST(COALESCE(report_unit_quantity, 1), 0.0001)
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
    ELSE
      UPDATE public.products
         SET report_by_unit = CASE
               WHEN public.product_unit_is_generic(report_by_unit) THEN COALESCE(v_report_unit, report_by_unit)
               ELSE report_by_unit
             END,
             base_unit = CASE
               WHEN public.product_unit_is_generic(base_unit) THEN COALESCE(v_report_unit, base_unit)
               ELSE base_unit
             END,
             report_unit_source_price = CASE
               WHEN COALESCE(v_item.unit_price, 0) > 0 THEN v_item.unit_price
               ELSE report_unit_source_price
             END,
             latest_price = CASE
               WHEN COALESCE(v_item.unit_price, 0) > 0 THEN v_item.unit_price / GREATEST(COALESCE(report_unit_quantity, 1), 0.0001)
               ELSE latest_price
             END,
             updated_at = now()
       WHERE id = v_product_id
         AND deleted_at IS NULL;
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
        DO UPDATE SET updated_at = now();
      END IF;
    END IF;

    UPDATE public.invoice_line_items
       SET vendor_id = v_invoice.vendor_id,
           vendor_item_id = v_vendor_item_id,
           internal_product_id = v_product_id,
           price_variance_flag = v_price_variance_flag,
           price_variance_percent = v_price_variance_percent
     WHERE id = v_item.id;

    UPDATE public.inventory inv
       SET unit_cost = CASE
             WHEN COALESCE(v_item.unit_price, 0) > 0 THEN v_item.unit_price / GREATEST((SELECT COALESCE(report_unit_quantity, 1) FROM public.products WHERE id = v_product_id), 0.0001)
             ELSE inv.unit_cost
           END,
           current_unit = CASE
             WHEN public.product_unit_is_generic(inv.current_unit) THEN COALESCE(v_report_unit, inv.current_unit)
             ELSE inv.current_unit
           END,
           report_by = CASE
             WHEN public.product_unit_is_generic(inv.report_by) THEN COALESCE(v_report_unit, inv.report_by)
             ELSE inv.report_by
           END,
           updated_at = now()
     WHERE v_product_id IS NOT NULL
       AND inv.organization_id = v_invoice.organization_id
       AND inv.deleted_at IS NULL
       AND (
         inv.internal_product_id = v_product_id
         OR inv.product_id = (SELECT product_id FROM public.products WHERE id = v_product_id)
       );

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

GRANT EXECUTE ON FUNCTION public.sync_invoice_products(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
