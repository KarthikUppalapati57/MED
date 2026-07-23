import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders } from '../_shared/cors.ts'
import { getPaymentProviderAdapter } from '../_shared/paymentProviders/registry.ts'
import { prepareBankPayloadForProvider, providerForUse, resolvePaymentProviderConfig } from '../_shared/paymentProviders/bankDataRouter.ts'

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function cents(amount: unknown) {
  return Math.round(Number(amount || 0) * 100)
}

function estimateFee(flow: string, amountCents: number, feePaidBy: string) {
  const achFee = Math.min(Math.round(amountCents * 0.008), 500)
  const payoutFee = flow === 'client_to_vendor' ? Math.round(amountCents * 0.0025) + 25 : 0
  const providerFee = achFee + payoutFee
  return {
    baseAmountCents: amountCents,
    providerFeeCents: providerFee,
    totalFeeCents: providerFee,
    totalDebitCents: feePaidBy === 'client' ? amountCents + providerFee : amountCents,
    platformAbsorbedCents: feePaidBy === 'platform' ? providerFee : 0,
  }
}

async function defaultBankAccount(serviceSupabase: ReturnType<typeof createClient>, scope: any, purpose: string) {
  let query = serviceSupabase
    .from('bank_accounts')
    .select('id')
    .eq('purpose', purpose)
    .eq('default_for_owner', true)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (scope.organization_id) query = query.eq('organization_id', scope.organization_id)
  if (scope.brand_id) query = query.eq('brand_id', scope.brand_id)
  if (scope.location_id) query = query.eq('location_id', scope.location_id)

  const { data, error } = await query.maybeSingle()
  if (error) throw error
  if (!data?.id) throw new Error(`No default bank account configured for ${purpose}`)
  return data.id
}

