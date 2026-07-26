import 'dotenv/config';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = process.env.ONBOARDING_SANDBOX_PASSWORD || process.env.ROLE_QA_PASSWORD;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

if (!PASSWORD) {
  console.error('Missing ONBOARDING_SANDBOX_PASSWORD or ROLE_QA_PASSWORD.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CONSENT_VERSION = 'tenant-bank-authorization-v1';
const CONSENT_TEXT = 'Sandbox tenant bank authorization for QA onboarding verification only.';

const ALL_MODULES = [
  'dashboard',
  'invoices',
  'payments',
  'products',
  'inventory',
  'orders',
  'smartprep',
  'ask_tom',
  'recipes',
  'vendors',
  'labor',
  'admin',
  'integrations',
  'performance',
  'feedback',
  'accounting',
  'setup',
];
const sandboxAccounts = [
  { n: 1, email: 'qa.onboarding.tester1@restops.test', name: 'QA Onboarding Tester 1', scenario: 'not_started' },
  { n: 2, email: 'qa.onboarding.tester2@restops.test', name: 'QA Onboarding Tester 2', scenario: 'draft_business' },
  { n: 3, email: 'qa.onboarding.tester3@restops.test', name: 'QA Onboarding Tester 3', scenario: 'pending_review' },
  { n: 4, email: 'qa.onboarding.tester4@restops.test', name: 'QA Onboarding Tester 4', scenario: 'failed_review' },
  { n: 5, email: 'qa.onboarding.tester5@restops.test', name: 'QA Onboarding Tester 5', scenario: 'business_verified' },
  { n: 6, email: 'qa.onboarding.tester6@restops.test', name: 'QA Onboarding Tester 6', scenario: 'payment_verified' },
  { n: 7, email: 'qa.onboarding.tester7@restops.test', name: 'QA Onboarding Tester 7', scenario: 'bank_pending_signature' },
  { n: 8, email: 'qa.onboarding.tester8@restops.test', name: 'QA Onboarding Tester 8', scenario: 'completed' },
  { n: 9, email: 'qa.onboarding.developer@restops.test', name: 'QA Onboarding Developer', scenario: 'completed' },
];

const fullAccessAccounts = [
  { n: 101, email: 'qa.fullaccess.tester1@restops.test', name: 'QA Full Access Tester 1', scenario: 'completed', fullAccess: true },
  { n: 102, email: 'qa.fullaccess.tester2@restops.test', name: 'QA Full Access Tester 2', scenario: 'completed', fullAccess: true },
  { n: 103, email: 'qa.fullaccess.tester3@restops.test', name: 'QA Full Access Tester 3', scenario: 'completed', fullAccess: true },
  { n: 104, email: 'qa.fullaccess.tester4@restops.test', name: 'QA Full Access Tester 4', scenario: 'completed', fullAccess: true },
  { n: 105, email: 'qa.fullaccess.tester5@restops.test', name: 'QA Full Access Tester 5', scenario: 'completed', fullAccess: true },
  { n: 106, email: 'qa.fullaccess.tester6@restops.test', name: 'QA Full Access Tester 6', scenario: 'completed', fullAccess: true },
  { n: 107, email: 'qa.fullaccess.tester7@restops.test', name: 'QA Full Access Tester 7', scenario: 'completed', fullAccess: true },
  { n: 108, email: 'qa.fullaccess.tester8@restops.test', name: 'QA Full Access Tester 8', scenario: 'completed', fullAccess: true },
  { n: 109, email: 'qa.fullaccess.developer@restops.test', name: 'QA Full Access Developer', scenario: 'completed', fullAccess: true },
];

const scenarioLabels = {
  not_started: 'fresh signup, no onboarding started',
  draft_business: 'business form draft saved',
  pending_review: 'business verification waiting for platform admin',
  failed_review: 'business verification rejected / editable again',
  business_verified: 'business verified, payment method next',
  payment_verified: 'subscription payment verified, hierarchy next',
  bank_pending_signature: 'org created, operating bank saved, signature pending',
  completed: 'full onboarding completed with authorized sandbox bank',
};

function fakeBusiness(account) {
  const suffix = String(account.n).padStart(3, '0');
  return {
    legalName: `QA Sandbox Company ${suffix} LLC`,
    businessType: 'llc',
    identifierType: 'ein',
    taxIdentifier: `99-88${suffix}77`,
    identifierLast4: `${suffix}7`.slice(-4).padStart(4, '0'),
    email: account.email,
    phone: `+1865555${String(1000 + account.n).slice(-4)}`,
    website: `https://qa-sandbox-${suffix}.example.test`,
    address: {
      line1: `${100 + account.n} Sandbox Test Way`,
      line2: '',
      city: 'Knoxville',
      state: 'TN',
      zip: `379${String((10 + account.n) % 90).padStart(2, '0')}`,
      country: 'US',
    },
    bank: {
      bankName: `Sandbox Bank ${suffix}`,
      accountHolderName: `QA Sandbox Company ${suffix} LLC`,
      routingLast4: String(1000 + account.n).slice(-4),
      accountLast4: String(9000 + account.n).slice(-4),
    },
  };
}

function onboardingDraft(account) {
  const business = fakeBusiness(account);
  return {
    legalName: business.legalName,
    businessType: business.businessType,
    identifierType: business.identifierType,
    taxIdentifier: business.taxIdentifier,
    email: business.email,
    phone: business.phone,
    website: business.website,
    businessAddress: business.address,
    mailingAddress: business.address,
    serviceAddress: business.address,
    sameMailing: true,
    serviceLocationName: `QA Sandbox Location ${String(account.n).padStart(3, '0')}`,
    sandbox: true,
  };
}

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function maybe(label, promise) {
  const { error } = await promise;
  if (error) console.warn(`${label}: ${error.message}`);
}

async function findUserByEmail(email) {
  const perPage = 1000;
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const user = data.users.find((item) => item.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < perPage) return null;
  }
  return null;
}

async function upsertUser(account) {
  const metadata = {
    full_name: account.name,
    role: 'tenant_super_admin',
    sandbox_onboarding: true,
    sandbox_scenario: account.scenario,
  };
  const existing = await findUserByEmail(account.email);

  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      app_metadata: { ...(existing.app_metadata || {}), ...metadata },
      email_confirm: true,
      password: PASSWORD,
      user_metadata: { ...(existing.user_metadata || {}), ...metadata },
    });
    if (error) throw new Error(`updateUser ${account.email}: ${error.message}`);
    return data.user;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    app_metadata: metadata,
    email: account.email,
    email_confirm: true,
    password: PASSWORD,
    user_metadata: metadata,
  });
  if (error) throw new Error(`createUser ${account.email}: ${error.message}`);
  return data.user;
}

