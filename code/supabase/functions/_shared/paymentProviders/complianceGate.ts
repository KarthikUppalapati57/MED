import type { ProviderUse } from './types.ts'

type SupabaseLike = {
  from: (table: string) => any
}

export interface ComplianceGateContext {
  provider: string
  providerUse: ProviderUse
  tenantId?: string | null
  organizationId?: string | null
  brandId?: string | null
  locationId?: string | null
  ownerType?: string | null
  ownerId?: string | null
}

export interface ComplianceGateResult {
  allowed: boolean
  missing: string[]
  profile: Record<string, unknown> | null
}

function bool(value: unknown) {
  return value === true
}

export async function runProviderComplianceGate(
  supabase: SupabaseLike,
  ctx: ComplianceGateContext,
): Promise<ComplianceGateResult> {
  const { data: profile, error } = await supabase
    .from('payment_provider_compliance_profiles')
    .select('*')
    .eq('provider', ctx.provider)
    .eq('provider_use', ctx.providerUse)
    .maybeSingle()

  if (error) throw error
  if (!profile) {
    return { allowed: false, missing: ['provider_compliance_profile'], profile: null }
  }

  const missing: string[] = []

  if (bool(profile.requires_terms_acceptance) && ctx.ownerType && ctx.ownerId) {
    const { data: acceptance, error: termsError } = await supabase
      .from('payment_terms_acceptances')
      .select('id')
      .eq('provider', ctx.provider)
      .eq('owner_type', ctx.ownerType)
      .eq('owner_id', ctx.ownerId)
      .limit(1)
      .maybeSingle()
    if (termsError) throw termsError
    if (!acceptance) missing.push('terms_acceptance')
  }

  if (bool(profile.requires_fraud_review) && ctx.ownerType && ctx.ownerId) {
    const { data: riskReview, error: riskError } = await supabase
      .from('provider_risk_reviews')
      .select('risk_status')
      .eq('provider', ctx.provider)
      .eq('owner_type', ctx.ownerType)
      .eq('owner_id', ctx.ownerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (riskError) throw riskError
    if (riskReview?.risk_status !== 'approved') missing.push('risk_review')
  }

  if (bool(profile.requires_requirements_remediation) && ctx.ownerType && ctx.ownerId) {
    const { data: requirements, error: reqError } = await supabase
      .from('provider_requirement_snapshots')
      .select('payouts_enabled, charges_enabled, disabled_reason, currently_due, past_due')
      .eq('provider', ctx.provider)
      .eq('owner_type', ctx.ownerType)
      .eq('owner_id', ctx.ownerId)
      .order('synced_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (reqError) throw reqError
    if (requirements?.disabled_reason) missing.push('provider_disabled')
    if (Array.isArray(requirements?.currently_due) && requirements.currently_due.length > 0) {
      missing.push('provider_currently_due')
    }
    if (Array.isArray(requirements?.past_due) && requirements.past_due.length > 0) {
      missing.push('provider_past_due')
    }
  }

  return { allowed: missing.length === 0, missing, profile }
}
