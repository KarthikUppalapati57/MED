import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/apiClient';
import { supabase } from '@/lib/supabaseClient';
import { getStripe } from '@/lib/paymentService';
import posthog from '@/lib/posthog';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, ArrowRight, Banknote, CheckCircle2, ChevronDown, ChevronRight, Clock3, CreditCard, Download, Landmark, Loader2, Plus, Save, Trash2, Upload } from 'lucide-react';

const DRAFT_KEY = 'restops:onboarding:draft:v2';
const ownershipModels = ['corporate', 'franchise', 'independent', 'partnership', 'individual'];
const emptyAddress = () => ({ line1: '', line2: '', city: '', state: '', postalCode: '', country: 'United States' });
const DEV_TEST_ADDRESS = { line1: '123 Market Square', line2: 'Suite 100', city: 'Knoxville', state: 'TN', postalCode: '37902', country: 'United States' };
const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const formatAddress = (a) => [a?.line1, a?.line2, a?.city, a?.state, a?.postalCode, a?.country].filter(Boolean).join(', ');
const normalizeCouponCodeInput = (value) => String(value || '').trim().replace(/\s+-\s+\d+\s*(month|months|mo).*$/i, '').toUpperCase();
const addressComplete = (a) => Boolean(a?.line1?.trim() && a?.city?.trim() && a?.state?.trim() && a?.postalCode?.trim() && a?.country?.trim());
const createLocation = () => ({ name: '', businessAddressSource: 'custom', businessAddress: emptyAddress(), mailingSameAsBusiness: true, mailingAddress: emptyAddress() });
const createBrand = () => ({ name: '', addressEnabled: false, addressSource: 'custom', address: emptyAddress(), locations: [createLocation()] });
const createOrganization = () => ({ name: '', slug: '', slugManual: false, addressEnabled: false, businessAddress: emptyAddress(), mailingSameAsBusiness: true, mailingAddress: emptyAddress(), brands: [createBrand()] });
const createBusinessIdentity = () => ({ companyName: '', ownershipModel: 'corporate', website: 'https://', businessAddress: emptyAddress(), mailingSameAsBusiness: true, mailingAddress: emptyAddress() });
const normalizeAddress = (address) => ({ ...emptyAddress(), ...(address && typeof address === 'object' ? address : {}) });
const normalizeLocation = (location = {}) => ({ ...createLocation(), ...location, businessAddressSource: location.businessAddressSource || 'custom', businessAddress: normalizeAddress(location.businessAddress), mailingAddress: normalizeAddress(location.mailingAddress), mailingSameAsBusiness: location.mailingSameAsBusiness !== false });
const normalizeBrand = (brand = {}) => ({ ...createBrand(), ...brand, addressSource: brand.addressSource || 'custom', address: normalizeAddress(brand.address), locations: Array.isArray(brand.locations) && brand.locations.length ? brand.locations.map(normalizeLocation) : [createLocation()] });
const normalizeOrganization = (org = {}) => {
  const businessAddress = normalizeAddress(org.businessAddress || org.address);
  return {
    ...createOrganization(),
    ...org,
    addressEnabled: org.addressEnabled === true || (Boolean(org.businessAddress || org.address) && addressComplete(businessAddress)),
    businessAddress,
    mailingAddress: normalizeAddress(org.mailingAddress),
    mailingSameAsBusiness: org.mailingSameAsBusiness !== false,
    brands: Array.isArray(org.brands) && org.brands.length ? org.brands.map(normalizeBrand) : [createBrand()],
  };
};
const normalizeBusinessIdentity = (identity = {}) => ({ ...createBusinessIdentity(), ...identity, businessAddress: normalizeAddress(identity.businessAddress), mailingAddress: normalizeAddress(identity.mailingAddress), mailingSameAsBusiness: identity.mailingSameAsBusiness !== false });
const normalizeKey = (value) => String(value || '').trim().toLowerCase();
const addressPayloadOrUndefined = (address) => address && typeof address === 'object' && addressComplete(address) ? address : undefined;

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
const getFunctionErrorMessage = async (error) => {
  if (error?.context && typeof error.context.json === 'function') {
    try {
      const body = await error.context.json();
      return body?.error || body?.message || error.message;
    } catch {
      return error.message;
    }
  }
  return error?.message;
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

const HIERARCHY_TEMPLATE_COLUMNS = [
  'organization_name',
  'organization_slug',
  'organization_address_line1',
  'organization_address_line2',
  'organization_city',
  'organization_state',
  'organization_postal_code',
  'organization_country',
  'organization_mailing_same_as_business',
  'organization_mailing_address_line1',
  'organization_mailing_address_line2',
  'organization_mailing_city',
  'organization_mailing_state',
  'organization_mailing_postal_code',
  'organization_mailing_country',
  'brand_name',
  'brand_address_line1',
  'brand_address_line2',
  'brand_city',
  'brand_state',
  'brand_postal_code',
  'brand_country',
  'location_name',
  'location_address_line1',
  'location_address_line2',
  'location_city',
  'location_state',
  'location_postal_code',
  'location_country',
  'location_mailing_same_as_business',
  'location_mailing_address_line1',
  'location_mailing_address_line2',
  'location_mailing_city',
  'location_mailing_state',
  'location_mailing_postal_code',
  'location_mailing_country',
];

const HIERARCHY_TEMPLATE_ROWS = [
  {
    organization_name: 'Karthik Restaurant Group',
    organization_slug: 'karthik-restaurant-group',
    organization_address_line1: '100 Corporate Center Dr',
    organization_city: 'Knoxville',
    organization_state: 'TN',
    organization_postal_code: '37902',
    organization_country: 'United States',
    organization_mailing_same_as_business: 'yes',
    brand_name: 'Downtown Grill',
    location_name: 'Downtown Knoxville',
    location_address_line1: '123 Main St',
    location_city: 'Knoxville',
    location_state: 'TN',
    location_postal_code: '37902',
    location_country: 'United States',
    location_mailing_same_as_business: 'yes',
  },
  {
    organization_name: 'Karthik Restaurant Group',
    organization_slug: 'karthik-restaurant-group',
    organization_address_line1: '100 Corporate Center Dr',
    organization_city: 'Knoxville',
    organization_state: 'TN',
    organization_postal_code: '37902',
    organization_country: 'United States',
    organization_mailing_same_as_business: 'yes',
    brand_name: 'Downtown Grill',
    location_name: 'West Knoxville',
    location_address_line1: '500 Park Ave',
    location_city: 'Knoxville',
    location_state: 'TN',
    location_postal_code: '37919',
    location_country: 'United States',
    location_mailing_same_as_business: 'yes',
  },
];

const valueFor = (row, key) => String(row?.[key] || '').trim();
const hasAddressValues = (row, prefix) => ['line1', 'line2', 'city', 'state', 'postal_code', 'country'].some((field) => valueFor(row, `${prefix}_${field}`));
const addressFromRow = (row, prefix) => ({
  line1: valueFor(row, `${prefix}_line1`),
  line2: valueFor(row, `${prefix}_line2`),
  city: valueFor(row, `${prefix}_city`),
  state: valueFor(row, `${prefix}_state`),
  postalCode: valueFor(row, `${prefix}_postal_code`),
  country: valueFor(row, `${prefix}_country`) || 'United States',
});
const parseCsvBoolean = (value, defaultValue = true) => {
  const normalized = normalizeKey(value);
  if (!normalized) return defaultValue;
  if (['yes', 'y', 'true', '1', 'same'].includes(normalized)) return true;
  if (['no', 'n', 'false', '0', 'different'].includes(normalized)) return false;
  return defaultValue;
};

function FieldLabel({ htmlFor, children, required = false }) {
  return <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">{children}{required && <span className="text-destructive"> *</span>}</Label>;
}

function AddressFields({ idPrefix, value, onChange, required = false, compact = false, line1Label = 'Business/Service Address' }) {
  const update = (field, nextValue) => onChange({ ...value, [field]: nextValue });
  return (
    <div className={compact ? 'space-y-3' : 'rounded-md border bg-muted/20 p-4 space-y-3'}>
      <div className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
        <div className="space-y-1.5">
          <FieldLabel htmlFor={`${idPrefix}-line1`} required={required}>{line1Label}</FieldLabel>
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

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: { fontSize: '15px', color: 'hsl(var(--foreground))', '::placeholder': { color: 'hsl(var(--muted-foreground))' } },
    invalid: { color: '#dc2626' },
  },
};

function CardFields({ stripeRef, elementsRef, cardHolderName, onCardHolderNameChange, onCardChange }) {
  const stripe = useStripe();
  const elements = useElements();
  useEffect(() => { stripeRef.current = stripe; elementsRef.current = elements; }, [stripe, elements, stripeRef, elementsRef]);

  return (
    <div className="space-y-1.5">
      <FieldLabel htmlFor="card-holder-name" required>Cardholder Name</FieldLabel>
      <Input id="card-holder-name" value={cardHolderName} onChange={(event) => onCardHolderNameChange(event.target.value)} className="h-10 bg-card" />
      <FieldLabel required>Card Details</FieldLabel>
      <div className="h-10 rounded-md border bg-card px-3 py-2.5">
        <CardElement options={CARD_ELEMENT_OPTIONS} onChange={onCardChange} />
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
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [bankAccount, setBankAccount] = useState({ bankName: '', accountHolderName: '', accountType: 'checking', routingNumber: '', accountNumber: '', billingAddress: emptyAddress() });
  const [cardHolderName, setCardHolderName] = useState('');
  const [cardComplete, setCardComplete] = useState(false);
  const [cardError, setCardError] = useState('');
  const stripeRef = useRef(null);
  const elementsRef = useRef(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [finalizingOnboarding, setFinalizingOnboarding] = useState(false);
  const autoFinalizeRef = useRef(false);
  const hierarchyImportInputRef = useRef(null);
  const [draftReady, setDraftReady] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponResult, setCouponResult] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [businessIdentity, setBusinessIdentity] = useState(createBusinessIdentity());
  const [organizations, setOrganizations] = useState([createOrganization()]);
  const [hierarchyMode, setHierarchyMode] = useState('manual');
  const [hierarchyView, setHierarchyView] = useState('build');
  const [expandedOrganizations, setExpandedOrganizations] = useState(() => new Set([0]));

  useEffect(() => {
    const saved = window.localStorage.getItem(DRAFT_KEY);
    if (!saved) {
      setDraftReady(true);
      return;
    }
    try {
      const draft = JSON.parse(saved);
      if (draft.businessIdentity) setBusinessIdentity((prev) => normalizeBusinessIdentity({ ...prev, ...draft.businessIdentity }));
      if (Array.isArray(draft.organizations) && draft.organizations.length > 0) setOrganizations(draft.organizations.map(normalizeOrganization));
      if (draft.step) setStep(Math.min(Math.max(draft.step, 1), 4));
      if (draft.selectedPlan) setSelectedPlan(draft.selectedPlan);
      if (draft.paymentMethod) setPaymentMethod(draft.paymentMethod);
      if (draft.bankAccount) setBankAccount((prev) => ({ ...prev, ...draft.bankAccount, accountNumber: '', routingNumber: '' }));
      if (draft.couponCode) setCouponCode(normalizeCouponCodeInput(draft.couponCode));
      if (draft.hierarchyMode) setHierarchyMode(draft.hierarchyMode);
      if (draft.hierarchyView) setHierarchyView(draft.hierarchyView);
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
    const inviteCoupon = userProfile?.coupon_code || userProfile?.metadata?.coupon_code || userProfile?.metadata?.coupon?.code;
    if (inviteCoupon && !couponCode.trim()) setCouponCode(normalizeCouponCodeInput(inviteCoupon));
  }, [userProfile?.coupon_code, userProfile?.metadata, couponCode]);


  useEffect(() => {
    if (completed && userProfile?.organization_id) navigate('/', { replace: true });
  }, [completed, userProfile?.organization_id, navigate]);

  useEffect(() => {
    const checkoutStatus = new URLSearchParams(window.location.search).get('checkout');
    if (!checkoutStatus || !['success', 'free', 'mock', 'trial', 'ach'].includes(checkoutStatus)) return;
    if (!draftReady || !user || completed || finalizingOnboarding || autoFinalizeRef.current) return;

    autoFinalizeRef.current = true;
    setFinalizingOnboarding(true);
    setStep(4);

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
  const updateBankAccount = (field, value) => setBankAccount((prev) => ({ ...prev, [field]: value }));
  const updateBankBillingAddress = (value) => setBankAccount((prev) => ({ ...prev, billingAddress: normalizeAddress(value) }));
  const updateBusinessIdentityAddress = (field, value) => setBusinessIdentity((prev) => ({ ...prev, [field]: normalizeAddress(value) }));
  const updateOrganization = (orgIdx, updater) => setOrganizations((prev) => prev.map((org, index) => (index === orgIdx ? updater(org) : org)));
  const updateBrand = (orgIdx, brandIdx, updater) => updateOrganization(orgIdx, (org) => ({ ...org, brands: org.brands.map((brand, index) => (index === brandIdx ? updater(brand) : brand)) }));
  const updateLocation = (orgIdx, brandIdx, locIdx, updater) => updateBrand(orgIdx, brandIdx, (brand) => ({ ...brand, locations: brand.locations.map((location, index) => (index === locIdx ? updater(location) : location)) }));
  const handleOrgNameChange = (orgIdx, value) => updateOrganization(orgIdx, (org) => ({ ...org, name: value, slug: org.slugManual ? org.slug : slugify(value) }));
  const addOrganization = () => setOrganizations((prev) => {
    const nextIndex = prev.length;
    setExpandedOrganizations((current) => new Set([...current, nextIndex]));
    return [...prev, createOrganization()];
  });
  const addBrand = (orgIdx) => updateOrganization(orgIdx, (org) => ({ ...org, brands: [...org.brands, createBrand()] }));
  const addLocation = (orgIdx, brandIdx) => updateBrand(orgIdx, brandIdx, (brand) => ({ ...brand, locations: [...brand.locations, createLocation()] }));
  const removeOrganization = (orgIdx) => organizations.length > 1 && setOrganizations((prev) => prev.filter((_, index) => index !== orgIdx));
  const removeBrand = (orgIdx, brandIdx) => setOrganizations((prev) => prev.map((org, index) => index === orgIdx && org.brands.length > 1 ? { ...org, brands: org.brands.filter((_, nextIndex) => nextIndex !== brandIdx) } : org));
  const removeLocation = (orgIdx, brandIdx, locIdx) => setOrganizations((prev) => prev.map((org, index) => index === orgIdx ? { ...org, brands: org.brands.map((brand, nextBrandIdx) => nextBrandIdx === brandIdx && brand.locations.length > 1 ? { ...brand, locations: brand.locations.filter((_, nextLocIdx) => nextLocIdx !== locIdx) } : brand) } : org));

  const downloadHierarchyTemplate = () => {
    const csv = Papa.unparse({ fields: HIERARCHY_TEMPLATE_COLUMNS, data: HIERARCHY_TEMPLATE_ROWS });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'restops-organization-hierarchy-template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const importHierarchyRows = (rows) => {
    const normalizedRows = rows
      .map((row) => Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [normalizeKey(key).replace(/\s+/g, '_'), String(value || '').trim()])))
      .filter((row) => valueFor(row, 'organization_name') || valueFor(row, 'brand_name') || valueFor(row, 'location_name'));

    if (!normalizedRows.length) throw new Error('The uploaded template does not contain hierarchy rows.');

    const orgMap = new Map();
    for (const [rowIdx, row] of normalizedRows.entries()) {
      const orgName = valueFor(row, 'organization_name');
      const brandName = valueFor(row, 'brand_name');
      const locationName = valueFor(row, 'location_name');

      if (!orgName) throw new Error(`Row ${rowIdx + 2}: organization_name is required.`);
      if (!brandName) throw new Error(`Row ${rowIdx + 2}: brand_name is required.`);
      if (!locationName) throw new Error(`Row ${rowIdx + 2}: location_name is required.`);

      const orgAddressEnabled = hasAddressValues(row, 'organization_address');
      const orgBusinessAddress = orgAddressEnabled ? addressFromRow(row, 'organization_address') : emptyAddress();
      if (orgAddressEnabled) {
        const orgAddressError = addressError(orgBusinessAddress, `Row ${rowIdx + 2} organization business/service address`);
        if (orgAddressError) throw new Error(orgAddressError);
      }

      const orgMailingSameAsBusiness = parseCsvBoolean(valueFor(row, 'organization_mailing_same_as_business'), true);
      const orgMailingAddress = orgMailingSameAsBusiness ? emptyAddress() : addressFromRow(row, 'organization_mailing_address');
      if (orgAddressEnabled && !orgMailingSameAsBusiness) {
        const orgMailingAddressError = addressError(orgMailingAddress, `Row ${rowIdx + 2} organization mailing address`);
        if (orgMailingAddressError) throw new Error(orgMailingAddressError);
      }
      const locationAddress = addressFromRow(row, 'location_address');
      const locationAddressError = addressError(locationAddress, `Row ${rowIdx + 2} location business/service address`);
      if (locationAddressError) throw new Error(locationAddressError);

      const orgKey = normalizeKey(valueFor(row, 'organization_slug') || orgName);
      if (!orgMap.has(orgKey)) {
        orgMap.set(orgKey, {
          ...createOrganization(),
          name: orgName,
          slug: slugify(valueFor(row, 'organization_slug') || orgName),
          slugManual: Boolean(valueFor(row, 'organization_slug')),
          addressEnabled: orgAddressEnabled,
          businessAddress: orgBusinessAddress,
          mailingSameAsBusiness: orgAddressEnabled ? orgMailingSameAsBusiness : true,
          mailingAddress: orgMailingAddress,
          brands: [],
        });
      }

      const org = orgMap.get(orgKey);
      const brandKey = normalizeKey(brandName);
      let brand = org.brands.find((item) => normalizeKey(item.name) === brandKey);
      if (!brand) {
        const brandAddressEnabled = hasAddressValues(row, 'brand_address');
        brand = {
          ...createBrand(),
          name: brandName,
          addressEnabled: brandAddressEnabled,
          address: brandAddressEnabled ? addressFromRow(row, 'brand_address') : emptyAddress(),
          locations: [],
        };
        org.brands.push(brand);
      }

      const mailingSameAsBusiness = parseCsvBoolean(valueFor(row, 'location_mailing_same_as_business'), true);
      const mailingAddress = mailingSameAsBusiness ? emptyAddress() : addressFromRow(row, 'location_mailing_address');
      if (!mailingSameAsBusiness) {
        const mailingAddressError = addressError(mailingAddress, `Row ${rowIdx + 2} location mailing address`);
        if (mailingAddressError) throw new Error(mailingAddressError);
      }

      brand.locations.push({
        name: locationName,
        businessAddress: locationAddress,
        mailingSameAsBusiness,
        mailingAddress,
      });
    }

    const importedOrganizations = Array.from(orgMap.values()).map(normalizeOrganization);
    const orgCount = importedOrganizations.length;
    const brandCount = importedOrganizations.reduce((sum, org) => sum + org.brands.length, 0);
    const locationCount = importedOrganizations.reduce((sum, org) => sum + org.brands.reduce((brandSum, brand) => brandSum + brand.locations.length, 0), 0);
    setOrganizations(importedOrganizations);
    toast.success(`Imported ${orgCount} organization(s), ${brandCount} brand(s), and ${locationCount} location(s).`);
  };

  const handleHierarchyTemplateUpload = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: ({ data, errors }) => {
        if (errors?.length) {
          toast.error(errors[0]?.message || 'Could not read the hierarchy template.');
          return;
        }
        try {
          importHierarchyRows(data);
        } catch (error) {
          toast.error(error.message || 'Could not import hierarchy template.');
        }
      },
      error: (error) => toast.error(error.message || 'Could not import hierarchy template.'),
    });
  };

  const saveDraft = (nextStep = step, showToast = true) => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ step: nextStep, businessIdentity, organizations, selectedPlan, paymentMethod, bankAccount: { ...bankAccount, accountNumber: '', routingNumber: '' }, couponCode: normalizeCouponCodeInput(couponCode), hierarchyMode, hierarchyView, updatedAt: new Date().toISOString() }));
    if (showToast) toast.success('Onboarding draft saved.');
  };

  const applyLocationBusinessAddress = (orgIdx, brandIdx, locIdx, source, address) => {
    updateLocation(orgIdx, brandIdx, locIdx, (current) => ({
      ...current,
      businessAddressSource: source,
      businessAddress: normalizeAddress(address),
      mailingAddress: current.mailingSameAsBusiness ? normalizeAddress(address) : current.mailingAddress,
    }));
  };

  const toggleOrganizationExpanded = (orgIdx) => setExpandedOrganizations((current) => {
    const next = new Set(current);
    if (next.has(orgIdx)) next.delete(orgIdx);
    else next.add(orgIdx);
    return next;
  });

  const organizationCounts = (org) => {
    const brandCount = org.brands.length;
    const locationCount = org.brands.reduce((sum, brand) => sum + brand.locations.length, 0);
    return { brandCount, locationCount };
  };

  const hierarchyIssues = useMemo(() => {
    const issues = [];
    if (!organizations.length) issues.push({ scope: 'hierarchy', message: 'Add at least one organization.' });
    const orgSlugs = new Set();
    const orgNames = new Set();

    organizations.forEach((org, orgIdx) => {
      const orgLabel = org.name.trim() || `Organization ${orgIdx + 1}`;
      if (!org.name.trim()) issues.push({ scope: 'organization', orgIdx, message: `${orgLabel} needs a name.` });
      if (!org.slug.trim()) issues.push({ scope: 'organization', orgIdx, message: `${orgLabel} needs a workspace slug.` });
      else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(org.slug.trim())) issues.push({ scope: 'organization', orgIdx, message: `${orgLabel} slug can use lowercase letters, numbers, and hyphens only.` });
      const orgSlug = normalizeKey(org.slug);
      if (orgSlug && orgSlugs.has(orgSlug)) issues.push({ scope: 'organization', orgIdx, message: `Organization slug ${org.slug} is duplicated.` });
      if (orgSlug) orgSlugs.add(orgSlug);
      const orgName = normalizeKey(org.name);
      if (orgName && orgNames.has(orgName)) issues.push({ scope: 'organization', orgIdx, message: `Organization name ${org.name} is duplicated.` });
      if (orgName) orgNames.add(orgName);
      if (!org.brands.length) issues.push({ scope: 'organization', orgIdx, message: `${orgLabel} needs at least one brand.` });
      if (org.addressEnabled) {
        const orgAddressError = addressError(org.businessAddress, `${orgLabel} business/service address`);
        if (orgAddressError) issues.push({ scope: 'organization', orgIdx, message: orgAddressError });
        if (!org.mailingSameAsBusiness) {
          const orgMailingAddressError = addressError(org.mailingAddress, `${orgLabel} mailing address`);
          if (orgMailingAddressError) issues.push({ scope: 'organization', orgIdx, message: orgMailingAddressError });
        }
      }

      org.brands.forEach((brand, brandIdx) => {
        const brandLabel = brand.name.trim() || `Brand ${brandIdx + 1}`;
        if (!brand.name.trim()) issues.push({ scope: 'brand', orgIdx, brandIdx, message: `${brandLabel} is required in ${orgLabel}.` });
        if (brand.addressEnabled) {
          const brandAddressError = addressError(brand.address, `${brandLabel} address`);
          if (brandAddressError) issues.push({ scope: 'brand', orgIdx, brandIdx, message: brandAddressError });
        }
        const locationNames = new Set();
        if (!brand.locations.length) issues.push({ scope: 'brand', orgIdx, brandIdx, message: `${brandLabel} needs at least one location.` });
        brand.locations.forEach((location, locIdx) => {
          const locLabel = location.name.trim() || `Location ${locIdx + 1}`;
          if (!location.name.trim()) issues.push({ scope: 'location', orgIdx, brandIdx, locIdx, message: `${locLabel} needs a name.` });
          const locationName = normalizeKey(location.name);
          if (locationName && locationNames.has(locationName)) issues.push({ scope: 'location', orgIdx, brandIdx, locIdx, message: `Location name ${location.name} is duplicated in ${brandLabel}.` });
          if (locationName) locationNames.add(locationName);
          const locationAddressError = addressError(location.businessAddress, `${locLabel} business/service address`);
          if (locationAddressError) issues.push({ scope: 'location', orgIdx, brandIdx, locIdx, message: locationAddressError });
          if (!location.mailingSameAsBusiness) {
            const mailingAddressError = addressError(location.mailingAddress, `${locLabel} mailing address`);
            if (mailingAddressError) issues.push({ scope: 'location', orgIdx, brandIdx, locIdx, message: mailingAddressError });
          }
        });
      });
    });
    return issues;
  }, [organizations]);

  const issueCountForOrganization = (orgIdx) => hierarchyIssues.filter((issue) => issue.orgIdx === orgIdx).length;
  const firstHierarchyIssue = hierarchyIssues[0]?.message || null;
  const locationIssueCount = hierarchyIssues.filter((issue) => issue.scope === 'location').length;
  const checklist = [
    { label: 'All organizations have a unique name and slug', ok: !hierarchyIssues.some((issue) => issue.scope === 'organization' && /name|slug/i.test(issue.message)), detail: hierarchyIssues.find((issue) => issue.scope === 'organization' && /name|slug/i.test(issue.message))?.message },
    { label: 'Every brand is linked to a valid organization', ok: !hierarchyIssues.some((issue) => issue.scope === 'brand' && /required|needs/i.test(issue.message)), detail: hierarchyIssues.find((issue) => issue.scope === 'brand' && /required|needs/i.test(issue.message))?.message },
    { label: 'Every location has a complete business/service address', ok: !hierarchyIssues.some((issue) => issue.scope === 'location' && issue.message.toLowerCase().includes('business/service')), detail: hierarchyIssues.find((issue) => issue.scope === 'location' && issue.message.toLowerCase().includes('business/service'))?.message },
    { label: 'Every location has a complete mailing address or is marked same as business', ok: !hierarchyIssues.some((issue) => issue.scope === 'location' && /mailing/i.test(issue.message)), detail: hierarchyIssues.find((issue) => issue.scope === 'location' && /mailing/i.test(issue.message))?.message },
    { label: 'No duplicate location names within any brand', ok: !hierarchyIssues.some((issue) => /duplicated/i.test(issue.message) && issue.scope === 'location'), detail: hierarchyIssues.find((issue) => /duplicated/i.test(issue.message) && issue.scope === 'location')?.message },
    { label: 'Postal codes are valid for the stated country', ok: !hierarchyIssues.some((issue) => /postal code/i.test(issue.message)), detail: hierarchyIssues.find((issue) => /postal code/i.test(issue.message))?.message },
  ];

  const validateBusinessIdentity = () => {
    if (!businessIdentity.companyName.trim()) return 'Company name is required.';
    if (!businessIdentity.ownershipModel) return 'Ownership model is required.';
    const websiteValidation = websiteError(businessIdentity.website);
    if (websiteValidation) return websiteValidation;
    const tenantAddressError = addressError(businessIdentity.businessAddress, 'Tenant business/service address');
    if (tenantAddressError) return tenantAddressError;
    if (!businessIdentity.mailingSameAsBusiness) {
      const tenantMailingAddressError = addressError(businessIdentity.mailingAddress, 'Tenant mailing address');
      if (tenantMailingAddressError) return tenantMailingAddressError;
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
        const orgAddressError = addressError(org.businessAddress, `${org.name || `Organization ${orgIdx + 1}`} business/service address`);
        if (orgAddressError) return orgAddressError;
        if (!org.mailingSameAsBusiness) {
          const orgMailingAddressError = addressError(org.mailingAddress, `${org.name || `Organization ${orgIdx + 1}`} mailing address`);
          if (orgMailingAddressError) return orgMailingAddressError;
        }
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

  const buildHierarchyPayload = () => organizations.map((org) => {
    const orgBusinessAddress = org.addressEnabled ? addressPayloadOrUndefined(org.businessAddress) : undefined;
    const orgMailingAddress = org.addressEnabled ? addressPayloadOrUndefined(org.mailingSameAsBusiness ? org.businessAddress : org.mailingAddress) : undefined;

    return {
      name: org.name.trim(),
      slug: org.slug.trim(),
      metadata: {
        tenant_business_identity: businessIdentity,
        ...(orgBusinessAddress ? { organization_address: orgBusinessAddress, organization_business_address: orgBusinessAddress } : {}),
        organization_mailing_same_as_business: org.addressEnabled ? org.mailingSameAsBusiness : true,
        ...(orgMailingAddress ? { organization_mailing_address: orgMailingAddress } : {}),
      },
      brands: org.brands.map((brand) => {
        const brandAddress = brand.addressEnabled ? addressPayloadOrUndefined(brand.address) : undefined;
        return {
          name: brand.name.trim(),
          metadata: brandAddress ? { brand_address: brandAddress } : {},
          locations: brand.locations.map((location) => ({
            name: location.name.trim(),
            address: formatAddress(location.businessAddress),
            business_address: addressPayloadOrUndefined(location.businessAddress),
            mailing_address: addressPayloadOrUndefined(location.mailingSameAsBusiness ? location.businessAddress : location.mailingAddress),
          })),
        };
      }),
    };
  });

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
      setCompleted(true);
      refreshProfile().catch((profileError) => console.warn('Profile refresh after onboarding failed:', profileError));
      window.setTimeout(() => navigate('/', { replace: true }), 1200);
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
    const normalizedCouponCode = normalizeCouponCodeInput(couponCode);
    if (!normalizedCouponCode) return toast.error('Enter a coupon or trial code first.');
    if (normalizedCouponCode !== couponCode) setCouponCode(normalizedCouponCode);
    setCouponLoading(true);
    try {
      const result = await api.onboarding.applyCoupon({ code: normalizedCouponCode, planId: selectedPlan?.id || null });
      setCouponResult(result?.coupon || null);
      toast.success(`Applied ${result?.coupon?.code || normalizedCouponCode}`);
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
    const isPaidPlan = Number(selectedPlan.price_monthly || 0) > 0;
    if (isPaidPlan && paymentMethod === 'ach') {
      const routingDigits = String(bankAccount.routingNumber || '').replace(/\D/g, '');
      const accountDigits = String(bankAccount.accountNumber || '').replace(/\D/g, '');
      if (!bankAccount.bankName.trim()) return toast.error('Enter the bank name for ACH setup.');
      if (!bankAccount.accountHolderName.trim()) return toast.error('Enter the account holder name for ACH setup.');
      if (!/^\d{9}$/.test(routingDigits)) return toast.error('Enter a valid 9-digit routing number.');
      if (!/^\d{4,17}$/.test(accountDigits)) return toast.error('Enter a valid bank account number.');
      const billingAddressError = addressError(bankAccount.billingAddress, 'ACH billing address');
      if (billingAddressError) return toast.error(billingAddressError);
    }
    if (isPaidPlan && paymentMethod === 'card') {
      if (!cardHolderName.trim()) return toast.error('Enter the cardholder name.');
      if (!cardComplete) return toast.error(cardError || 'Enter complete card details.');
      if (!stripeRef.current || !elementsRef.current) return toast.error('Payment form is still loading. Try again in a moment.');
    }
    const hierarchyError = validateHierarchy();
    if (hierarchyError) return toast.error(hierarchyError);

    saveDraft(3, false);
    setCheckoutLoading(true);
    try {
      let paymentMethodId = null;
      if (isPaidPlan && paymentMethod === 'card') {
        const { error: pmError, paymentMethod: pm } = await stripeRef.current.createPaymentMethod({
          type: 'card',
          card: elementsRef.current.getElement(CardElement),
          billing_details: { name: cardHolderName, email: user?.email || undefined },
        });
        if (pmError) throw new Error(pmError.message);
        paymentMethodId = pm.id;
      }

      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          planId: selectedPlan.id,
          priceId: selectedPlan.stripe_price_id || null,
          couponCode: normalizeCouponCodeInput(couponCode) || null,
          paymentMethod,
          paymentMethodId,
          bankAccount: paymentMethod === 'ach' ? bankAccount : null,
          successUrl: `${window.location.origin}/onboarding?checkout=success`,
          cancelUrl: `${window.location.origin}/onboarding`,
        },
      });
      if (error) throw error;

      if (data.check) {
        await refreshProfile();
        toast.success('Check payment recorded. A platform admin will confirm it once received.');
        return;
      }

      if (data.requiresAction) {
        const { error: confirmError } = await stripeRef.current.confirmCardPayment(data.clientSecret);
        if (confirmError) throw new Error(confirmError.message);
        toast.success('Card verified. Finishing setup...');
        await refreshProfile();
        await performOnboarding();
        return;
      }

      if (data.freePlan || data.ach || data.card) {
        await refreshProfile();
        await performOnboarding();
        return;
      }

      throw new Error('Unrecognized checkout response.');
    } catch (error) {
      const message = await getFunctionErrorMessage(error);
      toast.error(message || 'Failed to start checkout process.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const goNext = async () => {
    if (step === 1) {
      const error = validateBusinessIdentity();
      if (error) return toast.error(error);
      saveDraft();
      setHierarchyView('build');
      return setStep(2);
    }
    if (step === 2 && hierarchyView === 'build') {
      saveDraft(2);
      setHierarchyView('review');
      return;
    }
    if (step === 2) {
      const error = validateHierarchy();
      if (error) return toast.error(error);
      saveDraft(3);
      setStep(3);
      return;
    }
    if (step === 3) {
      if (!selectedPlan) return toast.error('Please select a plan to continue.');
      saveDraft(4);
      setStep(4);
      return;
    }
    await handleSubscribe();
  };

  const goBack = () => {
    if (step === 2 && hierarchyView === 'review') return setHierarchyView('build');
    setStep((current) => Math.max(1, current - 1));
  };

  const nextLabel = step === 2 && hierarchyView === 'build' ? 'Continue to review' : step === 2 ? 'Confirm & continue' : step === 3 ? 'Continue to payment' : step === 4 ? 'Complete' : 'Next';

  useEffect(() => {
    if (!draftReady || !user || !userProfile?.payment_verified || userProfile?.organization_id || completed || finalizingOnboarding || autoFinalizeRef.current) return;
    autoFinalizeRef.current = true;
    setFinalizingOnboarding(true);
    setStep(3);
    performOnboarding().finally(() => setFinalizingOnboarding(false));
  }, [draftReady, user, userProfile?.payment_verified, userProfile?.organization_id, completed, finalizingOnboarding]);

  const renderHierarchyBuild = () => (
    <>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Organization Hierarchy</CardTitle>
          <CardDescription>Define your Organization -&gt; Brand -&gt; Location structure. Addresses are optional above the location level, mandatory at it.</CardDescription>
        </div>
        <div className="grid grid-cols-2 rounded-md border bg-muted/20 p-1 text-xs font-medium">
          <button type="button" onClick={() => setHierarchyMode('manual')} className={`rounded px-4 py-2 transition ${hierarchyMode === 'manual' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Build manually</button>
          <button type="button" onClick={() => setHierarchyMode('upload')} className={`rounded px-4 py-2 transition ${hierarchyMode === 'upload' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Upload template</button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {hierarchyMode === 'upload' ? (
          <div className="space-y-5">
            <div className="rounded-md border border-dashed bg-muted/20 p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div><h3 className="font-semibold text-foreground">Upload hierarchy template</h3><p className="mt-1 text-sm text-muted-foreground">Upload does not create records immediately. A valid file merges into the manual tree for review and editing.</p></div>
                <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={downloadHierarchyTemplate}><Download className="mr-2 h-4 w-4" /> Download blank template</Button><Button type="button" onClick={() => hierarchyImportInputRef.current?.click()}><Upload className="mr-2 h-4 w-4" /> Upload CSV</Button><input ref={hierarchyImportInputRef} type="file" accept=".csv,text/csv" onChange={handleHierarchyTemplateUpload} className="hidden" /></div>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2"><div className="rounded-md border bg-card p-4"><h4 className="mb-2 text-sm font-semibold text-foreground">Required columns</h4><p className="text-sm text-muted-foreground">organization_name, brand_name, location_name, location_address_line1, location_city, location_state, location_postal_code</p></div><div className="rounded-md border bg-card p-4"><h4 className="mb-2 text-sm font-semibold text-foreground">Optional columns</h4><p className="text-sm text-muted-foreground">Organization address, brand address, location mailing address, and every standard line2/postal/country companion.</p></div></div>
            <div className="rounded-md border bg-card p-4"><div className="mb-3 flex items-center justify-between gap-3"><h4 className="text-sm font-semibold text-foreground">Import preview</h4><span className="text-xs text-muted-foreground">{totals.locationCount} parsed location rows in the current tree</span></div><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="text-xs uppercase text-muted-foreground"><tr><th className="py-2">Organization</th><th>Brand</th><th>Location</th><th>City</th><th>Postal code</th></tr></thead><tbody>{organizations.flatMap((org) => org.brands.flatMap((brand) => brand.locations.map((location) => { const issue = !addressComplete(location.businessAddress); return <tr key={`${org.name}-${brand.name}-${location.name}`} className={issue ? 'bg-destructive/10 text-destructive' : 'border-t'}><td className="py-2">{org.name || '- missing'}</td><td>{brand.name || '- missing'}</td><td>{location.name || '- missing'}</td><td>{location.businessAddress.city || '- missing'}</td><td>{location.businessAddress.postalCode || '- missing'}</td></tr>; })))}</tbody></table></div></div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="font-mono text-sm text-muted-foreground"><span className="font-semibold text-foreground">{organizations.length}</span> organizations - <span className="font-semibold text-foreground">{totals.brandCount}</span> brands - <span className="font-semibold text-foreground">{totals.locationCount}</span> locations</div><Button type="button" size="sm" onClick={addOrganization}><Plus className="mr-2 h-4 w-4" /> Add organization</Button></div>
            {organizations.map((org, orgIdx) => { const counts = organizationCounts(org); const expanded = expandedOrganizations.has(orgIdx); const flagged = issueCountForOrganization(orgIdx); return (
              <div key={`org-${orgIdx}`} className="rounded-md border bg-card">
                <button type="button" onClick={() => toggleOrganizationExpanded(orgIdx)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"><div className="flex items-center gap-3">{expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}<div><div className="font-semibold text-foreground">{org.name || `Organization ${orgIdx + 1}`}</div><div className="text-xs text-muted-foreground">{counts.brandCount} brand(s) - {counts.locationCount} location(s)</div></div></div><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${flagged ? 'border-amber-500/40 bg-amber-500/10 text-amber-400' : 'border-primary/40 bg-primary/10 text-primary'}`}>{flagged ? `${flagged} needs attention` : 'Complete'}</span></button>
                {expanded && <div className="space-y-5 border-t p-4"><div className="grid gap-4 md:grid-cols-2"><div className="space-y-1.5"><FieldLabel htmlFor={`org-${orgIdx}-name`} required>Organization name</FieldLabel><Input id={`org-${orgIdx}-name`} value={org.name} onChange={(event) => handleOrgNameChange(orgIdx, event.target.value)} className="h-10 bg-card" /></div><div className="space-y-1.5"><FieldLabel htmlFor={`org-${orgIdx}-slug`} required>Workspace slug</FieldLabel><Input id={`org-${orgIdx}-slug`} value={org.slug} onChange={(event) => updateOrganization(orgIdx, (current) => ({ ...current, slug: slugify(event.target.value), slugManual: true }))} className="h-10 bg-card" /></div></div>
                  <div className="rounded-md border border-dashed bg-muted/10 p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-foreground">Organization address</p><p className="text-xs text-muted-foreground">Optional - add it once here and brands or locations below can reuse it.</p></div><Switch checked={org.addressEnabled} onCheckedChange={(checked) => updateOrganization(orgIdx, (current) => ({ ...current, addressEnabled: checked, mailingSameAsBusiness: checked ? current.mailingSameAsBusiness : true }))} /></div>{org.addressEnabled && <div className="mt-3"><AddressFields idPrefix={`org-${orgIdx}-business-address`} value={org.businessAddress} onChange={(value) => updateOrganization(orgIdx, (current) => ({ ...current, businessAddress: value }))} required /></div>}</div>
                  <div className="space-y-4 border-l pl-4 sm:ml-3 sm:pl-5">{org.brands.map((brand, brandIdx) => (<div key={`org-${orgIdx}-brand-${brandIdx}`} className="space-y-3"><div className="flex items-start gap-3"><div className="flex-1 space-y-1.5"><FieldLabel htmlFor={`brand-${orgIdx}-${brandIdx}`} required>Brand</FieldLabel><Input id={`brand-${orgIdx}-${brandIdx}`} value={brand.name} onChange={(event) => updateBrand(orgIdx, brandIdx, (current) => ({ ...current, name: event.target.value }))} className="h-10 bg-card" /></div>{org.brands.length > 1 && <Button type="button" variant="ghost" size="icon" className="mt-6" onClick={() => removeBrand(orgIdx, brandIdx)}><Trash2 className="h-4 w-4" /></Button>}</div>
                    <div className="rounded-md border border-dashed bg-muted/10 p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-foreground">Brand address</p><p className="text-xs text-muted-foreground">Optional - add only if this brand has its own registered address.</p></div><Switch checked={brand.addressEnabled} onCheckedChange={(checked) => updateBrand(orgIdx, brandIdx, (current) => ({ ...current, addressEnabled: checked, addressSource: checked ? current.addressSource : 'custom' }))} /></div>{brand.addressEnabled && <div className="mt-3 space-y-3"><div className="flex flex-wrap gap-2"><Button type="button" variant={brand.addressSource === 'organization' ? 'default' : 'outline'} size="sm" disabled={!addressComplete(org.businessAddress)} onClick={() => updateBrand(orgIdx, brandIdx, (current) => ({ ...current, addressSource: 'organization', address: org.businessAddress }))}>Same as organization</Button><Button type="button" variant={brand.addressSource === 'custom' ? 'default' : 'outline'} size="sm" onClick={() => updateBrand(orgIdx, brandIdx, (current) => ({ ...current, addressSource: 'custom' }))}>Custom address</Button></div>{brand.addressSource === 'organization' ? <div className="rounded-md border bg-muted/20 px-3 py-2 font-mono text-xs text-muted-foreground">ORG {formatAddress(org.businessAddress) || 'Add an organization address above to reuse it here'}</div> : <AddressFields idPrefix={`brand-${orgIdx}-${brandIdx}-address`} value={brand.address} onChange={(value) => updateBrand(orgIdx, brandIdx, (current) => ({ ...current, address: value }))} required compact />}</div>}</div>
                    <div className="space-y-3 sm:ml-4">{brand.locations.map((location, locIdx) => { const issue = hierarchyIssues.find((item) => item.orgIdx === orgIdx && item.brandIdx === brandIdx && item.locIdx === locIdx); return (<div key={`org-${orgIdx}-brand-${brandIdx}-loc-${locIdx}`} className={`rounded-md border p-3 ${issue ? 'border-amber-500/40 bg-amber-500/10' : 'bg-card'}`}><div className="mb-3 grid gap-3 md:grid-cols-[1fr_auto]"><div className="space-y-1.5"><FieldLabel htmlFor={`loc-${orgIdx}-${brandIdx}-${locIdx}`} required>Location name</FieldLabel><Input id={`loc-${orgIdx}-${brandIdx}-${locIdx}`} value={location.name} onChange={(event) => updateLocation(orgIdx, brandIdx, locIdx, (current) => ({ ...current, name: event.target.value }))} className="h-10 bg-card" /></div>{brand.locations.length > 1 && <Button type="button" variant="ghost" size="icon" className="self-end" onClick={() => removeLocation(orgIdx, brandIdx, locIdx)}><Trash2 className="h-4 w-4" /></Button>}</div><div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>Business address:</span><Button type="button" variant={location.businessAddressSource === 'tenant' ? 'default' : 'outline'} size="sm" onClick={() => applyLocationBusinessAddress(orgIdx, brandIdx, locIdx, 'tenant', businessIdentity.businessAddress)}>Same as tenant</Button><Button type="button" variant={location.businessAddressSource === 'organization' ? 'default' : 'outline'} size="sm" disabled={!addressComplete(org.businessAddress)} onClick={() => applyLocationBusinessAddress(orgIdx, brandIdx, locIdx, 'organization', org.businessAddress)}>Same as organization</Button><Button type="button" variant={location.businessAddressSource === 'brand' ? 'default' : 'outline'} size="sm" disabled={!addressComplete(brand.address)} onClick={() => applyLocationBusinessAddress(orgIdx, brandIdx, locIdx, 'brand', brand.address)}>Same as brand</Button><Button type="button" variant={location.businessAddressSource === 'custom' ? 'default' : 'outline'} size="sm" onClick={() => updateLocation(orgIdx, brandIdx, locIdx, (current) => ({ ...current, businessAddressSource: 'custom' }))}>Custom address</Button></div>{location.businessAddressSource === 'custom' ? <AddressFields idPrefix={`loc-${orgIdx}-${brandIdx}-${locIdx}-business`} value={location.businessAddress} onChange={(value) => updateLocation(orgIdx, brandIdx, locIdx, (current) => ({ ...current, businessAddress: value }))} required compact /> : <div className="rounded-md border bg-muted/20 px-3 py-2 font-mono text-xs text-muted-foreground">{location.businessAddressSource.toUpperCase()} {formatAddress(location.businessAddress) || 'No address available from selected source'}</div>}<div className="mt-3 flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2"><p className="text-sm font-medium text-foreground">Mailing address is same as business/service address</p><Switch checked={location.mailingSameAsBusiness} onCheckedChange={(checked) => updateLocation(orgIdx, brandIdx, locIdx, (current) => ({ ...current, mailingSameAsBusiness: checked }))} /></div>{!location.mailingSameAsBusiness && <div className="mt-3"><AddressFields idPrefix={`loc-${orgIdx}-${brandIdx}-${locIdx}-mailing`} value={location.mailingAddress} onChange={(value) => updateLocation(orgIdx, brandIdx, locIdx, (current) => ({ ...current, mailingAddress: value }))} required compact line1Label="Mailing Address" /></div>}{issue && <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-amber-400"><AlertTriangle className="h-3.5 w-3.5" /> {issue.message}</div>}</div>); })}<Button type="button" variant="ghost" size="sm" onClick={() => addLocation(orgIdx, brandIdx)}><Plus className="mr-2 h-4 w-4" /> Add location</Button></div>
                  </div>))}<Button type="button" variant="ghost" size="sm" onClick={() => addBrand(orgIdx)}><Plus className="mr-2 h-4 w-4" /> Add brand</Button></div>
                </div>}
              </div>
            ); })}
          </div>
        )}
      </CardContent>
    </>
  );

  const renderHierarchyReview = () => (
    <>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle>Review & confirm</CardTitle><CardDescription>Every organization, brand, and location you entered - checked automatically before your workspace is created.</CardDescription></div><Button type="button" variant="ghost" onClick={() => setHierarchyView('build')}><ArrowLeft className="mr-2 h-4 w-4" /> Back to edit</Button></CardHeader>
      <CardContent className="space-y-5"><div className="grid gap-3 sm:grid-cols-3">{[['Organizations', organizations.length], ['Brands', totals.brandCount], ['Locations', totals.locationCount]].map(([label, value]) => <div key={label} className="rounded-md border bg-card p-4"><div className="text-3xl font-bold text-foreground">{value}</div><div className="mt-1 text-xs font-semibold uppercase text-muted-foreground">{label}</div></div>)}</div>{hierarchyIssues.length > 0 && <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-400">{locationIssueCount || hierarchyIssues.length} item(s) need attention - fix them before you can confirm.</div>}<div className="rounded-md border bg-card">{checklist.map((item) => <div key={item.label} className="flex items-start gap-3 border-b px-4 py-3 last:border-b-0"><span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border ${item.ok ? 'border-primary text-primary' : 'border-amber-500 text-amber-400'}`}>{item.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}</span><div><p className="text-sm font-medium text-foreground">{item.label}</p>{!item.ok && item.detail && <p className="mt-1 text-xs text-amber-400">{item.detail}</p>}</div></div>)}</div><div className="rounded-md border bg-card">{organizations.map((org, orgIdx) => { const flagged = issueCountForOrganization(orgIdx); return <div key={`review-org-${orgIdx}`} className="border-b last:border-b-0"><div className="flex items-center justify-between gap-3 px-4 py-3"><h3 className="font-semibold text-foreground">{org.name || `Organization ${orgIdx + 1}`}</h3><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${flagged ? 'border-amber-500/40 bg-amber-500/10 text-amber-400' : 'border-primary/40 bg-primary/10 text-primary'}`}>{flagged ? `${flagged} flagged` : 'Complete'}</span></div>{org.brands.map((brand, brandIdx) => <div key={`review-brand-${orgIdx}-${brandIdx}`} className="border-t px-6 py-3"><p className="mb-2 text-sm font-semibold text-foreground">{brand.name || `Brand ${brandIdx + 1}`}</p><div className="space-y-2 border-l pl-4">{brand.locations.map((location, locIdx) => { const issue = hierarchyIssues.find((item) => item.orgIdx === orgIdx && item.brandIdx === brandIdx && item.locIdx === locIdx); return <div key={`review-location-${orgIdx}-${brandIdx}-${locIdx}`} className={`flex items-start justify-between gap-3 border-l-2 pl-3 ${issue ? 'border-amber-500 text-amber-400' : 'border-border text-muted-foreground'}`}><div><p className="text-sm font-semibold text-foreground">{location.name || `Location ${locIdx + 1}`}</p><p className="font-mono text-xs">{formatAddress(location.businessAddress) || 'Address missing'}{location.businessAddressSource !== 'custom' ? ` - same as ${location.businessAddressSource}` : ''}</p>{issue && <p className="mt-1 text-xs font-semibold text-amber-400">{issue.message}</p>}</div><Button type="button" variant="ghost" size="sm" onClick={() => { setHierarchyView('build'); setExpandedOrganizations((current) => new Set([...current, orgIdx])); }}>Edit</Button></div>; })}</div></div>)}</div>; })}</div></CardContent>
    </>
  );
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

  if (userProfile?.payment_method_type === 'check' && !userProfile?.payment_verified) {
    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center p-6">
        <Card className="w-full max-w-lg border-border bg-card p-2 text-center shadow-sm">
          <CardHeader className="space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
              <Clock3 className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold">Awaiting Check Payment</CardTitle>
            <CardDescription className="text-base">
              We've recorded your intent to pay by check. A platform admin will confirm your workspace setup once the check is received and processed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">You can close this page - we'll notify you as soon as it's confirmed.</p>
          </CardContent>
        </Card>
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

        <div className="mb-6 grid gap-2 sm:grid-cols-4">
          {['Business Identity', 'Hierarchy', 'Plan', 'Payment'].map((label, index) => {
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

                <div className="space-y-3 border-t border-border/70 pt-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Tenant Business/Service Address</h3>
                      <p className="text-xs text-muted-foreground">Required for the tenant business identity before organization hierarchy setup.</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setBusinessIdentity((prev) => ({ ...prev, businessAddress: DEV_TEST_ADDRESS, mailingAddress: DEV_TEST_ADDRESS, mailingSameAsBusiness: true }))}
                    >
                      Use test address
                    </Button>
                  </div>
                  <AddressFields idPrefix="tenant-business-address" value={businessIdentity.businessAddress} onChange={(value) => updateBusinessIdentityAddress('businessAddress', value)} required />
                  <div className="flex items-center justify-between rounded-md border bg-muted/20 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Tenant mailing address is same as business/service address</p>
                      <p className="text-xs text-muted-foreground">Turn this off when billing or mail should go somewhere else.</p>
                    </div>
                    <Switch checked={businessIdentity.mailingSameAsBusiness} onCheckedChange={(checked) => updateBusinessIdentity('mailingSameAsBusiness', checked)} />
                  </div>
                  {!businessIdentity.mailingSameAsBusiness && (
                    <AddressFields idPrefix="tenant-mailing-address" value={businessIdentity.mailingAddress} onChange={(value) => updateBusinessIdentityAddress('mailingAddress', value)} required line1Label="Mailing Address" />
                  )}
                </div>

              </CardContent>
            </>
          )}

          {step === 2 && (hierarchyView === 'review' ? renderHierarchyReview() : renderHierarchyBuild())}

          {step === 3 && (
            <>
              <CardHeader>
                <CardTitle>Plan</CardTitle>
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
              </CardContent>
            </>
          )}

          {step === 4 && (
            <>
              <CardHeader>
                <CardTitle>Payment</CardTitle>
                <CardDescription>{selectedPlan ? `Complete payment for the ${selectedPlan.name} plan.` : 'Select a plan to continue.'}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {Number(selectedPlan?.price_monthly || 0) > 0 && (
                  <div className="rounded-md border bg-muted/20 p-4">
                    <div className="mb-3">
                      <h3 className="text-sm font-semibold text-foreground">Payment Method</h3>
                      <p className="text-xs text-muted-foreground">Choose how RestOps should collect billing details now. Trial coupons still require a payment method so billing can start automatically after the trial.</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <button type="button" onClick={() => setPaymentMethod('card')} className={`rounded-md border p-4 text-left transition hover:border-primary ${paymentMethod === 'card' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card'}`}>
                        <CreditCard className="mb-2 h-5 w-5 text-primary" />
                        <p className="font-semibold text-foreground">Credit or Debit Card</p>
                        <p className="mt-1 text-xs text-muted-foreground">Secure subscription checkout through Stripe.</p>
                      </button>
                      <button type="button" onClick={() => setPaymentMethod('ach')} className={`rounded-md border p-4 text-left transition hover:border-primary ${paymentMethod === 'ach' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card'}`}>
                        <Landmark className="mb-2 h-5 w-5 text-primary" />
                        <p className="font-semibold text-foreground">Bank ACH</p>
                        <p className="mt-1 text-xs text-muted-foreground">Secure bank setup through Dwolla.</p>
                      </button>
                      <button type="button" onClick={() => setPaymentMethod('check')} className={`rounded-md border p-4 text-left transition hover:border-primary ${paymentMethod === 'check' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card'}`}>
                        <Banknote className="mb-2 h-5 w-5 text-primary" />
                        <p className="font-semibold text-foreground">Check</p>
                        <p className="mt-1 text-xs text-muted-foreground">Mail a check. A platform admin confirms it once received.</p>
                      </button>
                    </div>
                    {paymentMethod === 'card' && (
                      <div className="mt-4 rounded-md border bg-card p-4">
                        <Elements stripe={getStripe()}>
                          <CardFields
                            stripeRef={stripeRef}
                            elementsRef={elementsRef}
                            cardHolderName={cardHolderName}
                            onCardHolderNameChange={setCardHolderName}
                            onCardChange={(event) => { setCardComplete(event.complete); setCardError(event.error?.message || ''); }}
                          />
                        </Elements>
                        {cardError && <p className="mt-2 text-xs text-destructive">{cardError}</p>}
                        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">Secured by Stripe - your card number never touches our servers.</p>
                      </div>
                    )}
                    {paymentMethod === 'check' && (
                      <div className="mt-4 rounded-md border bg-card p-4 text-sm text-muted-foreground">
                        Clicking Complete records your intent to pay by check. Your workspace setup stays on hold until a platform admin confirms the check has arrived.
                      </div>
                    )}
                    {paymentMethod === 'ach' && (
                      <div className="mt-4 rounded-md border bg-card p-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-1.5">
                            <FieldLabel htmlFor="ach-bank-name" required>Bank Name</FieldLabel>
                            <Input id="ach-bank-name" value={bankAccount.bankName} onChange={(event) => updateBankAccount('bankName', event.target.value)} className="h-10 bg-card" />
                          </div>
                          <div className="space-y-1.5">
                            <FieldLabel htmlFor="ach-holder-name" required>Account Holder Name</FieldLabel>
                            <Input id="ach-holder-name" value={bankAccount.accountHolderName} onChange={(event) => updateBankAccount('accountHolderName', event.target.value)} className="h-10 bg-card" />
                          </div>
                          <div className="space-y-1.5">
                            <FieldLabel htmlFor="ach-account-type" required>Account Type</FieldLabel>
                            <Select value={bankAccount.accountType} onValueChange={(value) => updateBankAccount('accountType', value)}>
                              <SelectTrigger id="ach-account-type" className="h-10 bg-card"><SelectValue /></SelectTrigger>
                              <SelectContent><SelectItem value="checking">Checking</SelectItem><SelectItem value="savings">Savings</SelectItem></SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <FieldLabel htmlFor="ach-routing" required>Routing Number</FieldLabel>
                            <Input id="ach-routing" value={bankAccount.routingNumber} onChange={(event) => updateBankAccount('routingNumber', event.target.value.replace(/\D/g, '').slice(0, 9))} inputMode="numeric" className="h-10 bg-card" />
                          </div>
                          <div className="space-y-1.5 md:col-span-2">
                            <FieldLabel htmlFor="ach-account" required>Account Number</FieldLabel>
                            <Input id="ach-account" value={bankAccount.accountNumber} onChange={(event) => updateBankAccount('accountNumber', event.target.value.replace(/\D/g, '').slice(0, 17))} inputMode="numeric" type="password" className="h-10 bg-card" />
                          </div>
                        </div>
                        <div className="mt-4 border-t pt-4">
                          <p className="mb-2 text-sm font-semibold text-foreground">Billing Address</p>
                          <AddressFields idPrefix="ach-billing-address" value={bankAccount.billingAddress} onChange={updateBankBillingAddress} required compact line1Label="Billing Address" />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="rounded-md border bg-muted/20 p-4">
                  <Label htmlFor="coupon-code">Coupon or Trial Code</Label>
                  <div className="mt-2 flex gap-2">
                    <Input id="coupon-code" value={couponCode} onChange={(event) => setCouponCode(normalizeCouponCodeInput(event.target.value))} placeholder="Enter code" className="h-11 bg-card uppercase" />
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
              <Button type="button" variant="ghost" onClick={goBack} disabled={step === 1 || loading || checkoutLoading || finalizingOnboarding} className="flex-1 sm:flex-none"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
              <Button type="button" onClick={goNext} disabled={loading || checkoutLoading || finalizingOnboarding || (step === 2 && hierarchyView === 'review' && hierarchyIssues.length > 0)} className="flex-1 min-w-[140px] sm:flex-none">{loading || checkoutLoading || finalizingOnboarding ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Working</> : <>{nextLabel} <ArrowRight className="ml-2 h-4 w-4" /></>}</Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}







