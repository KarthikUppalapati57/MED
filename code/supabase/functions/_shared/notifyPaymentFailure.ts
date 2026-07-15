import { sendTransactionalEmail } from './email.ts'

// Called from every payment-failure path (process-payout, process-checkbook-payout, and both
// payout webhooks) so a failed payout is never silent -- notifies the person who released the
// funds (payments.created_by) in-app and by email. Never throws: a notification failure must
// never mask or interrupt the real payment-failure handling that's calling it.
export async function notifyPaymentFailure(
  serviceSupabase: any,
  { paymentId, invoiceId, reason }: { paymentId: string; invoiceId: string; reason: string }
) {
  try {
    const { data: payment } = await serviceSupabase
      .from('payments')
      .select('vendor_name, invoice_number, amount, organization_id, created_by')
      .eq('id', paymentId)
      .maybeSingle()

    if (!payment?.created_by) return

    const { data: recipient } = await serviceSupabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', payment.created_by)
      .maybeSingle()

    if (!recipient?.email) return

    const amountText = payment.amount != null ? `$${Number(payment.amount).toFixed(2)}` : 'this amount'
    const title = 'Payment failed'
    const message = `The ${amountText} payment to ${payment.vendor_name || 'this vendor'} for invoice ${payment.invoice_number || invoiceId} failed: ${reason}. It's safe to retry from Bill Pay.`

    await serviceSupabase.from('notifications').insert({
      user_id: payment.created_by,
      organization_id: payment.organization_id,
      type: 'payment_failed',
      title,
      message,
      is_read: false,
      metadata: { invoice_id: invoiceId, payment_id: paymentId, reason },
    })

    await sendTransactionalEmail({
      to: recipient.email,
      subject: title,
      text: message,
    })
  } catch (err) {
    console.error('notifyPaymentFailure error (non-fatal):', err)
  }
}
