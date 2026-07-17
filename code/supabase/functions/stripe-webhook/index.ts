import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14.17.0?target=deno'
import { getSupabaseSystemClient } from '../_shared/supabase.ts'
import { corsHeaders } from '../_shared/cors.ts'

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2023-10-16', httpClient: Stripe.createFetchHttpClient() })
  : null

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

    // Card onboarding no longer goes through Checkout Sessions -- the tenant enters card
    // details inline and the subscription is created directly (see create-checkout-session).
    // That flow marks payment_verified synchronously when the first invoice's PaymentIntent
    // succeeds immediately, but if the card required 3D Secure the PaymentIntent came back
    // 'requires_action' and the frontend confirms it client-side afterward -- this event is
    // how the server catches that async completion and finishes marking the profile verified.
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object
      const subscriptionId = invoice.subscription

      if (subscriptionId && stripe) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const metadata = subscription.metadata || {}
        const userId = metadata.user_id || null
        const planId = metadata.plan_id || null

        if (userId) {
          const { data: existingProfile } = await supabaseClient
            .from('profiles')
            .select('payment_verified')
            .eq('id', userId)
            .maybeSingle()

          if (existingProfile && existingProfile.payment_verified !== true) {
            const { error: profileError } = await supabaseClient
              .from('profiles')
              .update({
                payment_verified: true,
                payment_method_type: 'stripe_subscription',
                pending_onboarding_plan_id: planId || null,
                pending_stripe_customer_id: invoice.customer || null,
                pending_stripe_subscription_id: subscriptionId,
                pending_payment_metadata: {
                  provider: 'stripe',
                  plan_id: planId || '',
                  stripe_customer_id: invoice.customer || '',
                  stripe_subscription_id: subscriptionId,
                  invoice_id: invoice.id,
                  checkout_status: 'subscription_created',
                  completed_at: new Date().toISOString(),
                },
                updated_at: new Date().toISOString(),
              })
              .eq('id', userId)

            if (profileError) throw profileError
          }
        }
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
