import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders } from '../_shared/cors.ts'
import { getPaymentProviderAdapter, installedPaymentProviderAdapters } from '../_shared/paymentProviders/registry.ts'
import { prepareBankPayloadForProvider, providerForUse, resolvePaymentProviderConfig } from '../_shared/paymentProviders/bankDataRouter.ts'
import { runProviderComplianceGate } from '../_shared/paymentProviders/complianceGate.ts'

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function cents(amount: unknown) {
  return Math.round(Number(amount || 0) * 100)
}

function dollars(amountCents: number) {
  return Number((amountCents / 100).toFixed(2))
}

async function fingerprintHash(routingNumber: string, accountNumber: string) {
  const normalized = `${routingNumber.replace(/\D/g, '')}:${accountNumber.replace(/\D/g, '')}`
  const bytes = new TextEncoder().encode(normalized)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function authUser(req: Request, anonSupabase: ReturnType<typeof createClient>) {
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) throw new Error('Unauthorized')
  const { data, error } = await anonSupabase.auth.getUser(token)
  if (error || !data?.user?.id) throw new Error('Unauthorized')
  return data.user
}

async function profileFor(serviceSupabase: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await serviceSupabase
    .from('profiles')
    .select('id, role, tenant_id, organization_id, brand_id, location_id, full_name')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('User profile not found')
  return data
}

function scopeFromPayload(payload: Record<string, unknown>, profile: Record<string, unknown>) {
  const scope = {
    tenant_id: (payload.tenant_id as string) || (profile.tenant_id as string) || null,
    organization_id: (payload.organization_id as string) || (profile.organization_id as string) || null,
    brand_id: (payload.brand_id as string) || (profile.brand_id as string) || null,
    location_id: (payload.location_id as string) || (profile.location_id as string) || null,
  }

  if (profile.role !== 'platform_admin' && profile.organization_id && scope.organization_id !== profile.organization_id) {
    throw new Error('Requested payment setup scope is outside your organization')
  }

  return scope
}

