import React, { useState } from 'react';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { getStripe, createPaymentIntent } from '@/lib/paymentService';
import { Button } from '@/components/ui/button';
import { CreditCard, Loader2, AlertCircle, Lock } from 'lucide-react';

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '15px',
      color: '#1e293b',
      fontFamily: 'Inter, system-ui, sans-serif',
      '::placeholder': { color: '#94a3b8' },
      padding: '12px',
    },
    invalid: { color: '#dc2626' },
  },
  hidePostalCode: true,
};

function StripeCheckoutForm({ amount, vendorName, invoiceNumber, onSuccess, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError(null);

    try {
      // 1. Create PaymentIntent (via edge function or mock)
      const { clientSecret, isMock } = await createPaymentIntent(amount, 'usd', {
        vendor_name: vendorName,
        invoice_number: invoiceNumber,
      });

      if (isMock) {
        // Development mock — simulate success
        await new Promise(r => setTimeout(r, 1500));
        onSuccess({
          payment_method: 'stripe',
          status: 'completed',
          transaction_id: `txn_mock_${Date.now()}`,
          payment_date: new Date().toISOString().split('T')[0],
        });
        setProcessing(false);
        return;
      }

      // 2. Confirm payment with Stripe
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: elements.getElement(CardElement) },
      });

      if (stripeError) {
        setError(stripeError.message);
        onError?.(stripeError);
      } else if (paymentIntent.status === 'succeeded') {
        onSuccess({
          payment_method: 'stripe',
          status: 'completed',
          transaction_id: paymentIntent.id,
          payment_date: new Date().toISOString().split('T')[0],
        });
      }
    } catch (err) {
      setError(err.message || 'Payment failed');
      onError?.(err);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="border rounded-lg p-3 bg-white">
        <CardElement options={CARD_ELEMENT_OPTIONS} />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <Lock className="h-3 w-3" />
        Secured by Stripe. Card data never touches our servers.
      </div>

      <Button
        type="submit"
        className="w-full bg-teal-600 hover:bg-teal-700"
        disabled={!stripe || processing}
      >
        {processing ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</>
        ) : (
          <><CreditCard className="h-4 w-4 mr-2" /> Pay ${amount?.toLocaleString()}</>
        )}
      </Button>
    </form>
  );
}

export default function StripePaymentForm({ amount, vendorName, invoiceNumber, onSuccess, onError }) {
  const stripePromise = getStripe();

  if (!stripePromise) {
    return (
      <div className="text-center py-6">
        <AlertCircle className="h-8 w-8 text-orange-500 mx-auto mb-2" />
        <p className="text-sm text-slate-600 font-medium">Stripe Not Configured</p>
        <p className="text-xs text-slate-400 mt-1">
          Set <code className="bg-slate-100 px-1 rounded">VITE_STRIPE_PUBLISHABLE_KEY</code> in your environment.
        </p>
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <StripeCheckoutForm
        amount={amount}
        vendorName={vendorName}
        invoiceNumber={invoiceNumber}
        onSuccess={onSuccess}
        onError={onError}
      />
    </Elements>
  );
}
