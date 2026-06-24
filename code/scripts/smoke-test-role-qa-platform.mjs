import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const password = process.env.ROLE_QA_PASSWORD;

if (!supabaseUrl || !anonKey) {
  console.error('Missing VITE_SUPABASE_URL/SUPABASE_URL or VITE_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY.');
  process.exit(1);
}

if (!password) {
  console.error('Missing ROLE_QA_PASSWORD.');
  process.exit(1);
}

const accounts = [
  {
    email: 'qa.platform.admin@restops.test',
    role: 'platform_admin',
    expectedContext: ['platform'],
    expectedPages: ['Dashboard', 'PlatformAdmin', 'PlatformUsers', 'PlatformOrganizations', 'PlatformPlans', 'PlatformInvoices', 'PlatformUserManagement', 'PlatformAuditLogs'],
  },
  {
    email: 'qa.owner.bistro@restops.test',
    role: 'org_owner',
    expectedContext: ['organization_id'],
    expectedPages: ['Dashboard', 'Performance', 'Notifications', 'AiInsights', 'Invoices', 'Payments', 'Products', 'Inventory', 'AutoOrdering', 'SmartPrep', 'Recipes', 'Vendors', 'Labor', 'Accounting', 'OrgManagement', 'UserManagement', 'RestaurantSetup', 'Integrations', 'AuditLogs'],
  },
  {
    email: 'qa.brand.northfork@restops.test',
    role: 'branch_manager',
    expectedContext: ['organization_id', 'brand_id'],
    expectedPages: ['Dashboard', 'Performance', 'Notifications', 'AiInsights', 'Invoices', 'Payments', 'Products', 'Inventory', 'AutoOrdering', 'SmartPrep', 'Recipes', 'Vendors', 'Labor', 'RestaurantSetup'],
  },
  {
    email: 'qa.location.northfork@restops.test',
    role: 'location_manager',
    expectedContext: ['organization_id', 'brand_id', 'location_id'],
    expectedPages: ['Dashboard', 'Performance', 'Notifications', 'Invoices', 'Payments', 'Products', 'Inventory', 'AutoOrdering', 'SmartPrep', 'Recipes', 'Vendors', 'Labor', 'RestaurantSetup'],
  },
  {
    email: 'qa.staff.northfork@restops.test',
    role: 'ground_staff',
    expectedContext: ['organization_id', 'brand_id', 'location_id'],
    expectedPages: ['Dashboard', 'Notifications', 'Invoices', 'Products', 'Inventory'],
  },
];

const tableChecks = [
  { name: 'organizations', select: 'id,name', roles: ['platform_admin', 'org_owner', 'branch_manager', 'location_manager', 'ground_staff'] },
  { name: 'brands', select: 'brand_id,name,organization_id', roles: ['org_owner', 'branch_manager', 'location_manager', 'ground_staff'] },
  { name: 'locations', select: 'id,name,organization_id,brand_id', roles: ['org_owner', 'branch_manager', 'location_manager', 'ground_staff'] },
  { name: 'invoices', select: 'id,organization_id,location_id,status', roles: ['org_owner', 'branch_manager', 'location_manager', 'ground_staff'] },
  { name: 'payments', select: 'id,organization_id,location_id,status', roles: ['org_owner', 'branch_manager', 'location_manager'] },
  { name: 'products', select: 'id,organization_id,location_id,name', roles: ['org_owner', 'branch_manager', 'location_manager', 'ground_staff'] },
  { name: 'inventory', select: 'id,organization_id,location_id,product_id', roles: ['org_owner', 'branch_manager', 'location_manager', 'ground_staff'] },
  { name: 'auto_orders', select: 'id,organization_id,location_id,status', roles: ['org_owner', 'branch_manager', 'location_manager', 'ground_staff'] },
  { name: 'recipes', select: 'id,organization_id,location_id,name', roles: ['org_owner', 'branch_manager', 'location_manager'] },
  { name: 'vendors', select: 'id,organization_id,location_id,name', roles: ['org_owner', 'branch_manager', 'location_manager'] },
  { name: 'employee_shifts', select: 'id,organization_id,location_id,status', roles: ['org_owner', 'branch_manager', 'location_manager'] },
  { name: 'notifications', select: 'id,user_id,type,is_read', roles: ['platform_admin', 'org_owner', 'branch_manager', 'location_manager', 'ground_staff'] },
  { name: 'dashboard_report_preferences', select: 'id,organization_id,scope,daily_handoff,weekly_executive', roles: ['org_owner', 'branch_manager', 'location_manager'] },
  { name: 'dashboard_report_deliveries', select: 'id,organization_id,scope,report_type,status', roles: ['org_owner', 'branch_manager', 'location_manager'] },
  { name: 'dashboard_action_status', select: 'id,organization_id,scope,status', roles: ['org_owner', 'branch_manager', 'location_manager'] },
  { name: 'dashboard_escalation_rules', select: 'id,organization_id,scope', roles: ['org_owner', 'branch_manager', 'location_manager'] },
];

