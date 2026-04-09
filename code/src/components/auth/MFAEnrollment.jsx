import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp';
import { QrCode, Smartphone, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export function MFAEnrollment({ onComplete, onCancel }) {
  const { refreshMFAStatus } = useAuth();
  const [step, setStep] = useState(1); // 1: Initialize, 2: Scan QR, 3: Verify
  const [factorId, setFactorId] = useState('');
  const [qrCodeSvg, setQrCodeSvg] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const startEnrollment = async () => {
    setIsLoading(true);
    setError('');
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Authenticator (${new Date().toLocaleDateString()})`
      });

      if (error) throw error;

      setFactorId(data.id);
      setQrCodeSvg(data.totp.qr_code);
      setSecret(data.totp.secret);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (code.length < 6) return;
    setIsLoading(true);
    setError('');

    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;

      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code
      });

      if (verify.error) throw verify.error;

      toast.success('Authenticator app linked successfully!');
      await refreshMFAStatus();
      if (onComplete) onComplete();
    } catch (err) {
      setError(err.message || 'Invalid code. Please try again.');
      setCode('');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    startEnrollment();
  }, []);

  return (
    <div className="space-y-6 py-4">
      {step === 2 && (
        <div className="space-y-6 text-center animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-slate-900 flex items-center justify-center gap-2">
              <QrCode className="w-5 h-5 text-teal-600" />
              Scan QR Code
            </h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              Scan this code with your Microsoft Authenticator, Google Authenticator, or 1Password app.
            </p>
          </div>

          <div className="bg-white p-4 rounded-xl border-2 border-slate-100 inline-block">
             {/* Supabase returns an SVG string. We can set it as innerHTML or use a data URI. */}
             <div 
               className="w-48 h-48 mx-auto"
               dangerouslySetInnerHTML={{ __html: qrCodeSvg }} 
             />
          </div>

          <div className="space-y-3">
             <p className="text-xs text-slate-400">Can't scan? Use this code manually:</p>
             <code className="bg-slate-50 px-3 py-2 rounded border text-xs font-mono font-bold text-teal-700 uppercase tracking-widest break-all">
               {secret}
             </code>
          </div>

          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={() => setStep(3)}>
              I've scanned it
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6 text-center animate-in fade-in zoom-in-95 duration-300">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-slate-900 flex items-center justify-center gap-2">
              <Smartphone className="w-5 h-5 text-teal-600" />
              Verify Connection
            </h3>
            <p className="text-sm text-slate-500">
              Enter the 6-digit code shown in your app to confirm.
            </p>
          </div>

          <div className="flex justify-center">
            <InputOTP
              maxLength={6}
              value={code}
              onChange={(val) => setCode(val)}
              onComplete={handleVerify}
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
            <Alert variant="destructive" className="bg-red-50 border-red-100 text-red-800 py-2">
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-center gap-3">
            <Button variant="ghost" onClick={() => setStep(2)} disabled={isLoading}>
              Back to QR
            </Button>
            <Button 
              className="bg-teal-600 hover:bg-teal-700" 
              onClick={handleVerify}
              disabled={isLoading || code.length < 6}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Enable MFA
            </Button>
          </div>
        </div>
      )}

      {isLoading && step === 1 && (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <RefreshCw className="w-8 h-8 text-teal-600 animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Initializing secure enrollment...</p>
        </div>
      )}
    </div>
  );
}
