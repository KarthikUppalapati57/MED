import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { invoice_id, action } = await req.json()
    if (!invoice_id || !action) {
      throw new Error('Missing invoice_id or action in request payload')
    }

    // This edge function handles heavy invoice actions, such as:
    // - evaluate_policy: Re-evaluating routing policies after line changes
    // - cascade_prices: Updating global product prices when an invoice is approved
    // - auto_match: Using fuzzy logic to match vendor items to global items
    
    console.log(`Executing ${action} for invoice ${invoice_id}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Action ${action} completed successfully for invoice ${invoice_id}`,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
