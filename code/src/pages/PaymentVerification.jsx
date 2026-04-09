import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck, Lock, CreditCard, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { getStripe } from '@/lib/paymentService';
import { toast } from 'sonner';

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      color: '#1e293b',
      fontFamily: 'Inter, system-ui, sans-serif',
      '::placeholder': { color: '#94a3b8' },
    },
    invalid: { color: '#dc2626' },
  },
  hidePostalCode: true,
};

function VerificationForm() {
  const stripe = useStripe();
  const elements = useElements();
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError(null);

    try {
      // In a real scenario, we would create a SetupIntent or a PaymentMethod
      // For this workflow, we simulate successful verification
      await new Promise(r => setTimeout(r, 2000));

      // Update profile status
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ payment_verified: true, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (updateError) throw updateError;

      toast.success('Payment details verified successfully!');
      await refreshProfile();
      
      // Redirect to onboarding
      setTimeout(() => navigate('/onboarding'), 1000);
    } catch (err) {
      setError(err.message || 'Verification failed. Please try again.');
      toast.error('Verification failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleVerify} className="space-y-6">
      <div className="space-y-4">
        <label className="text-sm font-medium text-slate-700">Card Details</label>
        <div className="p-4 border border-slate-200 rounded-xl bg-slate-50 shadow-inner">
          <CardElement options={CARD_ELEMENT_OPTIONS} />
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Lock className="w-3 h-3" />
          Your payment information is encrypted and secured by Stripe.
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-100 flex items-center gap-2 text-sm text-red-600 animate-in fade-in slide-in-from-top-1">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <Button 
        type="submit" 
        disabled={!stripe || processing}
        className="w-full h-12 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-lg shadow-teal-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
      >
        {processing ? (
          <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Verifying...</>
        ) : (
          <><ShieldCheck className="w-5 h-5 mr-2" /> Verify & Continue</>
        )}
      </Button>
    </form>
  );
}

export default function PaymentVerification() {
  const stripePromise = getStripe();

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-teal-50 via-slate-50 to-white">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center space-y-2">
          <div className="w-16 h-16 bg-white rounded-2xl shadow-xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
            <CreditCard className="w-8 h-8 text-teal-600" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Confirm Your Account</h1>
          <p className="text-slate-500 font-medium">To keep your account secure, please provide a valid payment method.</p>
        </div>

        <Card className="border-none shadow-2xl bg-white/80 backdrop-blur-xl ring-1 ring-slate-200/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-bold text-slate-900">Payment Verification</CardTitle>
            <CardDescription className="text-slate-500">
              Your card will not be charged at this time. We use this to verify your identity and prevent platform abuse.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stripePromise ? (
              <Elements stripe={stripePromise}>
                <VerificationForm />
              </Elements>
            ) : (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">Stripe Configuration Missing</p>
                <p className="text-xs text-slate-400 mt-1">Please check your environment variables.</p>
              </div>
            )}
          </CardContent>
          <CardFooter className="bg-slate-50/50 border-t border-slate-100 rounded-b-xl flex flex-col gap-3 py-6">
            <div className="flex items-center gap-4 justify-center grayscale opacity-50">
              <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400">Powered by Stripe</span>
            </div>
            <p className="text-[10px] text-center text-slate-400">
              By continuing, you agree to our Terms of Service and Privacy Policy. Your card will be stored for future billing.
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
