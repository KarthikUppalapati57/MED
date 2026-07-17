import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import Stripe from 'https://esm.sh/stripe@14.17.0?target=deno'
import { corsHeaders } from '../_shared/cors.ts'

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const dwollaKey = Deno.env.get('DWOLLA_KEY') ?? ''
const dwollaSecret = Deno.env.get('DWOLLA_SECRET') ?? ''
const dwollaEnvironment = (Deno.env.get('DWOLLA_ENVIRONMENT') ?? 'sandbox').toLowerCase()
const dwollaBaseUrl = dwollaEnvironment === 'production' ? 'https://api.dwolla.com' : 'https://api-sandbox.dwolla.com'
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })
  : null

async function getDwollaAccessToken() {
  if (!dwollaKey || !dwollaSecret) {
    throw new Error('Dwolla is not configured. Bank ACH setup requires DWOLLA_KEY and DWOLLA_SECRET.')
  }

  const credentials = btoa(`${dwollaKey}:${dwollaSecret}`)
  const response = await fetch(`${dwollaBaseUrl}/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/vnd.dwolla.v1.hal+json',
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Dwolla authentication failed: ${body || response.statusText}`)
  }

  const data = await response.json()
  return data.access_token
}

async function createDwollaResource(path: string, payload: Record<string, unknown>, accessToken: string) {
  const response = await fetch(`${dwollaBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/vnd.dwolla.v1.hal+json',
      Accept: 'application/vnd.dwolla.v1.hal+json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Dwolla request failed: ${body || response.statusText}`)
  }

  return response.headers.get('location')
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
      paymentMethod = 'card',
      paymentMethodId = null,
      bankAccount = null,
    } = await req.json()

    const selectedPlanId = planId || plan_id
    const selectedPaymentMethod = String(paymentMethod || 'card').toLowerCase()
    if (!['card', 'ach', 'check'].includes(selectedPaymentMethod)) throw new Error('Payment method must be card, ach, or check')
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

    if (selectedPaymentMethod === 'check') {
      // A mailed paper check can't be verified electronically at checkout time. Record the
      // tenant's intent and hold payment_verified = false until a platform admin confirms the
      // check actually arrived via confirm_check_payment_received().
      await adminClient
        .from('profiles')
        .update({
          payment_method_type: 'check',
          pending_onboarding_plan_id: plan.id,
          pending_payment_metadata: {
            provider: 'check',
            plan_id: plan.id,
            coupon_code: coupon || '',
            status: 'awaiting_check',
            requested_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', authData.user.id)

      const { data: admins } = await adminClient.from('profiles').select('id').eq('role', 'platform_admin')
      if (admins?.length) {
        await adminClient.from('notifications').insert(
          admins.map((admin: { id: string }) => ({
            user_id: admin.id,
            organization_id: organizationId,
            type: 'system',
            title: 'Check payment pending',
            message: `${profile.full_name || profile.email || 'A tenant'} chose to pay by check for the ${plan.name} plan and is awaiting confirmation.`,
            is_read: false,
          }))
        )
      }

      return new Response(JSON.stringify({ success: true, url: successUrl || '/onboarding?checkout=check', check: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
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

      const [firstName, ...lastNameParts] = holderName.split(/\s+/)
      const lastName = lastNameParts.join(' ') || 'Tenant'
      const accessToken = await getDwollaAccessToken()
      const customerUrl = await createDwollaResource('/customers', {
        firstName: firstName || 'RestOps',
        lastName,
        email: profile.email || authData.user.email,
        type: 'unverified',
        businessName: holderName,
        address1: billingLine1,
        address2: String(billingAddress.line2 || '').trim() || undefined,
        city: billingCity,
        state: billingState,
        postalCode: billingPostalCode,
      }, accessToken)

      if (!customerUrl) throw new Error('Dwolla customer creation did not return a resource URL')
      const fundingSourcePath = customerUrl.replace(dwollaBaseUrl, '') + '/funding-sources'
      const fundingSourceUrl = await createDwollaResource(fundingSourcePath, {
        routingNumber,
        accountNumber,
        bankAccountType,
        name: bankName,
      }, accessToken)

      if (!fundingSourceUrl) throw new Error('Dwolla funding source creation did not return a resource URL')

      await adminClient
        .from('profiles')
        .update({
          payment_verified: true,
          payment_method_type: 'ach',
          pending_onboarding_plan_id: plan.id,
          pending_payment_metadata: {
            provider: 'dwolla',
            plan_id: plan.id,
            coupon_code: coupon || '',
            trial_days: couponTrialDays || 0,
            dwolla_customer_url: customerUrl,
            dwolla_funding_source_url: fundingSourceUrl,
            bank_name: bankName,
            account_type: bankAccountType,
            account_last4: accountNumber.slice(-4),
            billing_address: { line1: billingLine1, line2: String(billingAddress.line2 || '').trim(), city: billingCity, state: billingState, postal_code: billingPostalCode, country: String(billingAddress.country || 'United States').trim() },
            completed_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', authData.user.id)

      return new Response(JSON.stringify({ success: true, url: successUrl || '/onboarding?checkout=ach', ach: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }
    if (!stripe) {
      throw new Error('Stripe is not configured. Payment method collection is required for paid and trial plans.')
    }

    if (Number(plan.price_monthly) > 0 && !resolvedPriceId) {
      const price = await stripe.prices.create({
        unit_amount: Math.round(Number(plan.price_monthly) * 100),
        currency: 'usd',
        recurring: { interval: 'month' },
        product_data: {
          name: plan.name || `RestOps ${plan.id}`,
          metadata: { plan_id: plan.id },
        },
        metadata: { plan_id: plan.id },
      })
      resolvedPriceId = price.id
      await adminClient.from('plans').update({ stripe_price_id: resolvedPriceId }).eq('id', plan.id)
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
    }

    // Inline card details (Stripe Elements, client-side tokenized into paymentMethodId, so the
    // raw card number never reaches this server). Attach it to the customer and create the
    // subscription directly -- no redirect.
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId })
    await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } })

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: resolvedPriceId }],
      default_payment_method: paymentMethodId,
      ...(couponTrialDays > 0 ? { trial_period_days: couponTrialDays } : {}),
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        tenant_id: tenantId || '',
        organization_id: organizationId || '',
        user_id: authData.user.id,
        plan_id: plan.id,
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

