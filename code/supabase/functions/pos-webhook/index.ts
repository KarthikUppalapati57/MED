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
      .from('event_logs')
      .insert([
        {
          organization_id: payload.organization_id || null,
          event_name: `${provider}.${payload.type || payload.event_type || 'unknown_event'}`,
          entity_type: 'pos_webhook',
          entity_id: payload.id || null,
          payload: payload
        }
      ])

    if (insertError) {
      console.warn("Could not log POS webhook event. Proceeding.", insertError)
    }

    // Extract line items based on provider
    let lineItems: any[] = []
    const orgId = payload.organization_id;
    const locationId = payload.location_id;

    if (!orgId) {
      throw new Error("Missing organization_id in payload");
    }

    switch (provider) {
      case 'toast':
      case 'square':
        // For test/mock purposes, we expect normalized data in payload.order.line_items
        if (payload.type === 'order.completed' || payload.event_type === 'order.completed') {
          const items = payload.order?.line_items || [];
          lineItems = items.map((item: any) => ({
            pos_item_id: item.id || item.item_id,
            item_name: item.name,
            quantity: item.quantity || 1,
            price: item.total_money?.amount ? item.total_money.amount / 100 : item.price || 0,
          }));
        }
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

    // Process line items
    if (lineItems.length > 0) {
      // 1. Insert the pos_order header
      const { data: posOrder, error: orderError } = await supabaseClient
        .from('pos_orders')
        .upsert(
          {
            organization_id: orgId,
            location_id: locationId || null,
            pos_provider: provider,
            pos_order_id: payload.id || `mock_${Date.now()}`,
            total_amount: lineItems.reduce((sum, item) => sum + (item.price * item.quantity), 0),
            order_date: payload.created_at || new Date().toISOString(),
            status: 'logged'
          },
          { onConflict: 'organization_id, pos_provider, pos_order_id' }
        )
        .select()
        .single();

      if (orderError) {
        console.error('Failed to insert pos_order:', orderError);
        throw orderError;
      }

      // 2. Insert line items
      const orderItemsToInsert = lineItems.map(item => ({
        order_id: posOrder.id,
        pos_item_id: item.pos_item_id,
        item_name: item.item_name,
        quantity: item.quantity,
        price: item.price
      }));

      const { error: itemsError } = await supabaseClient
        .from('pos_order_items')
        .insert(orderItemsToInsert);

      if (itemsError) {
        console.error('Failed to insert pos_order_items:', itemsError);
      }
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
