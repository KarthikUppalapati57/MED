-- 20260724000003: Product module production hardening.
--
-- This migration is intentionally placed at the tip instead of rewriting history. It
-- closes the product-module checklist gaps with forward-only, idempotent changes:
-- constraints for new writes, RPC overload cleanup, explicit grants, audit trail,
-- restore/import/barcode/merge helpers, verified vendor mappings, price history,
-- product/inventory cost sync, and recipe recalculation for normalized ingredients.

BEGIN;

-- ===== Core table hardening =====

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS restored_at timestamptz,
  ADD COLUMN IF NOT EXISTS restored_by uuid,
  ADD COLUMN IF NOT EXISTS merged_into_product_id uuid REFERENCES public.products(id),
  ADD COLUMN IF NOT EXISTS merge_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS average_price numeric,
  ADD COLUMN IF NOT EXISTS price_history jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.products
   SET status = 'active'
 WHERE status IS NULL
    OR status NOT IN ('active', 'discontinued', 'seasonal');

UPDATE public.products
   SET version_number = 1
 WHERE version_number IS NULL;

UPDATE public.products
   SET merge_metadata = '{}'::jsonb
 WHERE merge_metadata IS NULL;

UPDATE public.products
   SET price_history = '[]'::jsonb
 WHERE price_history IS NULL;

