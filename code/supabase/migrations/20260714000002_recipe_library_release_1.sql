-- MED-fresh Recipe Library Release 1
-- Additive foundation for classifications, alternate outputs, unit conversions,
-- nested component costing metadata, and deterministic cost audit fields.

BEGIN;

CREATE TABLE IF NOT EXISTS public.recipe_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'dish' CHECK (kind IN ('dish', 'component', 'beverage')),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_recipe_types_scope_name
  ON public.recipe_types (organization_id, COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
CREATE INDEX IF NOT EXISTS idx_recipe_types_organization ON public.recipe_types (organization_id);

CREATE TABLE IF NOT EXISTS public.recipe_yields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  quantity NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  cost_per_unit NUMERIC(14,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_recipe_yields_recipe_unit
  ON public.recipe_yields (recipe_id, lower(unit));
CREATE UNIQUE INDEX IF NOT EXISTS uq_recipe_yields_primary
  ON public.recipe_yields (recipe_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS idx_recipe_yields_organization ON public.recipe_yields (organization_id);

CREATE TABLE IF NOT EXISTS public.recipe_unit_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  from_unit TEXT NOT NULL,
  to_unit TEXT NOT NULL,
  factor NUMERIC(18,8) NOT NULL CHECK (factor > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (lower(from_unit) <> lower(to_unit))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_recipe_unit_conversions_scope
  ON public.recipe_unit_conversions (
    organization_id,
    COALESCE(product_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(from_unit),
    lower(to_unit)
  );
CREATE INDEX IF NOT EXISTS idx_recipe_unit_conversions_product ON public.recipe_unit_conversions (product_id);

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS recipe_type_id UUID REFERENCES public.recipe_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS costing_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_costed_at TIMESTAMPTZ;

ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS yield_percentage NUMERIC(7,4) NOT NULL DEFAULT 100 CHECK (yield_percentage > 0 AND yield_percentage <= 100),
  ADD COLUMN IF NOT EXISTS cost_unit TEXT,
  ADD COLUMN IF NOT EXISTS unit_cost_snapshot NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.recipe_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_yields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_unit_conversions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recipe_types_select ON public.recipe_types;
CREATE POLICY recipe_types_select ON public.recipe_types FOR SELECT
  USING (organization_id = public.get_my_org());
DROP POLICY IF EXISTS recipe_types_manage ON public.recipe_types;
CREATE POLICY recipe_types_manage ON public.recipe_types FOR ALL
  USING (organization_id = public.get_my_org() AND public.is_manager_or_above())
  WITH CHECK (organization_id = public.get_my_org() AND public.is_manager_or_above());

DROP POLICY IF EXISTS recipe_yields_select ON public.recipe_yields;
CREATE POLICY recipe_yields_select ON public.recipe_yields FOR SELECT
  USING (organization_id = public.get_my_org());
DROP POLICY IF EXISTS recipe_yields_manage ON public.recipe_yields;
CREATE POLICY recipe_yields_manage ON public.recipe_yields FOR ALL
  USING (organization_id = public.get_my_org() AND public.is_manager_or_above())
  WITH CHECK (organization_id = public.get_my_org() AND public.is_manager_or_above());

DROP POLICY IF EXISTS recipe_unit_conversions_select ON public.recipe_unit_conversions;
CREATE POLICY recipe_unit_conversions_select ON public.recipe_unit_conversions FOR SELECT
  USING (organization_id = public.get_my_org());
DROP POLICY IF EXISTS recipe_unit_conversions_manage ON public.recipe_unit_conversions;
CREATE POLICY recipe_unit_conversions_manage ON public.recipe_unit_conversions FOR ALL
  USING (organization_id = public.get_my_org() AND public.is_manager_or_above())
  WITH CHECK (organization_id = public.get_my_org() AND public.is_manager_or_above());

INSERT INTO public.recipe_yields (organization_id, recipe_id, quantity, unit, is_primary, cost_per_unit)
SELECT organization_id, id, GREATEST(COALESCE(yield_quantity, 1), 0.0001), COALESCE(NULLIF(yield_unit, ''), 'serving'), true, cost_per_serving
FROM public.recipes
ON CONFLICT (recipe_id, lower(unit)) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_primary_recipe_yield()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.yield_quantity, 0) <= 0 OR COALESCE(trim(NEW.yield_unit), '') = '' THEN
    RETURN NEW;
  END IF;

  UPDATE public.recipe_yields SET is_primary = false
  WHERE recipe_id = NEW.id AND lower(unit) <> lower(NEW.yield_unit) AND is_primary;

  INSERT INTO public.recipe_yields (organization_id, recipe_id, quantity, unit, is_primary, cost_per_unit)
  VALUES (NEW.organization_id, NEW.id, NEW.yield_quantity, NEW.yield_unit, true, NEW.cost_per_serving)
  ON CONFLICT (recipe_id, lower(unit)) DO UPDATE SET
    quantity = EXCLUDED.quantity,
    is_primary = true,
    cost_per_unit = EXCLUDED.cost_per_unit,
    updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_primary_recipe_yield ON public.recipes;
CREATE TRIGGER trigger_sync_primary_recipe_yield
AFTER INSERT OR UPDATE OF yield_quantity, yield_unit, cost_per_serving ON public.recipes
FOR EACH ROW EXECUTE FUNCTION public.sync_primary_recipe_yield();

COMMIT;
