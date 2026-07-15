import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders } from '../_shared/cors.ts'
import { Client } from 'npm:dwolla-v2'
import { notifyPaymentFailure } from '../_shared/notifyPaymentFailure.ts'

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

    const { invoice_id, payment_account_id } = await req.json()

    if (!invoice_id) {
      return new Response(JSON.stringify({ error: 'invoice_id is required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Preflight Dwolla routing before mutating invoice/payment state.
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, total_amount, paid_amount, vendor_id, payment_account_id')
      .eq('id', invoice_id)
      .single()

    if (invoiceError || !invoice?.vendor_id) {
      return new Response(JSON.stringify({ error: 'Invoice not found or missing vendor routing information.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 })
    }

    const finalPaymentAccountId = payment_account_id || invoice.payment_account_id
    if (!finalPaymentAccountId) {
      return new Response(JSON.stringify({ error: 'A payment account is required to release funds.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    const { data: paymentAccount, error: accountError } = await serviceSupabase
      .from('payment_accounts')
      .select('dwolla_funding_source_url')
      .eq('id', finalPaymentAccountId)
      .maybeSingle()

    if (accountError) {
      console.error('Payment account lookup error:', accountError)
      return new Response(JSON.stringify({ error: 'Unable to resolve Dwolla source funding information.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
    }

    if (!paymentAccount?.dwolla_funding_source_url) {
      return new Response(JSON.stringify({ error: 'Missing Dwolla source funding information.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    const { data: dwollaLink, error: linkError } = await serviceSupabase
      .rpc('get_vendor_provider_link', {
        p_vendor_id: invoice.vendor_id,
        p_provider: 'dwolla'
      })
      .maybeSingle()

    if (linkError) {
      console.error('Dwolla provider link lookup error:', linkError)
      return new Response(JSON.stringify({ error: 'Unable to resolve Dwolla vendor routing information.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
    }

    // ponytail: fail closed before release_invoice_funds mutates payment state.
    if (!dwollaLink?.provider_funding_ref) {
       return new Response(JSON.stringify({ error: 'Missing Dwolla vendor funding source. Vendor must submit bank details first.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    // 'unverified' funding sources can still receive real transfers at Dwolla's own
    // (lower) transaction limits -- Dwolla's API enforces that ceiling itself, we don't
    // need to duplicate it here. Only block statuses that mean the link is unusable.
    if (dwollaLink.provider_status === 'suspended') {
       return new Response(JSON.stringify({ error: 'Vendor Dwolla account is suspended.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    // 1. Call the secure RPC to release funds. This enforces RBAC (Location Manager / Org Manager).
    const { data: releaseData, error: releaseError } = await supabase.rpc('release_invoice_funds', {
      p_invoice_id: invoice_id,
      p_payment_account_id: payment_account_id || null
    })

    if (releaseError) {
      console.error('RPC Error:', releaseError)
      return new Response(JSON.stringify({ error: releaseError.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 })
    }

    const transferAmount = (invoice.total_amount || 0) - (invoice.paid_amount || 0);

    // release_invoice_funds already flipped invoice.status -> scheduled and
    // payment_status -> processing, and inserted a 'processing' payments row. If the Dwolla
    // call below fails, that state is stuck and unretryable unless we revert it here.
    const revertOnFailure = async (reason) => {
      await serviceSupabase
        .from('payments')
        .update({ status: 'failed', payout_status: 'failed', failure_reason: reason })
        .eq('id', releaseData.payment_id)
        .eq('organization_id', releaseData.organization_id)
      await serviceSupabase
        .from('invoices')
        .update({ payment_status: 'unpaid' })
        .eq('id', invoice_id)
    }

    try {
      // 2. Initiate Dwolla Transfer
      const dwollaClient = new Client({
        key: Deno.env.get('DWOLLA_KEY') ?? '',
        secret: Deno.env.get('DWOLLA_SECRET') ?? '',
        environment: 'sandbox' // Change to 'production' for live
      });

      const requestBody = {
        _links: {
          source: { href: paymentAccount.dwolla_funding_source_url },
          destination: { href: dwollaLink.provider_funding_ref }
        },
        amount: { currency: "USD", value: transferAmount.toFixed(2) },
        metadata: { invoiceId: invoice_id }
      };

      const transferResponse = await dwollaClient.post('transfers', requestBody);
      const transferUrl = transferResponse.headers.get('location');

      // 3. Update the payment record with the Dwolla transfer URL
      // We use a service role client to bypass RLS for this internal system update
      await serviceSupabase
        .from('payments')
        .update({ dwolla_transfer_url: transferUrl })
        .eq('id', releaseData.payment_id)
        .eq('organization_id', releaseData.organization_id)

      return new Response(JSON.stringify({ success: true, transferUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    } catch (transferError) {
      console.error('Dwolla transfer failed, reverting:', transferError)
      const reason = transferError.message || 'Dwolla transfer failed'
      await revertOnFailure(reason)
      await notifyPaymentFailure(serviceSupabase, { paymentId: releaseData.payment_id, invoiceId: invoice_id, reason })
      return new Response(JSON.stringify({ error: reason }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 502,
      })
    }
  } catch (error) {
    console.error('process-payout error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
