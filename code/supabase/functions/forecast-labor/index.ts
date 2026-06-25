import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getSupabaseClient } from '../_shared/supabase.ts'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    const supabaseClient = getSupabaseClient(authHeader)

    const { organization_id, location_id, forecast_date } = await req.json()

    if (!organization_id || !forecast_date) {
      throw new Error("Missing required parameters")
    }

    // 1. Fetch historical sales data for the same day of the week over the last 4 weeks
    // (Mocking this data retrieval for the AI forecast)
    console.log(`Generating labor forecast for Org: ${organization_id}, Date: ${forecast_date}`)
    
    const historicalAvgSales = 4500.00;
    const weatherAdjustment = 0.95; // e.g. Rain expected
    const localEventBump = 1.20; // e.g. Football game

    // AI Sales Prediction
    const predictedSales = historicalAvgSales * weatherAdjustment * localEventBump;

    // Labor Target (Assuming 20% labor cost target, avg wage $18/hr)
    // Labor budget = predictedSales * 0.20
    // Hours = Labor budget / 18
    const laborBudget = predictedSales * 0.20;
    const recommendedHours = laborBudget / 18.00;

    // 2. Insert into labor_forecasts
    const { data, error } = await supabaseClient
      .from('labor_forecasts')
      .insert({
        organization_id,
        location_id,
        forecast_date,
        predicted_sales: Math.round(predictedSales * 100) / 100,
        recommended_labor_hours: Math.round(recommendedHours * 10) / 10,
        ai_confidence: 88
      })
      .select()
      .single()

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error("Forecast error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
