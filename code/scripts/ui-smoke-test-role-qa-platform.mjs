import 'dotenv/config';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const baseUrlArg = process.argv.find((arg) => arg.startsWith('--base-url='))?.split('=').slice(1).join('=');
const baseUrl = baseUrlArg || process.env.ROLE_QA_BASE_URL || 'https://restops-360.com';
const authOnly = process.argv.includes('--auth-only');
const accountFilterArg = process.argv.find((arg) => arg.startsWith('--account='))?.split('=').slice(1).join('=');
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.ROLE_QA_PASSWORD;

if (!supabaseUrl || !anonKey) {
  console.error('Missing Supabase env vars.');
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
    dashboardText: 'Platform Overview',
    routes: ['Dashboard', 'PlatformAdmin', 'PlatformUsers', 'PlatformOrganizations', 'PlatformPlans', 'PlatformInvoices', 'PlatformUserManagement', 'PlatformAuditLogs'],
    forbiddenRoutes: ['Invoices', 'Payments', 'Inventory', 'OrgManagement'],
  },
  {
    email: 'qa.owner.bistro@restops.test',
    role: 'org_owner',
    dashboardText: 'QA Bistro Group Dashboard',
    routes: ['Dashboard', 'Performance', 'Notifications', 'AiInsights', 'AskTom', 'Invoices', 'Payments', 'Products', 'Inventory', 'AutoOrdering', 'SmartPrep', 'Recipes', 'Vendors', 'Labor', 'Accounting', 'OrgManagement', 'UserManagement', 'RestaurantSetup', 'Integrations', 'AuditLogs'],
    forbiddenRoutes: ['PlatformAdmin', 'PlatformUsers', 'PlatformOrganizations', 'PlatformPlans', 'PlatformInvoices', 'PlatformUserManagement', 'PlatformAuditLogs'],
  },
  {
    email: 'qa.brand.northfork@restops.test',
    role: 'branch_manager',
    dashboardText: 'North Fork Grill Dashboard',
    routes: ['Dashboard', 'Performance', 'Notifications', 'AiInsights', 'AskTom', 'Invoices', 'Payments', 'Products', 'Inventory', 'AutoOrdering', 'SmartPrep', 'Recipes', 'Vendors', 'Labor', 'RestaurantSetup'],
    forbiddenRoutes: ['Accounting', 'OrgManagement', 'UserManagement', 'Integrations', 'AuditLogs', 'PlatformAdmin'],
  },
  {
    email: 'qa.location.northfork@restops.test',
    role: 'location_manager',
    dashboardText: 'North Fork Downtown Dashboard',
    routes: ['Dashboard', 'Performance', 'Notifications', 'Invoices', 'Payments', 'Products', 'Inventory', 'AutoOrdering', 'SmartPrep', 'Recipes', 'Vendors', 'Labor', 'RestaurantSetup'],
    forbiddenRoutes: ['Accounting', 'OrgManagement', 'UserManagement', 'Integrations', 'AuditLogs', 'PlatformAdmin'],
  },
  {
    email: 'qa.staff.northfork@restops.test',
    role: 'ground_staff',
    dashboardText: 'My Dashboard',
    routes: ['Dashboard', 'Notifications', 'Invoices', 'Products', 'Inventory', 'AutoOrdering'],
    forbiddenRoutes: ['Performance', 'Payments', 'SmartPrep', 'Recipes', 'Vendors', 'Labor', 'Accounting', 'RestaurantSetup', 'UserManagement', 'PlatformAdmin'],
  },
];

const selectedAccounts = accountFilterArg
  ? accounts.filter((account) => account.email === accountFilterArg || account.role === accountFilterArg)
  : accounts;

if (!selectedAccounts.length) {
  console.error(`No QA accounts matched --account=${accountFilterArg}`);
  process.exit(1);
}

