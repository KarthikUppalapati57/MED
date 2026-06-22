import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

serve(async (req) => {
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Get all active organizations
    const { data: orgs, error: orgError } = await supabaseClient
      .from('organizations')
      .select('id, name');

    if (orgError) throw orgError;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    for (const org of orgs) {
      // 2. Fetch forecasted sales from mv_daily_sales_summary for tomorrow
      // Since it's a forecast, we assume mv_daily_sales_summary might have it,
      // or we just look at a rolling average. For MVP, we'll just mock a call to Gemini.
      
      const prompt = `You are an AI culinary assistant for ${org.name}. Generate a JSON prep list for tomorrow (${tomorrowStr}) based on historical sales data. Limit to 5 critical items. Return ONLY JSON like: [{"item_name":"Diced Onions","prep_amount":5,"unit":"lbs","priority":"High"}]`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      const geminiData = await response.json();
      const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (rawText) {
        // Strip markdown blocks if any
        const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const prepItems = JSON.parse(cleanJson);
        
        // 3. Save to database
        await supabaseClient.from('ai_insights').insert({
          organization_id: org.id,
          insight_type: 'smart_prep_list',
          title: `SmartPrep List for ${tomorrowStr}`,
          description: `Automatically generated prep list based on AI forecast.`,
          severity: 'info',
          metadata: { date: tomorrowStr, items: prepItems }
        });
      }
    }

    return new Response(JSON.stringify({ success: true, message: "SmartPrep generated for all orgs" }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