ALTER TABLE public.products
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN version_number SET DEFAULT 1,
  ALTER COLUMN version_number SET NOT NULL,
  ALTER COLUMN merge_metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN merge_metadata SET NOT NULL,
  ALTER COLUMN price_history SET DEFAULT '[]'::jsonb,
  ALTER COLUMN price_history SET NOT NULL;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_status_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_status_check
  CHECK (status IN ('active', 'discontinued', 'seasonal')) NOT VALID;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_accounting_category_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_accounting_category_check
  CHECK (
    accounting_category IS NULL
    OR accounting_category = ANY (ARRAY[
      'food','beverage','supplies','equipment','packaging','cleaning','other',
      'food_cogs','beverage_cogs','merchandise_cogs',
      '5100','5110','5120','5130','5140','5150','5160','5170',
      '5200','5210','5220','5230','5240','5300'
    ]::text[])
  ) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_products_active_product_id
  ON public.products (product_id)
  WHERE deleted_at IS NULL AND NULLIF(btrim(product_id), '') IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.products
    WHERE deleted_at IS NULL
      AND NULLIF(btrim(product_id), '') IS NOT NULL
    GROUP BY lower(btrim(product_id))
    HAVING count(*) > 1
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS products_product_id_active_key
      ON public.products (lower(btrim(product_id)))
      WHERE deleted_at IS NULL AND NULLIF(btrim(product_id), '''') IS NOT NULL';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_products_product_id_unique()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NULL AND NULLIF(btrim(COALESCE(NEW.product_id, '')), '') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id IS DISTINCT FROM NEW.id
        AND p.deleted_at IS NULL
        AND lower(btrim(p.product_id)) = lower(btrim(NEW.product_id))
    ) THEN
      RAISE EXCEPTION 'Product ID "%" is already in use. Choose a different one.', NEW.product_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_products_product_id_unique ON public.products;
CREATE TRIGGER enforce_products_product_id_unique
  BEFORE INSERT OR UPDATE OF product_id, deleted_at ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_products_product_id_unique();

-- ===== Product-specific audit and price history =====

CREATE OR REPLACE FUNCTION public.audit_product_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
BEGIN
  v_action := CASE TG_OP
    WHEN 'INSERT' THEN 'product_created'
    WHEN 'UPDATE' THEN 'product_updated'
    ELSE 'product_deleted'
  END;

  INSERT INTO public.audit_logs (
    organization_id, brand_id, location_id, user_id, action, table_name,
    record_id, old_data, new_data, created_at
  ) VALUES (
    COALESCE(NEW.organization_id, OLD.organization_id),
    COALESCE(NEW.brand_id, OLD.brand_id),
    COALESCE(NEW.location_id, OLD.location_id),
    auth.uid(),
    v_action,
    'products',
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_product_change ON public.products;
CREATE TRIGGER audit_product_change
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_product_change();

CREATE OR REPLACE FUNCTION public.capture_product_price_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_history jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.average_price := COALESCE(NEW.average_price, NEW.latest_price);
    NEW.price_history := COALESCE(NEW.price_history, '[]'::jsonb);
    RETURN NEW;
  END IF;

  IF NEW.latest_price IS DISTINCT FROM OLD.latest_price THEN
    v_history := COALESCE(OLD.price_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'price', OLD.latest_price,
      'changed_at', now(),
      'changed_by', auth.uid(),
      'source', 'product_update'
    ));

    NEW.price_history := v_history;
    SELECT avg((entry->>'price')::numeric)
      INTO NEW.average_price
    FROM jsonb_array_elements(v_history || jsonb_build_array(jsonb_build_object('price', NEW.latest_price))) entry
    WHERE NULLIF(entry->>'price', '') IS NOT NULL;
  END IF;

  NEW.version_number := COALESCE(OLD.version_number, 1) + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capture_product_price_history ON public.products;
CREATE TRIGGER capture_product_price_history
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_product_price_history();

-- ===== Rich taxonomy restored =====

DROP FUNCTION IF EXISTS public.derive_product_category_type(text, text, text);
CREATE OR REPLACE FUNCTION public.derive_product_category_type(
  p_accounting_category text,
  p_category text,
  p_name text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  WITH src AS (
    SELECT
      lower(COALESCE(p_accounting_category, '')) AS accounting,
      lower(COALESCE(p_category, '')) AS category,
      lower(COALESCE(p_name, '')) AS name
  )
  SELECT CASE
    WHEN accounting = '5230' OR category ~ '(beer|ale|lager|ipa|stout|porter|pilsner|cider|seltzer)' OR name ~ '(beer|ale|lager|ipa|stout|porter|pilsner|cider|seltzer)' THEN 'Beer'
    WHEN accounting = '5240' OR category ~ '(wine|pinot|chardonnay|cabernet|merlot|sauvignon|riesling|prosecco|champagne|moscato|malbec|zinfandel)' OR name ~ '(wine|pinot|chardonnay|cabernet|merlot|sauvignon|riesling|prosecco|champagne|moscato|malbec|zinfandel)' THEN 'Wine'
    WHEN accounting = '5220' OR category ~ '(liquor|spirit|vodka|gin|rum|tequila|whiskey|whisky|bourbon|scotch|brandy|cognac|mezcal|liqueur)' OR name ~ '(liquor|spirit|vodka|gin|rum|tequila|whiskey|whisky|bourbon|scotch|brandy|cognac|mezcal|liqueur)' THEN 'Liquor'
    WHEN accounting IN ('5200','5210') OR category ~ '(n-a bev|n/a bev|na bev|non[- ]?alcohol|beverage|soda|juice|tea|coffee|lemonade|water|fountain|syrup)' OR name ~ '(n-a bev|n/a bev|na bev|non[- ]?alcohol|beverage|soda|juice|tea|coffee|lemonade|water|fountain|syrup)' THEN 'N-A Bev'
    WHEN accounting = '5300' OR category ~ '(retail|merchandise|apparel|shirt|hat|gift ?card|merch)' OR name ~ '(retail|merchandise|apparel|shirt|hat|gift ?card|merch)' THEN 'Retail'
    WHEN accounting LIKE '51%' OR accounting IN ('food','food_cogs','5100') OR category ~ '(bakery|meat|poultry|seafood|dairy|produce|frozen|grocery|food)' THEN 'Food'
    ELSE 'Other'
  END
  FROM src;
$$;

DROP FUNCTION IF EXISTS public.product_accounting_category_for_type(text, text);
CREATE OR REPLACE FUNCTION public.product_accounting_category_for_type(p_category_type text, p_category text DEFAULT NULL)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE COALESCE(NULLIF(btrim(p_category_type), ''), 'Other')
    WHEN 'Beer' THEN '5230'
    WHEN 'Wine' THEN '5240'
    WHEN 'Liquor' THEN '5220'
    WHEN 'N-A Bev' THEN '5210'
    WHEN 'Retail' THEN '5300'
    WHEN 'Food' THEN CASE
      WHEN lower(COALESCE(p_category, '')) LIKE '%poultry%' THEN '5120'
      WHEN lower(COALESCE(p_category, '')) LIKE '%seafood%' THEN '5130'
      WHEN lower(COALESCE(p_category, '')) LIKE '%dairy%' THEN '5140'
      WHEN lower(COALESCE(p_category, '')) LIKE '%produce%' THEN '5150'
      WHEN lower(COALESCE(p_category, '')) LIKE '%frozen%' THEN '5160'
      WHEN lower(COALESCE(p_category, '')) LIKE '%grocery%' THEN '5170'
      ELSE '5110'
    END
    ELSE '5110'
  END;
$$;

-- ===== Restore, merge, barcode, import, duplicate, and mapping RPCs =====

CREATE TABLE IF NOT EXISTS public.product_barcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id uuid,
  location_id uuid,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  barcode text NOT NULL,
  symbology text NOT NULL DEFAULT 'unknown',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  UNIQUE (organization_id, barcode)
);

ALTER TABLE public.product_barcodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_barcodes_select ON public.product_barcodes;
CREATE POLICY product_barcodes_select ON public.product_barcodes
  FOR SELECT USING (public.reference_scope_visible(organization_id, brand_id, location_id, deleted_at));
DROP POLICY IF EXISTS product_barcodes_write ON public.product_barcodes;
CREATE POLICY product_barcodes_write ON public.product_barcodes
  FOR ALL USING (public.product_write_allowed(organization_id, brand_id, location_id))
  WITH CHECK (public.product_write_allowed(organization_id, brand_id, location_id));

CREATE TABLE IF NOT EXISTS public.product_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id uuid,
  location_id uuid,
  file_name text,
  file_hash text,
  status text NOT NULL DEFAULT 'validated' CHECK (status IN ('validated','committed','failed')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (organization_id, file_hash)
);

CREATE TABLE IF NOT EXISTS public.product_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.product_import_jobs(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','invalid','committed','skipped')),
  errors text[] NOT NULL DEFAULT ARRAY[]::text[],
  product_id uuid REFERENCES public.products(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_import_rows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_import_jobs_select ON public.product_import_jobs;
CREATE POLICY product_import_jobs_select ON public.product_import_jobs
  FOR SELECT USING (public.reference_scope_visible(organization_id, brand_id, location_id, NULL));
DROP POLICY IF EXISTS product_import_jobs_write ON public.product_import_jobs;
CREATE POLICY product_import_jobs_write ON public.product_import_jobs
  FOR ALL USING (public.product_write_allowed(organization_id, brand_id, location_id))
  WITH CHECK (public.product_write_allowed(organization_id, brand_id, location_id));
DROP POLICY IF EXISTS product_import_rows_select ON public.product_import_rows;
CREATE POLICY product_import_rows_select ON public.product_import_rows
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.product_import_jobs j
    WHERE j.id = job_id
      AND public.reference_scope_visible(j.organization_id, j.brand_id, j.location_id, NULL)
  ));
DROP POLICY IF EXISTS product_import_rows_write ON public.product_import_rows;
CREATE POLICY product_import_rows_write ON public.product_import_rows
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.product_import_jobs j
    WHERE j.id = job_id
      AND public.product_write_allowed(j.organization_id, j.brand_id, j.location_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.product_import_jobs j
    WHERE j.id = job_id
      AND public.product_write_allowed(j.organization_id, j.brand_id, j.location_id)
  ));

CREATE OR REPLACE FUNCTION public.find_duplicate_products(
  p_organization_id uuid,
  p_name text,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (id uuid, product_id text, name text, similarity numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.product_id, p.name,
         CASE
           WHEN lower(p.name) = lower(COALESCE(p_name, '')) THEN 1::numeric
           WHEN lower(p.name) LIKE '%' || lower(COALESCE(p_name, '')) || '%'
             OR lower(COALESCE(p_name, '')) LIKE '%' || lower(p.name) || '%' THEN 0.85::numeric
           ELSE 0.5::numeric
         END AS similarity
  FROM public.products p
  WHERE p.organization_id = p_organization_id
    AND p.deleted_at IS NULL
    AND NULLIF(btrim(COALESCE(p_name, '')), '') IS NOT NULL
    AND (
      lower(p.name) = lower(p_name)
      OR lower(p.name) LIKE '%' || lower(p_name) || '%'
      OR lower(p_name) LIKE '%' || lower(p.name) || '%'
    )
    AND public.reference_scope_visible(p.organization_id, p.brand_id, p.location_id, p.deleted_at)
  ORDER BY similarity DESC, p.name
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
$$;

CREATE OR REPLACE FUNCTION public.restore_product(p_product_id uuid)
RETURNS public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
BEGIN
  SELECT * INTO v_product
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF v_product.id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF NOT public.product_write_allowed(v_product.organization_id, v_product.brand_id, v_product.location_id) THEN
    RAISE EXCEPTION 'Not authorized to restore this product';
  END IF;

  UPDATE public.products
     SET deleted_at = NULL,
         deleted_by = NULL,
         restored_at = now(),
         restored_by = auth.uid(),
         status = COALESCE(NULLIF(status, ''), 'active'),
         updated_at = now()
   WHERE id = p_product_id
   RETURNING * INTO v_product;

  UPDATE public.inventory
     SET deleted_at = NULL,
         deleted_by = NULL,
         updated_at = now()
   WHERE organization_id = v_product.organization_id
     AND (
       internal_product_id = v_product.id
       OR (NULLIF(product_id, '') IS NOT NULL AND product_id = v_product.product_id)
     );

  RETURN v_product;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_product_barcode(
  p_product_id uuid,
  p_barcode text,
  p_symbology text DEFAULT 'unknown'
)
RETURNS public.product_barcodes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_row public.product_barcodes%ROWTYPE;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id AND deleted_at IS NULL;
  IF v_product.id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  IF NOT public.product_write_allowed(v_product.organization_id, v_product.brand_id, v_product.location_id) THEN
    RAISE EXCEPTION 'Not authorized to edit product barcodes';
  END IF;
  IF NULLIF(btrim(COALESCE(p_barcode, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Barcode is required';
  END IF;

  INSERT INTO public.product_barcodes (
    organization_id, brand_id, location_id, product_id, barcode, symbology, created_by, deleted_at, deleted_by
  ) VALUES (
    v_product.organization_id, v_product.brand_id, v_product.location_id, v_product.id,
    btrim(p_barcode), COALESCE(NULLIF(btrim(p_symbology), ''), 'unknown'), auth.uid(), NULL, NULL
  )
  ON CONFLICT (organization_id, barcode)
  DO UPDATE SET
    product_id = EXCLUDED.product_id,
    brand_id = EXCLUDED.brand_id,
    location_id = EXCLUDED.location_id,
    symbology = EXCLUDED.symbology,
    deleted_at = NULL,
    deleted_by = NULL
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_product_barcode(p_barcode_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.product_barcodes%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.product_barcodes WHERE id = p_barcode_id AND deleted_at IS NULL;
  IF v_row.id IS NULL THEN
    RETURN true;
  END IF;
  IF NOT public.product_write_allowed(v_row.organization_id, v_row.brand_id, v_row.location_id) THEN
    RAISE EXCEPTION 'Not authorized to remove product barcodes';
  END IF;
  UPDATE public.product_barcodes
     SET deleted_at = now(), deleted_by = auth.uid()
   WHERE id = p_barcode_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_vendor_item_mapping(
  p_mapping_id uuid,
  p_conversion_multiplier numeric DEFAULT NULL
)
RETURNS public.vendor_item_mappings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mapping public.vendor_item_mappings%ROWTYPE;
BEGIN
  SELECT * INTO v_mapping
  FROM public.vendor_item_mappings
  WHERE id = p_mapping_id
  FOR UPDATE;

  IF v_mapping.id IS NULL THEN
    RAISE EXCEPTION 'Vendor item mapping not found';
  END IF;
  IF NOT public.product_write_allowed(v_mapping.organization_id, NULL, NULL) THEN
    RAISE EXCEPTION 'Not authorized to verify this mapping';
  END IF;

  UPDATE public.vendor_item_mappings
     SET is_verified = true,
         conversion_multiplier = GREATEST(COALESCE(p_conversion_multiplier, conversion_multiplier, 1), 0.0001),
         updated_at = now()
   WHERE id = p_mapping_id
   RETURNING * INTO v_mapping;

  RETURN v_mapping;
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_products(
  p_source_product_id uuid,
  p_target_product_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source public.products%ROWTYPE;
  v_target public.products%ROWTYPE;
BEGIN
  IF p_source_product_id IS NULL OR p_target_product_id IS NULL OR p_source_product_id = p_target_product_id THEN
    RAISE EXCEPTION 'Source and target products must be different';
  END IF;

  SELECT * INTO v_source FROM public.products WHERE id = p_source_product_id FOR UPDATE;
  SELECT * INTO v_target FROM public.products WHERE id = p_target_product_id FOR UPDATE;

  IF v_source.id IS NULL OR v_target.id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  IF v_source.organization_id IS DISTINCT FROM v_target.organization_id THEN
    RAISE EXCEPTION 'Products must belong to the same organization';
  END IF;
  IF NOT public.product_write_allowed(v_target.organization_id, v_target.brand_id, v_target.location_id) THEN
    RAISE EXCEPTION 'Not authorized to merge products';
  END IF;

  UPDATE public.inventory
     SET internal_product_id = v_target.id,
         product_id = COALESCE(NULLIF(v_target.product_id, ''), product_id),
         product_name = v_target.name,
         updated_at = now()
   WHERE organization_id = v_source.organization_id
     AND (internal_product_id = v_source.id OR product_id = v_source.product_id);

  UPDATE public.invoice_line_items
     SET internal_product_id = v_target.id
   WHERE organization_id = v_source.organization_id
     AND internal_product_id = v_source.id;

  UPDATE public.vendor_item_mappings
     SET internal_product_id = v_target.id,
         updated_at = now()
   WHERE organization_id = v_source.organization_id
     AND internal_product_id = v_source.id
     AND NOT EXISTS (
       SELECT 1
       FROM public.vendor_item_mappings existing
       WHERE existing.vendor_item_id = vendor_item_mappings.vendor_item_id
         AND existing.internal_product_id = v_target.id
     );

  DELETE FROM public.vendor_item_mappings
   WHERE organization_id = v_source.organization_id
     AND internal_product_id = v_source.id;

  UPDATE public.recipe_ingredients
     SET product_id = v_target.id,
         updated_at = now()
   WHERE organization_id = v_source.organization_id
     AND product_id = v_source.id;

  UPDATE public.products
     SET deleted_at = now(),
         deleted_by = auth.uid(),
         merged_into_product_id = v_target.id,
         merge_metadata = jsonb_build_object('reason', p_reason, 'merged_at', now(), 'merged_by', auth.uid()),
         updated_at = now()
   WHERE id = v_source.id;

  RETURN jsonb_build_object('success', true, 'source_product_id', v_source.id, 'target_product_id', v_target.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.stage_product_import(
  p_organization_id uuid,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_file_name text DEFAULT NULL,
  p_file_hash text DEFAULT NULL,
  p_rows jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.product_import_jobs%ROWTYPE;
  v_row jsonb;
  v_row_number integer := 0;
  v_errors text[];
  v_status text;
  v_valid_count integer := 0;
  v_invalid_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;
  IF NOT public.product_write_allowed(p_organization_id, p_brand_id, p_location_id) THEN
    RAISE EXCEPTION 'Not authorized to import products for this scope';
  END IF;
  IF jsonb_typeof(COALESCE(p_rows, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Rows must be a JSON array';
  END IF;

  INSERT INTO public.product_import_jobs (
    organization_id, brand_id, location_id, file_name, file_hash, created_by, summary
  ) VALUES (
    p_organization_id, p_brand_id, p_location_id, p_file_name, p_file_hash, auth.uid(), '{}'::jsonb
  )
  ON CONFLICT (organization_id, file_hash)
  DO UPDATE SET
    file_name = EXCLUDED.file_name,
    brand_id = EXCLUDED.brand_id,
    location_id = EXCLUDED.location_id,
    status = 'validated',
    created_by = auth.uid(),
    created_at = now(),
    committed_at = NULL,
    summary = '{}'::jsonb
  RETURNING * INTO v_job;

  DELETE FROM public.product_import_rows WHERE job_id = v_job.id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_row_number := v_row_number + 1;
    v_errors := ARRAY[]::text[];

    IF NULLIF(btrim(COALESCE(v_row->>'name', v_row->>'Product Name', v_row->>'product_name', '')), '') IS NULL THEN
      v_errors := array_append(v_errors, 'Product name is required');
    END IF;
    IF NULLIF(btrim(COALESCE(v_row->>'product_id', v_row->>'Product ID', v_row->>'sku', '')), '') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.organization_id = p_organization_id
          AND p.deleted_at IS NULL
          AND lower(btrim(p.product_id)) = lower(btrim(COALESCE(v_row->>'product_id', v_row->>'Product ID', v_row->>'sku')))
      ) THEN
      v_errors := array_append(v_errors, 'Product ID already exists');
    END IF;
    IF NULLIF(btrim(COALESCE(v_row->>'latest_price', v_row->>'Latest Price', '')), '') IS NOT NULL
      AND btrim(COALESCE(v_row->>'latest_price', v_row->>'Latest Price')) !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$' THEN
      v_errors := array_append(v_errors, 'Latest price must be a non-negative number');
    END IF;
    IF NULLIF(btrim(COALESCE(v_row->>'is_inventoried', v_row->>'On Inventory', '')), '') IS NOT NULL
      AND lower(btrim(COALESCE(v_row->>'is_inventoried', v_row->>'On Inventory'))) <> ALL (ARRAY['true','false','yes','no','1','0']) THEN
      v_errors := array_append(v_errors, 'On Inventory must be true/false, yes/no, or 1/0');
    END IF;
    IF NULLIF(btrim(COALESCE(v_row->>'is_tax_exempt', v_row->>'Tax Exempt', '')), '') IS NOT NULL
      AND lower(btrim(COALESCE(v_row->>'is_tax_exempt', v_row->>'Tax Exempt'))) <> ALL (ARRAY['true','false','yes','no','1','0']) THEN
      v_errors := array_append(v_errors, 'Tax Exempt must be true/false, yes/no, or 1/0');
    END IF;
    IF NULLIF(btrim(COALESCE(v_row->>'accounting_category', v_row->>'Accounting Category', '')), '') IS NOT NULL
      AND btrim(COALESCE(v_row->>'accounting_category', v_row->>'Accounting Category')) <> ALL (ARRAY[
        'food','beverage','supplies','equipment','packaging','cleaning','other',
        'food_cogs','beverage_cogs','merchandise_cogs',
        '5100','5110','5120','5130','5140','5150','5160','5170',
        '5200','5210','5220','5230','5240','5300'
      ]::text[]) THEN
      v_errors := array_append(v_errors, 'Accounting category is not allowed');
    END IF;

    v_status := CASE WHEN array_length(v_errors, 1) IS NULL THEN 'valid' ELSE 'invalid' END;
    IF v_status = 'valid' THEN
      v_valid_count := v_valid_count + 1;
    ELSE
      v_invalid_count := v_invalid_count + 1;
    END IF;

    INSERT INTO public.product_import_rows (job_id, row_number, payload, status, errors)
    VALUES (v_job.id, v_row_number, v_row, v_status, v_errors);
  END LOOP;

  UPDATE public.product_import_jobs
     SET summary = jsonb_build_object(
       'total_rows', v_row_number,
       'valid_rows', v_valid_count,
       'invalid_rows', v_invalid_count
     )
   WHERE id = v_job.id
   RETURNING * INTO v_job;

  RETURN jsonb_build_object(
    'job_id', v_job.id,
    'summary', v_job.summary,
    'rows', (
      SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.row_number), '[]'::jsonb)
      FROM public.product_import_rows r
      WHERE r.job_id = v_job.id
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_product_import(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.product_import_jobs%ROWTYPE;
  v_import_row public.product_import_rows%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_committed integer := 0;
  v_skipped integer := 0;
BEGIN
  SELECT * INTO v_job FROM public.product_import_jobs WHERE id = p_job_id FOR UPDATE;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'Product import job not found';
  END IF;
  IF NOT public.product_write_allowed(v_job.organization_id, v_job.brand_id, v_job.location_id) THEN
    RAISE EXCEPTION 'Not authorized to commit this product import';
  END IF;

  FOR v_import_row IN
    SELECT * FROM public.product_import_rows
    WHERE job_id = v_job.id
    ORDER BY row_number
  LOOP
    IF v_import_row.status <> 'valid' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.products (
      organization_id, brand_id, location_id, product_id, name, description,
      category, accounting_category, report_by_unit, base_unit, latest_price,
      is_inventoried, is_tax_exempt, location_specific, created_by, updated_at
    ) VALUES (
      v_job.organization_id,
      v_job.brand_id,
      v_job.location_id,
      NULLIF(btrim(COALESCE(v_import_row.payload->>'product_id', v_import_row.payload->>'Product ID', v_import_row.payload->>'sku', '')), ''),
      upper(btrim(COALESCE(v_import_row.payload->>'name', v_import_row.payload->>'Product Name', v_import_row.payload->>'product_name'))),
      NULLIF(btrim(COALESCE(v_import_row.payload->>'description', v_import_row.payload->>'Description', '')), ''),
      COALESCE(NULLIF(btrim(COALESCE(v_import_row.payload->>'category', v_import_row.payload->>'Category', '')), ''), 'Uncategorized'),
      COALESCE(NULLIF(btrim(COALESCE(v_import_row.payload->>'accounting_category', v_import_row.payload->>'Accounting Category', '')), ''), '5110'),
      COALESCE(NULLIF(btrim(COALESCE(v_import_row.payload->>'report_by_unit', v_import_row.payload->>'Report By Unit', '')), ''), 'Each'),
      COALESCE(NULLIF(btrim(COALESCE(v_import_row.payload->>'base_unit', v_import_row.payload->>'Base Unit', '')), ''), 'Each'),
      COALESCE(NULLIF(btrim(COALESCE(v_import_row.payload->>'latest_price', v_import_row.payload->>'Latest Price', '')), '')::numeric, 0),
      CASE lower(btrim(COALESCE(v_import_row.payload->>'is_inventoried', v_import_row.payload->>'On Inventory', '')))
        WHEN 'true' THEN true
        WHEN 'yes' THEN true
        WHEN '1' THEN true
        ELSE false
      END,
      CASE lower(btrim(COALESCE(v_import_row.payload->>'is_tax_exempt', v_import_row.payload->>'Tax Exempt', '')))
        WHEN 'true' THEN true
        WHEN 'yes' THEN true
        WHEN '1' THEN true
        ELSE false
      END,
      v_job.location_id IS NOT NULL,
      auth.uid(),
      now()
    )
    RETURNING * INTO v_product;

    UPDATE public.product_import_rows
       SET status = 'committed', product_id = v_product.id
     WHERE id = v_import_row.id;

    IF v_product.is_inventoried THEN
      PERFORM public.set_product_inventory_tracking(v_product.id, true);
    END IF;

    v_committed := v_committed + 1;
  END LOOP;

  UPDATE public.product_import_jobs
     SET status = 'committed',
         committed_at = now(),
         summary = COALESCE(summary, '{}'::jsonb) || jsonb_build_object('committed_rows', v_committed, 'skipped_rows', v_skipped)
   WHERE id = v_job.id;

  RETURN jsonb_build_object('success', true, 'job_id', v_job.id, 'committed_rows', v_committed, 'skipped_rows', v_skipped);
END;
$$;

-- ===== Product write RPCs with one callable update signature =====

DROP FUNCTION IF EXISTS public.update_product_details(uuid, text, text, text, text, text, boolean, boolean, text, text, numeric, boolean);
DROP FUNCTION IF EXISTS public.update_product_details(uuid, text, text, text, text, text, boolean, boolean, text, text, numeric, boolean, numeric, numeric);

DROP FUNCTION IF EXISTS public.create_product_details(text, text, text, text, text, boolean, boolean, text, text, numeric, boolean, uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION public.create_product_details(
  p_name text,
  p_restops_product_id text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_accounting_category text DEFAULT NULL,
  p_is_inventoried boolean DEFAULT true,
  p_is_tax_exempt boolean DEFAULT false,
  p_report_by_unit text DEFAULT NULL,
  p_base_unit text DEFAULT NULL,
  p_latest_price numeric DEFAULT NULL,
  p_location_specific boolean DEFAULT false,
  p_organization_id uuid DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL
)
RETURNS public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := COALESCE(p_organization_id, public.get_auth_org());
  v_brand_id uuid := p_brand_id;
  v_location_id uuid := p_location_id;
  v_product_id text := NULLIF(btrim(COALESCE(p_restops_product_id, '')), '');
  v_created public.products%ROWTYPE;
  v_needs_approval boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NULLIF(btrim(COALESCE(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Product name is required';
  END IF;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context is required';
  END IF;

  IF v_brand_id IS NULL OR v_location_id IS NULL THEN
    SELECT COALESCE(v_brand_id, p.brand_id), COALESCE(v_location_id, p.location_id)
      INTO v_brand_id, v_location_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.organization_id = v_org_id
      AND p.deleted_at IS NULL;
  END IF;

  IF NOT public.product_write_allowed(v_org_id, v_brand_id, v_location_id) THEN
    RAISE EXCEPTION 'Not authorized to create products for this scope';
  END IF;

  IF v_product_id IS NULL THEN
    v_product_id := public.generate_restops_product_id();
  END IF;

  v_needs_approval := public.get_auth_role() = 'location_manager'
    AND public.get_product_approval_setting(v_org_id);

  INSERT INTO public.products (
    organization_id, brand_id, location_id, product_id, name, description,
    category, accounting_category, is_inventoried, is_tax_exempt,
    report_by_unit, base_unit, latest_price, location_specific,
    pending_approval, pending_action, submitted_by, submitted_at,
    created_by, updated_at
  ) VALUES (
    v_org_id, v_brand_id, v_location_id, v_product_id, upper(btrim(p_name)),
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    NULLIF(btrim(COALESCE(p_category, '')), ''),
    NULLIF(btrim(COALESCE(p_accounting_category, '')), ''),
    COALESCE(p_is_inventoried, false), COALESCE(p_is_tax_exempt, false),
    NULLIF(btrim(COALESCE(p_report_by_unit, '')), ''),
    NULLIF(btrim(COALESCE(p_base_unit, '')), ''),
    COALESCE(p_latest_price, 0), COALESCE(p_location_specific, false),
    v_needs_approval, CASE WHEN v_needs_approval THEN 'create' ELSE NULL END,
    CASE WHEN v_needs_approval THEN auth.uid() ELSE NULL END,
    CASE WHEN v_needs_approval THEN now() ELSE NULL END,
    auth.uid(), now()
  )
  RETURNING * INTO v_created;

  IF COALESCE(p_is_inventoried, false) THEN
    PERFORM public.set_product_inventory_tracking(v_created.id, true);
    SELECT * INTO v_created FROM public.products WHERE id = v_created.id;
  END IF;

  RETURN v_created;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_product_details(
  p_product_id uuid,
  p_name text,
  p_restops_product_id text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_accounting_category text DEFAULT NULL,
  p_is_inventoried boolean DEFAULT NULL,
  p_is_tax_exempt boolean DEFAULT NULL,
  p_report_by_unit text DEFAULT NULL,
  p_base_unit text DEFAULT NULL,
  p_latest_price numeric DEFAULT NULL,
  p_location_specific boolean DEFAULT NULL,
  p_report_unit_quantity numeric DEFAULT NULL,
  p_report_unit_source_price numeric DEFAULT NULL,
  p_expected_version integer DEFAULT NULL
)
RETURNS public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_updated public.products%ROWTYPE;
  v_category text;
  v_accounting_category text;
  v_category_changed boolean;
  v_needs_approval boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_product
  FROM public.products
  WHERE id = p_product_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_product.id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  IF p_expected_version IS NOT NULL AND p_expected_version <> COALESCE(v_product.version_number, 1) THEN
    RAISE EXCEPTION 'Product was changed by another session. Refresh and try again.';
  END IF;
  IF NOT public.product_write_allowed(v_product.organization_id, v_product.brand_id, v_product.location_id) THEN
    RAISE EXCEPTION 'Not authorized to update this product';
  END IF;
  IF NULLIF(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Product name is required';
  END IF;

  v_category := NULLIF(btrim(COALESCE(p_category, '')), '');
  v_accounting_category := NULLIF(btrim(COALESCE(p_accounting_category, '')), '');
  v_category_changed :=
    COALESCE(v_product.category, '') IS DISTINCT FROM COALESCE(v_category, '')
    OR COALESCE(v_product.accounting_category, '') IS DISTINCT FROM COALESCE(v_accounting_category, '');
  v_needs_approval := public.get_auth_role() = 'location_manager'
    AND public.get_product_approval_setting(v_product.organization_id)
    AND NOT COALESCE(v_product.pending_approval, false);

  UPDATE public.products
     SET name = upper(btrim(p_name)),
         product_id = NULLIF(btrim(COALESCE(p_restops_product_id, '')), ''),
         description = NULLIF(btrim(COALESCE(p_description, '')), ''),
         category = v_category,
         accounting_category = v_accounting_category,
         is_tax_exempt = COALESCE(p_is_tax_exempt, false),
         report_by_unit = NULLIF(btrim(COALESCE(p_report_by_unit, '')), ''),
         base_unit = NULLIF(btrim(COALESCE(p_base_unit, '')), ''),
         latest_price = COALESCE(p_latest_price, 0),
         location_specific = COALESCE(p_location_specific, false),
         report_unit_quantity = GREATEST(COALESCE(p_report_unit_quantity, report_unit_quantity, 1), 0.0001),
         report_unit_source_price = COALESCE(p_report_unit_source_price, report_unit_source_price, p_latest_price, latest_price, 0),
         pending_approval = CASE WHEN v_needs_approval THEN true ELSE pending_approval END,
         pending_action = CASE WHEN v_needs_approval THEN 'update' ELSE pending_action END,
         pending_snapshot = CASE WHEN v_needs_approval THEN to_jsonb(v_product) ELSE pending_snapshot END,
         submitted_by = CASE WHEN v_needs_approval THEN auth.uid() ELSE submitted_by END,
         submitted_at = CASE WHEN v_needs_approval THEN now() ELSE submitted_at END,
         category_source = CASE WHEN v_category_changed THEN 'manual' ELSE category_source END,
         category_review_status = CASE WHEN v_category_changed THEN 'approved' ELSE category_review_status END,
         category_reviewed_at = CASE WHEN v_category_changed THEN now() ELSE category_reviewed_at END,
         category_reviewed_by = CASE WHEN v_category_changed THEN auth.uid() ELSE category_reviewed_by END,
         suggested_category = CASE WHEN v_category_changed THEN NULL ELSE suggested_category END,
         suggested_category_type = CASE WHEN v_category_changed THEN NULL ELSE suggested_category_type END,
         suggested_accounting_category = CASE WHEN v_category_changed THEN NULL ELSE suggested_accounting_category END,
         category_reason = CASE WHEN v_category_changed THEN NULL ELSE category_reason END,
         updated_at = now()
   WHERE id = p_product_id
   RETURNING * INTO v_updated;

  IF p_is_inventoried IS NOT NULL AND p_is_inventoried IS DISTINCT FROM v_product.is_inventoried THEN
    PERFORM public.set_product_inventory_tracking(p_product_id, p_is_inventoried);
    SELECT * INTO v_updated FROM public.products WHERE id = p_product_id;
  ELSIF p_is_inventoried IS NOT NULL THEN
    UPDATE public.products
       SET is_inventoried = p_is_inventoried, updated_at = now()
     WHERE id = p_product_id
     RETURNING * INTO v_updated;
  END IF;

  UPDATE public.inventory
     SET unit_cost = COALESCE(v_updated.latest_price, unit_cost),
         current_unit = COALESCE(NULLIF(v_updated.report_by_unit, ''), current_unit),
         report_by = COALESCE(NULLIF(v_updated.report_by_unit, ''), report_by),
         category = COALESCE(NULLIF(v_updated.category, ''), category),
         accounting_category = COALESCE(NULLIF(v_updated.accounting_category, ''), accounting_category),
         updated_at = now()
   WHERE organization_id = v_updated.organization_id
     AND deleted_at IS NULL
     AND (internal_product_id = v_updated.id OR product_id = v_updated.product_id);

  RETURN v_updated;
END;
$$;

DROP FUNCTION IF EXISTS public.soft_delete_product_safe(uuid);
CREATE OR REPLACE FUNCTION public.soft_delete_product_safe(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.products%ROWTYPE;
  v_needs_approval boolean;
BEGIN
  SELECT * INTO v_existing
  FROM public.products
  WHERE id = p_product_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  IF NOT public.product_write_allowed(v_existing.organization_id, v_existing.brand_id, v_existing.location_id) THEN
    RAISE EXCEPTION 'Not authorized to delete this product';
  END IF;

  v_needs_approval := public.get_auth_role() = 'location_manager'
    AND public.get_product_approval_setting(v_existing.organization_id)
    AND NOT COALESCE(v_existing.pending_approval, false);

  IF v_needs_approval THEN
    UPDATE public.products
       SET pending_approval = true,
           pending_action = 'delete',
           pending_snapshot = to_jsonb(v_existing),
           submitted_by = auth.uid(),
           submitted_at = now(),
           updated_at = now()
     WHERE id = p_product_id;

    RETURN jsonb_build_object('success', true, 'pending_approval', true);
  END IF;

  UPDATE public.products
     SET deleted_at = now(), deleted_by = auth.uid(), updated_at = now()
   WHERE id = p_product_id;

  UPDATE public.inventory
     SET deleted_at = now(), deleted_by = auth.uid(), updated_at = now()
   WHERE organization_id = v_existing.organization_id
     AND deleted_at IS NULL
     AND (internal_product_id = v_existing.id OR product_id = v_existing.product_id);

  RETURN jsonb_build_object('success', true, 'pending_approval', false);
END;
$$;

-- ===== Invoice/inventory/recipe sync repairs =====

DROP TRIGGER IF EXISTS trigger_sync_invoice_products ON public.invoices;
CREATE TRIGGER trigger_sync_invoice_products
  AFTER INSERT OR UPDATE OF status ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_sync_invoice_products();

CREATE OR REPLACE FUNCTION public.recalculate_recipe_costs_on_price_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.recipes r
     SET total_cost = COALESCE((
           SELECT sum(COALESCE(ri.quantity, 0) * COALESCE(NEW.latest_price, 0))
           FROM public.recipe_ingredients ri
           WHERE ri.recipe_id = r.id
             AND ri.product_id = NEW.id
         ), r.total_cost),
         cost_per_serving = CASE
           WHEN COALESCE(r.yield_quantity, 0) > 0 THEN COALESCE((
             SELECT sum(COALESCE(ri.quantity, 0) * COALESCE(NEW.latest_price, 0))
             FROM public.recipe_ingredients ri
             WHERE ri.recipe_id = r.id
               AND ri.product_id = NEW.id
           ), r.total_cost) / r.yield_quantity
           ELSE r.cost_per_serving
         END,
         updated_at = now()
   WHERE EXISTS (
     SELECT 1 FROM public.recipe_ingredients ri
     WHERE ri.recipe_id = r.id
       AND ri.product_id = NEW.id
   );

  UPDATE public.recipes r
     SET total_cost = public.calculate_recipe_cost(r.id),
         updated_at = now()
   WHERE r.ingredients @> jsonb_build_array(jsonb_build_object('product_id', NEW.id::text));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_recalculate_recipes_on_price_change ON public.products;
CREATE TRIGGER trigger_recalculate_recipes_on_price_change
  AFTER UPDATE OF latest_price ON public.products
  FOR EACH ROW
  WHEN (OLD.latest_price IS DISTINCT FROM NEW.latest_price)
  EXECUTE FUNCTION public.recalculate_recipe_costs_on_price_change();

-- ===== Grants =====

REVOKE ALL ON FUNCTION public.create_product_details(text, text, text, text, text, boolean, boolean, text, text, numeric, boolean, uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_product_details(uuid, text, text, text, text, text, boolean, boolean, text, text, numeric, boolean, numeric, numeric, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.soft_delete_product_safe(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_product_inventory_tracking(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_product(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_product_barcode(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_product_barcode(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_vendor_item_mapping(uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.merge_products(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.find_duplicate_products(uuid, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stage_product_import(uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commit_product_import(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_product_details(text, text, text, text, text, boolean, boolean, text, text, numeric, boolean, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_product_details(uuid, text, text, text, text, text, boolean, boolean, text, text, numeric, boolean, numeric, numeric, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_product_safe(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_product_inventory_tracking(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_product(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_product_barcode(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_product_barcode(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_vendor_item_mapping(uuid, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_products(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_duplicate_products(uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stage_product_import(uuid, uuid, uuid, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_product_import(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
