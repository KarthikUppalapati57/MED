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
    if (authError || !authData?.user) throw new Error('Authentication required')

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
      .select('id, email, tenant_id, organization_id, payment_verified, payment_method_type, business_verification_status')
      .eq('id', authData.user.id)
      .single()

    if (profileError || !profile) throw new Error('Profile not found')
    if (profile.business_verification_status !== 'verified') throw new Error('Business verification is required before checkout')

    // Checkout is the RestOps subscription payment step. During first onboarding,
    // hierarchy may still be a client-side draft, so organization_id can be absent.
    const tenantId = profile.tenant_id || null
    const organizationId = organization_id || org_id || profile.organization_id || null

    const { data: plan, error: planError } = await adminClient
      .from('plans')
      .select('id, name, price_monthly, stripe_price_id, is_active')
      .eq('id', selectedPlanId)
      .single()

    if (planError || !plan) throw new Error('Invalid plan ID')
    if (plan.is_active !== true) throw new Error('Selected plan is not active')

    const resolvedPriceId = priceId || plan.stripe_price_id

    let coupon: string | undefined
    let couponTrialDays = 0
    if (couponCode) {
      const normalizedCouponCode = String(couponCode).trim()
      const { data: existingCoupon } = await adminClient
        .from('onboarding_coupons')
        .select('id, code, trial_days, discount_type')
        .ilike('code', normalizedCouponCode)
        .maybeSingle()

      const { data: existingRedemption } = existingCoupon
        ? await adminClient
            .from('onboarding_coupon_redemptions')
            .select('id')
            .eq('coupon_id', existingCoupon.id)
            .eq('user_id', authData.user.id)
            .in('status', ['applied', 'consumed'])
            .maybeSingle()
        : { data: null }

      if (existingCoupon && existingRedemption) {
        coupon = existingCoupon.code
        couponTrialDays = Number(existingCoupon.trial_days || 0)
      } else {
        const { data: appliedCoupon, error: couponError } = await userClient.rpc('apply_onboarding_coupon', {
          p_code: normalizedCouponCode,
          p_plan_id: selectedPlanId,
        })
        if (couponError) throw couponError
        coupon = appliedCoupon?.coupon?.code
        couponTrialDays = Number(appliedCoupon?.coupon?.trial_days || 0)
      }
    }

    if (Number(plan.price_monthly) > 0 && !resolvedPriceId) {
      throw new Error('Selected paid plan is missing a Stripe price ID')
    }

    if (Number(plan.price_monthly) === 0) {
      if (organizationId) {
        await adminClient.from('organizations').update({ plan_id: plan.id }).eq('id', organizationId)
      }

      await adminClient
        .from('profiles')
        .update({
          payment_verified: true,
          payment_method_type: 'free_plan',
          pending_onboarding_plan_id: plan.id,
          pending_payment_metadata: {
            provider: 'free_plan',
            plan_id: plan.id,
            coupon_code: coupon || '',
            completed_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', authData.user.id)

      return new Response(JSON.stringify({ success: true, url: successUrl || '/onboarding?checkout=free', freePlan: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    if (!stripe) {
      throw new Error('Stripe is not configured. Payment method collection is required for paid and trial plans.')
    }

    let org: { id: string; name: string; stripe_customer_id: string | null } | null = null
    if (organizationId) {
      const { data: orgData, error: orgError } = await adminClient
        .from('organizations')
        .select('id, name, stripe_customer_id')
        .eq('id', organizationId)
        .single()

      if (orgError || !orgData) throw new Error('Organization not found')
      org = orgData
    }

    let customerId = org?.stripe_customer_id || null
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email || authData.user.email || undefined,
        name: org?.name || profile.email || authData.user.email || 'RestOps tenant',
        metadata: {
          tenant_id: tenantId || '',
          organization_id: organizationId || '',
          user_id: authData.user.id,
        },
      })
      customerId = customer.id
      if (organizationId) {
        await adminClient.from('organizations').update({ stripe_customer_id: customerId }).eq('id', organizationId)
      }
    }

    await adminClient
      .from('profiles')
      .update({
        pending_onboarding_plan_id: plan.id,
        pending_stripe_customer_id: customerId,
        payment_method_type: 'stripe_subscription',
        pending_payment_metadata: {
          provider: 'stripe',
          plan_id: plan.id,
          coupon_code: coupon || '',
          checkout_status: 'created',
          trial_days: couponTrialDays || 0,
          requires_payment_method_collection: couponTrialDays > 0,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', authData.user.id)

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: resolvedPriceId, quantity: 1 }],
      success_url: successUrl || `${new URL(req.url).origin}/onboarding?checkout=success`,
      cancel_url: cancelUrl || `${new URL(req.url).origin}/onboarding`,
      metadata: {
        tenant_id: tenantId || '',
        organization_id: organizationId || '',
        user_id: authData.user.id,
        plan_id: plan.id,
        coupon_code: coupon || '',
        payment_method_type: 'stripe_subscription',
      },
      payment_method_collection: couponTrialDays > 0 ? 'always' : 'if_required',
      subscription_data: {
        ...(couponTrialDays > 0 ? { trial_period_days: couponTrialDays } : {}),
        metadata: {
          tenant_id: tenantId || '',
          organization_id: organizationId || '',
          user_id: authData.user.id,
          plan_id: plan.id,
          coupon_code: coupon || '',
          trial_days: String(couponTrialDays || 0),
        },
      },
      allow_promotion_codes: true,
    })

    await adminClient
      .from('profiles')
      .update({
        pending_checkout_session_id: session.id,
        pending_payment_metadata: {
          provider: 'stripe',
          plan_id: plan.id,
          coupon_code: coupon || '',
          checkout_status: 'session_created',
          checkout_session_id: session.id,
          trial_days: couponTrialDays || 0,
          requires_payment_method_collection: couponTrialDays > 0,
          stripe_customer_id: customerId,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', authData.user.id)

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

