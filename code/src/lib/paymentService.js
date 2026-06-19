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
      console.warn('[PaymentService] VITE_STRIPE_PUBLISHABLE_KEY not set — Stripe payments disabled');
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

    // Edge function may return an error in the JSON body
    if (data?.error) {
      throw new Error(data.error);
    }

    if (!data?.clientSecret) {
      throw new Error('No client secret returned from payment service');
    }

    return data; // { clientSecret }
  } catch (err) {
    const allowDevMock = !import.meta.env.PROD && import.meta.env.VITE_ALLOW_MOCK_PAYMENTS === 'true';
    // Only mock in explicitly opted-in local development.
    if (allowDevMock && (err.message?.includes('FunctionsFetchError') || err.message?.includes('Failed to fetch'))) {
      console.warn('[PaymentService] Edge function unreachable, using mock for dev:', err.message);
      return {
        clientSecret: `pi_mock_${Date.now()}_secret_mock`,
        isMock: true,
      };
    }
    // Re-throw real Stripe/function errors so the UI can display them.
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

// Payment Records 
export async function createPaymentRecord(paymentData) {
  return api.entities.Payment.create({
    ...paymentData,
    payment_date: paymentData.payment_date || new Date().toISOString().split('T')[0],
    created_at: new Date().toISOString(),
  });
}

export async function updateInvoicePaymentStatus(invoiceId, status = 'paid', organizationId = null) {
  const updates = { payment_status: status };
  if (status === 'paid') updates.status = 'paid';
  if (organizationId) updates.organization_id = organizationId;
  await api.entities.Invoice.update(invoiceId, updates);
}

export async function getPaymentsByInvoice(invoiceId, organizationId = null) {
  return api.entities.Payment.filter(
    { invoice_id: invoiceId, ...(organizationId ? { organization_id: organizationId } : {}) },
    { orderBy: '-created_at' }
  );
}

export async function confirmBankTransfer(paymentId, organizationId = null) {
  return api.entities.Payment.update(paymentId, {
    ...(organizationId ? { organization_id: organizationId } : {}),
    status: 'completed',
    confirmed_at: new Date().toISOString(),
  });
}