async function resetOnboardingRows(userId) {
  await maybe('delete onboarding payment methods', supabase.from('onboarding_payment_methods').delete().eq('user_id', userId));
  await maybe('delete tenant payment authorizations', supabase.from('tenant_payment_authorizations').delete().eq('user_id', userId));
  await maybe('delete onboarding bank accounts', supabase.from('onboarding_bank_accounts').delete().eq('user_id', userId));
  await maybe('delete organization addresses', supabase.from('organization_addresses').delete().eq('user_id', userId));
  await maybe('delete business verifications', supabase.from('business_verifications').delete().eq('user_id', userId));
  await maybe('delete onboarding step events', supabase.from('onboarding_step_events').delete().eq('user_id', userId));
  await maybe('delete onboarding workflow runs', supabase.from('onboarding_workflow_runs').delete().eq('user_id', userId));
  await maybe('delete location memberships', supabase.from('location_members').delete().eq('user_id', userId));
  await maybe('delete brand memberships', supabase.from('brand_members').delete().eq('user_id', userId));
  await maybe('delete organization memberships', supabase.from('organization_members').delete().eq('user_id', userId));
}

async function seedProfile(account, user) {
  const base = {
    id: user.id,
    email: account.email,
    full_name: account.name,
    role: 'tenant_super_admin',
    status: 'active',
    access_level: 'organization',
    organization_id: null,
    brand_id: null,
    location_id: null,
    business_verification_status: 'not_started',
    business_verification_score: null,
    business_verification_provider: null,
    business_verified_at: null,
    business_type: null,
    tax_identifier_type: null,
    tax_identifier_last4: null,
    payment_verified: false,
    payment_method_type: null,
    payment_method_verified_at: null,
    onboarding_status: account.scenario === 'draft_business' ? 'in_progress' : 'not_started',
    onboarding_current_step: 'business_verification',
    onboarding_completed_at: null,
    onboarding_draft: account.scenario === 'draft_business' ? onboardingDraft(account) : {},
    banking_onboarding_completed: false,
    updated_at: new Date().toISOString(),
  };

  await must(`upsert profile ${account.email}`, supabase
    .from('profiles')
    .upsert(base, { onConflict: 'id' })
    .select('id')
    .single());
}

