import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature, x-toast-signature, x-square-signature',
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

    // Identify POS provider from URL or headers
    const url = new URL(req.url)
    const provider = url.searchParams.get('provider')

    if (!provider) {
      throw new Error("Missing 'provider' query parameter. Expected: toast, square, clover, or 7shifts")
    }

    const payload = await req.json()

    // Webhook verification (Simulated for this implementation)
    // In production, we would verify signatures like:
    // const signature = req.headers.get('x-square-signature')
    
    // Log the webhook payload to the database
    const { error: insertError } = await supabaseClient
      .from('integration_logs')
      .insert([
        {
          provider: provider,
          event_type: payload.type || payload.event_type || 'unknown_event',
          payload: payload,
          status: 'received'
        }
      ])

    if (insertError) {
      console.warn("Could not log to integration_logs (table may not exist yet). Proceeding.", insertError)
    }

    // Handle POS specific logic
    switch (provider) {
      case 'toast':
        // e.g. process Toast order
        console.log('Processing Toast webhook:', payload)
        break;
      case 'square':
        // e.g. process Square payment
        console.log('Processing Square webhook:', payload)
        break;
      case 'clover':
        console.log('Processing Clover webhook:', payload)
        break;
      case '7shifts':
        console.log('Processing 7shifts webhook:', payload)
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`)
    }

    return new Response(
      JSON.stringify({ received: true, provider }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
