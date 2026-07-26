import React from 'react';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { getPayPalClientId } from '@/lib/paymentService';
import { AlertCircle } from 'lucide-react';

function PayPalCheckout({ amount, vendorName, invoiceNumber, onSuccess, onError }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106z" />
        </svg>
        Secure checkout powered by PayPal
      </div>

      <PayPalButtons
        style={{
          layout: 'vertical',
          color: 'blue',
          shape: 'rect',
          label: 'pay',
          height: 45,
        }}
        createOrder={(data, actions) => {
          return actions.order.create({
            purchase_units: [{
              description: `Invoice ${invoiceNumber} - ${vendorName}`,
              amount: {
                value: (amount || 0).toFixed(2),
                currency_code: 'USD',
              },
            }],
          });
        }}
        onApprove={async (data, actions) => {
          const details = await actions.order.capture();
          onSuccess({
            payment_method: 'paypal',
            status: 'completed',
            transaction_id: details.id,
            payment_date: new Date().toISOString().split('T')[0],
            payer_email: details.payer?.email_address,
          });
        }}
        onError={(err) => {
          console.error('[PayPal] Error:', err);
          onError?.(new Error(String(err)));
        }}
        onCancel={() => {
          console.log('[PayPal] Payment cancelled by user');
        }}
      />
    </div>
  );
}

export default function PayPalPaymentForm({ amount, vendorName, invoiceNumber, onSuccess, onError }) {
  const clientId = getPayPalClientId();

  if (!clientId) {
    return (
      <div className="text-center py-6">
        <AlertCircle className="h-8 w-8 text-orange-500 mx-auto mb-2" />
        <p className="text-sm text-slate-600 font-medium">PayPal Not Configured</p>
        <p className="text-xs text-slate-400 mt-1">
          Set <code className="bg-slate-100 px-1 rounded">VITE_PAYPAL_CLIENT_ID</code> in your environment.
        </p>
      </div>
    );
  }

  return (
    <PayPalScriptProvider options={{ 'client-id': clientId, currency: 'USD' }}>
      <PayPalCheckout
        amount={amount}
        vendorName={vendorName}
        invoiceNumber={invoiceNumber}
        onSuccess={onSuccess}
        onError={onError}
      />
    </PayPalScriptProvider>
  );
}
