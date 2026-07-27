import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Building2, CheckCircle2, FileCheck2, Loader2, Mail, Phone, ShieldCheck, Clock3, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/lib/AuthContext';
import { useConfirmation } from '@/hooks/useConfirmation';
import { getConfirmationMessage } from '@/lib/confirmationMessages';
import { api } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import NotificationConsentNotice from '@/components/NotificationConsentNotice';

const BUSINESS_TYPES = [
  { value: 'llc', label: 'LLC' },
  { value: 'corporation', label: 'Corporation' },
  { value: 's_corporation', label: 'S Corporation' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'sole_proprietor', label: 'Sole Proprietor' },
  { value: 'independent_contractor', label: 'Independent Contractor' },
];

const createNotificationDeliveryPreferences = () => ({ email_enabled: false, phone_enabled: false });
const BUSINESS_VERIFICATION_NOTIFICATION_MODULE_KEYS = ['dashboard', 'invoices', 'payments', 'inventory', 'vendors', 'labor'];
const INDIVIDUAL_OWNER_TYPES = new Set(['sole_proprietor', 'independent_contractor']);

function identifierTypeForBusinessType(businessType) {
  return INDIVIDUAL_OWNER_TYPES.has(businessType) ? 'ssn' : 'ein';
}
const BUSINESS_STEPS = [
  { key: 'contact_verification', label: 'Contact' },
  { key: 'business_information', label: 'Business' },
  { key: 'business_review', label: 'Review' },
];

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function normalizePhone(value) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits;
}
function normalizeTaxIdentifier(value) {
  return value.replace(/\D/g, '').slice(0, 9);
}

function formatTaxIdentifier(value, identifierType) {
  const digits = normalizeTaxIdentifier(value);
  if (identifierType === 'ein') {
    return digits.length > 2 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : digits;
  }
  if (digits.length > 5) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  if (digits.length > 3) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return digits;
}

function maskIdentifier(identifier) {
  const digits = identifier.replace(/\D/g, '');
  return digits.slice(-4);
}

function scoreBusiness({ identifierType, website, phone, email, taxVerificationEnabled = true }) {
  let score = taxVerificationEnabled ? (identifierType === 'ein' ? 60 : 55) : 70;
  if (email.includes('@')) score += 10;
  if (phone.replace(/\D/g, '').length >= 10) score += 10;
  if (website.trim()) score += 10;
  return Math.min(score, 100);
}

function statusFromScore(score) {
  if (score >= 80) return 'verified';
  if (score >= 50) return 'pending_review';
  return 'failed';
}

