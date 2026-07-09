import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { api } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck, Lock, CreditCard, Loader2, AlertCircle, RefreshCw, Landmark, PenLine } from 'lucide-react';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { getStripe } from '@/lib/paymentService';
import { toast } from 'sonner';

const CONSENT_VERSION = 'tenant-bank-authorization-v1';
const CONSENT_TEXT = 'I authorize this organization to use the selected bank account for check, ACH, and related payment activity. I certify that I am authorized to sign for this bank account and that the signature artifact may be retained for audit and payment authorization evidence.';

async function sha256Hex(value) {
  const encoded = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function markPaymentVerified({ methodType = 'card', providerPaymentMethodId = null, last4 = null, brand = null, bankName = null, metadata = {} } = {}) {
  return api.onboarding.verifyPaymentMethod({
    methodType,
    provider: methodType === 'ach' ? 'tenant_bank_vault' : 'stripe',
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
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) throw new Error('Card input not found. Please refresh and try again.');

      const { paymentMethod: stripePaymentMethod, error: stripeError } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
        billing_details: { email: user?.email },
      });

      if (stripeError) throw new Error(stripeError.message);
      if (!stripePaymentMethod?.id) throw new Error('Card validation failed. Please check your card details and try again.');

      await markPaymentVerified({
        methodType: paymentMethod,
        providerPaymentMethodId: stripePaymentMethod.id,
        last4: stripePaymentMethod.card?.last4 || null,
        brand: stripePaymentMethod.card?.brand || null,
        metadata: { funding: stripePaymentMethod.card?.funding || null },
      });

      toast.success('Payment details verified successfully!');
      onVerified();
    } catch (err) {
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
        <div className="p-3 rounded-lg bg-resend-red/5 border border-resend-red/10 flex items-start gap-2 text-sm text-resend-red">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <Button type="submit" disabled={!stripe || processing} className="w-full h-12 bg-primary hover:bg-primary text-primary-foreground font-bold rounded-xl shadow-lg shadow-primary/10">
        {processing ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Verifying...</> : <><ShieldCheck className="w-5 h-5 mr-2" /> Verify & Continue</>}
      </Button>
    </form>
  );
}

