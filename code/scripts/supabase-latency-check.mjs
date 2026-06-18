import 'dotenv/config';
import { performance } from 'node:perf_hooks';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.ROLE_QA_EMAIL || 'qa.platform.admin@restops.test';
const qaPassword = process.env.ROLE_QA_PASSWORD;
const timeoutMs = Number(process.env.SUPABASE_LATENCY_TIMEOUT_MS || 8000);
const warnMs = Number(process.env.SUPABASE_LATENCY_WARN_MS || 1500);
const budgets = {
  raw_auth_health: Number(process.env.SUPABASE_LATENCY_AUTH_WARN_MS || warnMs),
  raw_profiles_rest: Number(process.env.SUPABASE_LATENCY_REST_WARN_MS || warnMs),
  anon_profiles_select: Number(process.env.SUPABASE_LATENCY_QUERY_WARN_MS || warnMs),
  qa_auth_sign_in: Number(process.env.SUPABASE_LATENCY_SIGNIN_WARN_MS || 2500),
  service_profile_lookup: Number(process.env.SUPABASE_LATENCY_QUERY_WARN_MS || warnMs),
  dashboard_summary_rpc: Number(process.env.SUPABASE_LATENCY_RPC_WARN_MS || 2500),
  edge_function_options: Number(process.env.SUPABASE_LATENCY_FUNCTION_WARN_MS || 2000),
};

const edgeFunctionNames = (process.env.SUPABASE_LATENCY_EDGE_FUNCTIONS || [
  'dashboard-report-scheduler',
  'process-email-invoices',
  'webhook-dispatcher',
  'pos-webhook',
].join(','))
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

if (!supabaseUrl || !anonKey) {
  console.error('Missing VITE_SUPABASE_URL/SUPABASE_URL or VITE_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY.');
  process.exit(1);
}

if (!qaPassword) {
  console.error('Missing ROLE_QA_PASSWORD.');
  process.exit(1);
}

