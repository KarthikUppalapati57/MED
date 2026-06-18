import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.ROLE_QA_PASSWORD;
const today = new Date().toISOString().slice(0, 10);
const runKey = `qa-smoke-${today}`;

if (!supabaseUrl || !anonKey) {
  console.error('Missing VITE_SUPABASE_URL/SUPABASE_URL or VITE_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY.');
  process.exit(1);
}

if (!password) {
  console.error('Missing ROLE_QA_PASSWORD.');
  process.exit(1);
}

const accounts = [
  { email: 'qa.owner.bistro@restops.test', role: 'org_owner', scope: 'org' },
  { email: 'qa.brand.northfork@restops.test', role: 'branch_manager', scope: 'brand' },
  { email: 'qa.location.northfork@restops.test', role: 'location_manager', scope: 'location' },
  { email: 'qa.staff.northfork@restops.test', role: 'ground_staff', scope: 'staff' },
];

function client() {
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function serviceClient() {
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signIn(account) {
  const supabase = client();
  const { data, error } = await supabase.auth.signInWithPassword({ email: account.email, password });
  if (error) throw new Error(`${account.email} login failed: ${error.message}`);
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,email,role,organization_id,brand_id,location_id')
    .eq('id', data.user.id)
    .single();
  if (profileError) throw new Error(`${account.email} profile failed: ${profileError.message}`);
  return { supabase, user: data.user, profile };
}

function scopePayload(account, profile) {
  return {
    brand_id: account.scope === 'brand' || account.scope === 'location' || account.scope === 'staff' ? profile.brand_id : null,
    location_id: account.scope === 'location' || account.scope === 'staff' ? profile.location_id : null,
    organization_id: profile.organization_id,
    scope: account.scope,
    scope_key:
      account.scope === 'brand' ? profile.brand_id
        : account.scope === 'location' || account.scope === 'staff' ? profile.location_id
          : 'org',
  };
}

function expectNoError(label, error) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

async function upsertActionStatus(supabase, account, profile) {
  const payload = {
    ...scopePayload(account, profile),
    action_date: today,
    action_key: runKey,
    action_title: 'QA smoke dashboard workflow',
    completed_at: null,
    completed_by: null,
    status: 'open',
  };

  const opened = await supabase
    .from('dashboard_action_status')
    .upsert(payload, { onConflict: 'organization_id,scope,scope_key,action_date,action_key' })
    .select('id,status')
    .single();
  expectNoError('dashboard action open upsert', opened.error);

  const completed = await supabase
    .from('dashboard_action_status')
    .upsert({
      ...payload,
      completed_at: new Date().toISOString(),
      completed_by: profile.id,
      status: 'done',
    }, { onConflict: 'organization_id,scope,scope_key,action_date,action_key' })
    .select('id,status,completed_by')
    .single();
  expectNoError('dashboard action done upsert', completed.error);
  if (completed.data.status !== 'done') throw new Error('dashboard action did not persist done status');
  return completed.data;
}

async function upsertHandoffNote(supabase, account, profile) {
  const note = `QA workflow smoke note ${new Date().toISOString()}`;
  const result = await supabase
    .from('dashboard_handoff_notes')
    .upsert({
      ...scopePayload(account, profile),
      note,
      note_date: today,
    }, { onConflict: 'organization_id,scope,scope_key,note_date' })
    .select('id,note')
    .single();
  expectNoError('dashboard handoff note upsert', result.error);
  if (result.data.note !== note) throw new Error('handoff note did not round-trip');
  return result.data;
}

async function saveAndDeleteReview(supabase, account, profile) {
  const upserted = await supabase
    .from('dashboard_review_logs')
    .upsert({
      ...scopePayload(account, profile),
      completed_count: 1,
      data_health_score: 99,
      low_stock_count: 0,
      note: `QA workflow smoke review ${runKey}`,
      open_actions: [],
      pending_invoice_count: 0,
      prime_cost_percent: 51,
      review_date: today,
      saved_by: profile.id,
      total_count: 1,
      unpaid_amount: 0,
      week_sales: 1234,
    }, { onConflict: 'organization_id,scope,scope_key,review_date' })
    .select('id,data_health_score,note')
    .single();
  expectNoError('dashboard review upsert', upserted.error);

  const deleted = await supabase
    .from('dashboard_review_logs')
    .delete()
    .eq('id', upserted.data.id);
  expectNoError('dashboard review cleanup delete', deleted.error);
  return upserted.data;
}

async function noOpUpdatePreferences(supabase, account, profile) {
  const scope = scopePayload(account, profile);
  const existing = await supabase
    .from('dashboard_report_preferences')
    .select('*')
    .eq('organization_id', scope.organization_id)
    .eq('scope', account.scope === 'staff' ? 'location' : account.scope)
    .eq('scope_key', account.scope === 'staff' ? profile.location_id : scope.scope_key)
    .maybeSingle();
  expectNoError('dashboard report preferences read', existing.error);
  if (!existing.data) return { skipped: true, reason: 'no seeded preference for scope' };

  const updated = await supabase
    .from('dashboard_report_preferences')
    .update({ include_forecasts: existing.data.include_forecasts })
    .eq('id', existing.data.id)
    .select('id,include_forecasts')
    .single();
  expectNoError('dashboard report preferences no-op update', updated.error);
  return updated.data;
}

async function noOpUpdateEscalationRules(supabase, account, profile) {
  const scope = scopePayload(account, profile);
  const targetScope = account.scope === 'staff' ? 'location' : account.scope;
  const targetScopeKey = account.scope === 'staff' ? profile.location_id : scope.scope_key;
  const existing = await supabase
    .from('dashboard_escalation_rules')
    .select('*')
    .eq('organization_id', scope.organization_id)
    .eq('scope', targetScope)
    .eq('scope_key', targetScopeKey)
    .maybeSingle();
  expectNoError('dashboard escalation rules read', existing.error);

  const payload = existing.data || {
    ...scope,
    scope: targetScope,
    scope_key: targetScopeKey,
    cogs_percent: 32,
    labor_percent: 28,
    prime_cost_percent: 60,
  };
  const updated = await supabase
    .from('dashboard_escalation_rules')
    .upsert(payload, { onConflict: 'organization_id,scope,scope_key' })
    .select('id,prime_cost_percent')
    .single();
  expectNoError('dashboard escalation rules upsert', updated.error);
  return updated.data;
}

async function createAndReadNotification(supabase, profile) {
  const inserted = await supabase
    .from('notifications')
    .insert({
      is_read: false,
      message: 'QA workflow smoke notification',
      organization_id: profile.organization_id,
      priority: 'low',
      title: 'QA workflow smoke',
      type: 'system',
      user_id: profile.id,
    })
    .select('id,is_read')
    .single();
  expectNoError('notification insert', inserted.error);

  const marked = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', inserted.data.id)
    .select('id,is_read')
    .single();
  expectNoError('notification mark read', marked.error);
  if (marked.data.is_read !== true) throw new Error('notification did not mark read');
  return marked.data;
}

async function assertStaffRestrictions(supabase, profile) {
  const invoiceNumber = `QA-DENIED-${Date.now()}`;
  const paymentInsert = await supabase
    .from('payments')
    .insert({
      amount: 1,
      invoice_number: invoiceNumber,
      organization_id: profile.organization_id,
      payment_method: 'manual',
      status: 'pending',
      vendor_name: 'QA Denied Vendor',
    })
    .select('id')
    .single();

  if (!paymentInsert.error) {
    const admin = serviceClient();
    if (admin) {
      await admin.from('payments').delete().eq('invoice_number', invoiceNumber);
    }
    throw new Error('ground staff unexpectedly inserted a payment record');
  }

  const crossScope = await supabase
    .from('dashboard_action_status')
    .insert({
      action_date: today,
      action_key: `${runKey}-forbidden-org`,
      action_title: 'QA forbidden org action',
      organization_id: profile.organization_id,
      scope: 'org',
      scope_key: 'org',
      status: 'open',
    })
    .select('id')
    .single();

  if (!crossScope.error) {
    throw new Error('ground staff unexpectedly inserted organization-scope dashboard action');
  }

  return {
    paymentInsertDenied: paymentInsert.error.message,
    orgDashboardWriteDenied: crossScope.error.message,
  };
}

async function assertCrossOrgIsolation() {
  const platform = await signIn({ email: 'qa.platform.admin@restops.test' });
  const { data: orgs, error } = await platform.supabase
    .from('organizations')
    .select('id,name,slug')
    .in('slug', ['qa-bistro-group', 'qa-coastal-restaurants']);
  await platform.supabase.auth.signOut();
  expectNoError('platform org lookup', error);

  const bistro = orgs.find((org) => org.slug === 'qa-bistro-group');
  const coastal = orgs.find((org) => org.slug === 'qa-coastal-restaurants');
  if (!bistro || !coastal) throw new Error('missing QA tenant organizations');

  const owner = await signIn({ email: 'qa.owner.bistro@restops.test' });
  const coastalBrands = await owner.supabase
    .from('brands')
    .select('brand_id,name', { count: 'exact' })
    .eq('organization_id', coastal.id);
  await owner.supabase.auth.signOut();
  expectNoError('cross-org brand read', coastalBrands.error);
  if ((coastalBrands.count || 0) > 0) {
    throw new Error(`bistro owner can see ${coastalBrands.count} coastal brand(s)`);
  }

  return { bistroOrg: bistro.name, coastalOrgHiddenFromBistroOwner: true };
}

async function runAccount(account) {
  const { supabase, profile } = await signIn(account);
  const failures = [];
  const checks = {};
  try {
    checks.actionStatus = await upsertActionStatus(supabase, account, profile);
    checks.handoffNote = await upsertHandoffNote(supabase, account, profile);
    checks.reviewLog = await saveAndDeleteReview(supabase, account, profile);
    checks.reportPreferences = await noOpUpdatePreferences(supabase, account, profile);
    checks.escalationRules = await noOpUpdateEscalationRules(supabase, account, profile);
    checks.notification = await createAndReadNotification(supabase, profile);
    if (account.role === 'ground_staff') {
      checks.restrictions = await assertStaffRestrictions(supabase, profile);
    }
  } catch (error) {
    failures.push(error.message);
  } finally {
    await supabase.auth.signOut();
  }

  return {
    account: account.email,
    role: account.role,
    scope: account.scope,
    ok: failures.length === 0,
    checks,
    failures,
  };
}

const results = [];
for (const account of accounts) {
  results.push(await runAccount(account));
}

let isolation = null;
const globalFailures = [];
try {
  isolation = await assertCrossOrgIsolation();
} catch (error) {
  globalFailures.push(error.message);
}

const failed = results.filter((result) => !result.ok);
const summary = {
  testedAt: new Date().toISOString(),
  runKey,
  accounts: results.length,
  passed: results.length - failed.length,
  failed: failed.length + globalFailures.length,
  isolation,
  globalFailures,
  results,
};

console.log(JSON.stringify(summary, null, 2));
if (failed.length || globalFailures.length) process.exit(1);