async function activeFeePolicy(serviceSupabase: ReturnType<typeof createClient>, scope: any) {
  let query = serviceSupabase
    .from('payment_fee_policies')
    .select('*')
    .eq('enabled', true)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (scope.organization_id) query = query.eq('organization_id', scope.organization_id)

  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data || { fee_paid_by: 'client', id: null, contract_version: 'ach-fee-policy-v1' }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const anonSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const { data: userData, error: userError } = await anonSupabase.auth.getUser(token)
    if (userError || !userData?.user?.id) return json({ error: 'Unauthorized' }, 401)
    const { data: profile, error: profileError } = await serviceSupabase
      .from('profiles')
      .select('id, role, organization_id, tenant_id')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (profileError) throw profileError
    if (!profile) return json({ error: 'User profile not found' }, 404)

    const { action, payload = {} } = await req.json()
    const scope = {
      tenant_id: payload.tenant_id || null,
      organization_id: payload.organization_id || null,
      brand_id: payload.brand_id || null,
      location_id: payload.location_id || null,
    }
    if (!scope.organization_id) scope.organization_id = profile.organization_id || null
    if (!scope.tenant_id) scope.tenant_id = profile.tenant_id || null
    if (!scope.organization_id) return json({ error: 'organization_id is required' }, 400)
    if (profile.role !== 'platform_admin' && profile.organization_id && scope.organization_id !== profile.organization_id) {
      return json({ error: 'Requested payment scope is outside your organization' }, 403)
    }

    const flow = action === 'client_to_platform_debit' ? 'client_to_platform' : 'client_to_vendor'
    const amountCents = cents(payload.amount)
    if (amountCents <= 0) return json({ error: 'A positive amount is required' }, 400)

    const feePolicy = await activeFeePolicy(serviceSupabase, scope)
    const feePaidBy = payload.fee_paid_by || feePolicy.fee_paid_by || 'client'
    const estimate = estimateFee(flow, amountCents, feePaidBy)
    const config = await resolvePaymentProviderConfig(serviceSupabase, {
      tenantId: scope.tenant_id,
      organizationId: scope.organization_id,
      brandId: scope.brand_id,
      locationId: scope.location_id,
    })

    if (action === 'client_to_platform_debit') {
      const sourceBankAccountId = payload.source_bank_account_id || await defaultBankAccount(serviceSupabase, scope, 'platform_billing')
      const sourcePayload = await prepareBankPayloadForProvider(serviceSupabase, sourceBankAccountId)
      const provider = providerForUse(config, 'collection')
      const adapter = getPaymentProviderAdapter(provider, 'collection')
      const result = await adapter.createDebit?.({
        bankAccountId: sourceBankAccountId,
        baseAmountCents: estimate.baseAmountCents,
        feeAmountCents: estimate.totalFeeCents,
        currency: payload.currency || 'usd',
        invoiceId: payload.invoice_id || null,
        paymentId: payload.payment_id || null,
        metadata: payload.metadata || {},
      }, sourcePayload)

      await serviceSupabase.from('payment_fee_events').insert({
        ...scope,
        invoice_id: payload.invoice_id || null,
        payment_id: payload.payment_id || null,
        payer_type: 'client',
        fee_paid_by: feePaidBy,
        provider,
        provider_fee_type: 'ach_debit',
        base_amount: estimate.baseAmountCents / 100,
        provider_fee_amount: estimate.providerFeeCents / 100,
        total_debit_amount: estimate.totalDebitCents / 100,
        fee_policy_id: feePolicy.id || null,
        contract_version: feePolicy.contract_version || 'ach-fee-policy-v1',
        displayed_to_user_at: new Date().toISOString(),
        metadata: { flow, adapter_result: result || null },
      })

      return json({ success: true, flow, estimate, provider, adapter_result: result || null })
    }

    if (action === 'client_to_vendor_payment') {
      const sourceBankAccountId = payload.source_bank_account_id || await defaultBankAccount(serviceSupabase, scope, 'vendor_funding')
      const destinationBankAccountId = payload.destination_bank_account_id || await defaultBankAccount(serviceSupabase, scope, 'vendor_receiving')
      const sourcePayload = await prepareBankPayloadForProvider(serviceSupabase, sourceBankAccountId)
      const destinationPayload = await prepareBankPayloadForProvider(serviceSupabase, destinationBankAccountId)
      const collectionProvider = providerForUse(config, 'collection')
      const payoutProvider = providerForUse(config, 'payout')
      const collectionAdapter = getPaymentProviderAdapter(collectionProvider, 'collection')
      const payoutAdapter = getPaymentProviderAdapter(payoutProvider, 'payout')

      const debitResult = await collectionAdapter.createDebit?.({
        bankAccountId: sourceBankAccountId,
        baseAmountCents: estimate.baseAmountCents,
        feeAmountCents: feePaidBy === 'client' ? estimate.totalFeeCents : 0,
        currency: payload.currency || 'usd',
        invoiceId: payload.invoice_id || null,
        paymentId: payload.payment_id || null,
        metadata: payload.metadata || {},
      }, sourcePayload)

      const payoutResult = await payoutAdapter.createPayout?.({
        sourceBankAccountId,
        destinationBankAccountId,
        amountCents,
        currency: payload.currency || 'usd',
        invoiceId: payload.invoice_id || null,
        paymentId: payload.payment_id || null,
        metadata: payload.metadata || {},
      }, sourcePayload, destinationPayload)

      await serviceSupabase.from('payment_fee_events').insert({
        ...scope,
        invoice_id: payload.invoice_id || null,
        payment_id: payload.payment_id || null,
        payer_type: 'client',
        fee_paid_by: feePaidBy,
        provider: `${collectionProvider}+${payoutProvider}`,
        provider_fee_type: 'connect_payout',
        base_amount: estimate.baseAmountCents / 100,
        provider_fee_amount: estimate.providerFeeCents / 100,
        total_debit_amount: estimate.totalDebitCents / 100,
        fee_policy_id: feePolicy.id || null,
        contract_version: feePolicy.contract_version || 'ach-fee-policy-v1',
        displayed_to_user_at: new Date().toISOString(),
        metadata: { flow, debit_result: debitResult || null, payout_result: payoutResult || null },
      })

      return json({ success: true, flow, estimate, collection_provider: collectionProvider, payout_provider: payoutProvider, debit_result: debitResult || null, payout_result: payoutResult || null })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (error) {
    console.error('provider-neutral-payment-router error:', error)
    return json({ error: error.message || 'Unexpected payment router error' }, 500)
  }
})


