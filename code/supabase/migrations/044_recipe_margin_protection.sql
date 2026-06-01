-- Migration 044: Automated Margin Protection (Recipe Engineering)
-- Adds fields to recipes and sets up a trigger to automatically recalculate
-- costs and check margins when ingredient prices change.

-- 1. Add fields to recipes
ALTER TABLE public.recipes 
  ADD COLUMN IF NOT EXISTS selling_price NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_margin_percent NUMERIC(5,2) DEFAULT 70.00,
  ADD COLUMN IF NOT EXISTS margin_alert_enabled BOOLEAN DEFAULT true;

-- 2. Create the trigger function for product price updates
CREATE OR REPLACE FUNCTION public.recalculate_recipe_costs_on_price_change()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
    new_ingredients JSONB;
    new_ingredient_cost NUMERIC(10,2);
    new_total_cost NUMERIC(10,2);
    new_cost_per_serving NUMERIC(10,2);
    new_margin NUMERIC(5,2);
    price_to_use NUMERIC(10,2);
BEGIN
    -- Only proceed if the price actually changed
    IF NEW.latest_price IS NULL OR NEW.latest_price = OLD.latest_price THEN
        RETURN NEW;
    END IF;

    -- Find recipes that use this product in their ingredients jsonb
    -- We cast id to text because jsonb typically stores it as text.
    FOR r IN 
        SELECT * FROM public.recipes 
        WHERE ingredients @> jsonb_build_array(jsonb_build_object('product_id', NEW.id::text))
    LOOP
        -- Rebuild the ingredients array with the new price
        SELECT 
            jsonb_agg(
                CASE 
                    WHEN elem->>'product_id' = NEW.id::text THEN
                        jsonb_set(
                            jsonb_set(
                                elem, 
                                '{unit_cost}', 
                                to_jsonb(NEW.latest_price)
                            ),
                            '{total_cost}',
                            to_jsonb(ROUND(((elem->>'quantity')::numeric * NEW.latest_price), 2))
                        )
                    ELSE elem
                END
            ),
            SUM(
                CASE 
                    WHEN elem->>'product_id' = NEW.id::text THEN ROUND(((elem->>'quantity')::numeric * NEW.latest_price), 2)
                    ELSE COALESCE((elem->>'total_cost')::numeric, 0)
                END
            )
        INTO new_ingredients, new_ingredient_cost
        FROM jsonb_array_elements(r.ingredients) AS elem;

        -- Recalculate totals
        new_total_cost := COALESCE(new_ingredient_cost, 0) + COALESCE(r.total_packaging_cost, 0) + COALESCE(r.labor_cost, 0);
        
        IF COALESCE(r.yield_quantity, 0) > 0 THEN
            new_cost_per_serving := new_total_cost / r.yield_quantity;
        ELSE
            new_cost_per_serving := new_total_cost;
        END IF;

        -- Check margin
        IF r.margin_alert_enabled AND COALESCE(r.selling_price, 0) > 0 AND r.target_margin_percent IS NOT NULL THEN
            new_margin := ((r.selling_price - new_cost_per_serving) / r.selling_price) * 100;
            
            -- If margin drops below target, create an alert
            IF new_margin < r.target_margin_percent THEN
                -- Check if an alert already exists in the last 24h to avoid spam
                IF NOT EXISTS (
                    SELECT 1 FROM public.notifications 
                    WHERE type = 'AI_alert' 
                      AND organization_id = r.organization_id 
                      AND metadata->>'recipe_id' = r.id::text
                      AND created_at > now() - interval '24 hours'
                ) THEN
                    INSERT INTO public.notifications (
                        organization_id,
                        type,
                        title,
                        body,
                        metadata
                    ) VALUES (
                        r.organization_id,
                        'AI_alert',
                        'Margin Alert: ' || r.name,
                        'The cost of ' || NEW.name || ' increased to $' || NEW.latest_price || '. The estimated margin for ' || r.name || ' has dropped to ' || round(new_margin, 1) || '%, which is below your target of ' || r.target_margin_percent || '%.',
                        jsonb_build_object(
                            'recipe_id', r.id, 
                            'product_id', NEW.id, 
                            'new_margin', new_margin,
                            'target_margin', r.target_margin_percent
                        )
                    );
                END IF;
            END IF;
        END IF;

        -- Update the recipe
        UPDATE public.recipes 
        SET 
            ingredients = new_ingredients,
            total_ingredient_cost = new_ingredient_cost,
            total_cost = new_total_cost,
            cost_per_serving = new_cost_per_serving,
            updated_at = now()
        WHERE id = r.id;

    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Attach trigger to products
DROP TRIGGER IF EXISTS trigger_recalculate_recipes_on_price_change ON public.products;
CREATE TRIGGER trigger_recalculate_recipes_on_price_change
    AFTER UPDATE OF latest_price ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.recalculate_recipe_costs_on_price_change();