const roleOrder = {
  ground_staff: 0,
  location_manager: 1,
  branch_manager: 2,
  org_owner: 3,
  platform_admin: 4,
};

function pageAllowed(account, page) {
  if (account.expectedPages.includes(page)) return true;
  return false;
}

async function checkTable(client, account, check) {
  if (!check.roles.includes(account.role)) return { table: check.name, skipped: true };
  const { data, error, count } = await client
    .from(check.name)
    .select(check.select, { count: 'exact' })
    .limit(5);
  if (error) return { table: check.name, ok: false, error: error.message };
  return { table: check.name, ok: true, count: count ?? data?.length ?? 0 };
}

async function runAccount(account) {
  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const login = await client.auth.signInWithPassword({ email: account.email, password });
  if (login.error) {
    return { account: account.email, role: account.role, ok: false, loginError: login.error.message };
  }

  const user = login.data.user;
  const session = login.data.session;
  const aal = session?.user?.aal || session?.aal || 'unknown';

  const profileRes = await client
    .from('profiles')
    .select('id,email,full_name,role,organization_id,brand_id,location_id,access_level,status')
    .eq('id', user.id)
    .maybeSingle();

  const failures = [];
  const warnings = [];

  if (profileRes.error) {
    failures.push(`profile read failed: ${profileRes.error.message}`);
  }

  const profile = profileRes.data;
  if (profile?.role !== account.role) {
    failures.push(`role mismatch: expected ${account.role}, got ${profile?.role || 'null'}`);
  }
  for (const field of account.expectedContext) {
    if (field === 'platform') continue;
    if (!profile?.[field]) failures.push(`missing ${field}`);
  }
  if (profile?.status !== 'active') warnings.push(`profile status is ${profile?.status}`);

  // Ground staff legacy permissions check removed since permissions column was dropped

  const tableResults = [];
  for (const check of tableChecks) {
    tableResults.push(await checkTable(client, account, check));
  }
  for (const result of tableResults) {
    if (result.ok === false) failures.push(`${result.table}: ${result.error}`);
  }

  const dashboardSummary = account.role === 'platform_admin'
    ? { skipped: true, reason: 'platform admin uses platform dashboard queries' }
    : await client.rpc('get_role_dashboard_summary', {
      p_scope: account.role === 'branch_manager' ? 'brand' : account.role === 'location_manager' || account.role === 'ground_staff' ? 'location' : 'org',
      p_org_id: profile?.organization_id || null,
      p_brand_id: profile?.brand_id || null,
      p_location_id: profile?.location_id || null,
    });

  if (dashboardSummary?.error) {
    failures.push(`get_role_dashboard_summary: ${dashboardSummary.error.message}`);
  }

  const forbiddenPages = [];
  if (account.role === 'ground_staff') {
    for (const page of ['Payments', 'Performance', 'Labor', 'UserManagement', 'PlatformAdmin']) {
      if (pageAllowed(account, page)) forbiddenPages.push(page);
    }
  }

  if (forbiddenPages.length) {
    failures.push(`forbidden pages unexpectedly allowed: ${forbiddenPages.join(', ')}`);
  }

  await client.auth.signOut();

  return {
    account: account.email,
    role: account.role,
    ok: failures.length === 0,
    aal,
    fullName: profile?.full_name,
    context: {
      organization_id: profile?.organization_id || null,
      brand_id: profile?.brand_id || null,
      location_id: profile?.location_id || null,
      access_level: profile?.access_level || null,
    },
    expectedPages: account.expectedPages,
    tableResults,
    dashboardSummaryOk: !dashboardSummary?.error,
    warnings,
    failures,
  };
}

const results = [];
for (const account of accounts) {
  results.push(await runAccount(account));
}

const failed = results.filter((result) => !result.ok);
const summary = {
  testedAt: new Date().toISOString(),
  accounts: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  results,
};

console.log(JSON.stringify(summary, null, 2));
if (failed.length) process.exit(1);
