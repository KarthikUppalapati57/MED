import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp';
import { ShieldCheck, LogOut, Loader2, Monitor } from 'lucide-react';

export function MFAChallenge() {
  const { logout, refreshMFAStatus, mfaFactors } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);

  const onSubmit = async (e) => {
    e?.preventDefault();
    if (code.length < 6) return;

    setError('');
    setIsLoading(true);

    try {
      // Find the first TOTP factor (Microsoft Authenticator etc)
      const totpFactor = mfaFactors.find(f => f.factor_type === 'totp' && f.status === 'verified');
      
      if (!totpFactor) {
        throw new Error('No verified authenticator app found on your account.');
      }

      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: totpFactor.id
      });

      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challenge.id,
        code: code
      });

      if (verifyError) throw verifyError;

      // Defer state updates and user token storage to allow GoTrue client lock to release
      setTimeout(async () => {
        try {
          await refreshMFAStatus();

          // If "Remember this device" was checked, store a trust token
          if (rememberDevice) {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              const trustToken = {
                userId: user.id,
                trustedAt: Date.now(),
                expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
              };
              localStorage.setItem('edgeops_mfa_trust', JSON.stringify(trustToken));
            }
          }
        } catch (e) {
          console.warn('Deferred challenge verification actions failed:', e);
        }
      }, 50);
    } catch (err) {
      setError(err.message || 'Verification failed. Please try again.');
      setCode('');
      setIsLoading(false); // Only set loading to false on error, keep loading on success until unmount
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background animated-mesh p-4">
      <div className="w-full max-w-md glass-card rounded-2xl border border-border/50 shadow-2xl overflow-hidden relative animate-fade-in-scale">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand via-orange-500 to-brand" />
        
        <div className="p-8">
          <div className="text-center pb-6">
            <div className="mx-auto w-12 h-12 bg-brand/10 border border-brand/20 rounded-full flex items-center justify-center mb-4 animate-float">
              <ShieldCheck className="w-6 h-6 text-brand" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Multi-Factor Authentication</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Enter the 6-digit code from your authenticator app to continue.
            </p>
          </div>

          <div className="space-y-6">
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={code}
                onChange={(value) => setCode(value)}
                onComplete={onSubmit}
                disabled={isLoading}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} className="border-border/80 bg-secondary/40 focus:ring-2 focus:ring-brand focus:border-transparent text-foreground" />
                  <InputOTPSlot index={1} className="border-border/80 bg-secondary/40 focus:ring-2 focus:ring-brand focus:border-transparent text-foreground" />
                  <InputOTPSlot index={2} className="border-border/80 bg-secondary/40 focus:ring-2 focus:ring-brand focus:border-transparent text-foreground" />
                </InputOTPGroup>
                <InputOTPSeparator className="text-muted-foreground/60" />
                <InputOTPGroup>
                  <InputOTPSlot index={3} className="border-border/80 bg-secondary/40 focus:ring-2 focus:ring-brand focus:border-transparent text-foreground" />
                  <InputOTPSlot index={4} className="border-border/80 bg-secondary/40 focus:ring-2 focus:ring-brand focus:border-transparent text-foreground" />
                  <InputOTPSlot index={5} className="border-border/80 bg-secondary/40 focus:ring-2 focus:ring-brand focus:border-transparent text-foreground" />
                </InputOTPGroup>
              </InputOTP>
            </div>

            {error && (
              <Alert variant="destructive" className="bg-destructive/15 border-destructive/20 text-destructive-foreground">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <p className="text-xs text-center text-muted-foreground">
              Open your Microsoft Authenticator, Google Authenticator, or similar app to get your code.
            </p>

            {/* Remember this device */}
            <label className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-secondary/30 border border-border/40 cursor-pointer hover:bg-secondary/60 transition-all duration-200">
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
                className="h-4 w-4 rounded border-border/60 text-brand bg-secondary focus:ring-brand"
              />
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-foreground/90">Remember this device for 30 days</span>
              </div>
            </label>
          </div>

          <div className="flex flex-col gap-3 mt-8">
            <Button 
              className="w-full bg-brand text-white hover:opacity-95 shadow-glow-brand font-bold py-6 shimmer-sweep"
              onClick={() => onSubmit()}
              disabled={isLoading || code.length < 6}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : 'Verify Code'}
            </Button>
            <Button 
              variant="ghost" 
              className="w-full text-muted-foreground hover:text-foreground hover:bg-secondary/50" 
              onClick={() => logout()}
              disabled={isLoading}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
