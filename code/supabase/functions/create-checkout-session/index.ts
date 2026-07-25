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

const appBaseUrl = (Deno.env.get('APP_BASE_URL') || Deno.env.get('VITE_APP_BASE_URL') || Deno.env.get('VITE_APP_URL') || '').trim().replace(/\/$/, '')
const appEnvironment = (Deno.env.get('APP_ENV') || Deno.env.get('ENVIRONMENT') || '').toLowerCase()
const isProduction = ['production', 'prod'].includes(appEnvironment)

function resolveCheckoutUrl(value: unknown, fallbackPath: string) {
  if (!appBaseUrl) {
    if (isProduction) throw new Error('APP_BASE_URL is required for production Stripe checkout redirects')
    return fallbackPath
  }

  const base = new URL(appBaseUrl)
  const fallback = new URL(fallbackPath, base)
  if (!value || typeof value !== 'string') return fallback.toString()

  const candidate = new URL(value, base)
  if (candidate.origin !== base.origin) {
    throw new Error('Checkout redirect URL must match the configured app origin')
  }

  return candidate.toString()
}

async function ensureStripeCustomer(adminClient: ReturnType<typeof createClient>, profile: any, authUser: any, tenantId: string | null, organizationId: string | null) {
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
      email: profile.email || authUser.email || undefined,
      name: org?.name || profile.email || authUser.email || 'RestOps tenant',
      metadata: {
        tenant_id: tenantId || '',
        organization_id: organizationId || '',
        user_id: authUser.id,
      },
    })
    customerId = customer.id
    if (organizationId) {
      await adminClient.from('organizations').update({ stripe_customer_id: customerId }).eq('id', organizationId)
    }
  }

  return { customerId, org }
}

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
      location_count,
      paymentMethod = 'card',
      paymentMethodId = null,
      bankAccount = null,
    } = await req.json()

    const selectedPlanId = planId || plan_id
    const selectedPaymentMethod = String(paymentMethod || 'card').toLowerCase()
    if (!['card', 'ach'].includes(selectedPaymentMethod)) throw new Error('Payment method must be card or ach')
    if (!selectedPlanId) throw new Error('Missing plan ID')

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('id, email, full_name, tenant_id, organization_id, payment_verified, payment_method_type, business_verification_status')
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

    let resolvedPriceId = priceId || plan.stripe_price_id
    let billingLocationCount = Math.max(1, Math.floor(Number(location_count || 0)))
    if (organizationId) {
      const { count: persistedLocationCount, error: locationCountError } = await adminClient
        .from('locations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)

      if (locationCountError) throw locationCountError
      billingLocationCount = Math.max(1, persistedLocationCount || billingLocationCount)
    }
    const unitAmountCents = Math.round(Number(plan.price_monthly) * 100)
    const monthlyAmountCents = unitAmountCents * billingLocationCount

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
            billing_model: 'per_location',
            location_count: billingLocationCount,
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

    if (Number(plan.price_monthly) > 0 && !resolvedPriceId) {
      const price = await stripe.prices.create({
        unit_amount: unitAmountCents,
        currency: 'usd',
        recurring: { interval: 'month' },
        product_data: {
          name: `${plan.name || `RestOps ${plan.id}`} - per location`,
          metadata: { plan_id: plan.id, billing_model: 'per_location' },
        },
        metadata: { plan_id: plan.id, billing_model: 'per_location' },
      })
      resolvedPriceId = price.id
      await adminClient.from('plans').update({ stripe_price_id: resolvedPriceId }).eq('id', plan.id)
    }
    if (selectedPaymentMethod === 'ach') {
      const account = bankAccount && typeof bankAccount === 'object' ? bankAccount as Record<string, unknown> : {}
      const routingNumber = String(account.routingNumber || '').replace(/\D/g, '')
      const accountNumber = String(account.accountNumber || '').replace(/\D/g, '')
      const bankAccountType = String(account.accountType || 'checking').toLowerCase()
      const bankName = String(account.bankName || 'Tenant bank account').trim()
      const holderName = String(account.accountHolderName || profile.full_name || profile.email || authData.user.email || 'RestOps Tenant').trim()
      const billingAddress = (account.billingAddress && typeof account.billingAddress === 'object' ? account.billingAddress : {}) as Record<string, unknown>
      const billingLine1 = String(billingAddress.line1 || '').trim()
      const billingCity = String(billingAddress.city || '').trim()
      const billingState = String(billingAddress.state || '').trim()
      const billingPostalCode = String(billingAddress.postalCode || '').trim()

      if (!/^\d{9}$/.test(routingNumber)) throw new Error('A valid 9-digit routing number is required for ACH setup')
      if (!/^\d{4,17}$/.test(accountNumber)) throw new Error('A valid bank account number is required for ACH setup')
      if (!['checking', 'savings'].includes(bankAccountType)) throw new Error('Bank account type must be checking or savings')
      if (!billingLine1 || !billingCity || !billingState || !billingPostalCode) throw new Error('A complete billing address is required for ACH setup')
      if (!resolvedPriceId) throw new Error('Stripe price is required before ACH subscription setup')

      const { customerId } = await ensureStripeCustomer(adminClient, profile, authData.user, tenantId, organizationId)
      const paymentMethod = await stripe.paymentMethods.create({
        type: 'us_bank_account',
        billing_details: {
          name: holderName,
          email: profile.email || authData.user.email || undefined,
          address: {
            line1: billingLine1,
            line2: String(billingAddress.line2 || '').trim() || undefined,
            city: billingCity,
            state: billingState,
            postal_code: billingPostalCode,
            country: 'US',
          },
        },
        us_bank_account: {
          routing_number: routingNumber,
          account_number: accountNumber,
          account_holder_type: 'company',
          account_type: bankAccountType as 'checking' | 'savings',
        },
        metadata: {
          tenant_id: tenantId || '',
          organization_id: organizationId || '',
          user_id: authData.user.id,
          plan_id: plan.id,
          provider: 'stripe_ach_debit',
        },
      })
      await stripe.paymentMethods.attach(paymentMethod.id, { customer: customerId })
      await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethod.id } })

      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: resolvedPriceId, quantity: billingLocationCount }],
        default_payment_method: paymentMethod.id,
        payment_settings: { payment_method_types: ['us_bank_account'] },
        ...(couponTrialDays > 0 ? { trial_period_days: couponTrialDays } : {}),
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          tenant_id: tenantId || '',
          organization_id: organizationId || '',
          user_id: authData.user.id,
          plan_id: plan.id,
          billing_model: 'per_location',
          location_count: String(billingLocationCount),
          coupon_code: coupon || '',
          trial_days: String(couponTrialDays || 0),
          payment_method_type: 'stripe_ach_debit',
        },
      })

      const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null
      const paymentIntent = (latestInvoice?.payment_intent ?? null) as Stripe.PaymentIntent | null
      const verified = paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'processing' || ['trialing', 'active'].includes(subscription.status)

      await adminClient
        .from('profiles')
        .update({
          payment_verified: verified,
          payment_method_type: 'ach',
          pending_onboarding_plan_id: plan.id,
          pending_stripe_customer_id: customerId,
          pending_stripe_subscription_id: subscription.id,
          pending_payment_metadata: {
            provider: 'stripe_ach_debit',
            plan_id: plan.id,
            billing_model: 'per_location',
            unit_amount_cents: unitAmountCents,
            location_count: billingLocationCount,
            monthly_amount_cents: monthlyAmountCents,
            coupon_code: coupon || '',
            trial_days: couponTrialDays || 0,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscription.id,
            stripe_payment_method_id: paymentMethod.id,
            stripe_payment_intent_id: paymentIntent?.id || null,
            stripe_payment_status: paymentIntent?.status || subscription.status,
            bank_name: bankName,
            account_type: bankAccountType,
            account_last4: accountNumber.slice(-4),
            billing_address: { line1: billingLine1, line2: String(billingAddress.line2 || '').trim(), city: billingCity, state: billingState, postal_code: billingPostalCode, country: 'US' },
            completed_at: verified ? new Date().toISOString() : null,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', authData.user.id)

      return new Response(JSON.stringify({ success: true, url: successUrl || '/onboarding?checkout=ach', ach: true, stripeAch: true, subscriptionId: subscription.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }
    const { customerId } = await ensureStripeCustomer(adminClient, profile, authData.user, tenantId, organizationId)

    if (!paymentMethodId) {
      // No inline card token was sent -- this is a caller that still expects the old
      // redirect-based Stripe Checkout page (e.g. the post-onboarding Billing plan-upgrade
      // page, which hasn't been wired to inline Stripe Elements). Keep that path working.
      await adminClient
        .from('profiles')
        .update({
          pending_onboarding_plan_id: plan.id,
          pending_stripe_customer_id: customerId,
          payment_method_type: 'stripe_subscription',
          pending_payment_metadata: {
            provider: 'stripe',
            plan_id: plan.id,
            billing_model: 'per_location',
            unit_amount_cents: unitAmountCents,
            location_count: billingLocationCount,
            monthly_amount_cents: monthlyAmountCents,
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
        payment_method_types: ['card'],
        line_items: [{ price: resolvedPriceId, quantity: billingLocationCount }],
        success_url: resolveCheckoutUrl(successUrl, '/onboarding?checkout=success'),
        cancel_url: resolveCheckoutUrl(cancelUrl, '/onboarding'),
        metadata: {
          tenant_id: tenantId || '',
          organization_id: organizationId || '',
          user_id: authData.user.id,
          plan_id: plan.id,
          billing_model: 'per_location',
          location_count: String(billingLocationCount),
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
            billing_model: 'per_location',
            location_count: String(billingLocationCount),
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
            billing_model: 'per_location',
            unit_amount_cents: unitAmountCents,
            location_count: billingLocationCount,
            monthly_amount_cents: monthlyAmountCents,
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
    }

    // Inline card details (Stripe Elements, client-side tokenized into paymentMethodId, so the
    // raw card number never reaches this server). Attach it to the customer and create the
    // subscription directly -- no redirect.
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId })
    await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } })

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: resolvedPriceId, quantity: billingLocationCount }],
      default_payment_method: paymentMethodId,
      ...(couponTrialDays > 0 ? { trial_period_days: couponTrialDays } : {}),
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        tenant_id: tenantId || '',
        organization_id: organizationId || '',
        user_id: authData.user.id,
        plan_id: plan.id,
        billing_model: 'per_location',
        location_count: String(billingLocationCount),
        coupon_code: coupon || '',
        trial_days: String(couponTrialDays || 0),
      },
    })

    const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null
    const paymentIntent = (latestInvoice?.payment_intent ?? null) as Stripe.PaymentIntent | null
    const requiresAction = paymentIntent?.status === 'requires_action'
    const succeeded = !requiresAction && (paymentIntent?.status === 'succeeded' || paymentIntent == null || ['trialing', 'active'].includes(subscription.status))

    await adminClient
      .from('profiles')
      .update({
        payment_verified: succeeded,
        payment_method_type: 'stripe_subscription',
        pending_onboarding_plan_id: plan.id,
        pending_stripe_customer_id: customerId,
        pending_stripe_subscription_id: subscription.id,
        pending_payment_metadata: {
          provider: 'stripe',
          plan_id: plan.id,
          billing_model: 'per_location',
          unit_amount_cents: unitAmountCents,
          location_count: billingLocationCount,
          monthly_amount_cents: monthlyAmountCents,
          coupon_code: coupon || '',
          checkout_status: requiresAction ? 'requires_action' : 'subscription_created',
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
          trial_days: couponTrialDays || 0,
          completed_at: succeeded ? new Date().toISOString() : null,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', authData.user.id)

    return new Response(JSON.stringify({
      success: true,
      card: true,
      requiresAction,
      clientSecret: requiresAction ? paymentIntent?.client_secret : null,
      subscriptionId: subscription.id,
    }), {
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
