import React, { useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useConfirmation } from '@/hooks/useConfirmation';
import { getConfirmationMessage } from '@/lib/confirmationMessages';
import { api } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowRight, Landmark, Lock, Loader2, PenLine } from 'lucide-react';

const CONSENT_VERSION = 'tenant-bank-authorization-v1';
const CONSENT_TEXT = 'I authorize this organization to use the selected bank account for check, ACH, and related payment activity. I certify that I am authorized to sign for this bank account and that the signature artifact may be retained for audit and payment authorization evidence.';

const emptyAddress = () => ({ line1: '', line2: '', city: '', state: '', postalCode: '', country: 'United States' });
const addressComplete = (a) => Boolean(a?.line1?.trim() && a?.city?.trim() && a?.state?.trim() && a?.postalCode?.trim() && a?.country?.trim());

// accessTree is [{ organization, role, brands: [{ brand, role, locations: [{ location, role }] }] }]
// -- the same tree ContextSwitcher uses, sourced from the tenant's own hierarchy submission.
const buildAssignmentOptions = (tree) => {
  const options = [];
  (tree || []).forEach((orgNode) => {
    const org = orgNode?.organization;
    if (!org?.id) return;
    options.push({ value: `organization:${org.id}`, label: `Organization — ${org.name}` });
    (orgNode.brands || []).forEach((brandNode) => {
      const brand = brandNode?.brand;
      if (!brand?.brand_id) return;
      options.push({ value: `brand:${brand.brand_id}`, label: `Brand — ${brand.name}` });
      (brandNode.locations || []).forEach((locationNode) => {
        const location = locationNode?.location;
        if (!location?.id) return;
        options.push({ value: `location:${location.id}`, label: `Location — ${location.name}` });
      });
    });
  });
  return options;
};