function timedFetch(input, init = {}) {
  const timeoutMs = Number(process.env.ROLE_QA_FETCH_TIMEOUT_MS || 8000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Supabase request timed out after ${timeoutMs}ms`)), timeoutMs);
  const upstreamSignal = init.signal;
  if (upstreamSignal) {
    if (upstreamSignal.aborted) controller.abort(upstreamSignal.reason);
    else upstreamSignal.addEventListener('abort', () => controller.abort(upstreamSignal.reason), { once: true });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

function makeSupabaseClient(key) {
  return createClient(supabaseUrl, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: timedFetch },
  });
}

async function getUserId(email) {
  const serviceUserId = await getUserIdFromServiceRole(email);
  if (serviceUserId) return serviceUserId;

  let data;
  const attempts = [];
  const maxAttempts = Number(process.env.ROLE_QA_AUTH_ATTEMPTS || 2);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const client = makeSupabaseClient(anonKey);
    const result = await client.auth.signInWithPassword({ email, password });
    data = result.data;
    if (!result.error && data?.user?.id) {
      await client.auth.signOut().catch(() => {});
      return data.user.id;
    }
    attempts.push(`attempt ${attempt}: ${formatError(result.error) || 'missing user id'}`);
    await client.auth.signOut().catch(() => {});
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }

  throw new Error(`${email} auth lookup failed after ${attempts.length} attempts. ${attempts.join(' | ')}`);
}

async function getUserIdFromServiceRole(email) {
  if (!serviceRoleKey) return null;
  const client = makeSupabaseClient(serviceRoleKey);

  const profile = await client
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (!profile.error && profile.data?.id) return profile.data.id;

  const users = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (!users.error) {
    const user = users.data?.users?.find((item) => item.email?.toLowerCase() === email.toLowerCase());
    if (user?.id) return user.id;
  }

  console.warn(JSON.stringify({
    warning: 'service_role_user_lookup_failed',
    email,
    profileError: formatError(profile.error),
    listUsersError: formatError(users.error),
  }));
  return null;
}

function formatError(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  const parts = [];
  if (error.name) parts.push(error.name);
  if (error.status) parts.push(`status=${error.status}`);
  if (error.code) parts.push(`code=${error.code}`);
  if (error.message) parts.push(error.message);
  if (error.cause?.message) parts.push(`cause=${error.cause.message}`);
  if (!parts.length) {
    try {
      const props = Object.getOwnPropertyNames(error).reduce((acc, key) => {
        acc[key] = error[key];
        return acc;
      }, {});
      return JSON.stringify(props);
    } catch {
      return String(error);
    }
  }
  return parts.join(' ');
}

function routeUrl(route) {
  return `${baseUrl}/${route}`;
}

function hasFailureText(text) {
  return [
    'This page is not available',
    'Page Not Found',
    'Welcome Back',
    'Secure Your Account',
    'Access Restricted',
    'Module Not Available',
    'Access denied',
    'You do not have access',
    'Something went wrong',
  ].some((needle) => text.includes(needle));
}

function isKnownConsoleWarning(message) {
  return [
    'plausible.io/js/script.js',
    'violates the following Content Security Policy directive',
    'TypeError: Failed to fetch',
    'Failed to load resource: the server responded with a status of 400',
    'Failed to load resource: the server responded with a status of 403',
    'Failed to load resource: the server responded with a status of 404',
  ].some((needle) => message.includes(needle));
}

async function waitForAppSettled(page) {
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await page.waitForFunction(() => {
    const text = document.body?.innerText || '';
    return text.trim().length > 0 && !text.trim().startsWith('Loading...');
  }, null, { timeout: 12000 }).catch(() => {});
}

async function login(page, account) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByPlaceholder('you@restaurant.com').fill(account.email);
  await page.getByPlaceholder('••••••••').fill(password);
  await Promise.all([
    page.waitForLoadState('domcontentloaded').catch(() => {}),
    page.getByRole('button', { name: 'Sign In' }).click(),
  ]);
  await waitForAppSettled(page);
}

async function runAccount(browser, account) {
  console.error(`[ui-smoke] ${account.email}: resolving user id`);
  const userId = await getUserId(account.email);
  console.error(`[ui-smoke] ${account.email}: launching browser context`);
  const context = await browser.newContext();
  await context.addInitScript(({ userId }) => {
    window.localStorage.setItem('restops_mfa_trust', JSON.stringify({
      userId,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    }));
  }, { userId });

  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  const failures = [];
  console.error(`[ui-smoke] ${account.email}: login`);
  await login(page, account);

  await page.getByText(account.dashboardText, { exact: false }).waitFor({ timeout: 15000 }).catch(() => {});
  const dashboardText = await page.locator('body').innerText({ timeout: 15000 });
  if (!dashboardText.includes(account.dashboardText)) {
    failures.push(`dashboard did not show "${account.dashboardText}"`);
  }
  if (hasFailureText(dashboardText)) {
    failures.push('dashboard displayed failure/auth text');
  }

  const routeResults = [];
  for (const route of account.routes) {
    console.error(`[ui-smoke] ${account.email}: checking ${route}`);
    await page.goto(routeUrl(route), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForAppSettled(page);
    const text = await page.locator('body').innerText({ timeout: 15000 });
    const ok = !hasFailureText(text);
    if (!ok) failures.push(`${route} displayed failure/auth text`);
    routeResults.push({
      route,
      ok,
      title: text.split('\n').find(Boolean) || '',
    });
  }

  const forbiddenRouteResults = [];
  for (const route of account.forbiddenRoutes || []) {
    console.error(`[ui-smoke] ${account.email}: checking forbidden ${route}`);
    await page.goto(routeUrl(route), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForAppSettled(page);
    const text = await page.locator('body').innerText({ timeout: 15000 });
    const currentPath = new URL(page.url()).pathname.replace(/^\/+/, '').toLowerCase();
    const redirectedAway = currentPath !== route.toLowerCase();
    const blocked = redirectedAway || hasFailureText(text);
    if (!blocked) failures.push(`${route} was reachable but should be blocked`);
    forbiddenRouteResults.push({
      route,
      blocked,
      redirectedAway,
      currentPath,
      title: text.split('\n').find(Boolean) || '',
    });
  }

  await context.close();
  console.error(`[ui-smoke] ${account.email}: complete`);
  return {
    account: account.email,
    role: account.role,
    ok: failures.length === 0,
    routesChecked: routeResults.length,
    forbiddenRoutesChecked: forbiddenRouteResults.length,
    routeResults,
    forbiddenRouteResults,
    consoleWarnings: consoleErrors
      .filter((message) => !message.includes('Sentry') && !message.includes('PostHog'))
      .filter(isKnownConsoleWarning)
      .slice(0, 10),
    consoleErrors: consoleErrors
      .filter((message) => !message.includes('Sentry') && !message.includes('PostHog'))
      .filter((message) => !isKnownConsoleWarning(message))
      .slice(0, 10),
    failures,
  };
}

if (authOnly) {
  const authResults = [];
  for (const account of selectedAccounts) {
    try {
      console.error(`[ui-smoke] ${account.email}: auth-only lookup`);
      const userId = await getUserId(account.email);
      authResults.push({ account: account.email, role: account.role, ok: true, userId });
    } catch (error) {
      authResults.push({ account: account.email, role: account.role, ok: false, error: formatError(error) });
    }
  }
  const failedAuth = authResults.filter((result) => !result.ok);
  console.log(JSON.stringify({
    testedAt: new Date().toISOString(),
    mode: 'auth-only',
    accounts: authResults.length,
    passed: authResults.length - failedAuth.length,
    failed: failedAuth.length,
    results: authResults,
  }, null, 2));
  if (failedAuth.length) process.exit(1);
  process.exit(0);
}

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const account of selectedAccounts) {
    results.push(await runAccount(browser, account));
  }
} finally {
  await browser.close();
}

const failed = results.filter((result) => !result.ok || result.consoleErrors.length);
const summary = {
  testedAt: new Date().toISOString(),
  baseUrl,
  accounts: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  results,
};

console.log(JSON.stringify(summary, null, 2));
if (failed.length) process.exit(1);
