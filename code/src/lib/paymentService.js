import { loadStripe } from '@stripe/stripe-js';
import { supabase } from '@/lib/supabaseClient';
import { api } from '@/lib/apiClient';

/**
 * Payment Service unified abstraction for Stripe, PayPal, bank transfer.
 */

// Stripe
let stripePromise = null;

export function getStripe() {
  if (!stripePromise) {
    const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      console.warn('[PaymentService] VITE_STRIPE_PUBLISHABLE_KEY not set - Stripe payments disabled');
      return null;
    }
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}

/**
 * Create a PaymentIntent via Supabase Edge Function.
 * Local development can opt into a mock fallback, but production must fail loudly.
 */
export async function createPaymentIntent(amount, currency = 'usd', metadata = {}) {
  try {
    const { data, error } = await supabase.functions.invoke('create-payment-intent', {
      body: { amount: Math.round(amount * 100), currency, metadata },
    });

    if (error) throw error;

    if (data?.error) {
      throw new Error(data.error);
    }

    if (!data?.clientSecret) {
      throw new Error('No client secret returned from payment service');
    }

    return data;
  } catch (err) {
    const allowDevMock = !import.meta.env.PROD && import.meta.env.VITE_ALLOW_MOCK_PAYMENTS === 'true';
    if (allowDevMock && (err.message?.includes('FunctionsFetchError') || err.message?.includes('Failed to fetch'))) {
      console.warn('[PaymentService] Edge function unreachable, using mock for dev:', err.message);
      return {
        clientSecret: `pi_mock_${Date.now()}_secret_mock`,
        isMock: true,
      };
    }
    throw err;
  }
}

// PayPal
export function getPayPalClientId() {
  return import.meta.env.VITE_PAYPAL_CLIENT_ID || null;
}

// Bank Transfer
export const BANK_DETAILS = {
  bank_name: 'Restops Business Account',
  account_name: 'Restops Restaurant Solutions Inc.',
  account_number: '****7890',
  routing_number: '021000021',
  swift_code: 'CHASUS33',
  bank_address: 'JPMorgan Chase, New York, NY',
  instructions: 'Please include your invoice number as the payment reference.',
};

export async function recordInvoicePayment({ invoiceId, amount, reference, paymentMethod = 'manual' }) {
  const { data, error } = await supabase.rpc('record_invoice_payment', {
    p_invoice_id: invoiceId,
    p_amount: Number(amount),
    p_reference: reference,
    p_payment_method: paymentMethod,
  });
  if (error) throw error;
  return data;
}

// Payment Records
export async function createPaymentRecord(paymentData) {
  if (!paymentData?.invoice_id) {
    throw new Error('Direct payment creation is disabled. Use an invoice-scoped financial RPC.');
  }

  return recordInvoicePayment({
    invoiceId: paymentData.invoice_id,
    amount: paymentData.amount,
    reference: paymentData.transaction_id || paymentData.reference || paymentData.bank_reference || `PAY-${Date.now()}`,
    paymentMethod: paymentData.payment_method || 'manual',
  });
}

export async function updateInvoicePaymentStatus(invoiceId, status = 'paid') {
  if (status !== 'paid') {
    throw new Error('Direct invoice payment status updates are disabled. Use a tenant-safe financial RPC.');
  }

  const invoice = await api.entities.Invoice.get(invoiceId);
  const remaining = Math.max(0, Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0));
  if (remaining <= 0) return invoice;

  return recordInvoicePayment({
    invoiceId,
    amount: remaining,
    reference: `STATUS-${Date.now()}`,
    paymentMethod: 'manual',
  });
}

export async function getPaymentsByInvoice(invoiceId, organizationId = null) {
  return api.entities.Payment.filter(
    { invoice_id: invoiceId, ...(organizationId ? { organization_id: organizationId } : {}) },
    { orderBy: '-created_at' }
  );
}

export async function confirmBankTransfer(paymentId) {
  return api.financial.confirmPayment(paymentId);
}

