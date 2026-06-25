import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const reportPath = path.join(root, 'reports', 'architecture-inspection-report.json');

const allowedDirectWriteMatches = [
  /supabase[\\/]functions[\\/]_shared[\\/]/,
];

const checks = [];

function addCheck(name, pass, details = '') {
  checks.push({ name, pass, details });
}

function listFiles(paths) {
  const files = [];
  const skipDirs = new Set(['node_modules', 'dist', '.git', '.supabase']);
  const allowed = /\.(js|jsx|ts|tsx|mjs|cjs)$/i;

  for (const relPath of paths) {
    const start = path.join(root, relPath);
    if (!fs.existsSync(start)) continue;
    const stack = [start];
    while (stack.length) {
      const current = stack.pop();
      const stat = fs.statSync(current);
      if (stat.isDirectory()) {
        if (skipDirs.has(path.basename(current))) continue;
        for (const entry of fs.readdirSync(current)) stack.push(path.join(current, entry));
      } else if (allowed.test(current)) {
        files.push(current);
      }
    }
  }
  return files;
}

function scan(pattern, paths) {
  const regex = new RegExp(pattern, 'i');
  const matches = [];
  for (const file of listFiles(paths)) {
    const rel = path.relative(root, file).replaceAll(path.sep, '/');
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (regex.test(line)) matches.push(`${rel}:${index + 1}:${line.trim()}`);
    });
  }
  return matches;
}

if (!fs.existsSync(reportPath)) {
  addCheck('architecture report exists', false, `Missing ${path.relative(root, reportPath)}`);
} else {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  addCheck('no organization index findings', Number(report.summary?.org_index_review_count || 0) === 0, `count=${report.summary?.org_index_review_count}`);
  addCheck('no tenant schemas in active summary', !(report.summary?.schemas || []).some((schema) => /^tenant_/i.test(schema)), (report.summary?.schemas || []).join(', '));
}

const directFinancialWrites = scan(
  String.raw`api\.entities\.(Invoice|Payment|LedgerBill|LedgerPayment|PaymentAccount|InvoiceAllocation|CreditRequest)\.(create|update|delete|deleteMany|createMany)|supabase\.from\('?(invoices|payments|ledger_payments|ledger_bills|payment_accounts|invoice_allocations|credit_requests)'?\)\.(insert|update|delete|upsert)`,
  ['src', 'supabase/functions']
).filter((line) => !allowedDirectWriteMatches.some((allowed) => allowed.test(line)));

addCheck(
  'no direct financial table writes',
  directFinancialWrites.length === 0,
  directFinancialWrites.slice(0, 20).join('\n')
);

const directAuditWrites = scan(
  String.raw`from\('audit_logs'\)\.(insert|update|delete|upsert)|from\("audit_logs"\)\.(insert|update|delete|upsert)|api\.entities\.AuditLog\.(create|update|delete|createMany)`,
  ['src', 'supabase/functions']
);

addCheck('no direct audit table writes', directAuditWrites.length === 0, directAuditWrites.slice(0, 20).join('\n'));

const tenantRuntimeReferences = scan(
  String.raw`tenant_schema|schema-per-tenant|tenant-template|tenant_select_rows|tenant_insert_row|tenant_update_row|tenant_delete_row`,
  ['src', 'supabase/functions']
).filter((line) => !/retired|Shared Tenancy Health|schema-per-tenant retirement|tenant-routing\.ts/i.test(line));

addCheck('no active schema-per-tenant runtime references', tenantRuntimeReferences.length === 0, tenantRuntimeReferences.slice(0, 20).join('\n'));

const failures = checks.filter((check) => !check.pass);

for (const check of checks) {
  const prefix = check.pass ? 'PASS' : 'FAIL';
  console.log(`${prefix} ${check.name}${check.details ? `\n${check.details}` : ''}`);
}

if (failures.length) {
  console.error(`\nArchitecture release gate failed: ${failures.length} check(s) failed.`);
  process.exit(1);
}

console.log('\nArchitecture release gate passed.');
