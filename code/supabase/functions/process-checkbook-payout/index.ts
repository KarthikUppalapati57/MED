import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders } from '../_shared/cors.ts'
import { revertPayoutOnFailure } from '../_shared/notifyPaymentFailure.ts'

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

    const { invoice_id, payout_method = 'checkbook_digital', payment_account_id } = await req.json()

    if (!invoice_id) {
      return new Response(JSON.stringify({ error: 'invoice_id is required' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // 1. Call the secure RPC to release funds for Checkbook.io
    const { data: releaseData, error: releaseError } = await supabase.rpc('release_invoice_funds', {
      p_invoice_id: invoice_id,
      p_payout_method: payout_method,
      p_payment_account_id: payment_account_id || null
    })

    if (releaseError) {
      console.error('RPC Error:', releaseError)
      return new Response(JSON.stringify({ error: releaseError.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 })
    }

    // 2. Fetch invoice and vendor details
    const { data: invoice } = await supabase
      .from('invoices')
      .select(`
        id, invoice_number, total_amount, paid_amount,
        vendor:vendor_id ( name, email, phone, address, city, state, zip_code )
      `)
      .eq('id', invoice_id)
      .single()

    if (!invoice || !invoice.vendor?.name) {
       return new Response(JSON.stringify({ error: 'Missing Vendor Information.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    if (payout_method === 'checkbook_digital' && !invoice.vendor.email) {
       return new Response(JSON.stringify({ error: 'Vendor email is required for Digital Checks.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    if (payout_method === 'checkbook_physical' && (!invoice.vendor.address || !invoice.vendor.city || !invoice.vendor.state || !invoice.vendor.zip_code)) {
       return new Response(JSON.stringify({ error: 'Vendor mailing address is required for Physical Checks.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    const transferAmount = (invoice.total_amount || 0) - (invoice.paid_amount || 0);

    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    try {
      // 3. Call Checkbook.io API
      // Single endpoint for both digital and physical -- the payload (recipient vs.
      // recipient_address, below) is what determines which kind of check gets issued.
      const checkbookEnv = (Deno.env.get('CHECKBOOK_ENV') || 'sandbox').toLowerCase();
      const checkbookBaseUrl = Deno.env.get('CHECKBOOK_BASE_URL')
        || (checkbookEnv === 'production'
          ? 'https://api.checkbook.io'
          : checkbookEnv === 'demo'
            ? 'https://demo.checkbook.io'
            : 'https://api.sandbox.checkbook.io');
      const checkbookUrl = `${checkbookBaseUrl.replace(/\/$/, '')}/v3/check`;

      const apiKey = Deno.env.get('CHECKBOOK_API_KEY');
      const apiSecret = Deno.env.get('CHECKBOOK_API_SECRET');

      if (!apiKey || !apiSecret) {
        throw new Error('Checkbook.io credentials not configured');
      }

      const checkPayload: any = {
        name: invoice.vendor.name,
        amount: Number(transferAmount.toFixed(2)),
        description: `Payment for Invoice ${invoice.invoice_number}`,
      };

      if (payout_method === 'checkbook_physical') {
        checkPayload.recipient_address = {
          line_1: invoice.vendor.address,
          line_2: '',
          city: invoice.vendor.city,
          state: invoice.vendor.state,
          zip: invoice.vendor.zip_code
        };
      } else {
        checkPayload.recipient = invoice.vendor.email;
      }

      const checkbookResponse = await fetch(checkbookUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `${apiKey}:${apiSecret}`
        },
        body: JSON.stringify(checkPayload)
      });

      const checkData = await checkbookResponse.json();

      if (!checkbookResponse.ok) {
        console.error('Checkbook.io Error:', checkData);
        const reason = checkData.error || 'Failed to issue check via Checkbook.io';
        await revertPayoutOnFailure(serviceSupabase, {
          paymentId: releaseData.payment_id,
          invoiceId: invoice_id,
          organizationId: releaseData.organization_id,
          reason,
        });
        return new Response(JSON.stringify({ error: reason }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
      }

      const checkbookCheckId = checkData.id;

      // 4. Update the payment record with the Checkbook ID
      await serviceSupabase
        .from('payments')
        .update({ checkbook_check_id: checkbookCheckId })
        .eq('id', releaseData.payment_id)
        .eq('organization_id', releaseData.organization_id)

      return new Response(JSON.stringify({ success: true, checkbookCheckId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    } catch (checkError) {
      console.error('Checkbook.io call failed, reverting:', checkError)
      const reason = checkError.message || 'Checkbook.io call failed'
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
    console.error('process-checkbook-payout error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})


