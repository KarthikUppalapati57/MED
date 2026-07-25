import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders } from '../_shared/cors.ts'
import { getPayoutProvider } from '../_shared/payoutProviders/index.ts'
import { revertPayoutOnFailure } from '../_shared/notifyPaymentFailure.ts'

// Single dispatcher for every payout rail. Which rail runs is a `payout_method` value
// (dwolla_ach / checkbook_digital / checkbook_physical), not a different function -- see
// _shared/payoutProviders/index.ts. Adding a rail means adding an adapter there, not touching
// this file or any caller.
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

    const { invoice_id, payout_method = 'dwolla_ach', payment_account_id } = await req.json()

    if (!invoice_id) {
      return new Response(JSON.stringify({ error: 'invoice_id is required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    let provider
    try {
      provider = getPayoutProvider(payout_method)
    } catch (methodError) {
      return new Response(JSON.stringify({ error: methodError.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
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

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select(`
        id, invoice_number, total_amount, paid_amount, vendor_id, payment_account_id,
        vendor:vendor_id ( name, email, phone, mailing_address_line1, mailing_city, mailing_state, mailing_zip_code )
      `)
      .eq('id', invoice_id)
      .single()

    if (invoiceError || !invoice?.vendor_id) {
      return new Response(JSON.stringify({ error: 'Invoice not found or missing vendor routing information.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 })
    }

    // Approval is checked once, at transition_vendor_approval time, and never again after --
    // a vendor suspended after being approved could otherwise still get paid, since this was
    // the only gate release_invoice_funds/the provider adapters ever consulted. Re-check here,
    // via service role rather than the caller's own RLS view, so this is "is the vendor actually
    // approved" and not "can the caller currently see this vendor from their active location" --
    // a different, already-separately-enforced concern.
    const { data: vendorApproval, error: vendorApprovalError } = await serviceSupabase
      .from('vendors')
      .select('approval_status, deleted_at')
      .eq('id', invoice.vendor_id)
      .maybeSingle()

    if (vendorApprovalError || !vendorApproval || vendorApproval.deleted_at || vendorApproval.approval_status !== 'approved') {
      return new Response(JSON.stringify({ error: 'Vendor is not approved for payment.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    const finalPaymentAccountId = payment_account_id || invoice.payment_account_id
    if (!finalPaymentAccountId) {
      return new Response(JSON.stringify({ error: 'A payment account is required to release funds.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    const transferAmount = (invoice.total_amount || 0) - (invoice.paid_amount || 0)

    const ctx = {
      serviceSupabase,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      vendorId: invoice.vendor_id,
      vendor: invoice.vendor,
      transferAmount,
      paymentAccountId: finalPaymentAccountId,
      payoutMethod: payout_method,
    }

    // Preflight before release_invoice_funds mutates payment state -- providers with a
    // destination to validate up front (Dwolla) fail closed here; providers with nothing to
    // check yet (Checkbook) no-op and validate inside initiate() instead.
    let state
    try {
      state = await provider.preflight(ctx)
    } catch (preflightError) {
      return new Response(JSON.stringify({ error: preflightError.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    // Call the secure RPC to release funds. This enforces RBAC (Location Manager / Org Manager).
    const { data: releaseData, error: releaseError } = await supabase.rpc('release_invoice_funds', {
      p_invoice_id: invoice_id,
      p_payout_method: payout_method,
      p_payment_account_id: payment_account_id || null,
    })

    if (releaseError) {
      console.error('RPC Error:', releaseError)
      return new Response(JSON.stringify({ error: releaseError.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 })
    }

    try {
      const { providerRef } = await provider.initiate(ctx, state)

      // Service role client bypasses RLS for this internal system update.
      await serviceSupabase
        .from('payments')
        .update({ [provider.refColumn]: providerRef })
        .eq('id', releaseData.payment_id)
        .eq('organization_id', releaseData.organization_id)

      return new Response(JSON.stringify({ success: true, providerRef }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    } catch (initiateError) {
      console.error(`${payout_method} payout failed, reverting:`, initiateError)
      const reason = initiateError.message || 'Payout failed'
      await revertPayoutOnFailure(serviceSupabase, {
        paymentId: releaseData.payment_id,
        invoiceId: invoice_id,
        organizationId: releaseData.organization_id,
        reason,
      })
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
