import React, { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Building2, CheckCircle2, FileCheck2, Loader2, Mail, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const BUSINESS_TYPES = [
  { value: 'llc', label: 'LLC' },
  { value: 'corporation', label: 'Corporation' },
  { value: 's_corporation', label: 'S Corporation' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'sole_proprietor', label: 'Sole Proprietor' },
  { value: 'independent_contractor', label: 'Independent Contractor' },
];

const INDIVIDUAL_OWNER_TYPES = new Set(['sole_proprietor', 'independent_contractor']);

function identifierTypeForBusinessType(businessType) {
  return INDIVIDUAL_OWNER_TYPES.has(businessType) ? 'ssn' : 'ein';
}
const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','IA','ID','IL','IN','KS','KY','LA','MA','MD','ME','MI','MN','MO','MS','NC','ND','NE','NH','NJ','NM','NV','NY','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VA','VT','WA','WI','WV','WY'];

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function normalizePhone(value) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits;
}
const initialAddress = {
  line1: '',
  line2: '',
  city: '',
  state: '',
  zip: '',
};

function normalizeZip(value) {
  return value.replace(/[^0-9-]/g, '').slice(0, 10);
}

function maskIdentifier(identifier) {
  const digits = identifier.replace(/\D/g, '');
  return digits.slice(-4);
}

function scoreBusiness({ identifierType, website, phone, email, businessAddress, serviceAddress }) {
  let score = identifierType === 'ein' ? 50 : 45;
  if (email.includes('@')) score += 10;
  if (phone.replace(/\D/g, '').length >= 10) score += 10;
  if (website.trim()) score += 10;
  if (businessAddress.zip.length >= 5) score += 10;
  if (serviceAddress.zip.length >= 5) score += 10;
  return Math.min(score, 100);
}

function statusFromScore(score) {
  if (score >= 80) return 'verified';
  if (score >= 50) return 'pending_review';
  return 'failed';
}

