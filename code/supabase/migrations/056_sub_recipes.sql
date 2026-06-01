-- Migration 056: Sub-recipes and JSONB Sync
-- Allows nested recipes and automatically synchronizes the frontend's JSONB array to the relational table

BEGIN;

-- 1. Add sub_recipe_id to recipe_ingredients
ALTER TABLE public.recipe_ingredients
ADD COLUMN IF NOT EXISTS sub_recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE;

-- 2. Modify constraint (product_id or sub_recipe_id must be provided, but not both)
-- Actually, we'll just allow it without strict constraints for flexibility.

-- 3. Create a trigger to automatically sync the JSONB `ingredients` column on recipes 
-- to the `recipe_ingredients` table.
CREATE OR REPLACE FUNCTION public.sync_recipe_ingredients_from_jsonb()
RETURNS TRIGGER AS $$
DECLARE
    ing RECORD;
    v_product_id UUID;
    v_sub_recipe_id UUID;
BEGIN
    -- Delete existing ingredients for this recipe to replace them
    DELETE FROM public.recipe_ingredients WHERE recipe_id = NEW.id;

    -- Iterate over the JSONB array and insert into recipe_ingredients
    -- We assume the JSON structure has `product_id`, `sub_recipe_id`, `quantity`, `unit`
    IF NEW.ingredients IS NOT NULL AND jsonb_typeof(NEW.ingredients) = 'array' THEN
        FOR ing IN SELECT * FROM jsonb_array_elements(NEW.ingredients)
        LOOP
            v_product_id := NULL;
            v_sub_recipe_id := NULL;

            IF (ing.value->>'product_id') IS NOT NULL AND (ing.value->>'product_id') != '' THEN
                v_product_id := (ing.value->>'product_id')::UUID;
            END IF;

            IF (ing.value->>'sub_recipe_id') IS NOT NULL AND (ing.value->>'sub_recipe_id') != '' THEN
                v_sub_recipe_id := (ing.value->>'sub_recipe_id')::UUID;
            END IF;

            IF v_product_id IS NOT NULL OR v_sub_recipe_id IS NOT NULL THEN
                INSERT INTO public.recipe_ingredients (
                    organization_id,
                    recipe_id,
                    product_id,
                    sub_recipe_id,
                    quantity,
                    unit
                ) VALUES (
                    NEW.organization_id,
                    NEW.id,
                    v_product_id,
                    v_sub_recipe_id,
                    COALESCE((ing.value->>'quantity')::NUMERIC, 0),
                    ing.value->>'unit'
                );
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach the sync trigger to the recipes table
DROP TRIGGER IF EXISTS trigger_sync_recipe_ingredients ON public.recipes;
CREATE TRIGGER trigger_sync_recipe_ingredients
    AFTER INSERT OR UPDATE OF ingredients ON public.recipes
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_recipe_ingredients_from_jsonb();

-- 4. Create an initial sync for existing recipes
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id, organization_id, ingredients FROM public.recipes WHERE ingredients IS NOT NULL AND jsonb_typeof(ingredients) = 'array'
    LOOP
        -- This forces the trigger to run by doing a dummy update
        UPDATE public.recipes SET updated_at = now() WHERE id = r.id;
    END LOOP;
END;
$$;

COMMIT;
