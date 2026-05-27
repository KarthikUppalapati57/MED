-- Migration 031: Recipe Normalization (Phase 1)
-- Normalizes recipe ingredients from a JSONB array into a relational table.

-- 1. Create recipe_ingredients table
CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
    unit TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add trigger for updated_at
DROP TRIGGER IF EXISTS set_updated_at ON public.recipe_ingredients;
CREATE TRIGGER set_updated_at 
    BEFORE UPDATE ON public.recipe_ingredients 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. Enable RLS
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
DROP POLICY IF EXISTS "Users can view recipe ingredients" ON public.recipe_ingredients;
CREATE POLICY "Users can view recipe ingredients" ON public.recipe_ingredients 
    FOR SELECT USING (organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Manager+ can manage recipe ingredients" ON public.recipe_ingredients;
CREATE POLICY "Manager+ can manage recipe ingredients" ON public.recipe_ingredients 
    FOR INSERT WITH CHECK (is_manager_or_above() AND organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Manager+ can update recipe ingredients" ON public.recipe_ingredients;
CREATE POLICY "Manager+ can update recipe ingredients" ON public.recipe_ingredients 
    FOR UPDATE USING (is_manager_or_above() AND organization_id = public.get_my_org());

DROP POLICY IF EXISTS "Admin can delete recipe ingredients" ON public.recipe_ingredients;
CREATE POLICY "Admin can delete recipe ingredients" ON public.recipe_ingredients 
    FOR DELETE USING (is_admin() AND organization_id = public.get_my_org());

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id ON public.recipe_ingredients(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_org_id ON public.recipe_ingredients(organization_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_product_id ON public.recipe_ingredients(product_id);
