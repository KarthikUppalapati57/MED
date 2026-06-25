import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getSupabaseSystemClient } from '../_shared/supabase.ts'
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = await getSupabaseSystemClient()

    // Stripe signature verification would go here in production
    // const signature = req.headers.get('stripe-signature');
    // const event = stripe.webhooks.constructEvent(payload, signature, Deno.env.get('STRIPE_WEBHOOK_SECRET'));
    
    // For MVP, we'll parse the event directly
    const event = await req.json()

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const orgId = session.client_reference_id; // Metadata passed during session creation
      const planId = session.metadata?.plan_id;

      if (orgId && planId) {
        console.log(`Webhook received: Upgrading org ${orgId} to plan ${planId}`);
        
        // 1. Update Organization Plan
        const { error: orgError } = await supabaseClient
          .from('organizations')
          .update({ 
            plan_id: planId,
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription
          })
          .eq('id', orgId);

        if (orgError) throw orgError;

        // 2. Log Audit Event
        await supabaseClient.rpc('log_audit_event', { p_entry: {
          organization_id: orgId,
          user_id: null,
          action: 'subscription_upgraded',
          entity_type: 'organization',
          entity_id: orgId,
          details: { plan_id: planId, session_id: session.id }
        }});
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error("Webhook error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

