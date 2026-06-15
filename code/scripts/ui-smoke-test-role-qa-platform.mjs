import 'dotenv/config';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const baseUrl = process.env.ROLE_QA_BASE_URL || 'https://restops-360.com';
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const password = process.env.ROLE_QA_PASSWORD || 'RestopsQA!2026';

if (!supabaseUrl || !anonKey) {
  console.error('Missing Supabase env vars.');
  process.exit(1);
}

const accounts = [
  {
    email: 'qa.platform.admin@restops.test',
    role: 'platform_admin',
    dashboardText: 'Platform Overview',
    routes: ['Dashboard', 'PlatformAdmin', 'PlatformUsers', 'PlatformOrganizations', 'PlatformPlans', 'PlatformInvoices', 'PlatformUserManagement', 'PlatformAuditLogs'],
  },
  {
    email: 'qa.owner.bistro@restops.test',
    role: 'org_owner',
    dashboardText: 'QA Bistro Group Dashboard',
    routes: ['Dashboard', 'Performance', 'Notifications', 'AiInsights', 'AskTom', 'Invoices', 'Payments', 'Products', 'Inventory', 'AutoOrdering', 'SmartPrep', 'Recipes', 'Vendors', 'Labor', 'Accounting', 'OrgManagement', 'UserManagement', 'RestaurantSetup', 'Integrations', 'AuditLogs'],
  },
  {
    email: 'qa.brand.northfork@restops.test',
    role: 'branch_manager',
    dashboardText: 'North Fork Grill Dashboard',
    routes: ['Dashboard', 'Performance', 'Notifications', 'AiInsights', 'AskTom', 'Invoices', 'Payments', 'Products', 'Inventory', 'AutoOrdering', 'SmartPrep', 'Recipes', 'Vendors', 'Labor', 'Accounting', 'RestaurantSetup'],
  },
  {
    email: 'qa.location.northfork@restops.test',
    role: 'location_manager',
    dashboardText: 'North Fork Downtown Dashboard',
    routes: ['Dashboard', 'Notifications', 'Invoices', 'Payments', 'Products', 'Inventory', 'AutoOrdering', 'SmartPrep', 'Recipes', 'Vendors', 'Labor', 'RestaurantSetup'],
  },
  {
    email: 'qa.staff.northfork@restops.test',
    role: 'ground_staff',
    dashboardText: 'My Dashboard',
    routes: ['Dashboard', 'Notifications', 'Invoices', 'Products', 'Inventory', 'AutoOrdering'],
  },
];

async function getUserId(email) {
  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${email} auth lookup failed: ${error.message}`);
  const userId = data.user.id;
  await client.auth.signOut();
  return userId;
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
    'Access denied',
    'You do not have access',
    'Something went wrong',
  ].some((needle) => text.includes(needle));
}

async function login(page, account) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByPlaceholder('you@restaurant.com').fill(account.email);
  await page.getByPlaceholder('••••••••').fill(password);
  await Promise.all([
    page.waitForLoadState('domcontentloaded').catch(() => {}),
    page.getByRole('button', { name: 'Sign In' }).click(),
  ]);
  await page.waitForTimeout(3500);
}

async function runAccount(browser, account) {
  const userId = await getUserId(account.email);
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
  await login(page, account);

  const dashboardText = await page.locator('body').innerText({ timeout: 15000 });
  if (!dashboardText.includes(account.dashboardText)) {
    failures.push(`dashboard did not show "${account.dashboardText}"`);
  }
  if (hasFailureText(dashboardText)) {
    failures.push('dashboard displayed failure/auth text');
  }

  const routeResults = [];
  for (const route of account.routes) {
    await page.goto(routeUrl(route), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1200);
    const text = await page.locator('body').innerText({ timeout: 15000 });
    const ok = !hasFailureText(text);
    if (!ok) failures.push(`${route} displayed failure/auth text`);
    routeResults.push({
      route,
      ok,
      title: text.split('\n').find(Boolean) || '',
    });
  }

  await context.close();
  return {
    account: account.email,
    role: account.role,
    ok: failures.length === 0,
    routesChecked: routeResults.length,
    routeResults,
    consoleErrors: consoleErrors.filter((message) => !message.includes('Sentry') && !message.includes('PostHog')).slice(0, 10),
    failures,
  };
}

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const account of accounts) {
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
