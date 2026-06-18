import 'dotenv/config';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const runUiSmoke = process.argv.includes('--ui-smoke');
const continueOnLatencyFailure = process.argv.includes('--continue-on-latency-failure');
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const outputPath = outputArg?.slice('--output='.length) || process.env.RELEASE_GATE_OUTPUT;
const uiBaseUrl = process.env.ROLE_QA_BASE_URL || 'http://127.0.0.1:5173';

function runCommand(name, command, args, options = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    let child;
    let stdout = '';
    let stderr = '';
    try {
      child = spawn(command, args, {
        cwd: process.cwd(),
        env: { ...process.env, ...(options.env || {}) },
        shell: process.platform === 'win32',
      });
    } catch (error) {
      resolve({
        name,
        ok: false,
        code: null,
        durationMs: Date.now() - started,
        stdout,
        stderr: error.message || String(error),
        spawnError: error.code || error.name || 'spawn_error',
      });
      return;
    }
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (!options.quiet) process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (!options.quiet) process.stderr.write(chunk);
    });
    child.on('error', (error) => {
      resolve({
        name,
        ok: false,
        code: null,
        durationMs: Date.now() - started,
        stdout,
        stderr: stderr || error.message || String(error),
        spawnError: error.code || error.name || 'spawn_error',
      });
    });
    child.on('close', (code) => {
      resolve({
        name,
        ok: code === 0,
        code,
        durationMs: Date.now() - started,
        stdout,
        stderr,
      });
    });
  });
}

function parseLastJson(text) {
  const start = text.lastIndexOf('\n{');
  const jsonText = (start >= 0 ? text.slice(start + 1) : text).trim();
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function compactStep(result) {
  return {
    name: result.name,
    ok: result.ok,
    code: result.code,
    durationMs: result.durationMs,
  };
}

const steps = [];
let exitCode = 0;

const schema = await runCommand('schema_connectivity', 'npm', ['run', 'check:schema']);
steps.push(compactStep(schema));
if (!schema.ok) exitCode = 1;

const build = await runCommand('production_build', 'npm', ['run', 'build']);
steps.push(compactStep(build));
if (!build.ok) exitCode = 1;

const bundles = await runCommand('bundle_budgets', 'npm', ['run', 'check:bundles']);
const bundleReport = parseLastJson(bundles.stdout);
steps.push({
  ...compactStep(bundles),
  passed: bundleReport?.passed,
  failed: bundleReport?.failed,
});
if (!bundles.ok) exitCode = 1;

const latency = await runCommand('supabase_latency', 'npm', ['run', 'check:latency'], { quiet: true });
const latencyReport = parseLastJson(latency.stdout);
steps.push({
  ...compactStep(latency),
  diagnosis: latencyReport?.diagnosis || 'unknown',
  failed: latencyReport?.failed,
  slow: latencyReport?.slow,
  supabaseHost: latencyReport?.supabaseHost,
  edgeFunctionNames: latencyReport?.edgeFunctionNames,
  recommendations: latencyReport?.recommendations,
  failedChecks: latencyReport?.results
    ?.filter((result) => !result.ok)
    .map((result) => ({ name: result.name, status: result.status, error: result.error })),
  slowChecks: latencyReport?.results
    ?.filter((result) => result.ok && result.status === 'slow')
    .map((result) => ({ name: result.name, durationMs: result.durationMs, budgetMs: result.budgetMs })),
});

const latencyBlocksSmoke = !latency.ok || latencyReport?.diagnosis === 'network_or_supabase_edge_unreachable';
if (!latency.ok && !continueOnLatencyFailure) {
  exitCode = 1;
}

if (runUiSmoke) {
  if (latencyBlocksSmoke) {
    steps.push({
      name: 'ui_smoke',
      ok: false,
      skipped: true,
      reason: `Supabase latency preflight failed: ${latencyReport?.diagnosis || 'unknown'}`,
    });
  } else {
    const smoke = await runCommand('ui_smoke', 'node', ['scripts/ui-smoke-test-role-qa-platform.mjs'], {
      env: { ROLE_QA_BASE_URL: uiBaseUrl },
    });
    steps.push(compactStep(smoke));
    if (!smoke.ok) exitCode = 1;
  }
}

const failed = steps.filter((step) => !step.ok && !step.skipped);
const skipped = steps.filter((step) => step.skipped);

const report = {
  checkedAt: new Date().toISOString(),
  mode: runUiSmoke ? 'release-gate-with-ui-smoke' : 'release-gate',
  passed: steps.length - failed.length - skipped.length,
  failed: failed.length,
  skipped: skipped.length,
  steps,
};

const reportJson = JSON.stringify(report, null, 2);

if (outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${reportJson}\n`, 'utf8');
}

console.log(reportJson);

process.exit(exitCode);
