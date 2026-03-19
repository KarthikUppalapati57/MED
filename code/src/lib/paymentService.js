import { loadStripe } from '@stripe/stripe-js';
import { supabase } from '@/lib/supabaseClient';

/**
 * Payment Service — unified abstraction for Stripe, PayPal, bank transfer.
 */

// ── Stripe ──────────────────────────────────────────────────
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
 * Falls back to mock for development if no edge function exists.
 */
export async function createPaymentIntent(amount, currency = 'usd', metadata = {}) {
  try {
    const { data, error } = await supabase.functions.invoke('create-payment-intent', {
      body: { amount: Math.round(amount * 100), currency, metadata },
    });
    if (error) throw error;
    return data; // { clientSecret }
  } catch (err) {
    console.warn('[PaymentService] Edge function unavailable, using mock:', err.message);
    // Mock for development — returns a fake client_secret
    return {
      clientSecret: `pi_mock_${Date.now()}_secret_mock`,
      isMock: true,
    };
  }
}

// ── PayPal ──────────────────────────────────────────────────
export function getPayPalClientId() {
  return import.meta.env.VITE_PAYPAL_CLIENT_ID || null;
}

// ── Bank Transfer ───────────────────────────────────────────
export const BANK_DETAILS = {
  bank_name: 'EdgeOps Business Account',
  account_name: 'EdgeOps Restaurant Solutions Inc.',
  account_number: '****7890',
  routing_number: '021000021',
  swift_code: 'CHASUS33',
  bank_address: 'JPMorgan Chase, New York, NY',
  instructions: 'Please include your invoice number as the payment reference.',
};

// ── Payment Records ─────────────────────────────────────────
export async function createPaymentRecord(paymentData) {
  const { data, error } = await supabase
    .from('payments')
    .insert([{
      ...paymentData,
      payment_date: paymentData.payment_date || new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString(),
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateInvoicePaymentStatus(invoiceId, status = 'paid') {
  const { error } = await supabase
    .from('invoices')
    .update({ payment_status: status, status: status === 'paid' ? 'paid' : undefined })
    .eq('id', invoiceId);
  if (error) throw error;
}

export async function getPaymentsByInvoice(invoiceId) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function confirmBankTransfer(paymentId) {
  const { data, error } = await supabase
    .from('payments')
    .update({ status: 'completed', confirmed_at: new Date().toISOString() })
    .eq('id', paymentId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
