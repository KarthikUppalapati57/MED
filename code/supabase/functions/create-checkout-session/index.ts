import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import Stripe from 'https://esm.sh/stripe@14.17.0?target=deno'
import { corsHeaders } from '../_shared/cors.ts'

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })
  : null

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader ?? '' } },
    })
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: authData, error: authError } = await userClient.auth.getUser()
    if (authError || !authData?.user) {
      throw new Error('Authentication required')
    }

    const {
      priceId,
      planId,
      couponCode,
      successUrl,
      cancelUrl,
      plan_id,
      org_id,
      organization_id,
    } = await req.json()

    const selectedPlanId = planId || plan_id
    if (!selectedPlanId) throw new Error('Missing plan ID')

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('id, email, organization_id, payment_verified, payment_method_type, business_verification_status')
      .eq('id', authData.user.id)
      .single()

    if (profileError || !profile) throw new Error('Profile not found')
    if (profile.business_verification_status !== 'verified') throw new Error('Business verification is required before checkout')
    if (!profile.payment_verified) throw new Error('Payment method verification is required before checkout')

    const organizationId = organization_id || org_id || profile.organization_id
    if (!organizationId) throw new Error('Organization setup must be completed before checkout')

    const { data: plan, error: planError } = await adminClient
      .from('plans')
      .select('id, name, price_monthly, stripe_price_id')
      .eq('id', selectedPlanId)
      .single()

    if (planError || !plan) throw new Error('Invalid plan ID')

    const resolvedPriceId = priceId || plan.stripe_price_id
    if (Number(plan.price_monthly) > 0 && !resolvedPriceId) {
      throw new Error('Selected paid plan is missing a Stripe price ID')
    }

    let coupon: string | undefined
    if (couponCode) {
      const { data: appliedCoupon, error: couponError } = await userClient.rpc('apply_onboarding_coupon', {
        p_code: couponCode,
        p_plan_id: selectedPlanId,
      })
      if (couponError) throw couponError
      coupon = appliedCoupon?.coupon?.code
    }

    if (Number(plan.price_monthly) === 0) {
      await adminClient
        .from('organizations')
        .update({ plan_id: plan.id })
        .eq('id', organizationId)

      return new Response(JSON.stringify({ success: true, url: successUrl || '/', freePlan: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    if (!stripe) {
      const mockUrl = `${successUrl || '/'}?checkout=mock&plan=${encodeURIComponent(plan.id)}${coupon ? `&coupon=${encodeURIComponent(coupon)}` : ''}`
      return new Response(JSON.stringify({ success: true, url: mockUrl, providerMode: 'stripe_secret_missing' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const { data: org, error: orgError } = await adminClient
      .from('organizations')
      .select('id, name, stripe_customer_id')
      .eq('id', organizationId)
      .single()

    if (orgError || !org) throw new Error('Organization not found')

    let customerId = org.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email || authData.user.email || undefined,
        name: org.name,
        metadata: {
          organization_id: organizationId,
          user_id: authData.user.id,
        },
      })
      customerId = customer.id
      await adminClient
        .from('organizations')
        .update({ stripe_customer_id: customerId })
        .eq('id', organizationId)
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: resolvedPriceId, quantity: 1 }],
      success_url: successUrl || `${new URL(req.url).origin}/`,
      cancel_url: cancelUrl || `${new URL(req.url).origin}/onboarding`,
      metadata: {
        organization_id: organizationId,
        user_id: authData.user.id,
        plan_id: plan.id,
        coupon_code: coupon || '',
        payment_method_type: profile.payment_method_type || '',
      },
      subscription_data: {
        metadata: {
          organization_id: organizationId,
          plan_id: plan.id,
        },
      },
      allow_promotion_codes: true,
    })

    return new Response(JSON.stringify({ success: true, url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Checkout error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})