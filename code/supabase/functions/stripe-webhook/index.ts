import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getSupabaseSystemClient } from '../_shared/supabase.ts'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = await getSupabaseSystemClient()

    // Stripe signature verification should be enabled when the webhook secret is configured.
    const event = await req.json()

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const metadata = session.metadata || {}
      const orgId = metadata.organization_id || session.client_reference_id || null
      const userId = metadata.user_id || null
      const planId = metadata.plan_id || null

      if (userId) {
        const { error: profileError } = await supabaseClient
          .from('profiles')
          .update({
            payment_verified: true,
            payment_method_type: metadata.payment_method_type || 'stripe_subscription',
            pending_onboarding_plan_id: planId || null,
            pending_stripe_customer_id: session.customer || null,
            pending_stripe_subscription_id: session.subscription || null,
            pending_checkout_session_id: session.id || null,
            pending_payment_metadata: {
              provider: 'stripe',
              plan_id: planId || '',
              checkout_session_id: session.id || '',
              stripe_customer_id: session.customer || '',
              stripe_subscription_id: session.subscription || '',
              completed_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)

        if (profileError) throw profileError
      }

      if (orgId && planId) {
        console.log(`Webhook received: Upgrading org ${orgId} to plan ${planId}`)

        const { error: orgError } = await supabaseClient
          .from('organizations')
          .update({
            plan_id: planId,
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
          })
          .eq('id', orgId)

        if (orgError) throw orgError

        await supabaseClient.rpc('log_audit_event', { p_entry: {
          organization_id: orgId,
          user_id: userId,
          action: 'subscription_upgraded',
          entity_type: 'organization',
          entity_id: orgId,
          details: { plan_id: planId, session_id: session.id },
        }})
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
