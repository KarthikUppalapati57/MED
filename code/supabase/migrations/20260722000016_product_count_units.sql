BEGIN;

CREATE TABLE IF NOT EXISTS public.product_count_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(brand_id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  normalized_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit text NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0,
  source_quantity numeric NOT NULL DEFAULT 1 CHECK (source_quantity > 0),
  source_unit text NOT NULL,
  source_price numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_count_units_active_name
  ON public.product_count_units (organization_id, product_id, normalized_name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_product_count_units_product
  ON public.product_count_units (organization_id, product_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.product_count_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_count_units_select ON public.product_count_units;
CREATE POLICY product_count_units_select ON public.product_count_units
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND public.reference_scope_visible(organization_id, brand_id, location_id, deleted_at)
  );

DROP POLICY IF EXISTS product_count_units_insert ON public.product_count_units;
CREATE POLICY product_count_units_insert ON public.product_count_units
  FOR INSERT
  WITH CHECK (
    public.product_write_allowed(organization_id, brand_id, location_id)
    AND EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = product_count_units.product_id
        AND p.organization_id = product_count_units.organization_id
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS product_count_units_update ON public.product_count_units;
CREATE POLICY product_count_units_update ON public.product_count_units
  FOR UPDATE
  USING (
    deleted_at IS NULL
    AND public.product_write_allowed(organization_id, brand_id, location_id)
  )
  WITH CHECK (
    public.product_write_allowed(organization_id, brand_id, location_id)
    AND EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = product_count_units.product_id
        AND p.organization_id = product_count_units.organization_id
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS product_count_units_delete ON public.product_count_units;
CREATE POLICY product_count_units_delete ON public.product_count_units
  FOR DELETE
  USING (
    public.product_write_allowed(organization_id, brand_id, location_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_count_units TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
