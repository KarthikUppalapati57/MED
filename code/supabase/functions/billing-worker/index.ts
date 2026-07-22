// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

function organizationIdFrom(record: Record<string, unknown> | null | undefined) {
  return record?.organization_id || record?.id || null
}

function subscriptionStatusFrom(status: string | null | undefined) {
  if (!status) return 'unknown'
  if (status === 'canceled') return 'cancelled'
  return status
}

async function notifyOrgManagers(
  supabaseClient: ReturnType<typeof createClient>,
  organizationId: string,
  payload: { type: string; title: string; message: string; metadata?: Record<string, unknown> },
) {
  const { data: recipients, error } = await supabaseClient
    .from('profiles')
    .select('id')
    .eq('organization_id', organizationId)
    .in('role', ['org_manager', 'tenant_super_admin'])
    .is('deleted_at', null)

  if (error) throw error
  if (!recipients?.length) return 0

  const rows = recipients.map((recipient) => ({
    user_id: recipient.id,
    organization_id: organizationId,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    is_read: false,
    metadata: payload.metadata || {},
  }))

  const { error: insertError } = await supabaseClient.from('notifications').insert(rows)
  if (insertError) throw insertError
  return rows.length
}

async function syncSubscriptionToOrganization(
  supabaseClient: ReturnType<typeof createClient>,
  record: Record<string, unknown>,
) {
  const organizationId = record.organization_id
  if (!organizationId) return { skipped: true, reason: 'missing organization id' }

  const status = subscriptionStatusFrom(String(record.status || 'active'))
  const planTier = String(record.plan_tier || 'starter')
  const active = ['active', 'trialing'].includes(status)
  const now = new Date().toISOString()

  const { error: orgError } = await supabaseClient
    .from('organizations')
    .update({
      subscription_status: status,
      subscription_plan: planTier,
      plan_id: planTier,
      stripe_customer_id: record.stripe_customer_id || null,
      stripe_subscription_id: record.stripe_subscription_id || null,
      updated_at: now,
    })
    .eq('id', organizationId)

  if (orgError) throw orgError

  if (!active) {
    const notified = await notifyOrgManagers(supabaseClient, String(organizationId), {
      type: 'billing',
      title: status === 'past_due' ? 'Subscription payment past due' : 'Subscription status changed',
      message: `Your subscription is now ${status}. Please review billing settings.`,
      metadata: { status, plan_tier: planTier, subscription_id: record.id || null },
    })
    return { organization_id: organizationId, status, plan_tier: planTier, notified }
  }

  return { organization_id: organizationId, status, plan_tier: planTier, notified: 0 }
}

async function syncOrganizationToSubscription(
  supabaseClient: ReturnType<typeof createClient>,
  record: Record<string, unknown>,
) {
  const organizationId = record.id
  if (!organizationId) return { skipped: true, reason: 'missing organization id' }

  const { error } = await supabaseClient
    .from('subscriptions')
    .upsert({
      organization_id: organizationId,
      stripe_customer_id: record.stripe_customer_id || null,
      stripe_subscription_id: record.stripe_subscription_id || null,
      plan_tier: record.plan_id || record.subscription_plan || 'starter',
      status: subscriptionStatusFrom(String(record.subscription_status || 'active')),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id' })

  if (error) throw error
  return { organization_id: organizationId, mirrored: 'subscriptions' }
}

async function handleFailedPayment(
  supabaseClient: ReturnType<typeof createClient>,
  record: Record<string, unknown>,
) {
  const organizationId = String(record.organization_id || '')
  if (!organizationId) return { skipped: true, reason: 'missing organization_id' }

  const notified = await notifyOrgManagers(supabaseClient, organizationId, {
    type: 'billing',
    title: 'Payment failed',
    message: `A payment for ${record.vendor_name || 'a vendor'} failed. Review the payment and retry when ready.`,
    metadata: {
      payment_id: record.id || null,
      invoice_id: record.invoice_id || null,
      amount: record.amount || null,
      failure_reason: record.failure_reason || null,
    },
  })

  return { organization_id: organizationId, payment_id: record.id || null, notified }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const payload = await req.json()
    const { type, table, record, old_record } = payload
    const results: Record<string, unknown>[] = []

    if (table === 'subscriptions' && record && (type === 'INSERT' || type === 'UPDATE')) {
      if (type === 'INSERT' || record.status !== old_record?.status || record.plan_tier !== old_record?.plan_tier) {
        results.push(await syncSubscriptionToOrganization(supabaseClient, record))
      }
    }

    if (table === 'organizations' && record && (type === 'INSERT' || type === 'UPDATE')) {
      if (type === 'INSERT' || record.subscription_status !== old_record?.subscription_status || record.plan_id !== old_record?.plan_id || record.subscription_plan !== old_record?.subscription_plan) {
        results.push(await syncOrganizationToSubscription(supabaseClient, record))
      }
    }

    if (table === 'payments' && type === 'UPDATE' && record?.status === 'failed' && old_record?.status !== 'failed') {
      results.push(await handleFailedPayment(supabaseClient, record))
    }

    return jsonResponse({ success: true, processed: results.length > 0, results })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error in billing-worker:', message)
    return jsonResponse({ error: message }, 500)
  }
})