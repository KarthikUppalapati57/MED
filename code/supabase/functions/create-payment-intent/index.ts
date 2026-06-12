import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@14.10.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders } from '../_shared/cors.ts'

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

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, organization_id, invoice_number, vendor_name, total_amount, payment_status, status')
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

    const paymentIntent = await stripe.paymentIntents.create({
      amount: requestedAmount,
      currency,
      metadata: {
        ...metadata,
        invoice_id: invoice.id,
        organization_id: invoice.organization_id,
        invoice_number: invoice.invoice_number || '',
        vendor_name: invoice.vendor_name || '',
      },
    })

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
