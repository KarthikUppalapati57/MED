-- 092: Add Yield Loss and Nested Batch Recipes

BEGIN;

ALTER TABLE public.recipes
ADD COLUMN IF NOT EXISTS yield_percentage DECIMAL(5,2) DEFAULT 100.00,
ADD COLUMN IF NOT EXISTS prep_time_minutes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_batch BOOLEAN DEFAULT false;

-- Allow recipe_ingredients to point to another recipe (sub-recipe/batch) instead of a raw product
ALTER TABLE public.recipe_ingredients
ALTER COLUMN product_id DROP NOT NULL,
ADD COLUMN IF NOT EXISTS sub_recipe_id UUID REFERENCES public.recipes(id) ON DELETE SET NULL;

-- Constraint to ensure an ingredient is either a raw product or a sub-recipe, but not both or neither
ALTER TABLE public.recipe_ingredients
ADD CONSTRAINT ingredient_type_check 
CHECK (
    (product_id IS NOT NULL AND sub_recipe_id IS NULL) OR 
    (product_id IS NULL AND sub_recipe_id IS NOT NULL)
);

COMMIT;
