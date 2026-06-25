import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const root = process.cwd();
for (const file of ['.env.local', '.env']) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) continue;
  for (const line of fs.readFileSync(fullPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  console.error('Missing Supabase URL, anon key, or service role key.');
  process.exit(1);
}

const runId = `arch-reg-${Date.now()}`;
const password = `Arch-${Date.now()}-${Math.random().toString(36).slice(2)}aA1!`;

function client(key) {
  return createClient(supabaseUrl, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const admin = client(serviceRoleKey);
const orgAClient = client(anonKey);
const orgBClient = client(anonKey);

const created = {
  audit_logs: [],
  ledger_payments: [],
  ledger_bills: [],
  ledger_entries: [],
  payment_accounts: [],
  payments: [],
  invoices: [],
  vendors: [],
  organization_members: [],
  profiles: [],
  organizations: [],
  users: [],
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectNoError(label, error) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

function expectError(label, error, pattern) {
  assert(error, `${label}: expected error, got success`);
  if (pattern && !pattern.test(error.message || '')) {
    throw new Error(`${label}: expected ${pattern}, got "${error.message}"`);
  }
}

async function insertOne(table, payload, select = '*') {
  const { data, error } = await admin.from(table).insert(payload).select(select).single();
  expectNoError(`${table} insert`, error);
  if (created[table] && data?.id) created[table].push(data.id);
  return data;
}
async function upsertOne(table, payload, options, select = '*') {
  const { data, error } = await admin.from(table).upsert(payload, options).select(select).single();
  expectNoError(`${table} upsert`, error);
  if (created[table] && data?.id) created[table].push(data.id);
  return data;
}

async function createOrg(label) {
  const org = await insertOne('organizations', {
    name: `Architecture Regression ${label} ${runId}`,
    slug: `${runId}-${label.toLowerCase()}`,
    subscription_plan: 'enterprise',
    subscription_status: 'active',
    enabled_modules: ['dashboard', 'invoices', 'payments', 'accounting', 'admin'],
  }, 'id,name,slug');
  created.organizations.push(org.id);
  return org;
}

async function createUser(label, orgId) {
  const email = `${runId}-${label.toLowerCase()}@example.invalid`;
  const metadata = {
    access_level: 'organization',
    full_name: `Architecture Regression ${label}`,
    organization_id: orgId,
    role: 'org_owner',
  };

  const { data, error } = await admin.auth.admin.createUser({
    app_metadata: metadata,
    email,
    email_confirm: true,
    password,
    user_metadata: metadata,
  });
  expectNoError(`create user ${label}`, error);
  const user = data.user;
  created.users.push(user.id);

  await upsertOne('profiles', {
    access_level: 'organization',
    email,
    full_name: metadata.full_name,
    id: user.id,
    organization_id: orgId,
    role: 'org_owner',
    status: 'active',
  }, { onConflict: 'id' }, 'id');
  created.profiles.push(user.id);

  const membership = await insertOne('organization_members', {
    organization_id: orgId,
    role: 'org_owner',
    user_id: user.id,
  }, 'id');
  created.organization_members.push(membership.id);

  return { email, user };
}

async function signIn(supabase, account) {
  const { error } = await supabase.auth.signInWithPassword({
    email: account.email,
    password,
  });
  expectNoError(`sign in ${account.email}`, error);
}

async function cleanup() {
  const deleteByIds = async (table, ids) => {
    if (!ids.length) return;
    const { error } = await admin.from(table).delete().in('id', Array.from(new Set(ids)));
    if (error) console.warn(`cleanup ${table}: ${error.message}`);
  };

  await deleteByIds('ledger_entries', created.ledger_entries);
  await deleteByIds('ledger_payments', created.ledger_payments);
  await deleteByIds('ledger_bills', created.ledger_bills);
  await deleteByIds('audit_logs', created.audit_logs);
  await deleteByIds('payment_accounts', created.payment_accounts);
  await deleteByIds('payments', created.payments);
  await deleteByIds('invoices', created.invoices);
  await deleteByIds('vendors', created.vendors);
  await deleteByIds('organization_members', created.organization_members);
  await deleteByIds('profiles', created.users);
  await deleteByIds('profiles', created.profiles);
  await deleteByIds('organizations', created.organizations);

  for (const userId of Array.from(new Set(created.users))) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.warn(`cleanup auth user ${userId}: ${error.message}`);
  }
}

async function trackRowsByOrg(table, orgIds) {
  const { data, error } = await admin.from(table).select('id').in('organization_id', orgIds);
  if (error) return;
  for (const row of data || []) {
    if (created[table]) created[table].push(row.id);
  }
}

async function cleanupStaleRegressionRows() {
  const staleOrgsResult = await admin
    .from('organizations')
    .select('id')
    .like('slug', 'arch-reg-%');
  if (staleOrgsResult.error) {
    console.warn(`stale cleanup organizations: ${staleOrgsResult.error.message}`);
    return;
  }

  const orgIds = (staleOrgsResult.data || []).map((row) => row.id);
  const deleteByOrg = async (table) => {
    if (!orgIds.length) return;
    const { error } = await admin.from(table).delete().in('organization_id', orgIds);
    if (error) console.warn(`stale cleanup ${table}: ${error.message}`);
  };

  for (const table of [
    'ledger_entries',
    'ledger_payments',
    'ledger_bills',
    'audit_logs',
    'payment_accounts',
    'payments',
    'invoices',
    'vendors',
    'organization_members',
  ]) {
    await deleteByOrg(table);
  }

  const staleProfiles = await admin
    .from('profiles')
    .select('id')
    .like('email', 'arch-reg-%@example.invalid');
  const profileIds = (staleProfiles.data || []).map((row) => row.id);
  if (profileIds.length) {
    const { error } = await admin.from('profiles').delete().in('id', profileIds);
    if (error) console.warn(`stale cleanup profiles: ${error.message}`);
  }

  if (orgIds.length) {
    const { error } = await admin.from('organizations').delete().in('id', orgIds);
    if (error) console.warn(`stale cleanup organizations: ${error.message}`);
  }

  const perPage = 1000;
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.warn(`stale cleanup auth users: ${error.message}`);
      return;
    }
    const matches = (data.users || []).filter((user) => /^arch-reg-.*@example\.invalid$/i.test(user.email || ''));
    for (const user of matches) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
      if (deleteError) console.warn(`stale cleanup auth user ${user.id}: ${deleteError.message}`);
    }
    if ((data.users || []).length < perPage) break;
  }
}

