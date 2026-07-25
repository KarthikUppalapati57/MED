import 'dotenv/config';

const required = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ROLE_QA_EMAIL',
  'ROLE_QA_PASSWORD',
  'ROLE_QA_BASE_URL',
  'VITE_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
];

const optional = [
  'APP_ENV',
  'APP_BASE_URL',
  'VITE_APP_BASE_URL',
  'VITE_APP_URL',
  'SUPABASE_FUNCTIONS_URL',
  'STRIPE_CONNECT_ENABLED',
  'SUPABASE_LATENCY_TIMEOUT_MS',
  'SUPABASE_LATENCY_WARN_MS',
  'SUPABASE_LATENCY_SIGNIN_WARN_MS',
  'SUPABASE_LATENCY_RPC_WARN_MS',
  'SUPABASE_LATENCY_FUNCTION_WARN_MS',
  'SUPABASE_LATENCY_EDGE_FUNCTIONS',
];

const value = (name) => (process.env[name] || '').trim();
const missing = required.filter((name) => !value(name));
const failures = [...missing];
const warnings = [];
const configuredOptional = optional.filter((name) => value(name));

const appEnv = value('APP_ENV').toLowerCase();
const stripePublishable = value('VITE_STRIPE_PUBLISHABLE_KEY');
const stripeSecret = value('STRIPE_SECRET_KEY');
const stripeWebhookSecret = value('STRIPE_WEBHOOK_SECRET');
const appBaseUrl = value('APP_BASE_URL') || value('VITE_APP_BASE_URL') || value('VITE_APP_URL');
const roleQaBaseUrl = value('ROLE_QA_BASE_URL');
const stripeConnectEnabled = value('STRIPE_CONNECT_ENABLED').toLowerCase();

function validateHttpsUrl(name, rawValue) {
  if (!rawValue) {
    failures.push(`${name} is required for production redirects`);
    return null;
  }

  try {
    const url = new URL(rawValue);
    if (url.protocol !== 'https:') failures.push(`${name} must use https in production`);
    if (['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname)) failures.push(`${name} must not point to localhost in production`);
    return url;
  } catch {
    failures.push(`${name} must be a valid URL`);
    return null;
  }
}

if (appEnv && !['production', 'prod'].includes(appEnv)) {
  warnings.push(`APP_ENV is '${appEnv}', expected production/prod for a production release check.`);
}

if (stripePublishable && !stripePublishable.startsWith('pk_live_')) {
  failures.push('VITE_STRIPE_PUBLISHABLE_KEY must be a Stripe live publishable key for production');
}

if (stripeSecret && !stripeSecret.startsWith('sk_live_')) {
  failures.push('STRIPE_SECRET_KEY must be a Stripe live secret key for production');
}

if (stripeWebhookSecret && !stripeWebhookSecret.startsWith('whsec_')) {
  failures.push('STRIPE_WEBHOOK_SECRET must be a Stripe webhook signing secret');
}

if (stripeConnectEnabled && !['true', 'false'].includes(stripeConnectEnabled)) {
  failures.push('STRIPE_CONNECT_ENABLED must be true or false when set');
}

const appUrl = validateHttpsUrl('APP_BASE_URL or VITE_APP_BASE_URL/VITE_APP_URL', appBaseUrl);
validateHttpsUrl('ROLE_QA_BASE_URL', roleQaBaseUrl);

if (appUrl && /vercel\.app$/i.test(appUrl.hostname)) {
  warnings.push('Production app URL points to a vercel.app preview-style domain. Confirm this is intentional before going live.');
}

const report = {
  checkedAt: new Date().toISOString(),
  ok: failures.length === 0,
  required: required.length,
  missing,
  failures,
  warnings,
  optionalConfigured: configuredOptional,
  productionGuards: {
    appEnv: appEnv || null,
    appBaseUrl: appUrl ? appUrl.origin : null,
    stripePublishableMode: stripePublishable ? stripePublishable.split('_').slice(0, 2).join('_') : null,
    stripeSecretMode: stripeSecret ? stripeSecret.split('_').slice(0, 2).join('_') : null,
    stripeWebhookSecretConfigured: Boolean(stripeWebhookSecret),
    stripeConnectEnabled: stripeConnectEnabled ? stripeConnectEnabled === 'true' : null,
  },
};

console.log(JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`Release environment is not production ready: ${failures.join('; ')}`);
  process.exit(1);
}