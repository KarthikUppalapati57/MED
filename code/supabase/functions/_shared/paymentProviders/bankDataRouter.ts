import type { ProviderBankPayload, ProviderConfig, ProviderUse } from './types.ts'

type SupabaseLike = {
  rpc: (name: string, args?: Record<string, unknown>) => any
  from: (table: string) => any
}

function normalizeConfig(data: any): ProviderConfig {
  return {
    tenant_id: data?.tenant_id ?? null,
    organization_id: data?.organization_id ?? null,
    brand_id: data?.brand_id ?? null,
    location_id: data?.location_id ?? null,
    collection_provider: data?.collection_provider || 'not_configured',
    payout_provider: data?.payout_provider || 'not_configured',
    check_provider: data?.check_provider || 'checkbook',
    enabled: data?.enabled === true,
    settings: data?.settings || {},
  }
}

export async function resolvePaymentProviderConfig(
  supabase: SupabaseLike,
  scope: {
    tenantId?: string | null
    organizationId?: string | null
    brandId?: string | null
    locationId?: string | null
  },
): Promise<ProviderConfig> {
  const { data, error } = await supabase.rpc('resolve_payment_provider_config', {
    p_tenant_id: scope.tenantId || null,
    p_organization_id: scope.organizationId || null,
    p_brand_id: scope.brandId || null,
    p_location_id: scope.locationId || null,
  })
  if (error) throw error
  return normalizeConfig(data)
}

export function providerForUse(config: ProviderConfig, providerUse: ProviderUse) {
  if (providerUse === 'collection') return config.collection_provider
  if (providerUse === 'payout') return config.payout_provider
  return config.check_provider
}

export async function prepareBankPayloadForProvider(
  supabase: SupabaseLike,
  bankAccountId: string,
): Promise<ProviderBankPayload> {
  const { data: row, error: rowError } = await supabase
    .from('bank_accounts')
    .select(`
      id,
      tenant_id,
      organization_id,
      brand_id,
      location_id,
      owner_type,
      owner_id,
      payment_account_id,
      account_holder_name,
      account_type,
      routing_last4,
      account_last4,
      verification_status,
      is_active,
      deleted_at
    `)
    .eq('id', bankAccountId)
    .maybeSingle()

  if (rowError) throw rowError
  if (!row || row.deleted_at || row.is_active !== true) {
    throw new Error('Bank account is not active')
  }

  const { data: secret, error: secretError } = await supabase.rpc('get_bank_account_secret_for_provider', {
    p_bank_account_id: bankAccountId,
  })
  if (secretError) throw secretError
  if (!secret?.routing_number || !secret?.account_number) {
    throw new Error('Bank account secret is incomplete')
  }

  return {
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    brandId: row.brand_id,
    locationId: row.location_id,
    paymentAccountId: row.payment_account_id,
    bankAccountId: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    accountHolderName: row.account_holder_name,
    accountType: row.account_type,
    routingNumber: String(secret.routing_number),
    accountNumber: String(secret.account_number),
    routingLast4: row.routing_last4,
    accountLast4: row.account_last4,
  }
}
