import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import crypto from 'node:crypto'
import { notifyPaymentFailure } from '../_shared/notifyPaymentFailure.ts'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const rawBody = await req.text()
    
    // Checkbook.io Signature Verification
    const signature = req.headers.get('Authorization')
    const secret = Deno.env.get('CHECKBOOK_API_SECRET') ?? ''
    
    // Checkbook signature is standard HMAC SHA256 of the body
    // The exact header format may vary, e.g., 'Signature ...'
    // For simplicity we will assume it matches the HMAC hex digest
    const hash = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    if (!signature || (signature !== hash && signature !== `Signature ${hash}`)) {
      return new Response('Invalid signature', { status: 401 })
    }

    const payload = JSON.parse(rawBody)
    const checkId = payload.id || payload.check_id
    const status = payload.status

    if (!checkId || !status) {
       return new Response('Missing check details', { status: 400 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const isFailure = status === 'VOID' || status === 'FAILED' || status === 'EXPIRED'
    let newPayoutStatus = 'in_transit'
    let newInvoiceStatus = 'processing'

    if (status === 'PAID') {
      newPayoutStatus = 'cleared'
      newInvoiceStatus = 'paid'
    } else if (isFailure) {
      newPayoutStatus = 'failed'
      newInvoiceStatus = 'scheduled' // Revert to allow retry
    } else if (status === 'PRINTED' || status === 'MAILED') {
      newPayoutStatus = 'in_transit'
    }

    // Update the payment record. Async failures used to only touch payout_status, leaving
    // payments.status stuck at 'pending' -- now set both so Payment History's Retry button
    // and status badge actually reflect a failure that happens days after release.
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .update({
        payout_status: newPayoutStatus,
        ...(isFailure ? { status: 'failed', failure_reason: `Checkbook.io: ${status}` } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('checkbook_check_id', checkId)
      .select('id, invoice_id')
      .single()

    if (paymentError || !payment) {
      console.error('Failed to update payment or payment not found:', paymentError)
      return new Response('OK', { status: 200 })
    }

    // Update the invoice status
    await supabase
      .from('invoices')
      .update({
        status: newInvoiceStatus,
        payment_status: newInvoiceStatus === 'paid' ? 'paid' : 'unpaid'
      })
      .eq('id', payment.invoice_id)

    if (isFailure) {
      await notifyPaymentFailure(supabase, { paymentId: payment.id, invoiceId: payment.invoice_id, reason: `Checkbook.io reported: ${status}` })
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
