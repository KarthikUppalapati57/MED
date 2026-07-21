import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14.17.0?target=deno'
import { getSupabaseSystemClient } from '../_shared/supabase.ts'
import { corsHeaders } from '../_shared/cors.ts'

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2023-10-16', httpClient: Stripe.createFetchHttpClient() })
  : null

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

async function recordWebhookStart(supabaseClient: Awaited<ReturnType<typeof getSupabaseSystemClient>>, event: Stripe.Event) {
  const { error } = await supabaseClient
    .from('webhook_events')
    .insert({
      external_id: event.id,
      source: 'stripe',
      type: event.type,
      data: event,
      status: 'pending',
    })

  if (!error) return { duplicate: false, status: 'pending' }

  if (error.code !== '23505') throw error

  const { data: existing, error: lookupError } = await supabaseClient
    .from('webhook_events')
    .select('status')
    .eq('external_id', event.id)
    .maybeSingle()

  if (lookupError) throw lookupError
  return { duplicate: true, status: existing?.status || 'pending' }
}

async function recordWebhookDone(
  supabaseClient: Awaited<ReturnType<typeof getSupabaseSystemClient>>,
  event: Stripe.Event,
  status: 'processed' | 'failed',
  errorMessage: string | null = null,
) {
  await supabaseClient
    .from('webhook_events')
    .update({
      status,
      error_message: errorMessage,
      processed_at: new Date().toISOString(),
    })
    .eq('external_id', event.id)
}

async function handleCheckoutCompleted(
  supabaseClient: Awaited<ReturnType<typeof getSupabaseSystemClient>>,
  session: Stripe.Checkout.Session,
) {
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
    const { error: orgError } = await supabaseClient
      .from('organizations')
      .update({
        plan_id: planId,
        subscription_plan: planId,
        subscription_status: 'active',
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription,
      })
      .eq('id', orgId)

    if (orgError) throw orgError

    await supabaseClient
      .from('subscriptions')
      .upsert({
        organization_id: orgId,
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription,
        plan_tier: planId,
        status: 'active',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id' })

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

async function handleInvoicePaymentSucceeded(
  supabaseClient: Awaited<ReturnType<typeof getSupabaseSystemClient>>,
  invoice: Stripe.Invoice,
) {
  const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id

  if (!subscriptionId || !stripe) return

  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const metadata = subscription.metadata || {}
  const userId = metadata.user_id || null
  const planId = metadata.plan_id || null
  const orgId = metadata.organization_id || null

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

  if (orgId) {
    await supabaseClient
      .from('subscriptions')
      .upsert({
        organization_id: orgId,
        stripe_customer_id: invoice.customer,
        stripe_subscription_id: subscriptionId,
        plan_tier: planId || subscription.items.data[0]?.price?.lookup_key || 'starter',
        status: subscription.status,
        current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
        cancel_at_period_end: subscription.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id' })
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  if (!stripe || !stripeWebhookSecret) {
    return jsonResponse({ error: 'Stripe webhook is not configured' }, 500)
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) return jsonResponse({ error: 'Missing Stripe signature' }, 400)

  const rawBody = await req.text()
  let event: Stripe.Event

  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, stripeWebhookSecret)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return jsonResponse({ error: `Invalid Stripe signature: ${message}` }, 400)
  }

  const supabaseClient = await getSupabaseSystemClient()
  const start = await recordWebhookStart(supabaseClient, event)
  if (start.duplicate && start.status === 'processed') {
    return jsonResponse({ received: true, duplicate: true })
  }

  try {
    if (event.type === 'checkout.session.completed') {
      await handleCheckoutCompleted(supabaseClient, event.data.object as Stripe.Checkout.Session)
    }

    if (event.type === 'invoice.payment_succeeded') {
      await handleInvoicePaymentSucceeded(supabaseClient, event.data.object as Stripe.Invoice)
    }

    await recordWebhookDone(supabaseClient, event, 'processed')
    return jsonResponse({ received: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordWebhookDone(supabaseClient, event, 'failed', message)
    return jsonResponse({ error: message }, 400)
  }
})