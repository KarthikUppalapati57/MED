import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const strictProduction = process.env.FOUNDATIONS_STRICT === '1' || process.argv.includes('--strict');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

const failures = [];
const warnings = [];
const blockers = [];
const checks = [];

function pass(name, details = {}) {
  checks.push({ name, ok: true, ...details });
}

function fail(name, message) {
  failures.push({ name, message });
  checks.push({ name, ok: false, message });
}

function warn(name, message) {
  warnings.push({ name, message });
}

function block(name, message) {
  blockers.push({ name, message });
}

function requireText(file, expected, name) {
  const source = read(file);
  if (!source.includes(expected)) fail(name, `${file} must include ${expected}`);
  else pass(name);
}

const packageJson = JSON.parse(read('package.json'));
const scripts = packageJson.scripts || {};
const scriptText = JSON.stringify(scripts, null, 2);

if (/\|\|\s*true|IGNORE_BUILD_ERRORS|bypassed for CI/i.test(scriptText)) {
  fail('strict_package_scripts', 'package.json scripts must not mask lint, typecheck, or build failures.');
} else {
  pass('strict_package_scripts');
}

for (const requiredScript of ['lint', 'typecheck', 'build', 'check:release-gate', 'check:foundations']) {
  if (!scripts[requiredScript]) fail(`script_${requiredScript}`, `Missing npm script ${requiredScript}.`);
  else pass(`script_${requiredScript}`);
}

if (exists('.github/workflows/ci.yml')) {
  const ci = read('.github/workflows/ci.yml');
  for (const expected of ['npm run lint', 'npm run typecheck', 'npm run check:foundations', 'npm run test']) {
    if (!ci.includes(expected)) fail(`ci_${expected.replace(/\W+/g, '_')}`, `.github/workflows/ci.yml must run ${expected}.`);
  }
  if (!ci.includes('working-directory: ./code')) fail('ci_working_directory', 'CI workflow must execute app commands from ./code.');
  else pass('ci_working_directory');
} else {
  warn('ci_workflow_missing_here', 'No .github/workflows/ci.yml found under the app directory; root workflow may be authoritative.');
}

if (exists('.github/workflows/release-gate.yml')) {
  const releaseGate = read('.github/workflows/release-gate.yml');
  for (const expected of ['working-directory: ./code', 'cache-dependency-path: code/package-lock.json']) {
    if (!releaseGate.includes(expected)) fail(`release_gate_${expected.replace(/\W+/g, '_')}`, `.github/workflows/release-gate.yml must include ${expected}.`);
    else pass(`release_gate_${expected.replace(/\W+/g, '_')}`);
  }
  for (const expectedEnv of ['VITE_STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'APP_BASE_URL']) {
    if (!releaseGate.includes(expectedEnv)) fail(`release_gate_env_${expectedEnv}`, `Release gate must pass ${expectedEnv} into check-release-env.`);
    else pass(`release_gate_env_${expectedEnv}`);
  }
} else {
  warn('release_gate_workflow_missing_here', 'No .github/workflows/release-gate.yml found under the app directory; root workflow may be authoritative.');
}

for (const artifact of [
  'docs/production_readiness/final_production_readiness_checklist.md',
  'docs/production_readiness/backup_disaster_recovery.md',
  'docs/production_readiness/incident_response_plan.md',
  'docs/production_readiness/internal_administrative_security.md',
  'docs/production_readiness/infrastructure_data_residency.md',
  'docs/production_readiness/payment_ach_review.md',
  'docs/production_readiness/support_operations_validation.md',
  'docs/production_readiness/ai_usage_policy.md',
]) {
  if (!exists(artifact)) fail(`artifact_${artifact}`, `Missing production readiness artifact: ${artifact}.`);
  else pass(`artifact_${artifact}`);
}

if (exists('docs/production_readiness/final_production_readiness_checklist.md')) {
  const checklist = read('docs/production_readiness/final_production_readiness_checklist.md');
  const mandatorySection = checklist.split('## Recommended After Launch')[0] || checklist;
  const rows = mandatorySection.split('\n').filter((line) => /^\|\s*\d+\s*\|/.test(line));
  for (const row of rows) {
    const cells = row.split('|').map((cell) => cell.trim()).filter(Boolean);
    const area = cells[1] || 'Unknown area';
    const status = cells[3] || '';
    if (/blocked/i.test(status)) block(area, status);
    if (/drafted/i.test(status)) warn(`review_${area}`, `${area} is ${status}; final owner review is still required.`);
  }
}

for (const edgeFunction of ['stripe-webhook', 'checkbook-webhook', 'notify-channel-dispatch', 'process-payout']) {
  if (!exists(`supabase/functions/${edgeFunction}/index.ts`)) warn(`edge_${edgeFunction}`, `Expected edge function ${edgeFunction} was not found.`);
  else pass(`edge_${edgeFunction}`);
}

if (exists('supabase/functions/stripe-webhook/index.ts')) {
  requireText('supabase/functions/stripe-webhook/index.ts', 'constructEventAsync', 'stripe_signature_verification');
  requireText('supabase/functions/stripe-webhook/index.ts', 'webhook_events', 'stripe_webhook_idempotency_log');
}

const report = {
  checkedAt: new Date().toISOString(),
  ok: failures.length === 0 && (!strictProduction || blockers.length === 0),
  strictProduction,
  passed: checks.filter((check) => check.ok).length,
  failed: failures.length,
  warnings: warnings.length,
  blockers: blockers.length,
  checks,
  failures,
  warnings,
  blockers,
};

console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  const strictMessage = strictProduction && blockers.length ? `; ${blockers.length} production owner blockers remain` : '';
  console.error(`Foundation readiness audit failed: ${failures.length} engineering failures${strictMessage}.`);
  process.exit(1);
}