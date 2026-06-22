import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload = await req.json();
    const { transcript } = payload;

    if (!transcript) {
      throw new Error('Missing required field: transcript');
    }

    // In production, we would send the transcript to OpenAI/Gemini here to extract intent
    // Example: "I threw away 5 lbs of chicken breast"
    // -> { action: "LOG_WASTE", item_id: "uuid", quantity: 5, unit: "lbs" }
    
    // MOCK RESPONSE
    console.log(`Processing voice command: "${transcript}"`);
    
    let message = "I didn't understand that command.";
    
    if (transcript.toLowerCase().includes("threw away") || transcript.toLowerCase().includes("waste")) {
      // Simulate logging waste
      message = "Logged 5 lbs of waste for Chicken Breasts.";
    } else if (transcript.toLowerCase().includes("count")) {
      message = "Updated inventory count for Tomatoes to 20 units.";
    } else {
      message = "I've analyzed your request but couldn't map it to an action.";
    }

    return new Response(JSON.stringify({ success: true, message }), {
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
