import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import crypto from 'node:crypto'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    // 1. Verify Dwolla Webhook Signature
    const signature = req.headers.get('x-dwolla-signature')
    const rawBody = await req.text()
    
    const secret = Deno.env.get('DWOLLA_WEBHOOK_SECRET') ?? ''
    const hash = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    if (signature !== hash) {
      return new Response('Invalid signature', { status: 401 })
    }

    const payload = JSON.parse(rawBody)
    const topic = payload.topic
    const resourceUrl = payload._links.resource.href

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 2. Handle relevant Dwolla Topics
    if (topic === 'transfer_completed' || topic === 'transfer_failed' || topic === 'transfer_cancelled') {
      let newPayoutStatus = 'in_transit'
      let newInvoiceStatus = 'processing'
      
      if (topic === 'transfer_completed') {
        newPayoutStatus = 'cleared'
        newInvoiceStatus = 'paid'
      } else if (topic === 'transfer_failed' || topic === 'transfer_cancelled') {
        newPayoutStatus = 'failed'
        newInvoiceStatus = 'scheduled' // Revert invoice status so it can be retried
      }

      // Update the payment record
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .update({ payout_status: newPayoutStatus, updated_at: new Date().toISOString() })
        .eq('dwolla_transfer_url', resourceUrl)
        .select('invoice_id')
        .single()

      if (paymentError || !payment) {
        console.error('Failed to update payment or payment not found:', paymentError)
        return new Response('OK', { status: 200 }) // Return 200 so Dwolla doesn't retry
      }

      // Update the invoice status
      await supabase
        .from('invoices')
        .update({ 
          status: newInvoiceStatus,
          payment_status: newInvoiceStatus === 'paid' ? 'paid' : 'partial'
        })
        .eq('id', payment.invoice_id)
        
    } else if (topic === 'customer_verified' || topic === 'customer_suspended') {
      // Vendor Onboarding status updates
      const newStatus = topic === 'customer_verified' ? 'verified' : 'suspended'
      
      await supabase
        .from('vendors')
        .update({ dwolla_onboarding_status: newStatus })
        .eq('dwolla_customer_url', resourceUrl)
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