function BankAuthorizationForm({ userProfile, onVerified }) {
  const [accounts, setAccounts] = useState([]);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [savingBank, setSavingBank] = useState(false);
  const [capturingSignature, setCapturingSignature] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [bankForm, setBankForm] = useState({
    bank_name: '',
    account_holder_name: userProfile?.full_name || '',
    account_type: 'checking',
    routing_number: '',
    account_number: '',
    billing_address_source: 'business',
    is_default: true,
    nickname: '',
  });
  const [signatureForm, setSignatureForm] = useState({
    signerFullName: userProfile?.full_name || '',
    signerTitle: '',
    signatureText: '',
    consentAccepted: false,
  });

  const selectedAccount = accounts.find((account) => account.id === selectedBankId);
  const selectedAccountAuthorized = selectedAccount && ['authorized', 'verified'].includes(selectedAccount.status);

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const rows = await api.onboarding.listOnboardingBankAccounts();
      setAccounts(rows);
      const preferred = rows.find((row) => row.is_default) || rows[0];
      setSelectedBankId((current) => current || preferred?.id || '');
    } catch (err) {
      toast.error(err.message || 'Could not load bank accounts.');
    } finally {
      setLoadingAccounts(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleBankChange = (field, value) => {
    setBankForm((prev) => ({ ...prev, [field]: value }));
  };

  const saveBankAccount = async (event) => {
    event.preventDefault();
    setSavingBank(true);
    try {
      const result = await api.onboarding.submitBankAccount({
        ...bankForm,
        metadata: { source: 'payment_verification' },
      });
      const saved = result?.bank_account;
      toast.success('Bank account saved. Add authorization signature next.');
      await loadAccounts();
      if (saved?.id) setSelectedBankId(saved.id);
      setBankForm((prev) => ({ ...prev, routing_number: '', account_number: '', nickname: '', is_default: false }));
    } catch (err) {
      toast.error(err.message || 'Could not save bank account.');
    } finally {
      setSavingBank(false);
    }
  };

  const captureSignature = async (event) => {
    event.preventDefault();
    if (!selectedBankId) {
      toast.error('Choose a bank account first.');
      return;
    }
    if (!signatureForm.consentAccepted) {
      toast.error('Please accept the authorization consent.');
      return;
    }
    if (!signatureForm.signatureText.trim()) {
      toast.error('Type your signature before continuing.');
      return;
    }

    setCapturingSignature(true);
    try {
      const signaturePayload = {
        type: 'typed_signature',
        value: signatureForm.signatureText.trim(),
        captured_at: new Date().toISOString(),
      };
      const hashSource = JSON.stringify({
        bankAccountId: selectedBankId,
        signerFullName: signatureForm.signerFullName.trim(),
        signerTitle: signatureForm.signerTitle.trim(),
        consentVersion: CONSENT_VERSION,
        consentText: CONSENT_TEXT,
        signaturePayload,
      });
      const signatureSha256 = await sha256Hex(hashSource);

      await api.onboarding.capturePaymentSignature({
        bankAccountId: selectedBankId,
        signerFullName: signatureForm.signerFullName,
        signerTitle: signatureForm.signerTitle,
        consentVersion: CONSENT_VERSION,
        consentText: CONSENT_TEXT,
        signatureSha256,
        signaturePayload,
        userAgent: navigator.userAgent,
      });
      toast.success('Signature authorization captured.');
      await loadAccounts();
    } catch (err) {
      toast.error(err.message || 'Could not capture signature authorization.');
    } finally {
      setCapturingSignature(false);
    }
  };

  const verifyBank = async () => {
    if (!selectedBankId) {
      toast.error('Choose a bank account first.');
      return;
    }
    setVerifying(true);
    try {
      const account = accounts.find((row) => row.id === selectedBankId);
      await markPaymentVerified({
        methodType: 'ach',
        bankName: account?.bank_name || null,
        metadata: { onboarding_bank_account_id: selectedBankId },
      });
      toast.success('Bank transfer method verified successfully.');
      onVerified();
    } catch (err) {
      toast.error(err.message || 'Bank verification failed.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-5 rounded-xl border bg-secondary/40 p-5">
      <div className="flex items-start gap-3">
        <Lock className="mt-0.5 h-4 w-4 text-primary" />
        <div>
          <p className="font-semibold text-foreground">Bank & Authorization</p>
          <p className="mt-1 text-sm text-muted-foreground">Raw account and routing numbers are sent only to the secure onboarding bank RPC. Normal database reads expose last 4 digits and authorization status only.</p>
        </div>
      </div>

      {loadingAccounts ? (
        <div className="flex items-center justify-center py-6 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading bank accounts...</div>
      ) : accounts.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Saved bank accounts</label>
          <div className="space-y-2">
            {accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => setSelectedBankId(account.id)}
                className={`w-full rounded-xl border p-3 text-left transition ${selectedBankId === account.id ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-foreground">{account.nickname || account.bank_name} ****{account.account_number_last4}</p>
                    <p className="text-xs text-muted-foreground">{account.account_type} account, routing ****{account.routing_number_last4}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${account.status === 'verified' || account.status === 'authorized' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{account.status}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={saveBankAccount} className="space-y-3 rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-bold text-foreground">Add bank account</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input className="h-10 rounded-lg border border-border bg-background px-3 text-sm" placeholder="Bank name" value={bankForm.bank_name} onChange={(e) => handleBankChange('bank_name', e.target.value)} required />
          <input className="h-10 rounded-lg border border-border bg-background px-3 text-sm" placeholder="Account holder name" value={bankForm.account_holder_name} onChange={(e) => handleBankChange('account_holder_name', e.target.value)} required />
          <select className="h-10 rounded-lg border border-border bg-background px-3 text-sm" value={bankForm.account_type} onChange={(e) => handleBankChange('account_type', e.target.value)}>
            <option value="checking">Checking</option>
            <option value="savings">Savings</option>
          </select>
          <select className="h-10 rounded-lg border border-border bg-background px-3 text-sm" value={bankForm.billing_address_source} onChange={(e) => handleBankChange('billing_address_source', e.target.value)}>
            <option value="business">Business address</option>
            <option value="mailing">Mailing address</option>
            <option value="service">Service address</option>
          </select>
          <input className="h-10 rounded-lg border border-border bg-background px-3 text-sm" placeholder="Routing number" inputMode="numeric" value={bankForm.routing_number} onChange={(e) => handleBankChange('routing_number', e.target.value)} required />
          <input className="h-10 rounded-lg border border-border bg-background px-3 text-sm" placeholder="Account number" inputMode="numeric" value={bankForm.account_number} onChange={(e) => handleBankChange('account_number', e.target.value)} required />
          <input className="h-10 rounded-lg border border-border bg-background px-3 text-sm sm:col-span-2" placeholder="Nickname, optional" value={bankForm.nickname} onChange={(e) => handleBankChange('nickname', e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={bankForm.is_default} onChange={(e) => handleBankChange('is_default', e.target.checked)} />
          Make this the default tenant bank account
        </label>
        <Button type="submit" disabled={savingBank} variant="outline" className="w-full rounded-xl">
          {savingBank ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving bank...</> : <><Landmark className="mr-2 h-4 w-4" /> Save Bank Account</>}
        </Button>
      </form>

      <form onSubmit={captureSignature} className="space-y-3 rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-bold text-foreground">Signature authorization</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input className="h-10 rounded-lg border border-border bg-background px-3 text-sm" placeholder="Signer full name" value={signatureForm.signerFullName} onChange={(e) => setSignatureForm((prev) => ({ ...prev, signerFullName: e.target.value }))} required />
          <input className="h-10 rounded-lg border border-border bg-background px-3 text-sm" placeholder="Title or role" value={signatureForm.signerTitle} onChange={(e) => setSignatureForm((prev) => ({ ...prev, signerTitle: e.target.value }))} />
          <input className="h-10 rounded-lg border border-border bg-background px-3 text-sm sm:col-span-2" placeholder="Type legal signature" value={signatureForm.signatureText} onChange={(e) => setSignatureForm((prev) => ({ ...prev, signatureText: e.target.value }))} required />
        </div>
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input className="mt-1" type="checkbox" checked={signatureForm.consentAccepted} onChange={(e) => setSignatureForm((prev) => ({ ...prev, consentAccepted: e.target.checked }))} />
          <span>{CONSENT_TEXT}</span>
        </label>
        <Button type="submit" disabled={!selectedBankId || capturingSignature} variant="outline" className="w-full rounded-xl">
          {capturingSignature ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Capturing signature...</> : <><PenLine className="mr-2 h-4 w-4" /> Capture Signature for Selected Bank</>}
        </Button>
      </form>

      <Button className="w-full h-12 rounded-xl" disabled={!selectedAccountAuthorized || verifying} onClick={verifyBank}>
        {verifying ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying bank...</> : <><ShieldCheck className="mr-2 h-4 w-4" /> Verify Bank & Continue</>}
      </Button>
    </div>
  );
}

export default function PaymentVerification() {
  const stripePromise = getStripe();
  const { userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [completed, setCompleted] = useState(false);
  const [pollFailed, setPollFailed] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('card');

  useEffect(() => {
    if (!completed) return;
    let cancelled = false;

    const pollUntilReady = async () => {
      let success = false;
      for (let i = 0; i < 15; i += 1) {
        if (cancelled) return;
        try {
          const freshProfile = await refreshProfile();
          if (freshProfile?.payment_verified) {
            success = true;
            break;
          }
        } catch (e) {
          console.warn('Profile refresh attempt failed:', e);
        }
        await new Promise((resolve) => setTimeout(resolve, 600 + (i * 150)));
      }
      if (cancelled) return;
      if (success) navigate('/onboarding', { replace: true });
      else setPollFailed(true);
    };

    pollUntilReady();
    return () => { cancelled = true; };
  }, [completed, refreshProfile, navigate]);

  useEffect(() => {
    if (completed && userProfile?.payment_verified) navigate('/onboarding', { replace: true });
  }, [completed, userProfile?.payment_verified, navigate]);

  if (userProfile && userProfile.business_verification_status !== 'verified') {
    return <Navigate to="/business-verification" replace />;
  }
  if (userProfile?.organization_id) return <Navigate to="/" replace />;
  if (userProfile?.payment_verified && !completed) return <Navigate to="/onboarding" replace />;

  if (pollFailed) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-background via-background to-white">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="w-16 h-16 bg-resend-yellow/10 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-resend-yellow" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">Almost There!</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">Your payment method was verified, but the profile refresh has not caught up yet.</p>
          </div>
          <div className="flex flex-col gap-3">
            <Button className="w-full h-12 bg-primary hover:bg-primary text-primary-foreground font-bold rounded-xl shadow-lg" onClick={async () => {
              setPollFailed(false);
              try {
                const freshProfile = await refreshProfile();
                if (freshProfile?.payment_verified) navigate('/onboarding', { replace: true });
                else setPollFailed(true);
              } catch (err) {
                toast.error(err.message || 'Still having trouble. Please try logging out and back in.');
                setPollFailed(true);
              }
            }}>
              <RefreshCw className="w-5 h-5 mr-2" /> Try Again
            </Button>
            <Button variant="outline" className="w-full h-10 rounded-xl" onClick={() => navigate('/onboarding', { replace: true })}>Continue to Setup</Button>
          </div>
        </div>
      </div>
    );
  }

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
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center space-y-2">
          <div className="w-16 h-16 bg-card rounded-2xl shadow-xl flex items-center justify-center mx-auto mb-4 border border-border">
            {paymentMethod === 'ach' ? <Landmark className="w-8 h-8 text-primary" /> : <CreditCard className="w-8 h-8 text-primary" />}
          </div>
          <h1 className="text-3xl font-black text-foreground tracking-tight">Confirm Your Account</h1>
          <p className="text-muted-foreground font-medium">Choose and verify the funding method for onboarding.</p>
        </div>

        <Card className="border-none shadow-2xl bg-card/80 backdrop-blur-xl ring-1 ring-slate-200/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-bold text-foreground">Payment Method Verification</CardTitle>
            <CardDescription className="text-muted-foreground">Card setup uses Stripe. Bank setup collects details through a secure onboarding vault workflow and requires a linked signature authorization.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setPaymentMethod('card')} className={`rounded-xl border p-4 text-left transition ${paymentMethod === 'card' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-card hover:border-primary/40'}`}>
                <CreditCard className="mb-3 h-5 w-5 text-primary" />
                <p className="font-semibold text-foreground">Credit or debit card</p>
                <p className="mt-1 text-xs text-muted-foreground">Validate through Stripe CardElement.</p>
              </button>
              <button type="button" onClick={() => setPaymentMethod('ach')} className={`rounded-xl border p-4 text-left transition ${paymentMethod === 'ach' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-card hover:border-primary/40'}`}>
                <Landmark className="mb-3 h-5 w-5 text-primary" />
                <p className="font-semibold text-foreground">Bank transfer / ACH</p>
                <p className="mt-1 text-xs text-muted-foreground">Bank details plus signed authorization.</p>
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
                </div>
              )
            ) : (
              <BankAuthorizationForm userProfile={userProfile} onVerified={() => setCompleted(true)} />
            )}
          </CardContent>
          <CardFooter className="bg-secondary/50 border-t border-border rounded-b-xl flex flex-col gap-3 py-6">
            <div className="flex items-center gap-4 justify-center grayscale opacity-50">
              <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Secure payment onboarding</span>
            </div>
            <p className="text-[10px] text-center text-muted-foreground">By continuing, you agree to our Terms of Service and Privacy Policy. Your verified payment method will be used for future billing.</p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