async function sha256Hex(value) {
  const encoded = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export default function CompleteOnboarding() {
  const { userProfile, refreshProfile, accessTree, fetchAccessTree } = useAuth();
  const { confirm } = useConfirmation();
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState([]);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [savingBank, setSavingBank] = useState(false);
  const [capturingSignature, setCapturingSignature] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const assignmentOptions = React.useMemo(() => buildAssignmentOptions(accessTree), [accessTree]);
  const assignmentLabel = React.useCallback(
    (value) => assignmentOptions.find((opt) => opt.value === value)?.label || null,
    [assignmentOptions]
  );
  const pendingSignatureAccounts = React.useMemo(
    () => accounts.filter((account) => account.status === 'pending_signature'),
    [accounts]
  );
  const accountAssignmentValue = (account) => {
    if (account.location_id) return `location:${account.location_id}`;
    if (account.brand_id) return `brand:${account.brand_id}`;
    if (account.organization_id) return `organization:${account.organization_id}`;
    return null;
  };

  const [bankForm, setBankForm] = useState({
    assignment: '',
    bank_name: '',
    account_holder_name: userProfile?.full_name || '',
    account_type: 'checking',
    routing_number: '',
    account_number: '',
    billing_address_source: 'business',
    is_default: true,
    nickname: '',
  });
  const [customAddress, setCustomAddress] = useState(emptyAddress());
  const [signatureForm, setSignatureForm] = useState({
    signerFullName: userProfile?.full_name || '',
    signerTitle: '',
    signatureText: '',
    consentAccepted: false,
  });

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const rows = await api.onboarding.listOnboardingBankAccounts();
      setAccounts(rows);
      const preferred = rows.find((row) => row.status === 'pending_signature') || rows.find((row) => row.is_default) || rows[0];
      setSelectedBankId((current) => current || preferred?.id || '');
    } catch (err) {
      toast.error(err.message || 'Could not load bank accounts.');
    } finally {
      setLoadingAccounts(false);
    }
  };

  useEffect(() => {
    loadAccounts();
    fetchAccessTree();
  }, []);

  if (userProfile && userProfile.business_verification_status !== 'verified') {
    return <Navigate to="/business-verification" replace />;
  }
  if (userProfile && !userProfile.organization_id) {
    return <Navigate to="/onboarding" replace />;
  }
  if (userProfile && !userProfile.payment_verified) {
    return <Navigate to="/onboarding" replace />;
  }
  if (userProfile?.banking_onboarding_completed) {
    return <Navigate to="/" replace />;
  }

  const handleBankChange = (field, value) => setBankForm((prev) => ({ ...prev, [field]: value }));
  const updateCustomAddress = (field, value) => setCustomAddress((prev) => ({ ...prev, [field]: value }));

  const saveBankAccount = async (event) => {
    event.preventDefault();
    const [assignmentScope, assignmentId] = bankForm.assignment.split(':');
    if (!assignmentScope || !assignmentId) {
      toast.error('Choose which organization, brand, or location this bank account belongs to.');
      return;
    }
    if (bankForm.billing_address_source === 'custom' && !addressComplete(customAddress)) {
      toast.error('Enter a complete billing address (line 1, city, state, postal code, country).');
      return;
    }
    const accountLast4 = String(bankForm.account_number).replace(/\D/g, '').slice(-4);
    const confirmed = await confirm(getConfirmationMessage(
      'saveOnboardingBankAccount',
      bankForm.bank_name.trim(),
      accountLast4,
      assignmentLabel(bankForm.assignment)
    ));
    if (!confirmed) return;
    setSavingBank(true);
    try {
      const { assignment, ...bankFormRest } = bankForm;
      const payload = {
        ...bankFormRest,
        assignment_scope: assignmentScope,
        assignment_id: assignmentId,
        metadata: { source: 'complete_onboarding' },
      };
      if (bankForm.billing_address_source === 'custom') {
        payload.billing_address_line1 = customAddress.line1;
        payload.billing_address_line2 = customAddress.line2;
        payload.billing_address_city = customAddress.city;
        payload.billing_address_state = customAddress.state;
        payload.billing_address_postal_code = customAddress.postalCode;
        payload.billing_address_country = customAddress.country;
      }
      const result = await api.onboarding.submitBankAccount(payload);
      const saved = result?.bank_account;
      toast.success('Bank account saved. Add authorization signature next.');
      await loadAccounts();
      if (saved?.id) setSelectedBankId(saved.id);
      setBankForm((prev) => ({ ...prev, assignment: '', routing_number: '', account_number: '', nickname: '', is_default: false }));
    } catch (err) {
      toast.error(err.message || 'Could not save bank account.');
    } finally {
      setSavingBank(false);
    }
  };

  const skipBankingSetup = async () => {
    const confirmed = await confirm({
      title: 'Skip bank setup for now?',
      description: 'You can finish onboarding now and add or change operating bank details later from Payments > Payment Setup. Vendor bill-pay will stay limited until an account is added.',
      confirmText: 'Skip for Now',
      cancelText: 'Add Bank Account',
      variant: 'warning',
      severity: 'medium',
    });
    if (!confirmed) return;

    setFinalizing(true);
    try {
      await api.onboarding.skipBankingOnboarding();
      await refreshProfile();
      toast.success('Bank setup skipped. You can add bank details later from Payments > Payment Setup.');
      navigate('/Payments/setup', { replace: true });
    } catch (err) {
      toast.error(err.message || 'Could not skip bank setup.');
    } finally {
      setFinalizing(false);
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

    const targetAccount = accounts.find((account) => account.id === selectedBankId);
    const confirmed = await confirm(getConfirmationMessage(
      'captureOnboardingBankSignature',
      targetAccount?.account_number_last4 || '----',
      signatureForm.signerFullName.trim()
    ));
    if (!confirmed) return;

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
      setFinalizing(true);
      const freshProfile = await refreshProfile();
      if (freshProfile?.banking_onboarding_completed) {
        toast.success('Signature authorization captured. Banking setup complete.');
        navigate('/', { replace: true });
      } else {
        toast.success('Signature captured for that account. Sign your next bank account to finish.');
        setSignatureForm({ signerFullName: userProfile?.full_name || '', signerTitle: '', signatureText: '', consentAccepted: false });
        setSelectedBankId('');
        await loadAccounts();
      }
    } catch (err) {
      toast.error(err.message || 'Could not capture signature authorization.');
    } finally {
      setCapturingSignature(false);
      setFinalizing(false);
    }
  };

  return (
    <div className="min-h-screen bg-secondary flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-background via-background to-white">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center space-y-2">
          <div className="w-16 h-16 bg-card rounded-2xl shadow-xl flex items-center justify-center mx-auto mb-4 border border-border">
            <Landmark className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-black text-foreground tracking-tight">Complete Onboarding</h1>
          <p className="text-muted-foreground font-medium">Add your organization's operating bank account now, or skip and add it later from Payments.</p>
        </div>

        <Card className="border-none shadow-2xl bg-card/80 backdrop-blur-xl ring-1 ring-slate-200/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-bold text-foreground">Banking &amp; Authorization</CardTitle>
            <CardDescription className="text-muted-foreground">This is separate from your RestOps subscription payment method -- it's the account your organization pays vendors from. You can also manage it later in Payments &gt; Payment Setup.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-start gap-3 rounded-xl border bg-secondary/40 p-4">
              <Lock className="mt-0.5 h-4 w-4 text-primary shrink-0" />
              <p className="text-sm text-muted-foreground">Raw account and routing numbers are sent only to the secure onboarding bank RPC. Normal database reads expose last 4 digits and authorization status only.</p>
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
                          {assignmentLabel(accountAssignmentValue(account)) && (
                            <p className="text-xs font-semibold text-primary">{assignmentLabel(accountAssignmentValue(account))}</p>
                          )}
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
              <div className="space-y-1.5">
                <Label>Assign this account to</Label>
                <Select value={bankForm.assignment} onValueChange={(value) => handleBankChange('assignment', value)}>
                  <SelectTrigger><SelectValue placeholder="Select an organization, brand, or location" /></SelectTrigger>
                  <SelectContent>
                    {assignmentOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input placeholder="Bank name" value={bankForm.bank_name} onChange={(e) => handleBankChange('bank_name', e.target.value)} required />
                <Input placeholder="Account holder name" value={bankForm.account_holder_name} onChange={(e) => handleBankChange('account_holder_name', e.target.value)} required />
                <Select value={bankForm.account_type} onValueChange={(value) => handleBankChange('account_type', value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="checking">Checking</SelectItem>
                    <SelectItem value="savings">Savings</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={bankForm.billing_address_source} onValueChange={(value) => handleBankChange('billing_address_source', value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="business">Business address</SelectItem>
                    <SelectItem value="mailing">Mailing address</SelectItem>
                    <SelectItem value="service">Service address</SelectItem>
                    <SelectItem value="custom">Different address</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Routing number" inputMode="numeric" value={bankForm.routing_number} onChange={(e) => handleBankChange('routing_number', e.target.value)} required />
                <Input placeholder="Account number" inputMode="numeric" value={bankForm.account_number} onChange={(e) => handleBankChange('account_number', e.target.value)} required />
                <Input placeholder="Nickname, optional" className="sm:col-span-2" value={bankForm.nickname} onChange={(e) => handleBankChange('nickname', e.target.value)} />
              </div>

              {bankForm.billing_address_source === 'custom' && (
                <div className="space-y-3 rounded-lg border bg-secondary/20 p-3">
                  <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
                    <div className="space-y-1.5">
                      <Label>Billing Address</Label>
                      <Input value={customAddress.line1} onChange={(e) => updateCustomAddress('line1', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Suite / Unit</Label>
                      <Input value={customAddress.line2} onChange={(e) => updateCustomAddress('line2', e.target.value)} />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label>City</Label>
                      <Input value={customAddress.city} onChange={(e) => updateCustomAddress('city', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>State</Label>
                      <Input value={customAddress.state} onChange={(e) => updateCustomAddress('state', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Postal Code</Label>
                      <Input value={customAddress.postalCode} onChange={(e) => updateCustomAddress('postalCode', e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Country</Label>
                      <Input value={customAddress.country} onChange={(e) => updateCustomAddress('country', e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={bankForm.is_default} onChange={(e) => handleBankChange('is_default', e.target.checked)} />
                Make this the default operating bank account
              </label>
              <Button type="submit" disabled={savingBank} variant="outline" className="w-full rounded-xl">
                {savingBank ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving bank...</> : <><Landmark className="mr-2 h-4 w-4" /> Save Bank Account</>}
              </Button>
            </form>

            <form onSubmit={captureSignature} className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-foreground">Signature authorization</p>
                {pendingSignatureAccounts.length > 0 && accounts.length > 0 && (
                  <span className="text-xs font-semibold text-muted-foreground">{accounts.length - pendingSignatureAccounts.length}/{accounts.length} signed</span>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Bank account to authorize</Label>
                <Select value={selectedBankId} onValueChange={setSelectedBankId}>
                  <SelectTrigger><SelectValue placeholder="Select a bank account (last 4 digits only)" /></SelectTrigger>
                  <SelectContent>
                    {pendingSignatureAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>**** {account.account_number_last4} &middot; {account.account_type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input placeholder="Signer full name" value={signatureForm.signerFullName} onChange={(e) => setSignatureForm((prev) => ({ ...prev, signerFullName: e.target.value }))} required />
                <Input placeholder="Title or role" value={signatureForm.signerTitle} onChange={(e) => setSignatureForm((prev) => ({ ...prev, signerTitle: e.target.value }))} />
                <Input placeholder="Type legal signature" className="sm:col-span-2" value={signatureForm.signatureText} onChange={(e) => setSignatureForm((prev) => ({ ...prev, signatureText: e.target.value }))} required />
              </div>
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <input className="mt-1" type="checkbox" checked={signatureForm.consentAccepted} onChange={(e) => setSignatureForm((prev) => ({ ...prev, consentAccepted: e.target.checked }))} />
                <span>{CONSENT_TEXT}</span>
              </label>
              <Button type="submit" disabled={!selectedBankId || capturingSignature} variant="outline" className="w-full rounded-xl">
                {capturingSignature ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Capturing signature...</> : <><PenLine className="mr-2 h-4 w-4" /> Capture Signature for Selected Bank</>}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="bg-secondary/50 border-t border-border rounded-b-xl flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 text-center sm:text-left">
              {finalizing && (
                <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground sm:justify-start"><Loader2 className="h-4 w-4 animate-spin" /> Finishing up...</p>
              )}
              <p className="text-xs font-medium text-foreground">Need to finish setup first?</p>
              <p className="text-[10px] text-muted-foreground">By continuing, you agree to our Terms of Service and Privacy Policy.</p>
            </div>
            <Button type="button" variant="outline" className="w-full rounded-xl sm:w-auto" onClick={skipBankingSetup} disabled={finalizing || savingBank || capturingSignature}>
              {finalizing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
              Skip, add in Payments later
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

