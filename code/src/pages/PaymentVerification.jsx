import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/components/ThemeProvider';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck, Lock, CreditCard, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
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
async function markPaymentVerified(userId, userEmail) {
  const MAX_RETRIES = 4;
  const RETRY_DELAY = 800; // ms

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { data, error, count } = await supabase
      .from('profiles')
      .update({
        payment_verified: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select('id')
      .maybeSingle();

    if (error) {
      console.warn(`[PaymentVerification] update attempt ${attempt + 1} error:`, error.message);
      // If it's an RLS error or permission issue, wait and retry
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, RETRY_DELAY));
        continue;
      }
      throw error;
    }

 // If data is returned, the update affected a row success!
    if (data?.id) {
      console.log('[PaymentVerification] Profile updated successfully on attempt', attempt + 1);
      return true;
    }

 // No row was matched profile may not exist yet. Wait and retry.
    console.warn(`[PaymentVerification] update matched 0 rows on attempt ${attempt + 1}, retrying...`);
    if (attempt < MAX_RETRIES - 1) {
      await new Promise(r => setTimeout(r, RETRY_DELAY));
    }
  }

 // All UPDATE retries exhausted fall back to UPSERT
  console.warn('[PaymentVerification] UPDATE retries exhausted, falling back to UPSERT');
  const { error: upsertError } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        email: userEmail,
        payment_verified: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

  if (upsertError) {
    console.error('[PaymentVerification] UPSERT fallback failed:', upsertError.message);
    throw upsertError;
  }

  console.log('[PaymentVerification] UPSERT fallback succeeded');
  return true;
}

function VerificationForm({ onVerified }) {
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

      const { paymentMethod, error: stripeError } = await stripe.createPaymentMethod({
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

      if (!paymentMethod?.id) {
        throw new Error('Card validation failed. Please check your card details and try again.');
      }

      console.log('[PaymentVerification] Stripe PaymentMethod created:', paymentMethod.id);

      // Step 2: Mark payment as verified in the database
      await markPaymentVerified(user.id, user.email);

      toast.success('Payment details verified successfully!');
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
        console.warn('[PaymentVerification] Polling exhausted — profile still not showing payment_verified');
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
              Your card was verified by Stripe, but we're having trouble updating your account status.
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
                    await markPaymentVerified(user.id, user.email);
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
          <p className="text-muted-foreground">Redirecting to organization setup…</p>
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
            <CreditCard className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-black text-foreground tracking-tight">Confirm Your Account</h1>
          <p className="text-muted-foreground font-medium">To keep your account secure, please provide a valid payment method.</p>
        </div>

        <Card className="border-none shadow-2xl bg-card/80 backdrop-blur-xl ring-1 ring-slate-200/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-bold text-foreground">Payment Verification</CardTitle>
            <CardDescription className="text-muted-foreground">
              Your card will not be charged at this time. We use this to verify your identity and prevent platform abuse.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stripePromise ? (
              <Elements stripe={stripePromise}>
                <VerificationForm onVerified={() => setCompleted(true)} />
              </Elements>
            ) : (
              <div className="p-8 text-center bg-secondary rounded-2xl border border-dashed border-border">
                <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Stripe Configuration Missing</p>
                <p className="text-xs text-muted-foreground mt-1">Please check your environment variables.</p>
              </div>
            )}
          </CardContent>
          <CardFooter className="bg-secondary/50 border-t border-border rounded-b-xl flex flex-col gap-3 py-6">
            <div className="flex items-center gap-4 justify-center grayscale opacity-50">
              <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Powered by Stripe</span>
            </div>
            <p className="text-[10px] text-center text-muted-foreground">
              By continuing, you agree to our Terms of Service and Privacy Policy. Your card will be stored for future billing.
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

