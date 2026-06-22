import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Expected headers from external POS systems (e.g. Toast, Square)
    const provider = req.headers.get('x-pos-provider'); // e.g., 'toast'
    const signature = req.headers.get('x-pos-signature');
    const locationId = req.headers.get('x-location-id');

    if (!provider || !locationId) {
      throw new Error("Missing provider or location identity");
    }

    // 1. Verify the configuration and active status
    const { data: config, error: configError } = await supabaseClient
      .from('pos_configurations')
      .select('*')
      .eq('location_id', locationId)
      .eq('provider', provider)
      .single();

    if (configError || !config || !config.is_active) {
      throw new Error("Invalid or inactive POS configuration");
    }

    // Note: In production, we would use crypto to verify the webhook signature using config.webhook_secret

    // 2. Parse payload based on provider
    const rawPayload = await req.json();
    let standardizedTicket = {};

    if (provider === 'toast') {
      // Example Toast transformation
      standardizedTicket = {
        organization_id: config.organization_id,
        location_id: config.location_id,
        status: 'open',
        total_amount: rawPayload.checks[0]?.totalAmount || 0,
        source: 'pos',
      };
    } else if (provider === 'square') {
      // Example Square transformation
      standardizedTicket = {
        organization_id: config.organization_id,
        location_id: config.location_id,
        status: 'open',
        total_amount: rawPayload.order?.net_amounts?.total_money?.amount / 100 || 0,
        source: 'pos',
      };
    }

    // 3. Insert standardized ticket into our ecosystem
    const { data: insertedTicket, error: insertError } = await supabaseClient
      .from('sales_tickets')
      .insert(standardizedTicket)
      .select()
      .single();

    if (insertError) throw insertError;

    // 4. Update sync timestamp
    await supabaseClient
      .from('pos_configurations')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', config.id);

    return new Response(JSON.stringify({ success: true, ticket_id: insertedTicket.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error("POS Sync error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