export default function BusinessVerification() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [sameMailing, setSameMailing] = useState(true);
  const [contactOtp, setContactOtp] = useState({
    email: {
      otpId: null,
      code: '',
      verifiedTarget: userProfile?.business_email_verified_at ? userProfile.business_email || '' : '',
      sending: false,
      verifying: false,
      devCode: '',
    },
    phone: {
      otpId: null,
      code: '',
      verifiedTarget: userProfile?.business_phone_verified_at ? userProfile.business_phone || '' : '',
      sending: false,
      verifying: false,
      devCode: '',
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
    businessAddress: initialAddress,
    mailingAddress: initialAddress,
    serviceAddress: initialAddress,
    serviceLocationName: '',
  });

  const requiredIdentifierType = identifierTypeForBusinessType(form.businessType);
  const isIndividualOwner = requiredIdentifierType === 'ssn';
  const contactEmailLabel = isIndividualOwner ? 'Contact Email' : 'Business Email';
  const emailVerified = contactOtp.email.verifiedTarget === normalizeEmail(form.email);
  const phoneVerified = contactOtp.phone.verifiedTarget === normalizePhone(form.phone);

  const trustScore = useMemo(() => scoreBusiness({
    identifierType: requiredIdentifierType,
    website: form.website,
    phone: form.phone,
    email: form.email,
    businessAddress: form.businessAddress,
    serviceAddress: form.serviceAddress,
  }), [form, requiredIdentifierType]);
  if (userProfile?.organization_id) {
    return <Navigate to="/" replace />;
  }

  if (userProfile?.business_verification_status === 'verified') {
    return <Navigate to="/verify-payment" replace />;
  }

  const updateAddress = (key, field, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: field === 'zip' ? normalizeZip(value) : value,
      },
    }));
  };

  const validate = () => {
    if (!form.legalName.trim()) return 'Legal business name is required.';
    if (form.identifierType !== requiredIdentifierType) return isIndividualOwner ? 'SSN is required for this tenant type.' : 'EIN is required for this tenant type.';
    if (!form.taxIdentifier.trim()) return requiredIdentifierType === 'ein' ? 'EIN is required.' : 'SSN is required for this verification path.';
    if (!form.email.includes('@')) return 'A valid business email is required.';
    if (form.phone.replace(/\D/g, '').length < 10) return 'A valid business phone number is required.';
    if (!emailVerified) return `Verify the ${contactEmailLabel.toLowerCase()} with OTP before continuing.`;
    if (!phoneVerified) return 'Verify the business phone with OTP before continuing.';
    for (const [label, address] of [['Business address', form.businessAddress], ['Service address', form.serviceAddress]]) {
      if (!address.line1.trim() || !address.city.trim() || !address.state || address.zip.replace(/\D/g, '').length < 5) {
        return `${label} must include street, city, state, and ZIP.`;
      }
    }
    if (!sameMailing) {
      const address = form.mailingAddress;
      if (!address.line1.trim() || !address.city.trim() || !address.state || address.zip.replace(/\D/g, '').length < 5) {
        return 'Mailing address must include street, city, state, and ZIP.';
      }
    }
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
      [channel]: { ...prev[channel], sending: true, otpId: null, code: '', devCode: '' },
    }));

    try {
      const result = await api.onboarding.requestContactOtp({ channel, target });
      setContactOtp((prev) => ({
        ...prev,
        [channel]: {
          ...prev[channel],
          otpId: result.otp_id,
          code: '',
          devCode: result.dev_code || '',
          verifiedTarget: '',
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
      const result = await api.onboarding.verifyContactOtp({ otpId: state.otpId, code: state.code });
      setContactOtp((prev) => ({
        ...prev,
        [channel]: {
          ...prev[channel],
          verifiedTarget: result.target,
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

  const updateOtpCode = (channel, code) => {
    setContactOtp((prev) => ({
      ...prev,
      [channel]: { ...prev[channel], code: code.replace(/\D/g, '').slice(0, 6) },
    }));
  };
  const saveVerification = async () => {
    const validationMessage = validate();
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    if (!user?.id) {
      toast.error('You must be signed in to continue.');
      return;
    }

    setLoading(true);
    try {
      const result = await api.onboarding.submitBusinessVerification({
        ...form,
        identifierType: requiredIdentifierType,
        sameMailing,
      });

      await refreshProfile();

      if (result?.status === 'verified') {
        toast.success('Business verified. Continue to payment setup.');
        navigate('/verify-payment', { replace: true });
      } else if (result?.status === 'pending_review') {
        toast.info('Business submitted for manual review. We will unlock payment setup after approval.');
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
  const AddressFields = ({ title, addressKey, icon: Icon }) => {
    const address = form[addressKey];
    return (
      <div className="space-y-3 rounded-lg border bg-secondary/30 p-4">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <Label>Address Line 1</Label>
            <Input value={address.line1} onChange={(e) => updateAddress(addressKey, 'line1', e.target.value)} placeholder="123 Main St" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Address Line 2</Label>
            <Input value={address.line2} onChange={(e) => updateAddress(addressKey, 'line2', e.target.value)} placeholder="Suite, unit, floor" />
          </div>
          <div className="space-y-1">
            <Label>City</Label>
            <Input value={address.city} onChange={(e) => updateAddress(addressKey, 'city', e.target.value)} placeholder="Knoxville" />
          </div>
          <div className="space-y-1">
            <Label>State</Label>
            <Select value={address.state} onValueChange={(value) => updateAddress(addressKey, 'state', value)}>
              <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
              <SelectContent>{STATES.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>ZIP Code</Label>
            <Input value={address.zip} onChange={(e) => updateAddress(addressKey, 'zip', e.target.value)} placeholder="37920" />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-secondary flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-background via-background to-white">
      <div className="w-full max-w-4xl space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border bg-card shadow-lg">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Verify Your Business</h1>
          <p className="text-muted-foreground">Business and address verification happens before payment setup.</p>
        </div>

        <Card className="border-none bg-card/85 shadow-2xl ring-1 ring-border/60 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> Business Information</CardTitle>
            <CardDescription>We support EIN businesses and SSN-based sole proprietors. Only masked identifiers are stored.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2">
                <Label>Legal Business Name</Label>
                <Input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} placeholder="Acme Hospitality LLC" />
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
                <p className="text-xs text-muted-foreground">{isIndividualOwner ? 'Individual owner tenants verify SSN.' : 'Business entity tenants verify EIN.'}</p>
              </div>
              <div className="space-y-1">
                <Label>{requiredIdentifierType === 'ein' ? 'EIN' : 'SSN'}</Label>
                <Input value={form.taxIdentifier} onChange={(e) => setForm({ ...form, taxIdentifier: e.target.value, identifierType: requiredIdentifierType })} placeholder={requiredIdentifierType === 'ein' ? '12-3456789' : '123-45-6789'} />
              </div>
              <div className="space-y-2">
                <Label>{contactEmailLabel}</Label>
                <div className="flex gap-2">
                  <Input
                    value={form.email}
                    onChange={(e) => {
                      setForm({ ...form, email: e.target.value });
                      setContactOtp((prev) => ({ ...prev, email: { ...prev.email, verifiedTarget: '' } }));
                    }}
                    placeholder={isIndividualOwner ? "owner@gmail.com" : "owner@restaurant.com"}
                  />
                  <Button type="button" variant={emailVerified ? 'secondary' : 'outline'} onClick={() => requestOtp('email')} disabled={contactOtp.email.sending || emailVerified} className="shrink-0">
                    {contactOtp.email.sending ? <Loader2 className="h-4 w-4 animate-spin" /> : emailVerified ? <CheckCircle2 className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
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
                    {contactOtp.email.devCode && <p className="text-xs text-muted-foreground">Development OTP: {contactOtp.email.devCode}</p>}
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
                      setContactOtp((prev) => ({ ...prev, phone: { ...prev.phone, verifiedTarget: '' } }));
                    }}
                    placeholder="(865) 555-0142"
                  />
                  <Button type="button" variant={phoneVerified ? 'secondary' : 'outline'} onClick={() => requestOtp('phone')} disabled={contactOtp.phone.sending || phoneVerified} className="shrink-0">
                    {contactOtp.phone.sending ? <Loader2 className="h-4 w-4 animate-spin" /> : phoneVerified ? <CheckCircle2 className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
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
                    {contactOtp.phone.devCode && <p className="text-xs text-muted-foreground">Development OTP: {contactOtp.phone.devCode}</p>}
                  </div>
                )}
                {phoneVerified && <p className="text-xs font-medium text-resend-green">Phone verified.</p>}
              </div>
              <div className="space-y-1">
                <Label>Website</Label>
                <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://restaurant.com" />
              </div>
            </div>

            <AddressFields title="Business Address" addressKey="businessAddress" icon={MapPin} />

            <div className="flex items-center justify-between rounded-lg border bg-card p-4">
              <div>
                <p className="font-semibold text-foreground">Mailing address same as business address</p>
                <p className="text-sm text-muted-foreground">Turn this off if billing or mail should go somewhere else.</p>
              </div>
              <Button type="button" variant={sameMailing ? 'default' : 'outline'} onClick={() => setSameMailing((value) => !value)}>
                {sameMailing ? 'Same' : 'Different'}
              </Button>
            </div>

            {!sameMailing && <AddressFields title="Mailing Address" addressKey="mailingAddress" icon={MapPin} />}

            <div className="space-y-3 rounded-lg border bg-secondary/30 p-4">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <MapPin className="h-4 w-4 text-primary" />
                Service Address
              </div>
              <div className="space-y-1">
                <Label>Location Name</Label>
                <Input value={form.serviceLocationName} onChange={(e) => setForm({ ...form, serviceLocationName: e.target.value })} placeholder="Downtown Restaurant" />
              </div>
              <AddressFields title="Restaurant Location" addressKey="serviceAddress" icon={MapPin} />
            </div>

            <div className="rounded-lg border bg-primary/5 p-4">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <FileCheck2 className="h-4 w-4 text-primary" />
                Estimated Trust Score: {trustScore}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Provider calls are represented by a local simulation in this first implementation slice. The persistence contract is ready for USPS, KYB, and SSN provider integration.</p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end border-t bg-secondary/40 p-6">
            <Button onClick={saveVerification} disabled={loading} className="min-w-[180px]">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...</> : <><CheckCircle2 className="mr-2 h-4 w-4" /> Verify & Continue</>}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