function timedFetch(input, init = {}) {
  const controller = new AbortController();
  let timeout;
  const upstreamSignal = init.signal;
  if (upstreamSignal) {
    if (upstreamSignal.aborted) controller.abort(upstreamSignal.reason);
    else upstreamSignal.addEventListener('abort', () => controller.abort(upstreamSignal.reason), { once: true });
  }
  timeout = setTimeout(() => {
    controller.abort(new Error(`request timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  return fetch(input, { ...init, signal: controller.signal })
    .catch((error) => {
      if (controller.signal.aborted && controller.signal.reason) {
        throw controller.signal.reason;
      }
      throw error;
    })
    .finally(() => clearTimeout(timeout));
}

function client(key) {
  return createClient(supabaseUrl, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: timedFetch },
  });
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
  if (parts.length) return parts.join(' ');
  try {
    return JSON.stringify(Object.fromEntries(Object.getOwnPropertyNames(error).map((key) => [key, error[key]])));
  } catch {
    return String(error);
  }
}

async function measure(name, fn) {
  const started = performance.now();
  const budgetMs = budgets[name] || (name.startsWith('edge_function_options:') ? budgets.edge_function_options : warnMs);
  try {
    const details = await fn();
    const durationMs = Math.round(performance.now() - started);
    return {
      name,
      ok: true,
      durationMs,
      budgetMs,
      status: durationMs > budgetMs ? 'slow' : 'ok',
      details,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      durationMs: Math.round(performance.now() - started),
      budgetMs,
      status: 'failed',
      error: formatError(error),
    };
  }
}

async function rawFetchCheck(path, options = {}) {
  const response = await timedFetch(`${supabaseUrl}${path}`, options);
  const text = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}${text ? `: ${text.slice(0, 160)}` : ''}`);
  }
  return { httpStatus: response.status, bytes: text.length };
}

async function edgeFunctionOptionsCheck(functionName) {
  return rawFetchCheck(`/functions/v1/${functionName}`, {
    method: 'OPTIONS',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Origin: process.env.SUPABASE_LATENCY_ORIGIN || 'http://localhost:5173',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization, apikey, content-type',
    },
  });
}

async function anonRestCheck() {
  const supabase = client(anonKey);
  const { data, error, count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact' })
    .limit(1);
  if (error) throw error;
  return { rows: data?.length || 0, count: count ?? null };
}

async function qaAuthCheck() {
  const response = await timedFetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: qaEmail, password: qaPassword }),
  });
  const text = await response.text().catch(() => '');
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}${text ? `: ${text.slice(0, 160)}` : ''}`);
  }
  return {
    userId: body?.user?.id ? 'resolved' : 'missing',
    aal: body?.user?.aal || body?.aal || null,
    expiresIn: body?.expires_in || null,
  };
}

async function serviceProfileCheck() {
  if (!serviceRoleKey) return { skipped: true, reason: 'SUPABASE_SERVICE_ROLE_KEY not configured' };
  const supabase = client(serviceRoleKey);
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,role,organization_id,brand_id,location_id')
    .eq('email', qaEmail)
    .maybeSingle();
  if (error) throw error;
  return { found: Boolean(data?.id), role: data?.role || null, hasOrganization: Boolean(data?.organization_id) };
}

async function dashboardRpcCheck() {
  if (!serviceRoleKey) return { skipped: true, reason: 'SUPABASE_SERVICE_ROLE_KEY not configured' };
  const supabase = client(serviceRoleKey);
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id,brand_id,location_id,role')
    .in('role', ['org_owner', 'branch_manager', 'location_manager'])
    .not('organization_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.organization_id) return { skipped: true, reason: 'no manager QA profile with organization_id found' };

  const scope = profile.role === 'branch_manager' ? 'brand' : profile.role === 'location_manager' ? 'location' : 'org';
  const { error } = await supabase.rpc('get_role_dashboard_summary', {
    p_scope: scope,
    p_org_id: profile.organization_id,
    p_brand_id: profile.brand_id || null,
    p_location_id: profile.location_id || null,
  });
  if (error) throw error;
  return { scope, role: profile.role };
}

const authHeaders = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
const checks = [
  measure('raw_auth_health', () => rawFetchCheck('/auth/v1/health', { headers: { apikey: anonKey } })),
  measure('raw_profiles_rest', () => rawFetchCheck('/rest/v1/profiles?select=id&limit=1', { headers: authHeaders })),
  measure('anon_profiles_select', anonRestCheck),
  measure('qa_auth_sign_in', qaAuthCheck),
  measure('service_profile_lookup', serviceProfileCheck),
  measure('dashboard_summary_rpc', dashboardRpcCheck),
  ...edgeFunctionNames.map((functionName) => (
    measure(`edge_function_options:${functionName}`, () => edgeFunctionOptionsCheck(functionName))
  )),
];

const results = await Promise.all(checks);
const failed = results.filter((result) => !result.ok);
const slow = results.filter((result) => result.ok && result.status === 'slow');
const authHealth = results.find((result) => result.name === 'raw_auth_health');
const rawRest = results.find((result) => result.name === 'raw_profiles_rest');
const anyEdgeOk = results.some((result) => result.name.startsWith('edge_function_options:') && result.ok);
const anyFunctionNotFound = failed.some((result) => result.name.startsWith('edge_function_options:') && result.error?.includes('HTTP 404'));
const diagnosis = !authHealth?.ok && !rawRest?.ok && !anyEdgeOk
  ? 'network_or_supabase_edge_unreachable'
  : !authHealth?.ok && !rawRest?.ok && anyEdgeOk
    ? 'supabase_rest_auth_unreachable_edge_partial'
    : anyFunctionNotFound
      ? 'supabase_edge_function_missing'
      : failed.length
        ? 'supabase_service_or_query_failure'
        : slow.length
          ? 'supabase_reachable_with_slow_queries'
          : 'supabase_reachable';

const recommendations = [];
if (diagnosis === 'network_or_supabase_edge_unreachable') {
  recommendations.push('Verify outbound network/DNS reachability to the Supabase project host from this runner.');
  recommendations.push('Re-run this check from CI or a deployed environment near the Supabase region.');
}
if (diagnosis === 'supabase_rest_auth_unreachable_edge_partial') {
  recommendations.push('Supabase Edge Functions are partially reachable, but Auth/REST timed out. Check project health, REST/Auth service status, RLS-heavy profile queries, and runner-to-region latency.');
}
if (failed.some((result) => result.name.startsWith('edge_function_options:'))) {
  const failedFunctions = failed
    .filter((result) => result.name.startsWith('edge_function_options:'))
    .map((result) => result.name.replace('edge_function_options:', ''));
  recommendations.push(`Deploy or repair failing Edge Functions and confirm they handle OPTIONS with CORS headers: ${failedFunctions.join(', ')}.`);
}
if (failed.some((result) => result.name === 'qa_auth_sign_in')) {
  recommendations.push('Confirm ROLE_QA_EMAIL and ROLE_QA_PASSWORD are current for the target Supabase project.');
}
if (failed.some((result) => result.name === 'dashboard_summary_rpc')) {
  recommendations.push('Confirm get_role_dashboard_summary exists, has execute permissions, and has required indexes for the selected scope.');
}
if (slow.length) {
  recommendations.push('Inspect slow checks against their per-check budget and consider indexes, RPC materialization, or regional runner placement.');
}

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  supabaseHost: new URL(supabaseUrl).host,
  diagnosis,
  timeoutMs,
  defaultWarnMs: warnMs,
  budgets,
  edgeFunctionNames,
  checks: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  slow: slow.length,
  recommendations,
  results,
}, null, 2));

if (failed.length) process.exit(1);