async function seedBusinessVerification(account, user, status) {
  const business = fakeBusiness(account);
  const trustScore = status === 'failed' ? 35 : status === 'pending_review' ? 65 : 96;
  await must(`business verification ${account.email}`, supabase
    .from('business_verifications')
    .upsert({
      user_id: user.id,
      legal_business_name: business.legalName,
      business_type: business.businessType,
      identifier_type: business.identifierType,
      identifier_last4: business.identifierLast4,
      provider_name: 'sandbox_kyb',
      provider_reference_id: `sandbox-kyb-${String(account.n).padStart(3, '0')}`,
      verification_status: status,
      trust_score: trustScore,
      rejection_reason: status === 'failed' ? 'Sandbox rejection: missing or mismatched test document.' : null,
      metadata: {
        sandbox: true,
        scenario: account.scenario,
        email: business.email,
        phone: business.phone,
        website: business.website,
        provider_mode: 'sandbox_seed',
      },
    }, { onConflict: 'user_id' })
    .select('id')
    .single());

  await must(`profile verification state ${account.email}`, supabase
    .from('profiles')
    .update({
      business_verification_status: status,
      business_verification_score: trustScore,
      business_verification_provider: 'sandbox_kyb',
      business_verified_at: status === 'verified' ? new Date().toISOString() : null,
      business_type: business.businessType,
      tax_identifier_type: business.identifierType,
      tax_identifier_last4: business.identifierLast4,
      onboarding_status: status === 'pending_review' ? 'pending_review' : status === 'failed' ? 'blocked' : 'in_progress',
      onboarding_current_step: status === 'verified' ? 'payment_method' : 'business_verification',
      onboarding_draft: status === 'failed' ? onboardingDraft(account) : {},
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)
    .select('id')
    .single());
}

async function seedAddress(account, user, organizationId = null, locationId = null) {
  const business = fakeBusiness(account);
  const addressRows = ['business', 'mailing', 'service'].map((addressType) => ({
    user_id: user.id,
    organization_id: organizationId,
    location_id: addressType === 'service' ? locationId : null,
    address_type: addressType,
    location_name: addressType === 'service' ? `QA Sandbox Location ${String(account.n).padStart(3, '0')}` : null,
    address_line_1: business.address.line1,
    address_line_2: null,
    city: business.address.city,
    state: business.address.state,
    zip_code: business.address.zip,
    country: 'US',
    usps_verified: true,
    usps_standardized: true,
    usps_validation_code: 'SANDBOX_USPS',
  }));
  await must(`addresses ${account.email}`, supabase.from('organization_addresses').insert(addressRows).select('id'));
}

async function seedPaymentMethod(account, user, organizationId = null, bankAccountId = null, authorizationId = null) {
  const business = fakeBusiness(account);
  const methodType = bankAccountId ? 'ach' : 'card';
  await must(`payment method ${account.email}`, supabase
    .from('onboarding_payment_methods')
    .insert({
      user_id: user.id,
      organization_id: organizationId,
      method_type: methodType,
      provider: bankAccountId ? 'tenant_bank_vault' : 'stripe_sandbox',
      provider_payment_method_id: bankAccountId ? null : `pm_sandbox_${String(account.n).padStart(3, '0')}`,
      status: 'verified',
      last4: bankAccountId ? business.bank.accountLast4 : String(4200 + account.n).slice(-4),
      brand: bankAccountId ? null : 'Visa',
      bank_name: bankAccountId ? business.bank.bankName : null,
      verified_at: new Date().toISOString(),
      metadata: {
        sandbox: true,
        scenario: account.scenario,
        onboarding_bank_account_id: bankAccountId,
        tenant_payment_authorization_id: authorizationId,
        routing_number_last4: bankAccountId ? business.bank.routingLast4 : null,
      },
    })
    .select('id')
    .single());

  await must(`profile payment ${account.email}`, supabase
    .from('profiles')
    .update({
      payment_verified: true,
      payment_method_type: methodType,
      payment_method_verified_at: new Date().toISOString(),
      onboarding_status: 'in_progress',
      onboarding_current_step: 'hierarchy_setup',
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)
    .select('id')
    .single());
}

async function seedOrganization(account, user) {
  const suffix = String(account.n).padStart(3, '0');
  const org = await must(`organization ${account.email}`, supabase
    .from('organizations')
    .upsert({
      name: `QA Sandbox Org ${suffix}`,
      slug: `qa-sandbox-org-${suffix}`,
      owner_id: user.id,
      subscription_plan: 'enterprise',
      subscription_status: 'trial',
      enabled_modules: ALL_MODULES,
      tenant_id: user.id,
    }, { onConflict: 'slug' })
    .select('id, name, slug')
    .single());

  await maybe(`delete previous sandbox locations ${account.email}`, supabase.from('locations').delete().eq('organization_id', org.id).ilike('name', 'QA Sandbox Location%'));
  await maybe(`delete previous sandbox brands ${account.email}`, supabase.from('brands').delete().eq('organization_id', org.id).ilike('name', 'QA Sandbox Brand%'));

  const brand = await must(`brand ${account.email}`, supabase
    .from('brands')
    .insert({ name: `QA Sandbox Brand ${suffix}`, organization_id: org.id })
    .select('brand_id, name')
    .single());

  const location = await must(`location ${account.email}`, supabase
    .from('locations')
    .insert({
      name: `QA Sandbox Location ${suffix}`,
      organization_id: org.id,
      brand_id: brand.brand_id,
      address: `${100 + account.n} Sandbox Test Way, Knoxville, TN`,
    })
    .select('id, name')
    .single());

  await maybe(`organization member ${account.email}`, supabase.from('organization_members').upsert({
    organization_id: org.id,
    role: 'tenant_super_admin',
    user_id: user.id,
  }, { onConflict: 'organization_id,user_id' }));

  await maybe(`brand member ${account.email}`, supabase.from('brand_members').upsert({
    brand_id: brand.brand_id,
    role: 'tenant_super_admin',
    user_id: user.id,
  }, { onConflict: 'brand_id,user_id' }));

  await maybe(`location member ${account.email}`, supabase.from('location_members').upsert({
    location_id: location.id,
    role: 'tenant_super_admin',
    user_id: user.id,
  }, { onConflict: 'location_id,user_id' }));

  await must(`profile hierarchy ${account.email}`, supabase
    .from('profiles')
    .update({
      organization_id: org.id,
      brand_id: brand.brand_id,
      location_id: location.id,
      access_level: 'organization',
      onboarding_status: 'in_progress',
      onboarding_current_step: 'bank_authorization',
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)
    .select('id')
    .single());

  await seedAddress(account, user, org.id, location.id);
  return { org, brand, location };
}

async function seedBank(account, user, organizationId, status) {
  const business = fakeBusiness(account);
  const bank = await must(`bank ${account.email}`, supabase
    .from('onboarding_bank_accounts')
    .insert({
      user_id: user.id,
      organization_id: organizationId,
      bank_name: business.bank.bankName,
      account_holder_name: business.bank.accountHolderName,
      account_type: 'checking',
      nickname: `Sandbox Operating ${String(account.n).padStart(3, '0')}`,
      routing_number_last4: business.bank.routingLast4,
      account_number_last4: business.bank.accountLast4,
      billing_address_source: 'business',
      is_default: true,
      status,
      metadata: { sandbox: true, scenario: account.scenario },
    })
    .select('id')
    .single());

  let authorizationId = null;
  if (status === 'authorized' || status === 'verified') {
    const signatureSha256 = createHash('sha256')
      .update(`${user.id}:${bank.id}:${CONSENT_VERSION}:sandbox`)
      .digest('hex');
    const authorization = await must(`bank authorization ${account.email}`, supabase
      .from('tenant_payment_authorizations')
      .insert({
        user_id: user.id,
        organization_id: organizationId,
        onboarding_bank_account_id: bank.id,
        signer_full_name: account.name,
        signer_title: 'Sandbox Owner',
        consent_version: CONSENT_VERSION,
        consent_text: CONSENT_TEXT,
        consent_accepted: true,
        signature_sha256: signatureSha256,
        signature_payload: { sandbox: true, typed_signature: account.name },
        user_agent: 'seed-onboarding-sandbox',
        status: 'active',
        metadata: { sandbox: true },
      })
      .select('id')
      .single());
    authorizationId = authorization.id;
  }

  await must(`profile banking ${account.email}`, supabase
    .from('profiles')
    .update({
      banking_onboarding_completed: status === 'authorized' || status === 'verified',
      onboarding_status: status === 'pending_signature' ? 'in_progress' : 'completed',
      onboarding_current_step: status === 'pending_signature' ? 'bank_authorization' : 'complete',
      onboarding_completed_at: status === 'pending_signature' ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)
    .select('id')
    .single());

  return { bankAccountId: bank.id, authorizationId };
}

async function seedWorkflowRun(account, user, organizationId = null) {
  const currentStepByScenario = {
    not_started: 'business_verification',
    draft_business: 'business_verification',
    pending_review: 'business_verification',
    failed_review: 'business_verification',
    business_verified: 'payment_method',
    payment_verified: 'hierarchy_setup',
    bank_pending_signature: 'bank_authorization',
    completed: 'complete',
  };
  const statusByScenario = {
    not_started: 'in_progress',
    draft_business: 'in_progress',
    pending_review: 'pending_review',
    failed_review: 'blocked',
    business_verified: 'in_progress',
    payment_verified: 'in_progress',
    bank_pending_signature: 'in_progress',
    completed: 'completed',
  };

  const run = await must(`workflow run ${account.email}`, supabase
    .from('onboarding_workflow_runs')
    .insert({
      user_id: user.id,
      organization_id: organizationId,
      status: statusByScenario[account.scenario],
      current_step: currentStepByScenario[account.scenario],
      completed_at: account.scenario === 'completed' ? new Date().toISOString() : null,
      metadata: { sandbox: true, scenario: account.scenario },
    })
    .select('id')
    .single());

  await maybe(`workflow event ${account.email}`, supabase.from('onboarding_step_events').insert({
    run_id: run.id,
    user_id: user.id,
    organization_id: organizationId,
    step_key: currentStepByScenario[account.scenario],
    event_type: account.scenario === 'completed' ? 'completed' : 'started',
    status: statusByScenario[account.scenario],
    metadata: { sandbox: true, scenario: account.scenario },
  }));
}

const credentialRows = [];

for (const account of [...sandboxAccounts, ...fullAccessAccounts]) {
  const user = await upsertUser(account);
  await resetOnboardingRows(user.id);
  await seedProfile(account, user);

  if (!['not_started', 'draft_business'].includes(account.scenario)) {
    const verificationStatus = account.scenario === 'pending_review'
      ? 'pending_review'
      : account.scenario === 'failed_review'
        ? 'failed'
        : 'verified';
    await seedBusinessVerification(account, user, verificationStatus);
  }

  let organizationId = null;
  if (['bank_pending_signature', 'completed'].includes(account.scenario)) {
    await seedPaymentMethod(account, user);
    const hierarchy = await seedOrganization(account, user);
    organizationId = hierarchy.org.id;
    const { bankAccountId, authorizationId } = await seedBank(
      account,
      user,
      organizationId,
      account.scenario === 'completed' ? 'authorized' : 'pending_signature',
    );
    if (account.scenario === 'completed') {
      await seedPaymentMethod(account, user, organizationId, bankAccountId, authorizationId);
    }
  } else if (account.scenario === 'payment_verified') {
    await seedPaymentMethod(account, user);
  }

  if (account.scenario !== 'not_started') {
    await seedWorkflowRun(account, user, organizationId);
  }

  credentialRows.push({
    email: account.email,
    password: PASSWORD,
    scenario: account.scenario,
    use_case: account.fullAccess ? 'full platform access with all modules enabled' : scenarioLabels[account.scenario],
  });
}

console.log('\nOnboarding sandbox seed complete.\n');
console.table(credentialRows.map(({ password: _password, ...row }) => row));
console.log('Shared password: configured from ONBOARDING_SANDBOX_PASSWORD or ROLE_QA_PASSWORD.');

