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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-teal-50 p-4">
      <Card className="w-full max-w-md border-0 shadow-2xl overflow-hidden">
        <div className="h-2 bg-teal-500" />
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center mb-4">
            <ShieldCheck className="w-6 h-6 text-teal-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900">Multi-Factor Authentication</CardTitle>
          <CardDescription>
            Enter the 6-digit code from your authenticator app to continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-4">
          <div className="flex justify-center">
            <InputOTP
              maxLength={6}
              value={code}
              onChange={(value) => setCode(value)}
              onComplete={onSubmit}
              disabled={isLoading}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>

          {error && (
            <Alert variant="destructive" className="bg-red-50 border-red-100 text-red-800">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <p className="text-xs text-center text-slate-500">
            Open your Microsoft Authenticator, Google Authenticator, or similar app to get your code.
          </p>

          {/* Remember this device */}
          <label className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
            <input
              type="checkbox"
              checked={rememberDevice}
              onChange={(e) => setRememberDevice(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-slate-400" />
              <span className="text-sm text-slate-700">Remember this device for 30 days</span>
            </div>
          </label>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button 
            className="w-full bg-teal-600 hover:bg-teal-700 text-white py-6"
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
            className="w-full text-slate-500 hover:text-slate-900" 
            onClick={() => logout()}
            disabled={isLoading}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