async function main() {
  await cleanupStaleRegressionRows();

  const orgA = await createOrg('A');
  const orgB = await createOrg('B');
  const accountA = await createUser('A', orgA.id);
  const accountB = await createUser('B', orgB.id);
  await signIn(orgAClient, accountA);
  await signIn(orgBClient, accountB);

  const ownInvoice = await orgAClient.rpc('save_invoice_workflow', {
    p_invoice_id: null,
    p_invoice: {
      ap_status: 'approved',
      invoice_number: `${runId}-A-001`,
      organization_id: orgA.id,
      payment_status: 'unpaid',
      source: 'architecture_regression',
      status: 'pending_review',
      total_amount: 125.5,
      vendor_name: 'Architecture Regression Vendor',
    },
    p_line_items: [],
  });
  expectNoError('same-org save_invoice_workflow', ownInvoice.error);
  created.invoices.push(ownInvoice.data.id);

  const crossOrgInvoice = await orgAClient.rpc('save_invoice_workflow', {
    p_invoice_id: null,
    p_invoice: {
      invoice_number: `${runId}-B-001`,
      organization_id: orgB.id,
      source: 'architecture_regression',
      total_amount: 88,
      vendor_name: 'Forbidden Vendor',
    },
    p_line_items: [],
  });
  expectError('cross-org save_invoice_workflow', crossOrgInvoice.error, /Cross-organization access denied|Cross-organization financial access denied|Insufficient financial permissions/i);

  const ownAccount = await orgAClient.rpc('create_payment_account_workflow', {
    p_account: {
      account_number_last4: '2601',
      account_type: 'checking',
      is_default: false,
      name: `Architecture Regression Account ${runId}`,
      organization_id: orgA.id,
      payment_method: 'bank_transfer',
      provider: 'manual',
      routing_number_last4: '1111',
    },
  });
  expectNoError('same-org create_payment_account_workflow', ownAccount.error);
  created.payment_accounts.push(ownAccount.data.id);

  const crossOrgAccount = await orgAClient.rpc('create_payment_account_workflow', {
    p_account: {
      account_number_last4: '2602',
      account_type: 'checking',
      name: `Forbidden Account ${runId}`,
      organization_id: orgB.id,
      payment_method: 'bank_transfer',
      provider: 'manual',
    },
  });
  expectError('cross-org create_payment_account_workflow', crossOrgAccount.error, /Cross-organization access denied|Cross-organization financial access denied|Insufficient financial permissions/i);

  const ownAudit = await orgAClient.rpc('log_audit_event', {
    p_entry: {
      action: 'architecture_regression_own_org',
      details: { run_id: runId },
      organization_id: orgA.id,
      table_name: 'architecture_regression',
    },
  });
  expectNoError('same-org log_audit_event', ownAudit.error);
  created.audit_logs.push(ownAudit.data.id);

  const crossOrgAudit = await orgAClient.rpc('log_audit_event', {
    p_entry: {
      action: 'architecture_regression_cross_org',
      details: { run_id: runId },
      organization_id: orgB.id,
      table_name: 'architecture_regression',
    },
  });
  expectError('cross-org log_audit_event', crossOrgAudit.error, /Cross-organization access denied/i);

  const vendor = await insertOne('vendors', {
    email: `${runId}@vendor.example.invalid`,
    name: `Architecture Regression Vendor ${runId}`,
    organization_id: orgA.id,
    status: 'active',
  }, 'id,name,organization_id');

  const paymentOne = await orgAClient.rpc('record_ad_hoc_vendor_payment', {
    p_amount: 42.25,
    p_idempotency_key: `${runId}-adhoc-payment`,
    p_memo: 'Architecture regression idempotency check',
    p_payment_method: 'manual',
    p_vendor_id: vendor.id,
  });
  expectNoError('record_ad_hoc_vendor_payment first call', paymentOne.error);
  assert(paymentOne.data?.success === true, 'first ad-hoc payment did not return success');
  assert(paymentOne.data?.idempotent === false, 'first ad-hoc payment should not be idempotent');
  created.ledger_payments.push(paymentOne.data.ledger_payment_id);
  if (paymentOne.data.bill_id) created.ledger_bills.push(paymentOne.data.bill_id);

  const paymentTwo = await orgAClient.rpc('record_ad_hoc_vendor_payment', {
    p_amount: 42.25,
    p_idempotency_key: `${runId}-adhoc-payment`,
    p_memo: 'Architecture regression idempotency check',
    p_payment_method: 'manual',
    p_vendor_id: vendor.id,
  });
  expectNoError('record_ad_hoc_vendor_payment duplicate call', paymentTwo.error);
  assert(paymentTwo.data?.success === true, 'duplicate ad-hoc payment did not return success');
  assert(paymentTwo.data?.idempotent === true, 'duplicate ad-hoc payment should return idempotent=true');
  assert(
    paymentTwo.data?.ledger_payment_id === paymentOne.data?.ledger_payment_id,
    'duplicate ad-hoc payment returned a different ledger_payment_id',
  );

  const crossOrgPayment = await orgBClient.rpc('record_ad_hoc_vendor_payment', {
    p_amount: 42.25,
    p_idempotency_key: `${runId}-forbidden-payment`,
    p_memo: 'Architecture regression cross-org check',
    p_payment_method: 'manual',
    p_vendor_id: vendor.id,
  });
  expectError('cross-org record_ad_hoc_vendor_payment', crossOrgPayment.error, /Cross-organization access denied|Cross-organization financial access denied|Insufficient financial permissions/i);

  await trackRowsByOrg('ledger_entries', [orgA.id, orgB.id]);
  await trackRowsByOrg('ledger_payments', [orgA.id, orgB.id]);
  await trackRowsByOrg('ledger_bills', [orgA.id, orgB.id]);
  await trackRowsByOrg('payments', [orgA.id, orgB.id]);
  await trackRowsByOrg('audit_logs', [orgA.id, orgB.id]);

  console.log(JSON.stringify({
    ok: true,
    run_id: runId,
    checked: [
      'same-org invoice RPC succeeds',
      'cross-org invoice RPC denied',
      'same-org payment account RPC succeeds',
      'cross-org payment account RPC denied',
      'same-org audit RPC succeeds',
      'cross-org audit RPC denied',
      'ad-hoc vendor payment idempotency',
      'cross-org ad-hoc vendor payment denied',
    ],
  }, null, 2));
}

try {
  await main();
} finally {
  await cleanup();
}