export default function BusinessVerification() {
  const { user, userProfile, refreshProfile, logout } = useAuth();
  const { confirm } = useConfirmation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(true);
  const [submittedForReview, setSubmittedForReview] = useState(false);
  const [stepError, setStepError] = useState('');
  const [stepKey, setStepKey] = useState('business_information');
  const [reviewFeedback, setReviewFeedback] = useState(null);
  const [revealedTaxId, setRevealedTaxId] = useState(null);
  const [revealingTaxId, setRevealingTaxId] = useState(false);
  const [nameAvailable, setNameAvailable] = useState(true);
  const [verificationSettings, setVerificationSettings] = useState({ ein_verification_enabled: false, ssn_verification_enabled: false });
  const [notificationDelivery, setNotificationDelivery] = useState(createNotificationDeliveryPreferences());
  const [contactOtp, setContactOtp] = useState({
    email: {
      otpId: null,
      code: '',
      verifiedTarget: '',
      sending: false,
      verifying: false,
      verifiedAt: null,
    },
    phone: {
      otpId: null,
      code: '',
      verifiedTarget: '',
      sending: false,
      verifying: false,
      verifiedAt: null,
    },
  });
  const [form, setForm] = useState({
    legalName: userProfile?.organization_name || '',
    businessType: 'llc',
    identifierType: 'ein',
    taxIdentifier: '',
    email: user?.email || '',
    phone: '',
    website: '',
  });

  const requiredIdentifierType = identifierTypeForBusinessType(form.businessType);
  const isTaxVerificationEnabled = requiredIdentifierType === 'ein' ? verificationSettings.ein_verification_enabled : verificationSettings.ssn_verification_enabled;
  const isIndividualOwner = requiredIdentifierType === 'ssn';
  const contactEmailLabel = 'Email';
  const emailVerified = Boolean(contactOtp.email.verifiedAt && contactOtp.email.verifiedTarget === normalizeEmail(form.email));
  const phoneVerified = Boolean(contactOtp.phone.verifiedAt && contactOtp.phone.verifiedTarget === normalizePhone(form.phone));

  const trustScore = useMemo(() => scoreBusiness({
    identifierType: requiredIdentifierType,
    website: form.website,
    phone: form.phone,
    email: form.email,
    taxVerificationEnabled: isTaxVerificationEnabled,
  }), [form, requiredIdentifierType, isTaxVerificationEnabled]);
  const currentStepIndex = Math.max(0, BUSINESS_STEPS.findIndex((step) => step.key === stepKey));
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === BUSINESS_STEPS.length - 1;

  useEffect(() => {
    let cancelled = false;
    const loadDraft = async () => {
      try {
        const [draftState, settings] = await Promise.all([
          api.onboarding.getBusinessVerificationDraft().catch(() => null),
          api.onboarding.getVerificationSettings().catch(() => ({ ein_verification_enabled: false, ssn_verification_enabled: false })),
        ]);
        if (cancelled) return;
        setVerificationSettings({
          ein_verification_enabled: settings?.ein_verification_enabled === true,
          ssn_verification_enabled: settings?.ssn_verification_enabled === true,
        });
        const draft = draftState?.draft || {};
        if (draft.form) {
          setForm((prev) => ({ ...prev, ...draft.form }));
        }
        if (draft.notificationDelivery) {
          setNotificationDelivery({
            ...createNotificationDeliveryPreferences(),
            email_enabled: draft.notificationDelivery.email_enabled === true,
            phone_enabled: draft.notificationDelivery.phone_enabled === true,
          });
        }
        if (draftState?.current_step && BUSINESS_STEPS.some((step) => step.key === draftState.current_step)) {
          setStepKey(draftState.current_step);
        }
        if ((draftState?.business_verification_status === 'failed' || draftState?.business_verification_status === 'rejected') && (draftState?.rejection_reason || draftState?.more_info_reason)) {
          setReviewFeedback({
            reason: draftState.rejection_reason || draftState.more_info_reason,
            isMoreInfo: Boolean(draftState.more_info_reason),
          });
        }
      } finally {
        if (!cancelled) setLoadingDraft(false);
      }
    };
    loadDraft();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const name = form.legalName.trim();
    if (name.length < 3) {
      setNameAvailable(true);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api.onboarding.isBusinessNameAvailable(name)
        .then((available) => { if (!cancelled) setNameAvailable(available); })
        .catch(() => { if (!cancelled) setNameAvailable(true); });
    }, 500);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [form.legalName]);

  const buildDraftPayload = () => {
    const { taxIdentifier, ...formWithoutTaxId } = form;
    return { form: { ...formWithoutTaxId, identifierType: requiredIdentifierType }, notificationDelivery };
  };
  const saveNotificationDeliveryPreferences = async () => {
    if (!user?.id) return;
    const rows = BUSINESS_VERIFICATION_NOTIFICATION_MODULE_KEYS.map((moduleKey) => ({
      user_id: user.id,
      organization_id: userProfile?.organization_id || null,
      module_key: moduleKey,
      in_app_enabled: true,
      email_enabled: notificationDelivery.email_enabled,
      phone_enabled: notificationDelivery.phone_enabled,
      critical_only: false,
    }));

    const { error } = await api.client
      .from('notification_delivery_preferences')
      .upsert(rows, { onConflict: 'user_id,module_key' });
    if (error) throw error;
  };
  const saveDraft = async (targetStep = stepKey, options = {}) => {
    if (!user?.id) return false;
    setSavingDraft(true);
    try {
      await api.onboarding.saveBusinessVerificationDraft({ payload: buildDraftPayload(), step: targetStep });
      await refreshProfile();
      if (!options.silent) toast.success('Draft saved.');
      return true;
    } catch (err) {
      console.error('Failed to save onboarding draft:', err);
      toast.error(err.message || 'Failed to save draft.');
      return false;
    } finally {
      setSavingDraft(false);
    }
  };

  const validateBusinessInfo = () => {
    if (!form.legalName.trim()) return 'Legal business name is required.';
    if (form.identifierType !== requiredIdentifierType) return isIndividualOwner ? 'SSN is required for this tenant type.' : 'EIN is required for this tenant type.';
    if (isTaxVerificationEnabled && !form.taxIdentifier.trim()) return requiredIdentifierType === 'ein' ? 'EIN is required.' : 'SSN is required for this verification path.';
    if (isTaxVerificationEnabled && normalizeTaxIdentifier(form.taxIdentifier).length !== 9) return requiredIdentifierType === 'ein' ? 'EIN must be 9 digits.' : 'SSN must be 9 digits.';
    return null;
  };

  const validateContact = () => {
    if (!form.email.includes('@')) return 'A valid email is required.';
    if (form.phone.replace(/\D/g, '').length < 10) return 'A valid phone number is required.';
    if (!emailVerified) return `Verify the ${contactEmailLabel.toLowerCase()} with OTP before continuing.`;
    if (!phoneVerified) return 'Verify the phone with OTP before continuing.';
    return null;
  };

  const validateCurrentStep = () => {
    if (stepKey === 'contact_verification') return validateContact();
    if (stepKey === 'business_information') return validateBusinessInfo();
    return validate();
  };

  const goToStep = async (nextKey) => {
    const nextIndex = BUSINESS_STEPS.findIndex((step) => step.key === nextKey);
    setStepError('');
    if (nextIndex > currentStepIndex) {
      const validationMessage = validateCurrentStep();
      if (validationMessage) {
        setStepError(validationMessage);
        toast.error(validationMessage);
        return;
      }
    }
    const saved = await saveDraft(nextKey, { silent: true });
    if (saved) {
      setStepError('');
      setStepKey(nextKey);
    }
  };

  const goNext = () => {
    const next = BUSINESS_STEPS[currentStepIndex + 1];
    if (next) goToStep(next.key);
  };

  const goBack = () => {
    const prev = BUSINESS_STEPS[currentStepIndex - 1];
    if (prev) goToStep(prev.key);
  };

  if (userProfile?.organization_id) {
    return <Navigate to="/" replace />;
  }

  if (userProfile?.business_verification_status === 'verified') {
    return <Navigate to="/onboarding" replace />;
  }

  if (userProfile?.business_verification_status === 'rejected') {
    const goToLanding = async () => {
      try {
        await logout();
      } finally {
        navigate('/landing', { replace: true });
      }
    };

    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-background via-background to-white">
        <Card className="w-full max-w-lg border-none bg-card/90 text-center shadow-2xl ring-1 ring-border/60 backdrop-blur-xl">
          <CardHeader className="space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl font-black tracking-tight">Business Verification Rejected</CardTitle>
              <CardDescription className="text-base">
                Your platform admin has rejected this application. This decision is final and this application cannot be resubmitted.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {reviewFeedback?.reason && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-left text-sm">
                <p className="font-bold text-foreground">Reason</p>
                <p className="mt-1 text-muted-foreground">{reviewFeedback.reason}</p>
              </div>
            )}
            <Button type="button" onClick={goToLanding} className="w-full">
              Go to Landing Page
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submittedForReview || userProfile?.business_verification_status === 'pending_review') {
    const goToLanding = async () => {
      try {
        await logout();
      } finally {
        navigate('/landing', { replace: true });
      }
    };

    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-background via-background to-white">
        <Card className="w-full max-w-lg border-none bg-card/90 text-center shadow-2xl ring-1 ring-border/60 backdrop-blur-xl">
          <CardHeader className="space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
              <Clock3 className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl font-black tracking-tight">Business Verification Submitted</CardTitle>
              <CardDescription className="text-base">
                Platform admin will verify your business details and notify you when your account is approved.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border bg-secondary/40 p-4 text-left text-sm">
              <p className="font-bold text-foreground">What happens next?</p>
              <p className="mt-1 text-muted-foreground">You can leave this page now. After approval, sign in again to continue hierarchy setup.</p>
            </div>
            <Button type="button" onClick={goToLanding} className="w-full">
              Go to Landing Page
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const validate = () => {
    if (!form.legalName.trim()) return 'Legal business name is required.';
    if (form.identifierType !== requiredIdentifierType) return isIndividualOwner ? 'SSN is required for this tenant type.' : 'EIN is required for this tenant type.';
    if (isTaxVerificationEnabled && !form.taxIdentifier.trim()) return requiredIdentifierType === 'ein' ? 'EIN is required.' : 'SSN is required for this verification path.';
    if (isTaxVerificationEnabled && normalizeTaxIdentifier(form.taxIdentifier).length !== 9) return requiredIdentifierType === 'ein' ? 'EIN must be 9 digits.' : 'SSN must be 9 digits.';
    if (!form.email.includes('@')) return 'A valid business email is required.';
    if (form.phone.replace(/\D/g, '').length < 10) return 'A valid business phone number is required.';
    if (!emailVerified) return `Verify the ${contactEmailLabel.toLowerCase()} with OTP before continuing.`;
    if (!phoneVerified) return 'Verify the business phone with OTP before continuing.';
    return null;
  };

  const requestOtp = async (channel) => {
    const target = channel === 'email' ? form.email : form.phone;
    const normalizedTarget = channel === 'email' ? normalizeEmail(target) : normalizePhone(target);

    if (channel === 'email' && !normalizedTarget.includes('@')) {
      toast.error('Enter a valid business email first.');
      return;
    }
    if (channel === 'phone' && normalizedTarget.replace(/\D/g, '').length < 10) {
      toast.error('Enter a valid business phone first.');
      return;
    }

    setContactOtp((prev) => ({
      ...prev,
      [channel]: { ...prev[channel], sending: true, otpId: null, code: '', verifiedTarget: '', verifiedAt: null },
    }));

    try {
      const result = await api.onboarding.requestContactOtp({ channel, target });
      setContactOtp((prev) => ({
        ...prev,
        [channel]: {
          ...prev[channel],
          otpId: result.otp_id,
          code: '',
          verifiedTarget: '',
          verifiedAt: null,
          sending: false,
        },
      }));
      toast.success(`${channel === 'email' ? 'Email' : 'Phone'} OTP sent.`);
    } catch (err) {
      console.error('OTP request failed:', err);
      toast.error(err.message || 'Failed to send OTP.');
      setContactOtp((prev) => ({ ...prev, [channel]: { ...prev[channel], sending: false } }));
    }
  };

  const verifyOtp = async (channel) => {
    const state = contactOtp[channel];
    if (!state.otpId) {
      toast.error('Request an OTP first.');
      return;
    }
    if (state.code.trim().length < 6) {
      toast.error('Enter the 6-digit OTP code.');
      return;
    }

    setContactOtp((prev) => ({ ...prev, [channel]: { ...prev[channel], verifying: true } }));

    try {
      const result = await api.onboarding.verifyContactOtp({ channel, target: channel === 'email' ? form.email : form.phone, code: state.code, otpId: state.otpId });
      setContactOtp((prev) => ({
        ...prev,
        [channel]: {
          ...prev[channel],
          verifiedTarget: result.target,
          verifiedAt: result.verified_at || new Date().toISOString(),
          verifying: false,
          code: '',
        },
      }));
      await refreshProfile();
      toast.success(`${channel === 'email' ? 'Email' : 'Phone'} verified.`);
    } catch (err) {
      console.error('OTP verification failed:', err);
      toast.error(err.message || 'Invalid OTP code.');
      setContactOtp((prev) => ({ ...prev, [channel]: { ...prev[channel], verifying: false } }));
    }
  };

  const handleToggleRevealTaxId = async () => {
    if (revealedTaxId) {
      setRevealedTaxId(null);
      return;
    }
    setRevealingTaxId(true);
    try {
      const result = await api.onboarding.revealTaxIdentifier();
      setRevealedTaxId(result?.full_identifier || null);
    } catch (err) {
      toast.error(err.message || 'Could not reveal the stored tax identifier.');
    } finally {
      setRevealingTaxId(false);
    }
  };

  const updateOtpCode = (channel, code) => {
    setContactOtp((prev) => ({
      ...prev,
      [channel]: { ...prev[channel], code: code.replace(/\D/g, '').slice(0, 6) },
    }));
  };
  const saveVerification = async () => {
    if (loading) return;
    setStepError('');
    const validationMessage = validate();
    if (validationMessage) {
      setStepError(validationMessage);
      toast.error(validationMessage);
      return;
    }

    if (!user?.id) {
      toast.error('You must be signed in to continue.');
      return;
    }

    const confirmed = await confirm(getConfirmationMessage(
      'submitOnboardingBusinessVerification',
      form.legalName.trim(),
      requiredIdentifierType,
      maskIdentifier(form.taxIdentifier),
      isTaxVerificationEnabled
    ));
    if (!confirmed) return;

    setLoading(true);
    try {
      const result = await api.onboarding.submitBusinessVerification({
        ...form,
        identifierType: requiredIdentifierType,
        taxIdentifier: isTaxVerificationEnabled ? form.taxIdentifier : '',
      });

      await refreshProfile();

      if (result?.tax_identifier_required === false) {
        toast.info('Tax ID verification is currently disabled by Platform Admin; continuing with contact verification.');
      }

      if (result?.status === 'verified') {
        toast.success('Business verified. Continue to onboarding.');
        navigate('/onboarding', { replace: true });
      } else if (result?.status === 'pending_review') {
        setSubmittedForReview(true);
        toast.info('Business submitted for manual review. We will notify you after approval.');
      } else {
        toast.error('Business verification failed. Please review and resubmit.');
      }
    } catch (err) {
      console.error('Business verification failed:', err);
      toast.error(err.message || 'Business verification failed.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="min-h-screen bg-secondary flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-background via-background to-white">
      <div className="w-full max-w-4xl space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border bg-card shadow-lg">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Verify Your Business</h1>
          <p className="text-muted-foreground">Business and contact verification happens before payment setup.</p>
        </div>

        <Card className="border-none bg-card/85 shadow-2xl ring-1 ring-border/60 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> Business Information</CardTitle>
            <CardDescription>We support EIN businesses and SSN-based sole proprietors. Only masked identifiers are stored.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {loadingDraft ? (
              <div className="flex items-center justify-center rounded-xl border bg-secondary/30 p-10 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading saved onboarding progress...
              </div>
            ) : (
              <>
                {reviewFeedback && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <p className="font-bold">{reviewFeedback.isMoreInfo ? 'Platform admin requested more information' : 'Business verification needs changes'}</p>
                    <p className="mt-1">{reviewFeedback.reason}</p>
                    <p className="mt-1 text-xs text-amber-700">Update the details below and resubmit for review.</p>
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-3">
                  {BUSINESS_STEPS.map((step, index) => (
                    <button
                      key={step.key}
                      type="button"
                      onClick={() => goToStep(step.key)}
                      className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${stepKey === step.key ? 'border-primary bg-primary text-primary-foreground' : index < currentStepIndex ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-border bg-secondary/40 text-muted-foreground'}`}
                    >
                      {index + 1}. {step.label}
                    </button>
                  ))}
                </div>

                {stepKey === 'business_information' && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1 md:col-span-2">
                      <Label>Legal Business Name</Label>
                      <Input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} placeholder="Acme Hospitality LLC" />
                      {!nameAvailable && (
                        <p className="text-xs text-amber-600">A business named "{form.legalName.trim()}" is already registered on RestOps. If that's not you, you can still continue.</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>Business Type</Label>
                      <Select value={form.businessType} onValueChange={(value) => setForm({ ...form, businessType: value, identifierType: identifierTypeForBusinessType(value), taxIdentifier: '' })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{BUSINESS_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Tax Identifier Type</Label>
                      <div className="flex h-10 items-center rounded-md border bg-secondary/50 px-3 text-sm font-medium text-foreground">
                        {requiredIdentifierType === 'ein' ? 'EIN' : 'SSN'}
                      </div>
                      <p className="text-xs text-muted-foreground">{isIndividualOwner ? 'Individual owner tenants use SSN when verification is enabled.' : 'Business entity tenants use EIN when verification is enabled.'}</p>
                    </div>
                    <div className="space-y-1">
                      <Label>{requiredIdentifierType === 'ein' ? 'EIN' : 'SSN'}</Label>
                      <Input value={formatTaxIdentifier(form.taxIdentifier, requiredIdentifierType)} onChange={(e) => setForm({ ...form, taxIdentifier: normalizeTaxIdentifier(e.target.value), identifierType: requiredIdentifierType })} disabled={!isTaxVerificationEnabled} placeholder={isTaxVerificationEnabled ? (requiredIdentifierType === 'ein' ? '12-3456789' : '123-45-6789') : 'Verification disabled by Platform Admin'} inputMode="numeric" />
                      {isTaxVerificationEnabled && <p className="text-xs text-muted-foreground">Enter the 9-digit {requiredIdentifierType.toUpperCase()}.</p>}
                      {!isTaxVerificationEnabled && <p className="text-xs text-amber-600">This verification type is disabled. No EIN/SSN is required for this onboarding.</p>}
                    </div>
                    <div className="space-y-1">
                      <Label>Website</Label>
                      <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://restaurant.com" />
                      <p className="text-xs text-muted-foreground">Optional. You can leave this blank and continue.</p>
                    </div>
                  </div>
                )}

                {stepKey === 'contact_verification' && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{contactEmailLabel}</Label>
                      <div className="flex gap-2">
                        <Input
                          value={form.email}
                          onChange={(e) => {
                            setForm({ ...form, email: e.target.value });
                            setContactOtp((prev) => ({ ...prev, email: { ...prev.email, verifiedTarget: '', verifiedAt: null } }));
                          }}
                          placeholder={isIndividualOwner ? "owner@gmail.com" : "owner@restaurant.com"}
                        />
                        <Button type="button" variant={emailVerified ? 'secondary' : 'outline'} onClick={() => requestOtp('email')} disabled={contactOtp.email.sending} className="min-w-[112px] shrink-0 gap-2">
                          {contactOtp.email.sending ? <Loader2 className="h-4 w-4 animate-spin" /> : emailVerified ? <CheckCircle2 className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                          {contactOtp.email.sending ? 'Sending' : emailVerified ? 'Reverify' : contactOtp.email.otpId ? 'Resend' : 'Send OTP'}
                        </Button>
                      </div>
                      {!emailVerified && contactOtp.email.otpId && (
                        <div className="space-y-2 rounded-lg border bg-secondary/40 p-3">
                          <div className="flex gap-2">
                            <Input value={contactOtp.email.code} onChange={(e) => updateOtpCode('email', e.target.value)} placeholder="Email OTP" inputMode="numeric" />
                            <Button type="button" onClick={() => verifyOtp('email')} disabled={contactOtp.email.verifying} className="shrink-0">
                              {contactOtp.email.verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
                            </Button>
                          </div>
                        </div>
                      )}
                      {emailVerified && <p className="text-xs font-medium text-resend-green">Email verified.</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <div className="flex gap-2">
                        <Input
                          value={form.phone}
                          onChange={(e) => {
                            setForm({ ...form, phone: e.target.value });
                            setContactOtp((prev) => ({ ...prev, phone: { ...prev.phone, verifiedTarget: '', verifiedAt: null } }));
                          }}
                          placeholder="(865) 555-0142"
                        />
                        <Button type="button" variant={phoneVerified ? 'secondary' : 'outline'} onClick={() => requestOtp('phone')} disabled={contactOtp.phone.sending} className="min-w-[112px] shrink-0 gap-2">
                          {contactOtp.phone.sending ? <Loader2 className="h-4 w-4 animate-spin" /> : phoneVerified ? <CheckCircle2 className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                          {contactOtp.phone.sending ? 'Sending' : phoneVerified ? 'Reverify' : contactOtp.phone.otpId ? 'Resend' : 'Send OTP'}
                        </Button>
                      </div>
                      {!phoneVerified && contactOtp.phone.otpId && (
                        <div className="space-y-2 rounded-lg border bg-secondary/40 p-3">
                          <div className="flex gap-2">
                            <Input value={contactOtp.phone.code} onChange={(e) => updateOtpCode('phone', e.target.value)} placeholder="Phone OTP" inputMode="numeric" />
                            <Button type="button" onClick={() => verifyOtp('phone')} disabled={contactOtp.phone.verifying} className="shrink-0">
                              {contactOtp.phone.verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
                            </Button>
                          </div>
                        </div>
                      )}
                      {phoneVerified && <p className="text-xs font-medium text-resend-green">Phone verified.</p>}
                    </div>
                    <div className="space-y-3 rounded-lg border bg-secondary/30 p-4 md:col-span-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">Notification Delivery</p>
                        <p className="text-xs text-muted-foreground">Email and SMS notifications are off by default. Turn on only the channels this user wants to receive.</p>
                      </div>
                      <NotificationConsentNotice compact />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="flex items-center justify-between gap-3 rounded-md border bg-card/70 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium text-foreground">Email notifications</span>
                          </div>
                          <Switch checked={notificationDelivery.email_enabled} onCheckedChange={(checked) => setNotificationDelivery((prev) => ({ ...prev, email_enabled: checked === true }))} aria-label="Enable email notifications" />
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-md border bg-card/70 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium text-foreground">SMS notifications</span>
                          </div>
                          <Switch checked={notificationDelivery.phone_enabled} onCheckedChange={(checked) => setNotificationDelivery((prev) => ({ ...prev, phone_enabled: checked === true }))} aria-label="Enable SMS notifications" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {stepKey === 'business_review' && (
                  <div className="space-y-4">
                    <div className="rounded-lg border bg-primary/5 p-4">
                      <div className="flex items-center gap-2 font-semibold text-foreground">
                        <FileCheck2 className="h-4 w-4 text-primary" />
                        Estimated Trust Score: {trustScore}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{isTaxVerificationEnabled ? 'Tax ID verification is enabled for this identifier type. Contact verification and admin review still apply.' : 'Tax ID verification is disabled for this identifier type. Contact verification still applies.'}</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border bg-secondary/30 p-4 text-sm"><b>Business:</b> {form.legalName || 'Not entered'}<br /><span className="text-muted-foreground">{form.businessType} / {requiredIdentifierType.toUpperCase()}</span></div>
                      <div className="rounded-lg border bg-secondary/30 p-4 text-sm"><b>Contact:</b> {form.email || 'No email'}<br /><span className="text-muted-foreground">{form.phone || 'No phone'}</span></div>

                    </div>
                    {userProfile?.tax_identifier_last4 && (
                      <div className="rounded-lg border bg-secondary/30 p-4 text-sm">
                        <b>{(userProfile?.tax_identifier_type || requiredIdentifierType).toUpperCase()} on file:</b>{' '}
                        <span className="font-mono">{revealedTaxId || `•••••${userProfile.tax_identifier_last4}`}</span>
                        <Button type="button" variant="ghost" size="sm" className="ml-2 h-7" onClick={handleToggleRevealTaxId} disabled={revealingTaxId}>
                          {revealingTaxId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : revealedTaxId ? 'Hide' : 'Show'}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                {stepError && (
                  <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
                    {stepError}
                  </div>
                )}
              </>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-3 border-t bg-secondary/40 p-6 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="outline" onClick={() => saveDraft()} disabled={savingDraft || loading || loadingDraft}>
              {savingDraft ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : 'Save Draft'}
            </Button>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button type="button" variant="ghost" onClick={goBack} disabled={isFirstStep || savingDraft || loading || loadingDraft} className="flex-1 sm:flex-none">
                Back
              </Button>
              {!isLastStep ? (
                <Button type="button" onClick={goNext} disabled={savingDraft || loading || loadingDraft} className="flex-1 sm:flex-none">
                  Next
                </Button>
              ) : (
                <Button onClick={saveVerification} disabled={loading || savingDraft || loadingDraft} className="min-w-[180px] flex-1 sm:flex-none">
                  {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...</> : <><CheckCircle2 className="mr-2 h-4 w-4" /> Verify & Continue</>}
                </Button>
              )}
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
