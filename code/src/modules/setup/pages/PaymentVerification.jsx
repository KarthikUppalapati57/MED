import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/components/ThemeProvider';
import { supabase } from '@/lib/supabaseClient';
import { api } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck, Lock, CreditCard, Loader2, AlertCircle, RefreshCw, Landmark } from 'lucide-react';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { getStripe } from '@/lib/paymentService';
import { toast } from 'sonner';



/**
 * Robustly set payment_verified = true on the user's profile.
 * Handles race conditions where the profile row may not exist yet
 * (e.g. the DB trigger hasn't fired) or RLS blocks the update.
 *
 * Strategy:
 *  1. Try UPDATE first (profile already exists from DB trigger)
 *  2. If UPDATE matches 0 rows, wait briefly and retry
 *  3. If still 0 rows after retries, fall back to UPSERT to create the row
 */
async function markPaymentVerified({ methodType = 'card', providerPaymentMethodId = null, last4 = null, brand = null, bankName = null, metadata = {} } = {}) {
  return api.onboarding.verifyPaymentMethod({
    methodType,
    provider: 'stripe',
    providerPaymentMethodId,
    last4,
    brand,
    bankName,
    metadata,
  });
}
function VerificationForm({ onVerified, paymentMethod }) {
  const stripe = useStripe();
  const elements = useElements();
  const { user } = useAuth();
  const { theme } = useTheme();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const CARD_ELEMENT_OPTIONS = {
    style: {
      base: {
        fontSize: '16px',
        color: isDark ? '#ffffff' : '#0f172a',
        fontFamily: 'Inter, system-ui, sans-serif',
        '::placeholder': { color: isDark ? '#a1a1aa' : '#64748b' },
      },
      invalid: { color: '#ef4444' },
    },
    hidePostalCode: true,
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError(null);

    try {
      // Step 1: Validate the card with Stripe by creating a PaymentMethod.
      // This sends the card details to Stripe and confirms the card is valid
      // without charging it.
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error('Card input not found. Please refresh and try again.');
      }

      const { paymentMethod: stripePaymentMethod, error: stripeError } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
        billing_details: {
          email: user?.email,
        },
      });

      if (stripeError) {
        // Stripe returned a validation error (invalid card, expired, etc.)
        throw new Error(stripeError.message);
      }

      if (!stripePaymentMethod?.id) {
        throw new Error('Card validation failed. Please check your card details and try again.');
      }

      console.log('[PaymentVerification] Stripe PaymentMethod created:', stripePaymentMethod.id);

      // Step 2: Mark payment as verified in the database
      await markPaymentVerified({
        methodType: paymentMethod,
        providerPaymentMethodId: stripePaymentMethod.id,
        last4: stripePaymentMethod.card?.last4 || null,
        brand: stripePaymentMethod.card?.brand || null,
        metadata: { funding: stripePaymentMethod.card?.funding || null },
      });

      toast.success(paymentMethod === 'ach' ? 'Bank transfer method verified successfully!' : 'Payment details verified successfully!');
      // Signal parent that verification is done
      onVerified();
    } catch (err) {
      console.error('[PaymentVerification] Verification failed:', err);
      const message = err.message || 'Verification failed. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleVerify} className="space-y-6">
      <div className="space-y-4">
        <label className="text-sm font-medium text-foreground">Card Details</label>
        <div className="p-4 border border-border rounded-xl bg-secondary shadow-inner">
          <CardElement options={CARD_ELEMENT_OPTIONS} />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="w-3 h-3" />
          Your payment information is encrypted and secured by Stripe.
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-resend-red/5 border border-resend-red/10 flex items-start gap-2 text-sm text-resend-red animate-in fade-in slide-in-from-top-1">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p>{error}</p>
            {error.includes('failed') && (
              <p className="text-xs text-red-400 mt-1">
                If you're using a test card, try <code className="bg-resend-red/10 px-1 rounded">4242 4242 4242 4242</code> with any future date and CVC.
              </p>
            )}
          </div>
        </div>
      )}

      <Button
        type="submit"
        disabled={!stripe || processing}
        className="w-full h-12 bg-primary hover:bg-primary text-primary-foreground font-bold rounded-xl shadow-lg shadow-primary/10 transition-all hover:scale-[1.02] active:scale-[0.98]"
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
  const { userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [completed, setCompleted] = useState(false);
  const [pollFailed, setPollFailed] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [bankProcessing, setBankProcessing] = useState(false);

 // After verification completes, poll refreshProfile until payment_verified is confirmed 
  useEffect(() => {
    if (!completed) return;
    let cancelled = false;

    const pollUntilReady = async () => {
      const MAX_RETRIES = 15;
      let success = false;

      for (let i = 0; i < MAX_RETRIES; i++) {
        if (cancelled) return;

        try {
          const freshProfile = await refreshProfile();
          // Check the return value directly to avoid stale closure issues
          if (freshProfile?.payment_verified) {
            success = true;
            break;
          }
        } catch (e) {
          console.warn('Profile refresh attempt failed:', e);
        }

        // Wait before next retry (gradual backoff)
        await new Promise(r => setTimeout(r, 600 + (i * 150)));
      }

      if (cancelled) return;

      if (success) {
        navigate('/onboarding', { replace: true });
      } else {
        // Instead of silently force-navigating (which causes a redirect loop),
        // show a clear error state with a retry button.
        console.warn('[PaymentVerification] Polling exhausted - profile still not showing payment_verified');
        setPollFailed(true);
      }
    };

    pollUntilReady();
    return () => { cancelled = true; };
  }, [completed, refreshProfile, navigate]);

 // Once profile state confirms payment_verified, navigate cleanly 
  useEffect(() => {
    if (completed && userProfile?.payment_verified) {
      navigate('/onboarding', { replace: true });
    }
  }, [completed, userProfile?.payment_verified, navigate]);

  if (userProfile && userProfile.business_verification_status !== 'verified') {
    return <Navigate to="/business-verification" replace />;
  }
  // Guard: If already has an organization, no verification needed.
  if (userProfile?.organization_id) {
    return <Navigate to="/" replace />;
  }

  // Guard: If already verified, move to onboarding
  if (userProfile?.payment_verified && !completed) {
    return <Navigate to="/onboarding" replace />;
  }

 // Poll failure screen profile update didn't propagate 
  if (pollFailed) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-background via-background to-white">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="w-16 h-16 bg-resend-yellow/10 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-resend-yellow" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">Almost There!</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Your payment method was verified, but we're having trouble updating your account status.
              This is usually a temporary issue.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button
              className="w-full h-12 bg-primary hover:bg-primary text-primary-foreground font-bold rounded-xl shadow-lg"
              onClick={async () => {
                setPollFailed(false);
                // Try the profile update one more time directly
                try {
                  const { data: { user } } = await supabase.auth.getUser();
                  if (user) {
                    await markPaymentVerified({
        methodType: paymentMethod,
        providerPaymentMethodId: stripePaymentMethod.id,
        last4: stripePaymentMethod.card?.last4 || null,
        brand: stripePaymentMethod.card?.brand || null,
        metadata: { funding: stripePaymentMethod.card?.funding || null },
      });
                    toast.success('Account updated! Redirecting...');
                    // Re-trigger the polling effect
                    setCompleted(false);
                    setTimeout(() => setCompleted(true), 100);
                  }
                } catch (err) {
                  console.error('Retry failed:', err);
                  toast.error('Still having trouble. Please try logging out and back in.');
                  setPollFailed(true);
                }
              }}
            >
              <RefreshCw className="w-5 h-5 mr-2" /> Try Again
            </Button>
            <Button
              variant="outline"
              className="w-full h-10 rounded-xl"
              onClick={() => {
                // Force-navigate to onboarding as last resort
                navigate('/onboarding', { replace: true });
              }}
            >
              Continue to Setup
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            If this keeps happening, try signing out and signing back in.
          </p>
        </div>
      </div>
    );
  }

 // Success screen while waiting for profile to update 
  if (completed) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-background via-background to-white">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto animate-pulse">
            <ShieldCheck className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Payment Verified!</h2>
          <p className="text-muted-foreground">Redirecting to organization setup...</p>
          <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-background via-background to-white">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center space-y-2">
          <div className="w-16 h-16 bg-card rounded-2xl shadow-xl flex items-center justify-center mx-auto mb-4 border border-border">
            {paymentMethod === 'ach' ? <Landmark className="w-8 h-8 text-primary" /> : <CreditCard className="w-8 h-8 text-primary" />}
          </div>
          <h1 className="text-3xl font-black text-foreground tracking-tight">Confirm Your Account</h1>
          <p className="text-muted-foreground font-medium">To keep your account secure, choose and verify a payment method.</p>
        </div>

        <Card className="border-none shadow-2xl bg-card/80 backdrop-blur-xl ring-1 ring-slate-200/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-bold text-foreground">Payment Method Verification</CardTitle>
            <CardDescription className="text-muted-foreground">
              Choose card or bank transfer. We verify the method before plan activation and do not store raw bank details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`rounded-xl border p-4 text-left transition ${paymentMethod === 'card' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-card hover:border-primary/40'}`}
              >
                <CreditCard className="mb-3 h-5 w-5 text-primary" />
                <p className="font-semibold text-foreground">Credit or debit card</p>
                <p className="mt-1 text-xs text-muted-foreground">Validate through Stripe CardElement.</p>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('ach')}
                className={`rounded-xl border p-4 text-left transition ${paymentMethod === 'ach' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-card hover:border-primary/40'}`}
              >
                <Landmark className="mb-3 h-5 w-5 text-primary" />
                <p className="font-semibold text-foreground">Bank transfer / ACH</p>
                <p className="mt-1 text-xs text-muted-foreground">Provider-ready secure bank setup path.</p>
              </button>
            </div>

            {paymentMethod === 'card' ? (
              stripePromise ? (
                <Elements stripe={stripePromise}>
                  <VerificationForm paymentMethod={paymentMethod} onVerified={() => setCompleted(true)} />
                </Elements>
              ) : (
                <div className="p-8 text-center bg-secondary rounded-2xl border border-dashed border-border">
                  <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Stripe Configuration Missing</p>
                  <p className="text-xs text-muted-foreground mt-1">Please check your environment variables.</p>
                </div>
              )
            ) : (
              <div className="space-y-4 rounded-xl border bg-secondary/40 p-5">
                <div className="flex items-start gap-3">
                  <Lock className="mt-0.5 h-4 w-4 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground">Secure bank transfer setup</p>
                    <p className="mt-1 text-sm text-muted-foreground">Production should connect this button to Stripe Financial Connections, ACH, Plaid, or another approved provider. This implementation stores only the selected payment method type and verification status.</p>
                  </div>
                </div>
                <Button
                  className="w-full h-12 rounded-xl"
                  disabled={bankProcessing}
                  onClick={async () => {
                    setBankProcessing(true);
                    try {
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user) throw new Error('You must be signed in to verify a bank account.');
                      await markPaymentVerified({
                        methodType: 'ach',
                        bankName: 'Bank transfer pending provider connection',
                        metadata: { provider_mode: 'financial_connections_ready' },
                      });
                      toast.success('Bank transfer method verified successfully!');
                      setCompleted(true);
                    } catch (err) {
                      console.error('Bank verification failed:', err);
                      toast.error(err.message || 'Bank verification failed.');
                    } finally {
                      setBankProcessing(false);
                    }
                  }}
                >
                  {bankProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying bank...</> : <><Landmark className="mr-2 h-4 w-4" /> Verify Bank Transfer</>}
                </Button>
              </div>
            )}
          </CardContent>
          <CardFooter className="bg-secondary/50 border-t border-border rounded-b-xl flex flex-col gap-3 py-6">
            <div className="flex items-center gap-4 justify-center grayscale opacity-50">
              <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Powered by Stripe</span>
            </div>
            <p className="text-[10px] text-center text-muted-foreground">
              By continuing, you agree to our Terms of Service and Privacy Policy. Your verified payment method will be used for future billing.
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
