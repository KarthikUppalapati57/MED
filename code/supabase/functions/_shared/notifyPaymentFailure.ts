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

// Reverts the payment/invoice state release_invoice_funds already applied optimistically
// (payments row -> 'processing', invoice payment_status -> 'processing') back to a retryable
// state, then notifies the releaser. Every synchronous payout-failure path (process-payout,
// process-checkbook-payout) needs exactly this pair together -- centralized so the revert and
// the notification can't drift out of sync with each other.
export async function revertPayoutOnFailure(
  serviceSupabase: any,
  { paymentId, invoiceId, organizationId, reason }: { paymentId: string; invoiceId: string; organizationId: string; reason: string }
) {
  await serviceSupabase
    .from('payments')
    .update({ status: 'failed', payout_status: 'failed', failure_reason: reason })
    .eq('id', paymentId)
    .eq('organization_id', organizationId)
  await serviceSupabase
    .from('invoices')
    .update({ payment_status: 'unpaid' })
    .eq('id', invoiceId)

  await notifyPaymentFailure(serviceSupabase, { paymentId, invoiceId, reason })
}

// Shared tail for both payout webhooks (Dwolla's payout-webhook, Checkbook's checkbook-webhook):
// each webhook does its own signature verification and maps its own provider's status
// vocabulary to payout_status/newInvoiceStatus, then both call this for the actual DB writes +
// failure notification so that sequence can't drift out of sync between the two rails.
export async function applyPayoutOutcome(
  serviceSupabase: any,
  { refColumn, refValue, newPayoutStatus, newInvoiceStatus, isFailure, reason }: {
    refColumn: string
    refValue: string
    newPayoutStatus: string
    newInvoiceStatus: string
    isFailure: boolean
    reason?: string
  }
) {
  const { data: payment, error: paymentError } = await serviceSupabase
    .from('payments')
    .update({
      payout_status: newPayoutStatus,
      ...(isFailure ? { status: 'failed', failure_reason: reason } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq(refColumn, refValue)
    .select('id, invoice_id')
    .single()

  if (paymentError || !payment) {
    console.error('Failed to update payment or payment not found:', paymentError)
    return
  }

  await serviceSupabase
    .from('invoices')
    .update({
      status: newInvoiceStatus,
      payment_status: newInvoiceStatus === 'paid' ? 'paid' : 'unpaid',
    })
    .eq('id', payment.invoice_id)

  if (isFailure) {
    await notifyPaymentFailure(serviceSupabase, { paymentId: payment.id, invoiceId: payment.invoice_id, reason: reason || 'Payout failed' })
  }
}
