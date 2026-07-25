import 'dotenv/config';

const required = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ROLE_QA_BASE_URL',
  'ONBOARDING_SANDBOX_PASSWORD',
  'VITE_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
];

const recommended = [
  'ROLE_QA_EMAIL',
  'ROLE_QA_PASSWORD',
  'CHECKBOOK_API_KEY',
  'CHECKBOOK_API_SECRET',
  'CHECKBOOK_ENV',
  'PLAID_CLIENT_ID',
  'PLAID_SECRET',
  'PLAID_ENV',
];

const value = (name) => (process.env[name] || '').trim();
const missingRequired = required.filter((name) => !value(name));
const missingRecommended = recommended.filter((name) => !value(name));
const failures = [...missingRequired];
const warnings = [];

const stripePublishable = value('VITE_STRIPE_PUBLISHABLE_KEY');
const stripeSecret = value('STRIPE_SECRET_KEY');
const checkbookEnvironment = value('CHECKBOOK_ENV').toLowerCase();
const plaidEnvironment = value('PLAID_ENV').toLowerCase();

if (stripePublishable && !stripePublishable.startsWith('pk_test_')) {
  failures.push('VITE_STRIPE_PUBLISHABLE_KEY must be a Stripe test/sandbox key for staging');
}

if (stripeSecret && !stripeSecret.startsWith('sk_test_')) {
  failures.push('STRIPE_SECRET_KEY must be a Stripe test/sandbox key for staging');
}

if (checkbookEnvironment && !['sandbox', 'demo'].includes(checkbookEnvironment)) {
  failures.push('CHECKBOOK_ENV must be sandbox or demo for staging');
}

if (plaidEnvironment && plaidEnvironment !== 'sandbox') {
  failures.push('PLAID_ENV must be sandbox for staging');
}

if (!value('CHECKBOOK_API_KEY') || !value('CHECKBOOK_API_SECRET')) {
  warnings.push('Checkbook sandbox/demo is not configured; check payout calls will fail if exercised.');
}

if (!value('PLAID_CLIENT_ID') || !value('PLAID_SECRET')) {
  warnings.push('Plaid sandbox is not configured; Plaid-based bank-linking is not ready.');
}

const report = {
  checkedAt: new Date().toISOString(),
  ok: failures.length === 0,
  missingRequired,
  missingRecommended,
  failures,
  warnings,
  sandboxGuards: {
    stripePublishableMode: stripePublishable ? stripePublishable.split('_').slice(0, 2).join('_') : null,
    stripeSecretMode: stripeSecret ? stripeSecret.split('_').slice(0, 2).join('_') : null,
    checkbookEnvironment: checkbookEnvironment || null,
    plaidEnvironment: plaidEnvironment || null,
  },
};

console.log(JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`Staging sandbox environment is not safe/ready: ${failures.join('; ')}`);
  process.exit(1);
}