function estimateFee(flow: string, amountCents: number, feePaidBy: string) {
  const base = Math.max(0, amountCents)
  const achFee = Math.min(Math.round(base * 0.008), 500)
  const payoutFee = flow === 'client_to_vendor' ? Math.round(base * 0.0025) + 25 : 0
  const providerFee = achFee + payoutFee
  return {
    base_amount_cents: base,
    provider_fee_cents: providerFee,
    platform_markup_cents: 0,
    total_fee_cents: providerFee,
    total_debit_cents: feePaidBy === 'client' ? base + providerFee : base,
    platform_absorbed_cents: feePaidBy === 'platform' ? providerFee : 0,
    formula: flow === 'client_to_vendor'
      ? 'ACH debit 0.8% capped at $5 + Connect payout 0.25% + $0.25'
      : 'ACH debit 0.8% capped at $5',
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const anonSupabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } },
  )
  const serviceSupabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  try {
    const user = await authUser(req, anonSupabase)
    const profile = await profileFor(serviceSupabase, user.id)
    const { action, payload = {} } = await req.json()

    if (action === 'list') {
      const scope = scopeFromPayload(payload, profile)
      let bankQuery = serviceSupabase
        .from('bank_accounts')
        .select('*, bank_account_provider_links(*)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (scope.organization_id) bankQuery = bankQuery.eq('organization_id', scope.organization_id)
      if (scope.brand_id) bankQuery = bankQuery.eq('brand_id', scope.brand_id)
      if (scope.location_id) bankQuery = bankQuery.eq('location_id', scope.location_id)

      const { data: bankAccounts, error: bankError } = await bankQuery
      if (bankError) throw bankError

      const { data: providerConfig, error: configError } = await serviceSupabase.rpc('resolve_payment_provider_config', {
        p_tenant_id: scope.tenant_id,
        p_organization_id: scope.organization_id,
        p_brand_id: scope.brand_id,
        p_location_id: scope.location_id,
      })
      if (configError) throw configError

      const { data: feePolicies, error: feeError } = await serviceSupabase
        .from('payment_fee_policies')
        .select('*')
        .is('deleted_at', null)
        .or(`organization_id.eq.${scope.organization_id},tenant_id.eq.${scope.tenant_id}`)
        .order('updated_at', { ascending: false })
      if (feeError) throw feeError

      const { data: feeCounters, error: counterError } = await serviceSupabase
        .from('payment_fee_counters')
        .select('*')
        .eq('organization_id', scope.organization_id)
        .order('month', { ascending: false })
        .limit(12)
      if (counterError) throw counterError

      return json({
        bank_accounts: bankAccounts || [],
        provider_config: providerConfig,
        fee_policies: feePolicies || [],
        fee_counters: feeCounters || [],
        installed_adapters: installedPaymentProviderAdapters(),
      })
    }

    if (action === 'create_bank_account') {
      const scope = scopeFromPayload(payload, profile)
      const routingNumber = String(payload.routing_number || '').replace(/\D/g, '')
      const accountNumber = String(payload.account_number || '').replace(/\D/g, '')
      if (!routingNumber.match(/^\d{9}$/)) return json({ error: 'A valid 9-digit routing number is required' }, 400)
      if (!accountNumber.match(/^\d{4,17}$/)) return json({ error: 'A valid bank account number is required' }, 400)

      const purpose = String(payload.purpose || 'vendor_funding')
      const ownerType = String(payload.owner_type || (purpose === 'vendor_receiving' ? 'vendor' : 'organization'))
      const ownerId = String(payload.owner_id || scope.location_id || scope.organization_id || user.id)
      const hash = await fingerprintHash(routingNumber, accountNumber)

      const { data: bankAccount, error: insertError } = await serviceSupabase
        .from('bank_accounts')
        .insert({
          ...scope,
          owner_type: ownerType,
          owner_id: ownerId,
          purpose,
          nickname: payload.nickname || null,
          account_holder_name: payload.account_holder_name || profile.full_name || null,
          bank_name: payload.bank_name || null,
          account_type: payload.account_type || 'checking',
          routing_last4: routingNumber.slice(-4),
          account_last4: accountNumber.slice(-4),
          fingerprint_hash: hash,
          default_for_owner: payload.default_for_owner !== false,
          verification_status: 'pending',
          created_by_user_id: user.id,
          created_by_role: profile.role,
          metadata: {
            source: payload.source || 'payment_setup',
            provider_neutral: true,
          },
        })
        .select('*')
        .single()
      if (insertError) throw insertError

      const { error: secretError } = await serviceSupabase.rpc('store_bank_account_secret', {
        p_bank_account_id: bankAccount.id,
        p_account_number: accountNumber,
        p_routing_number: routingNumber,
        p_fingerprint_hash: hash,
      })
      if (secretError) throw secretError

      return json({ success: true, bank_account: bankAccount })
    }

    if (action === 'set_default') {
      const { bank_account_id } = payload
      if (!bank_account_id) return json({ error: 'bank_account_id is required' }, 400)
      const { data, error } = await serviceSupabase
        .from('bank_accounts')
        .update({ default_for_owner: true })
        .eq('id', bank_account_id)
        .select('*')
        .single()
      if (error) throw error
      return json({ success: true, bank_account: data })
    }

    if (action === 'disable') {
      const { bank_account_id } = payload
      if (!bank_account_id) return json({ error: 'bank_account_id is required' }, 400)
      const { data, error } = await serviceSupabase
        .from('bank_accounts')
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .eq('id', bank_account_id)
        .select('*')
        .single()
      if (error) throw error
      return json({ success: true, bank_account: data })
    }

    if (action === 'save_provider_config') {
      const scope = scopeFromPayload(payload, profile)
      const row = {
        ...scope,
        collection_provider: payload.collection_provider || 'not_configured',
        payout_provider: payload.payout_provider || 'not_configured',
        check_provider: payload.check_provider || 'checkbook',
        enabled: payload.enabled !== false,
        settings: payload.settings || {},
        updated_by: user.id,
        created_by: user.id,
      }
      let existingQuery = serviceSupabase
        .from('payment_provider_configs')
        .select('id')
        .is('deleted_at', null)
      for (const key of ['tenant_id', 'organization_id', 'brand_id', 'location_id']) {
        const value = row[key as keyof typeof row]
        existingQuery = value ? existingQuery.eq(key, value) : existingQuery.is(key, null)
      }
      const { data: existing, error: existingError } = await existingQuery.maybeSingle()
      if (existingError) throw existingError

      const write = existing?.id
        ? serviceSupabase.from('payment_provider_configs').update(row).eq('id', existing.id)
        : serviceSupabase.from('payment_provider_configs').insert(row)
      const { data, error } = await write.select('*').single()
      if (error) throw error
      return json({ success: true, provider_config: data })
    }

    if (action === 'save_fee_policy') {
      if (profile.role !== 'platform_admin') return json({ error: 'Only platform admins can change convenience fee policy' }, 403)
      const scope = scopeFromPayload(payload, profile)
      const { data, error } = await serviceSupabase
        .from('payment_fee_policies')
        .insert({
          ...scope,
          fee_paid_by: payload.fee_paid_by || 'client',
          collection_fee_mode: payload.collection_fee_mode || 'pass_through',
          payout_fee_mode: payload.payout_fee_mode || 'pass_through',
          disclosure_text: payload.disclosure_text || null,
          contract_version: payload.contract_version || 'ach-fee-policy-v1',
          enabled: true,
          settings: payload.settings || {},
        })
        .select('*')
        .single()
      if (error) throw error
      return json({ success: true, fee_policy: data })
    }

    if (action === 'estimate_fee') {
      const flow = String(payload.flow || 'client_to_vendor')
      const amountCents = cents(payload.amount)
      const feePaidBy = String(payload.fee_paid_by || 'client')
      return json({ estimate: estimateFee(flow, amountCents, feePaidBy) })
    }

    if (action === 'link_provider') {
      const { bank_account_id, provider_use } = payload
      if (!bank_account_id || !provider_use) return json({ error: 'bank_account_id and provider_use are required' }, 400)

      const payloadForProvider = await prepareBankPayloadForProvider(serviceSupabase, String(bank_account_id))
      const config = await resolvePaymentProviderConfig(serviceSupabase, {
        tenantId: payloadForProvider.tenantId,
        organizationId: payloadForProvider.organizationId,
        brandId: payloadForProvider.brandId,
        locationId: payloadForProvider.locationId,
      })
      const provider = String(payload.provider || providerForUse(config, provider_use))
      const compliance = await runProviderComplianceGate(serviceSupabase, {
        provider,
        providerUse: provider_use,
        tenantId: payloadForProvider.tenantId,
        organizationId: payloadForProvider.organizationId,
        brandId: payloadForProvider.brandId,
        locationId: payloadForProvider.locationId,
        ownerType: payloadForProvider.ownerType,
        ownerId: payloadForProvider.ownerId,
      })

      if (!compliance.allowed && provider !== 'stripe_ach_debit') {
        return json({ error: 'Provider compliance gate blocked this account', missing: compliance.missing }, 409)
      }

      const adapter = getPaymentProviderAdapter(provider, provider_use)
      const result = await adapter.attachBankAccount(payloadForProvider)

      const providerLinkRow = {
        tenant_id: payloadForProvider.tenantId,
        organization_id: payloadForProvider.organizationId,
        brand_id: payloadForProvider.brandId,
        location_id: payloadForProvider.locationId,
        bank_account_id: bank_account_id,
        provider,
        provider_use,
        provider_owner_ref: result.providerOwnerRef || null,
        provider_bank_ref: result.providerBankRef || null,
        provider_mandate_ref: result.providerMandateRef || null,
        provider_status: result.providerStatus,
        requirements_due: result.requirementsDue || {},
        payouts_enabled: result.payoutsEnabled ?? null,
        charges_enabled: result.chargesEnabled ?? null,
        metadata: result.metadata || {},
        last_synced_at: new Date().toISOString(),
        is_active: true,
      }

      const { data: existingLink, error: existingLinkError } = await serviceSupabase
        .from('bank_account_provider_links')
        .select('id')
        .eq('bank_account_id', bank_account_id)
        .eq('provider', provider)
        .eq('provider_use', provider_use)
        .eq('is_active', true)
        .is('deleted_at', null)
        .maybeSingle()
      if (existingLinkError) throw existingLinkError

      const linkWrite = existingLink?.id
        ? serviceSupabase.from('bank_account_provider_links').update(providerLinkRow).eq('id', existingLink.id)
        : serviceSupabase.from('bank_account_provider_links').insert(providerLinkRow)
      const { data: link, error: linkError } = await linkWrite.select('*').single()
      if (linkError) throw linkError

      return json({ success: true, provider_link: link, adapter_result: result, compliance })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (error) {
    console.error('payment-bank-accounts error:', error)
    return json({ error: error.message || 'Unexpected payment bank account error' }, error.message === 'Unauthorized' ? 401 : 500)
  }
})




