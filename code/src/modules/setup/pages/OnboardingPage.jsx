import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/apiClient';
import { supabase } from '@/lib/supabaseClient';
import posthog from '@/lib/posthog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Plus, Save, Trash2 } from 'lucide-react';

const DRAFT_KEY = 'restops:onboarding:draft:v2';
const ownershipModels = ['corporate', 'franchise', 'independent', 'partnership', 'individual'];
const emptyAddress = () => ({ line1: '', line2: '', city: '', state: '', postalCode: '', country: 'United States' });
const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const formatAddress = (a) => [a?.line1, a?.line2, a?.city, a?.state, a?.postalCode, a?.country].filter(Boolean).join(', ');
const addressComplete = (a) => Boolean(a?.line1?.trim() && a?.city?.trim() && a?.state?.trim() && a?.postalCode?.trim() && a?.country?.trim());
const createLocation = () => ({ name: '', businessAddress: emptyAddress(), mailingSameAsBusiness: true, mailingAddress: emptyAddress() });
const createBrand = () => ({ name: '', addressEnabled: false, address: emptyAddress(), locations: [createLocation()] });
const createOrganization = () => ({ name: '', slug: '', slugManual: false, addressEnabled: false, address: emptyAddress(), brands: [createBrand()] });
const normalizeAddress = (address) => ({ ...emptyAddress(), ...(address && typeof address === 'object' ? address : {}) });
const normalizeLocation = (location = {}) => ({ ...createLocation(), ...location, businessAddress: normalizeAddress(location.businessAddress), mailingAddress: normalizeAddress(location.mailingAddress), mailingSameAsBusiness: location.mailingSameAsBusiness !== false });
const normalizeBrand = (brand = {}) => ({ ...createBrand(), ...brand, address: normalizeAddress(brand.address), locations: Array.isArray(brand.locations) && brand.locations.length ? brand.locations.map(normalizeLocation) : [createLocation()] });
const normalizeOrganization = (org = {}) => ({ ...createOrganization(), ...org, address: normalizeAddress(org.address), brands: Array.isArray(org.brands) && org.brands.length ? org.brands.map(normalizeBrand) : [createBrand()] });
const normalizeKey = (value) => String(value || '').trim().toLowerCase();
const isValidPostalCode = (address) => {
  const country = normalizeKey(address?.country);
  const postalCode = String(address?.postalCode || '').trim();
  if (!postalCode) return false;
  if (['us', 'usa', 'united states', 'united states of america'].includes(country)) return /^\d{5}(-?\d{4})?$/.test(postalCode);
  return /^[a-z0-9][a-z0-9\s-]{2,12}$/i.test(postalCode);
};
const addressError = (address, label) => {
  if (!addressComplete(address)) return `${label} is required.`;
  if (!isValidPostalCode(address)) return `${label} postal code is invalid.`;
  return null;
};
const websiteError = (value) => {
  const website = String(value || '').trim();
  if (!website || website === 'https://' || website === 'http://') return null;
  try {
    const parsed = new URL(website);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) return 'Website must be a valid URL.';
    return null;
  } catch {
    return 'Website must be a valid URL.';
  }
};

function FieldLabel({ htmlFor, children, required = false }) {
  return <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">{children}{required && <span className="text-destructive"> *</span>}</Label>;
}

