import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { organization_id, date, created_by } = await req.json();

    if (!organization_id || !date) {
      throw new Error("organization_id and date are required");
    }

    // A real implementation would:
    // 1. Fetch `recipes` and `projected_sales`
    // 2. Perform deep nesting calculation asynchronously to get exact par requirements
    // 3. Subtract `inventory.current_quantity`
    // 4. Batch insert `smart_prep_plans`
    
    // For this demonstration offload, we simulate the calculation and batch insert generic plans
    const { data: activeRecipes } = await supabase
      .from('recipes')
      .select('id, name, yield_quantity, yield_unit')
      .eq('organization_id', organization_id)
      .limit(10); // limited for demo purposes
      
    if (activeRecipes && activeRecipes.length > 0) {
      const prepPlans = activeRecipes.map(recipe => ({
        organization_id,
        name: `Master Prep: ${recipe.name}`,
        recipe_id: recipe.id,
        prep_date: date,
        par_quantity: recipe.yield_quantity || 10,
        on_hand_quantity: 0,
        forecast_quantity: 5,
        prep_quantity: (recipe.yield_quantity || 10) + 5,
        unit: recipe.yield_unit || 'portion',
        priority: 'high',
        status: 'pending',
        created_by
      }));
      
      const { error: insertError } = await supabase
        .from('smart_prep_plans')
        .insert(prepPlans);
        
      if (insertError) throw insertError;
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Master Prep Sheet generated successfully.' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
