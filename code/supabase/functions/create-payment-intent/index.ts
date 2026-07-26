import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@14.10.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders } from '../_shared/cors.ts'

async function resolveVendorCardDestination(supabase: ReturnType<typeof createClient>, invoice: any) {
  if (!invoice?.vendor_id) throw new Error('Invoice is missing vendor routing information.')

  const { data: vendorApproval, error: vendorApprovalError } = await supabase
    .from('vendors')
    .select('approval_status, deleted_at')
    .eq('id', invoice.vendor_id)
    .maybeSingle()

  if (vendorApprovalError || !vendorApproval || vendorApproval.deleted_at || vendorApproval.approval_status !== 'approved') {
    throw new Error('Vendor is not approved for payment.')
  }

  const { data: bankAccounts, error: bankError } = await supabase
    .from('bank_accounts')
    .select('id')
    .eq('owner_type', 'vendor')
    .eq('owner_id', invoice.vendor_id)
    .eq('purpose', 'vendor_receiving')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('default_for_owner', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(5)

  if (bankError) throw new Error('Unable to resolve vendor card payment destination.')

  const bankAccountIds = (bankAccounts || []).map((account: any) => account.id)
  if (bankAccountIds.length === 0) throw new Error('Vendor must complete payment setup before card payment.')

  const { data: links, error: linkError } = await supabase
    .from('bank_account_provider_links')
    .select('id, provider_owner_ref, payouts_enabled, requirements_due')
    .in('bank_account_id', bankAccountIds)
    .eq('provider', 'stripe_connect_custom')
    .eq('provider_use', 'payout')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (linkError) throw new Error('Unable to resolve vendor card payment destination.')
  const link = links?.[0]
  if (!link?.provider_owner_ref) throw new Error('Vendor is missing an active payment destination.')
  if (link.payouts_enabled !== true) {
    const requirements = Array.isArray(link.requirements_due?.currently_due) && link.requirements_due.currently_due.length > 0
      ? ` Missing: ${link.requirements_due.currently_due.join(', ')}`
      : ''
    throw new Error(`Vendor payment destination is not enabled yet.${requirements}`)
  }

  return link.provider_owner_ref
}
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 })
    }

    const { amount, currency = 'usd', metadata = {} } = await req.json()
    const invoiceId = metadata?.invoice_id

    if (!amount) {
      return new Response(JSON.stringify({ error: 'Missing amount' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }
    if (!invoiceId) {
      return new Response(JSON.stringify({ error: 'invoice_id is required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, organization_id, invoice_number, vendor_id, vendor_name, total_amount, paid_amount, payment_status, status')
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice) {
      return new Response(JSON.stringify({ error: 'Invoice not found or not accessible' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 })
    }

    if (invoice.payment_status === 'paid' || invoice.status === 'paid') {
      return new Response(JSON.stringify({ error: 'Invoice is already paid' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 })
    }

    const requestedAmount = Math.round(Number(amount))
    const invoiceAmount = Math.round(Number(invoice.total_amount || 0) * 100)
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid amount' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }
    if (Math.abs(requestedAmount - invoiceAmount) > 1) {
      return new Response(JSON.stringify({ error: 'Payment amount does not match invoice total' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    const intentMetadata = {
      ...metadata,
      invoice_id: invoice.id,
      organization_id: invoice.organization_id,
      invoice_number: invoice.invoice_number || '',
      vendor_id: invoice.vendor_id || '',
      vendor_name: invoice.vendor_name || '',
    }

    const paymentIntentParams: any = {
      amount: requestedAmount,
      currency,
      metadata: intentMetadata,
    }

    if (metadata?.payout_method === 'stripe_card') {
      const connectedAccountId = await resolveVendorCardDestination(adminSupabase, invoice)
      paymentIntentParams.payment_method_types = ['card']
      paymentIntentParams.transfer_data = { destination: connectedAccountId }
      paymentIntentParams.description = `Card payment for Invoice ${invoice.invoice_number || invoice.id}`
      paymentIntentParams.transfer_group = `invoice_${invoice.id}`
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams)

    return new Response(JSON.stringify({ clientSecret: paymentIntent.client_secret }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})