function AddressFields({ idPrefix, value, onChange, required = false, compact = false }) {
  const update = (field, nextValue) => onChange({ ...value, [field]: nextValue });
  return (
    <div className={compact ? 'space-y-3' : 'rounded-md border bg-muted/20 p-4 space-y-3'}>
      <div className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
        <div className="space-y-1.5">
          <FieldLabel htmlFor={`${idPrefix}-line1`} required={required}>Business/Service Address</FieldLabel>
          <Input id={`${idPrefix}-line1`} value={value.line1} onChange={(event) => update('line1', event.target.value)} className="h-10 bg-card" />
        </div>
        <div className="space-y-1.5">
          <FieldLabel htmlFor={`${idPrefix}-line2`}>Suite / Unit</FieldLabel>
          <Input id={`${idPrefix}-line2`} value={value.line2} onChange={(event) => update('line2', event.target.value)} className="h-10 bg-card" />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {[
          ['city', 'City'],
          ['state', 'State/Region'],
          ['postalCode', 'Postal Code'],
          ['country', 'Country'],
        ].map(([field, label]) => (
          <div key={field} className="space-y-1.5">
            <FieldLabel htmlFor={`${idPrefix}-${field}`} required={required}>{label}</FieldLabel>
            <Input id={`${idPrefix}-${field}`} value={value[field]} onChange={(event) => update(field, event.target.value)} className="h-10 bg-card" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const { user, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [finalizingOnboarding, setFinalizingOnboarding] = useState(false);
  const autoFinalizeRef = useRef(false);
  const [draftReady, setDraftReady] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponResult, setCouponResult] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [businessIdentity, setBusinessIdentity] = useState({ companyName: '', ownershipModel: 'corporate', website: 'https://', businessAddress: emptyAddress(), mailingSameAsBusiness: true, mailingAddress: emptyAddress() });
  const [organizations, setOrganizations] = useState([createOrganization()]);

  useEffect(() => {
    const saved = window.localStorage.getItem(DRAFT_KEY);
    if (!saved) {
      setDraftReady(true);
      return;
    }
    try {
      const draft = JSON.parse(saved);
      if (draft.businessIdentity) setBusinessIdentity((prev) => ({ ...prev, ...draft.businessIdentity, businessAddress: normalizeAddress(draft.businessIdentity.businessAddress), mailingAddress: normalizeAddress(draft.businessIdentity.mailingAddress), mailingSameAsBusiness: draft.businessIdentity.mailingSameAsBusiness !== false }));
      if (Array.isArray(draft.organizations) && draft.organizations.length > 0) setOrganizations(draft.organizations.map(normalizeOrganization));
      if (draft.step) setStep(Math.min(Math.max(draft.step, 1), 3));
      if (draft.selectedPlan) setSelectedPlan(draft.selectedPlan);
      if (draft.couponCode) setCouponCode(draft.couponCode);
    } catch (error) {
      console.warn('Failed to restore onboarding draft:', error);
    } finally {
      setDraftReady(true);
    }
  }, []);

  useEffect(() => {
    supabase.from('plans').select('id, name, description, price_monthly, features, stripe_price_id').eq('is_active', true).order('price_monthly', { ascending: true }).then(({ data }) => {
      if (data) setPlans(data);
    });
  }, []);

  useEffect(() => {
    if (completed && userProfile?.organization_id) navigate('/', { replace: true });
  }, [completed, userProfile?.organization_id, navigate]);

  useEffect(() => {
    const checkoutStatus = new URLSearchParams(window.location.search).get('checkout');
    if (!checkoutStatus || !['success', 'free', 'mock'].includes(checkoutStatus)) return;
    if (!draftReady || !user || completed || finalizingOnboarding || autoFinalizeRef.current) return;

    autoFinalizeRef.current = true;
    setFinalizingOnboarding(true);
    setStep(3);

    refreshProfile()
      .then(() => performOnboarding())
      .finally(() => setFinalizingOnboarding(false));
  }, [draftReady, user, completed, finalizingOnboarding]);

  const totals = useMemo(() => {
    const brandCount = organizations.reduce((sum, org) => sum + org.brands.length, 0);
    const locationCount = organizations.reduce((sum, org) => sum + org.brands.reduce((brandSum, brand) => brandSum + brand.locations.length, 0), 0);
    return { brandCount, locationCount };
  }, [organizations]);

  const updateBusinessIdentity = (field, value) => setBusinessIdentity((prev) => ({ ...prev, [field]: value }));
  const updateOrganization = (orgIdx, updater) => setOrganizations((prev) => prev.map((org, index) => (index === orgIdx ? updater(org) : org)));
  const updateBrand = (orgIdx, brandIdx, updater) => updateOrganization(orgIdx, (org) => ({ ...org, brands: org.brands.map((brand, index) => (index === brandIdx ? updater(brand) : brand)) }));
  const updateLocation = (orgIdx, brandIdx, locIdx, updater) => updateBrand(orgIdx, brandIdx, (brand) => ({ ...brand, locations: brand.locations.map((location, index) => (index === locIdx ? updater(location) : location)) }));
  const handleOrgNameChange = (orgIdx, value) => updateOrganization(orgIdx, (org) => ({ ...org, name: value, slug: org.slugManual ? org.slug : slugify(value) }));
  const addOrganization = () => setOrganizations((prev) => [...prev, createOrganization()]);
  const addBrand = (orgIdx) => updateOrganization(orgIdx, (org) => ({ ...org, brands: [...org.brands, createBrand()] }));
  const addLocation = (orgIdx, brandIdx) => updateBrand(orgIdx, brandIdx, (brand) => ({ ...brand, locations: [...brand.locations, createLocation()] }));
  const removeOrganization = (orgIdx) => organizations.length > 1 && setOrganizations((prev) => prev.filter((_, index) => index !== orgIdx));
  const removeBrand = (orgIdx, brandIdx) => setOrganizations((prev) => prev.map((org, index) => index === orgIdx && org.brands.length > 1 ? { ...org, brands: org.brands.filter((_, nextIndex) => nextIndex !== brandIdx) } : org));
  const removeLocation = (orgIdx, brandIdx, locIdx) => setOrganizations((prev) => prev.map((org, index) => index === orgIdx ? { ...org, brands: org.brands.map((brand, nextBrandIdx) => nextBrandIdx === brandIdx && brand.locations.length > 1 ? { ...brand, locations: brand.locations.filter((_, nextLocIdx) => nextLocIdx !== locIdx) } : brand) } : org));

  const saveDraft = (nextStep = step, showToast = true) => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ step: nextStep, businessIdentity, organizations, selectedPlan, couponCode, updatedAt: new Date().toISOString() }));
    if (showToast) toast.success('Onboarding draft saved.');
  };

  const validateBusinessIdentity = () => {
    if (!businessIdentity.companyName.trim()) return 'Company name is required.';
    if (!businessIdentity.ownershipModel) return 'Ownership model is required.';
    const websiteValidation = websiteError(businessIdentity.website);
    if (websiteValidation) return websiteValidation;
    const businessAddressError = addressError(businessIdentity.businessAddress, 'Business/service address');
    if (businessAddressError) return businessAddressError;
    if (!businessIdentity.mailingSameAsBusiness) {
      const mailingAddressError = addressError(businessIdentity.mailingAddress, 'Mailing address');
      if (mailingAddressError) return mailingAddressError;
    }
    return null;
  };

  const validateHierarchy = () => {
    if (!organizations.length) return 'Add at least one organization.';
    const orgSlugs = new Set();
    const orgNames = new Set();
    for (const [orgIdx, org] of organizations.entries()) {
      if (!org.name.trim()) return `Organization ${orgIdx + 1} name is required.`;
      if (!org.slug.trim()) return `Organization ${orgIdx + 1} slug is required.`;
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(org.slug.trim())) return `${org.name || `Organization ${orgIdx + 1}`} slug can use lowercase letters, numbers, and hyphens only.`;
      const orgSlug = normalizeKey(org.slug);
      if (orgSlugs.has(orgSlug)) return `Organization slug ${org.slug} is duplicated.`;
      orgSlugs.add(orgSlug);
      const orgName = normalizeKey(org.name);
      if (orgNames.has(orgName)) return `Organization name ${org.name} is duplicated.`;
      orgNames.add(orgName);
      if (!Array.isArray(org.brands) || org.brands.length === 0) return `${org.name || `Organization ${orgIdx + 1}`} requires at least one brand.`;
      if (org.addressEnabled) {
        const orgAddressError = addressError(org.address, `${org.name || `Organization ${orgIdx + 1}`} address`);
        if (orgAddressError) return orgAddressError;
      }
      const brandNames = new Set();
      for (const [brandIdx, brand] of org.brands.entries()) {
        if (!brand.name.trim()) return `Brand ${brandIdx + 1} is required in ${org.name || `Organization ${orgIdx + 1}`}.`;
        const brandName = normalizeKey(brand.name);
        if (brandNames.has(brandName)) return `Brand name ${brand.name} is duplicated in ${org.name || `Organization ${orgIdx + 1}`}.`;
        brandNames.add(brandName);
        if (!Array.isArray(brand.locations) || brand.locations.length === 0) return `${brand.name || `Brand ${brandIdx + 1}`} requires at least one location.`;
        if (brand.addressEnabled) {
          const brandAddressError = addressError(brand.address, `${brand.name || `Brand ${brandIdx + 1}`} address`);
          if (brandAddressError) return brandAddressError;
        }
        const locationNames = new Set();
        for (const [locIdx, location] of brand.locations.entries()) {
          if (!location.name.trim()) return `Location ${locIdx + 1} is required in ${brand.name || `Brand ${brandIdx + 1}`}.`;
          const locationName = normalizeKey(location.name);
          if (locationNames.has(locationName)) return `Location name ${location.name} is duplicated in ${brand.name || `Brand ${brandIdx + 1}`}.`;
          locationNames.add(locationName);
          const locationAddressError = addressError(location.businessAddress, `${location.name || `Location ${locIdx + 1}`} business/service address`);
          if (locationAddressError) return locationAddressError;
          if (!location.mailingSameAsBusiness) {
            const mailingAddressError = addressError(location.mailingAddress, `${location.name || `Location ${locIdx + 1}`} mailing address`);
            if (mailingAddressError) return mailingAddressError;
          }
        }
      }
    }
    return null;
  };

  const buildHierarchyPayload = () => organizations.map((org) => ({
    name: org.name.trim(),
    slug: org.slug.trim(),
    metadata: { tenant_business_identity: businessIdentity, organization_address: org.addressEnabled ? org.address : null },
    brands: org.brands.map((brand) => ({
      name: brand.name.trim(),
      metadata: { brand_address: brand.addressEnabled ? brand.address : null },
      locations: brand.locations.map((location) => ({
        name: location.name.trim(),
        address: formatAddress(location.businessAddress),
        business_address: location.businessAddress,
        mailing_address: location.mailingSameAsBusiness ? location.businessAddress : location.mailingAddress,
      })),
    })),
  }));

  const performOnboarding = async () => {
    if (!user) {
      toast.error('You must be logged in to complete onboarding.');
      return false;
    }
    const hierarchyError = validateHierarchy();
    if (hierarchyError) {
      toast.error(hierarchyError);
      return false;
    }
    setLoading(true);
    try {
      const hierarchy = buildHierarchyPayload();
      const result = await api.onboarding.setupHierarchy(user.id, hierarchy);
      hierarchy.forEach((org) => posthog.capture('workspace_created', { orgName: org.name }));
      await supabase.auth.refreshSession();

      toast.success(`Created ${result.counts?.organizations || hierarchy.length} organization(s).`);
      window.localStorage.removeItem(DRAFT_KEY);
      await refreshProfile();
      setCompleted(true);
      return true;
    } catch (error) {
      console.error('Onboarding failed:', error);
      toast.error(error.message?.includes('organizations_slug_key') ? 'One of your organization slugs is already taken. Please try a different one.' : (error.message || 'Failed to complete onboarding.'), { duration: 5000 });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleApplyCoupon = async () => {
    if (!selectedPlan) return toast.error('Select a plan before applying a coupon or trial code.');
    if (!couponCode.trim()) return toast.error('Enter a coupon or trial code first.');
    setCouponLoading(true);
    try {
      const result = await api.onboarding.applyCoupon({ code: couponCode.trim(), planId: selectedPlan?.id || null });
      setCouponResult(result?.coupon || null);
      toast.success(`Applied ${result?.coupon?.code || couponCode.trim()}`);
      await refreshProfile();
    } catch (error) {
      setCouponResult(null);
      toast.error(error.message || 'Coupon could not be applied.');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleSubscribe = async () => {
    if (!selectedPlan) return toast.error('Please select a plan to continue.');
    const hierarchyError = validateHierarchy();
    if (hierarchyError) return toast.error(hierarchyError);

    saveDraft(3, false);
    setCheckoutLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          planId: selectedPlan.id,
          priceId: selectedPlan.stripe_price_id || null,
          couponCode: couponCode.trim() || null,
          successUrl: `${window.location.origin}/onboarding?checkout=success`,
          cancelUrl: `${window.location.origin}/onboarding`,
        },
      });
      if (error) throw error;
      if (!data?.url) throw new Error('No checkout URL returned');

      if (data.freePlan || data.providerMode === 'stripe_secret_missing') {
        await refreshProfile();
        await performOnboarding();
        return;
      }

      window.location.href = data.url;
    } catch (error) {
      toast.error(error.message || 'Failed to start checkout process.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const goNext = async () => {
    if (step === 1) {
      const error = validateBusinessIdentity();
      if (error) return toast.error(error);
      saveDraft();
      return setStep(2);
    }
    if (step === 2) {
      const error = validateHierarchy();
      if (error) return toast.error(error);
      saveDraft(3);
      setStep(3);
      return;
    }
    await handleSubscribe();
  };

  useEffect(() => {
    if (!draftReady || !user || !userProfile?.payment_verified || userProfile?.organization_id || completed || finalizingOnboarding || autoFinalizeRef.current) return;
    autoFinalizeRef.current = true;
    setFinalizingOnboarding(true);
    setStep(3);
    performOnboarding().finally(() => setFinalizingOnboarding(false));
  }, [draftReady, user, userProfile?.payment_verified, userProfile?.organization_id, completed, finalizingOnboarding]);

  if (userProfile?.role && userProfile.role !== 'tenant_super_admin' && !completed) return <Navigate to="/" replace />;
  if (userProfile && userProfile.business_verification_status !== 'verified' && !completed) return <Navigate to="/business-verification" replace />;
  if (userProfile?.organization_id && userProfile?.payment_verified && !completed) return <Navigate to="/" replace />;

  if (completed) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto animate-pulse"><CheckCircle2 className="w-8 h-8 text-primary" /></div>
          <h2 className="text-2xl font-bold text-foreground">Onboarding Complete!</h2>
          <p className="text-muted-foreground">Setting up your workspace. Redirecting shortly...</p>
          <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary p-4 sm:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">RestOps onboarding</p>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Set up your tenant workspace</h1>
          </div>
          <div className="text-sm text-muted-foreground">Logged in as <span className="font-medium text-foreground">{user?.email}</span></div>
        </div>

        <div className="mb-6 grid gap-2 sm:grid-cols-3">
          {['Business Identity', 'Hierarchy', 'Plan & Payment'].map((label, index) => {
            const itemStep = index + 1;
            const active = step === itemStep;
            const done = step > itemStep;
            return (
              <div key={label} className={`rounded-md border px-4 py-3 text-sm ${active ? 'border-primary bg-primary/5 text-primary' : done ? 'border-primary/30 bg-primary/5 text-foreground' : 'bg-card text-muted-foreground'}`}>
                <div className="flex items-center gap-2 font-medium"><span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${active || done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{done ? <CheckCircle2 className="h-3.5 w-3.5" /> : itemStep}</span>{label}</div>
              </div>
            );
          })}
        </div>

        <Card className="border-border bg-card shadow-sm">
          {step === 1 && (
            <>
              <CardHeader>
                <CardTitle>Business Identity</CardTitle>
                <CardDescription>These details identify the tenant business before hierarchy setup.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5 md:col-span-2">
                    <FieldLabel htmlFor="company-name" required>Company Name</FieldLabel>
                    <Input id="company-name" value={businessIdentity.companyName} onChange={(event) => updateBusinessIdentity('companyName', event.target.value)} className="h-11 bg-card" />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="ownership-model" required>Ownership Model</FieldLabel>
                    <Select value={businessIdentity.ownershipModel} onValueChange={(value) => updateBusinessIdentity('ownershipModel', value)}>
                      <SelectTrigger id="ownership-model" className="h-11 bg-card"><SelectValue placeholder="Select ownership model" /></SelectTrigger>
                      <SelectContent>{ownershipModels.map((model) => <SelectItem key={model} value={model}>{model.replace('_', ' ').replace(/^./, (char) => char.toUpperCase())}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="website">Website</FieldLabel>
                    <Input id="website" value={businessIdentity.website} onChange={(event) => updateBusinessIdentity('website', event.target.value)} className="h-11 bg-card" placeholder="https://" />
                  </div>
                </div>
                <AddressFields idPrefix="business-address" value={businessIdentity.businessAddress} onChange={(value) => updateBusinessIdentity('businessAddress', value)} required />
                <div className="flex items-center justify-between rounded-md border bg-muted/20 px-4 py-3">
                  <div><p className="text-sm font-medium text-foreground">Mailing address is same as business/service address</p><p className="text-xs text-muted-foreground">Turn this off when mail should go to a different address.</p></div>
                  <Switch checked={businessIdentity.mailingSameAsBusiness} onCheckedChange={(checked) => updateBusinessIdentity('mailingSameAsBusiness', checked)} />
                </div>
                {!businessIdentity.mailingSameAsBusiness && <AddressFields idPrefix="business-mailing" value={businessIdentity.mailingAddress} onChange={(value) => updateBusinessIdentity('mailingAddress', value)} required />}
              </CardContent>
            </>
          )}

          {step === 2 && (
            <>
              <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div><CardTitle>Organization Hierarchy</CardTitle><CardDescription>Define your Tenant -&gt; Organization -&gt; Brand -&gt; Location structure.</CardDescription></div>
                <Button type="button" variant="outline" onClick={addOrganization} className="shrink-0"><Plus className="mr-2 h-4 w-4" /> Add Organization</Button>
              </CardHeader>
              <CardContent className="space-y-5">
                {organizations.map((org, orgIdx) => (
                  <div key={`org-${orgIdx}`} className="rounded-md border p-4 sm:p-5">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="grid flex-1 gap-3 md:grid-cols-[1fr_280px]">
                        <div className="space-y-1.5">
                          <FieldLabel htmlFor={`org-${orgIdx}-name`} required>Organization Name</FieldLabel>
                          <Input id={`org-${orgIdx}-name`} value={org.name} onChange={(event) => handleOrgNameChange(orgIdx, event.target.value)} className="h-11 bg-card" />
                        </div>
                        <div className="space-y-1.5">
                          <FieldLabel htmlFor={`org-${orgIdx}-slug`} required>Slug</FieldLabel>
                          <Input id={`org-${orgIdx}-slug`} value={org.slug} onChange={(event) => updateOrganization(orgIdx, (current) => ({ ...current, slug: slugify(event.target.value), slugManual: true }))} className="h-11 bg-card" />
                        </div>
                      </div>
                      {organizations.length > 1 && <Button type="button" variant="ghost" size="icon" onClick={() => removeOrganization(orgIdx)}><Trash2 className="h-4 w-4" /></Button>}
                    </div>

                    <div className="mb-5 flex items-center justify-between rounded-md border bg-muted/20 px-4 py-3">
                      <div><p className="text-sm font-medium text-foreground">Add organization address</p><p className="text-xs text-muted-foreground">Optional for organizations; locations still require addresses.</p></div>
                      <Switch checked={org.addressEnabled} onCheckedChange={(checked) => updateOrganization(orgIdx, (current) => ({ ...current, addressEnabled: checked }))} />
                    </div>
                    {org.addressEnabled && <div className="mb-5"><AddressFields idPrefix={`org-${orgIdx}-address`} value={org.address} onChange={(value) => updateOrganization(orgIdx, (current) => ({ ...current, address: value }))} required /></div>}

                    <div className="space-y-4 border-l pl-4 sm:ml-4 sm:pl-5">
                      {org.brands.map((brand, brandIdx) => (
                        <div key={`org-${orgIdx}-brand-${brandIdx}`} className="rounded-md bg-muted/30 p-4">
                          <div className="mb-4 flex items-start justify-between gap-3">
                            <div className="flex-1 space-y-1.5">
                              <FieldLabel htmlFor={`brand-${orgIdx}-${brandIdx}`} required>Brand</FieldLabel>
                              <Input id={`brand-${orgIdx}-${brandIdx}`} value={brand.name} onChange={(event) => updateBrand(orgIdx, brandIdx, (current) => ({ ...current, name: event.target.value }))} className="h-11 bg-card" />
                            </div>
                            {org.brands.length > 1 && <Button type="button" variant="ghost" size="icon" onClick={() => removeBrand(orgIdx, brandIdx)}><Trash2 className="h-4 w-4" /></Button>}
                          </div>

                          <div className="mb-4 flex items-center justify-between rounded-md border bg-card px-4 py-3">
                            <div><p className="text-sm font-medium text-foreground">Add brand address</p><p className="text-xs text-muted-foreground">Optional unless enabled.</p></div>
                            <Switch checked={brand.addressEnabled} onCheckedChange={(checked) => updateBrand(orgIdx, brandIdx, (current) => ({ ...current, addressEnabled: checked }))} />
                          </div>
                          {brand.addressEnabled && <div className="mb-4"><AddressFields idPrefix={`brand-${orgIdx}-${brandIdx}-address`} value={brand.address} onChange={(value) => updateBrand(orgIdx, brandIdx, (current) => ({ ...current, address: value }))} required /></div>}

                          <div className="space-y-3 sm:ml-4">
                            {brand.locations.map((location, locIdx) => (
                              <div key={`org-${orgIdx}-brand-${brandIdx}-loc-${locIdx}`} className="rounded-md bg-card p-3 shadow-sm ring-1 ring-border">
                                <div className="mb-3 grid gap-3 md:grid-cols-[1.3fr_1fr_1fr_auto]">
                                  <div className="space-y-1.5">
                                    <FieldLabel htmlFor={`loc-${orgIdx}-${brandIdx}-${locIdx}`} required>Location Name</FieldLabel>
                                    <Input id={`loc-${orgIdx}-${brandIdx}-${locIdx}`} value={location.name} onChange={(event) => updateLocation(orgIdx, brandIdx, locIdx, (current) => ({ ...current, name: event.target.value }))} className="h-10 bg-card" />
                                  </div>
                                  <div className="space-y-1.5">
                                    <FieldLabel htmlFor={`loc-${orgIdx}-${brandIdx}-${locIdx}-city`} required>City</FieldLabel>
                                    <Input id={`loc-${orgIdx}-${brandIdx}-${locIdx}-city`} value={location.businessAddress.city} onChange={(event) => updateLocation(orgIdx, brandIdx, locIdx, (current) => ({ ...current, businessAddress: { ...current.businessAddress, city: event.target.value } }))} className="h-10 bg-card" />
                                  </div>
                                  <div className="space-y-1.5">
                                    <FieldLabel htmlFor={`loc-${orgIdx}-${brandIdx}-${locIdx}-state`} required>State/Region</FieldLabel>
                                    <Input id={`loc-${orgIdx}-${brandIdx}-${locIdx}-state`} value={location.businessAddress.state} onChange={(event) => updateLocation(orgIdx, brandIdx, locIdx, (current) => ({ ...current, businessAddress: { ...current.businessAddress, state: event.target.value } }))} className="h-10 bg-card" />
                                  </div>
                                  {brand.locations.length > 1 && <Button type="button" variant="ghost" size="icon" className="self-end" onClick={() => removeLocation(orgIdx, brandIdx, locIdx)}><Trash2 className="h-4 w-4" /></Button>}
                                </div>
                                <AddressFields idPrefix={`loc-${orgIdx}-${brandIdx}-${locIdx}-business`} value={location.businessAddress} onChange={(value) => updateLocation(orgIdx, brandIdx, locIdx, (current) => ({ ...current, businessAddress: value }))} required compact />
                                <div className="mt-3 flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2"><p className="text-sm font-medium text-foreground">Mailing same as business/service</p><Switch checked={location.mailingSameAsBusiness} onCheckedChange={(checked) => updateLocation(orgIdx, brandIdx, locIdx, (current) => ({ ...current, mailingSameAsBusiness: checked }))} /></div>
                                {!location.mailingSameAsBusiness && <div className="mt-3"><AddressFields idPrefix={`loc-${orgIdx}-${brandIdx}-${locIdx}-mailing`} value={location.mailingAddress} onChange={(value) => updateLocation(orgIdx, brandIdx, locIdx, (current) => ({ ...current, mailingAddress: value }))} required compact /></div>}
                              </div>
                            ))}
                            <Button type="button" variant="ghost" onClick={() => addLocation(orgIdx, brandIdx)}><Plus className="mr-2 h-4 w-4" /> Add Location</Button>
                          </div>
                        </div>
                      ))}
                      <Button type="button" variant="ghost" onClick={() => addBrand(orgIdx)}><Plus className="mr-2 h-4 w-4" /> Add Brand</Button>
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground"><span>Total organizations: <span className="font-semibold text-foreground">{organizations.length}</span></span><span>Total brands: <span className="font-semibold text-foreground">{totals.brandCount}</span></span><span>Total locations: <span className="font-semibold text-foreground">{totals.locationCount}</span></span></div>
              </CardContent>
            </>
          )}

          {step === 3 && (
            <>
              <CardHeader>
                <CardTitle>Plan & Payment</CardTitle>
                <CardDescription>Select the plan for this tenant workspace.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  {plans.map((plan) => (
                    <button key={plan.id} type="button" onClick={() => setSelectedPlan(plan)} className={`rounded-md border p-4 text-left transition hover:border-primary ${selectedPlan?.id === plan.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card'}`}>
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div><h3 className="font-semibold text-foreground">{plan.name}</h3><p className="text-sm text-muted-foreground">{plan.description}</p></div>
                        {selectedPlan?.id === plan.id && <CheckCircle2 className="h-5 w-5 text-primary" />}
                      </div>
                      <div className="text-2xl font-bold text-foreground">${Number(plan.price_monthly || 0).toFixed(0)}<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
                      {Array.isArray(plan.features) && plan.features.length > 0 && <ul className="mt-3 space-y-1 text-sm text-muted-foreground">{plan.features.slice(0, 4).map((feature) => <li key={feature}>- {feature}</li>)}</ul>}
                    </button>
                  ))}
                </div>

                <div className="rounded-md border bg-muted/20 p-4">
                  <Label htmlFor="coupon-code">Coupon or Trial Code</Label>
                  <div className="mt-2 flex gap-2">
                    <Input id="coupon-code" value={couponCode} onChange={(event) => setCouponCode(event.target.value)} placeholder="Enter code" className="h-11 bg-card" />
                    <Button type="button" variant="outline" onClick={handleApplyCoupon} disabled={couponLoading || !couponCode.trim()} className="h-11 min-w-[112px]">{couponLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Applying</> : 'Apply'}</Button>
                  </div>
                  {couponResult && <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-foreground"><span className="font-semibold">{couponResult.code}</span><span className="text-muted-foreground"> applied</span>{couponResult.trial_days > 0 && <span className="text-muted-foreground"> for {couponResult.trial_days} trial days</span>}{couponResult.discount_type === 'percent' && <span className="text-muted-foreground"> for {couponResult.discount_value}% off</span>}</div>}
                </div>
              </CardContent>
            </>
          )}

          <CardFooter className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="outline" onClick={() => saveDraft()} disabled={loading || checkoutLoading || finalizingOnboarding} className="w-full sm:w-auto"><Save className="mr-2 h-4 w-4" /> Save</Button>
            <div className="flex w-full gap-3 sm:w-auto">
              <Button type="button" variant="ghost" onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={step === 1 || loading || checkoutLoading || finalizingOnboarding} className="flex-1 sm:flex-none"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
              <Button type="button" onClick={goNext} disabled={loading || checkoutLoading || finalizingOnboarding} className="flex-1 min-w-[140px] sm:flex-none">{loading || checkoutLoading || finalizingOnboarding ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Working</> : <>{step === 3 ? 'Complete' : 'Next'} <ArrowRight className="ml-2 h-4 w-4" /></>}</Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

