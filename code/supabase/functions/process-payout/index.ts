import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders } from '../_shared/cors.ts'
import { Client } from 'npm:dwolla-v2'

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

    // 1. Call the secure RPC to release funds. This enforces RBAC (Location Manager / Org Owner).
    const { data: releaseData, error: releaseError } = await supabase.rpc('release_invoice_funds', {
      p_invoice_id: invoice_id,
      p_payment_account_id: payment_account_id || null
    })

    if (releaseError) {
      console.error('RPC Error:', releaseError)
      return new Response(JSON.stringify({ error: releaseError.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 })
    }

    // 2. Fetch required details to initiate Dwolla Transfer
    // (e.g. source funding URL, destination customer URL, amount)
    const { data: invoice } = await supabase
      .from('invoices')
      .select(`
        id, total_amount, paid_amount,
        vendor:vendor_id ( dwolla_customer_url, dwolla_onboarding_status ),
        payment_account:payment_account_id ( dwolla_funding_source_url )
      `)
      .eq('id', invoice_id)
      .single()

    if (!invoice || !invoice.vendor?.dwolla_customer_url || !invoice.payment_account?.dwolla_funding_source_url) {
       return new Response(JSON.stringify({ error: 'Missing Dwolla routing information for vendor or source account.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    if (invoice.vendor.dwolla_onboarding_status !== 'verified') {
       return new Response(JSON.stringify({ error: 'Vendor must complete Dwolla onboarding first.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    const transferAmount = (invoice.total_amount || 0) - (invoice.paid_amount || 0);

    // 3. Initiate Dwolla Transfer
    const dwollaClient = new Client({
      key: Deno.env.get('DWOLLA_KEY') ?? '',
      secret: Deno.env.get('DWOLLA_SECRET') ?? '',
      environment: 'sandbox' // Change to 'production' for live
    });

    const requestBody = {
      _links: {
        source: { href: invoice.payment_account.dwolla_funding_source_url },
        destination: { href: invoice.vendor.dwolla_customer_url }
      },
      amount: { currency: "USD", value: transferAmount.toFixed(2) },
      metadata: { invoiceId: invoice_id }
    };

    const transferResponse = await dwollaClient.post('transfers', requestBody);
    const transferUrl = transferResponse.headers.get('location');

    // 4. Update the payment record with the Dwolla transfer URL
    // We use a service role client to bypass RLS for this internal system update
    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    await serviceSupabase
      .from('payments')
      .update({ dwolla_transfer_url: transferUrl })
      .eq('id', releaseData.payment_id)
      .eq('organization_id', releaseData.organization_id)

    return new Response(JSON.stringify({ success: true, transferUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('process-payout error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})


