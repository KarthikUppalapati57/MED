import React, { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Building2, CheckCircle2, FileCheck2, Loader2, MapPin, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
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

const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','IA','ID','IL','IN','KS','KY','LA','MA','MD','ME','MI','MN','MO','MS','NC','ND','NE','NH','NJ','NM','NV','NY','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VA','VT','WA','WI','WV','WY'];

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

  const trustScore = useMemo(() => scoreBusiness({
    identifierType: form.identifierType,
    website: form.website,
    phone: form.phone,
    email: form.email,
    businessAddress: form.businessAddress,
    serviceAddress: form.serviceAddress,
  }), [form]);

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
    if (!form.taxIdentifier.trim()) return form.identifierType === 'ein' ? 'EIN is required.' : 'SSN is required for this verification path.';
    if (!form.email.includes('@')) return 'A valid business email is required.';
    if (form.phone.replace(/\D/g, '').length < 10) return 'A valid business phone number is required.';
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
                <Select value={form.businessType} onValueChange={(value) => setForm({ ...form, businessType: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{BUSINESS_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tax Identifier Type</Label>
                <Select value={form.identifierType} onValueChange={(value) => setForm({ ...form, identifierType: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ein">EIN</SelectItem>
                    <SelectItem value="ssn">SSN</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{form.identifierType === 'ein' ? 'EIN' : 'SSN'}</Label>
                <Input value={form.taxIdentifier} onChange={(e) => setForm({ ...form, taxIdentifier: e.target.value })} placeholder={form.identifierType === 'ein' ? '12-3456789' : '123-45-6789'} />
              </div>
              <div className="space-y-1">
                <Label>Business Email</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="owner@restaurant.com" />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(865) 555-0142" />
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
