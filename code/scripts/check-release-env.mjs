import 'dotenv/config';

const required = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ROLE_QA_EMAIL',
  'ROLE_QA_PASSWORD',
  'ROLE_QA_BASE_URL',
];

const optional = [
  'SUPABASE_LATENCY_TIMEOUT_MS',
  'SUPABASE_LATENCY_WARN_MS',
  'SUPABASE_LATENCY_SIGNIN_WARN_MS',
  'SUPABASE_LATENCY_RPC_WARN_MS',
  'SUPABASE_LATENCY_FUNCTION_WARN_MS',
  'SUPABASE_LATENCY_EDGE_FUNCTIONS',
];

const missing = required.filter((name) => !process.env[name]?.trim());
const configuredOptional = optional.filter((name) => process.env[name]?.trim());

const report = {
  checkedAt: new Date().toISOString(),
  required: required.length,
  missing,
  optionalConfigured: configuredOptional,
  ok: missing.length === 0,
};

console.log(JSON.stringify(report, null, 2));

if (missing.length) {
  console.error(`Missing required release-gate environment variables: ${missing.join(', ')}`);
  process.exit(1);
}
