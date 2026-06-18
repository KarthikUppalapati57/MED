import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const assetsDir = join(process.cwd(), 'dist', 'assets');
const kib = 1024;

const budgets = [
  {
    name: 'dashboard_route',
    pattern: /^Dashboard-[\w-]+\.js$/,
    maxRawKiB: 112,
    maxGzipKiB: 32,
  },
  {
    name: 'dashboard_report_panels',
    pattern: /^DashboardReportPanels-[\w-]+\.js$/,
    maxRawKiB: 26,
    maxGzipKiB: 8,
  },
  {
    name: 'vendors_shell',
    pattern: /^Vendors-[\w-]+\.js$/,
    maxRawKiB: 8,
    maxGzipKiB: 3,
  },
  {
    name: 'vendor_list',
    pattern: /^VendorList-[\w-]+\.js$/,
    maxRawKiB: 25,
    maxGzipKiB: 7,
  },
  {
    name: 'vendor_detail',
    pattern: /^VendorDetail-[\w-]+\.js$/,
    maxRawKiB: 18,
    maxGzipKiB: 6,
  },
  {
    name: 'inventory_route',
    pattern: /^Inventory-[\w-]+\.js$/,
    maxRawKiB: 65,
    maxGzipKiB: 16,
  },
  {
    name: 'invoices_route',
    pattern: /^Invoices-[\w-]+\.js$/,
    maxRawKiB: 52,
    maxGzipKiB: 16,
  },
  {
    name: 'payments_route',
    pattern: /^Payments-[\w-]+\.js$/,
    maxRawKiB: 66,
    maxGzipKiB: 17,
  },
  {
    name: 'audit_logs_route',
    pattern: /^AuditLogs-[\w-]+\.js$/,
    maxRawKiB: 10,
    maxGzipKiB: 4,
  },
  {
    name: 'platform_audit_logs_route',
    pattern: /^PlatformAuditLogs-[\w-]+\.js$/,
    maxRawKiB: 17,
    maxGzipKiB: 6,
  },
];

function toKiB(bytes) {
  return Number((bytes / kib).toFixed(2));
}

function statusFor(rawKiB, gzipKiB, budget) {
  const rawOk = rawKiB <= budget.maxRawKiB;
  const gzipOk = gzipKiB <= budget.maxGzipKiB;
  if (rawOk && gzipOk) return 'ok';
  return 'failed';
}

let files;
try {
  files = await readdir(assetsDir);
} catch (error) {
  console.error(`Unable to read build assets at ${assetsDir}. Run npm run build first.`);
  console.error(error.message);
  process.exit(1);
}

const results = [];

for (const budget of budgets) {
  const matches = files.filter((file) => budget.pattern.test(file)).sort();

  if (matches.length !== 1) {
    results.push({
      name: budget.name,
      ok: false,
      status: 'failed',
      reason: `expected 1 matching asset, found ${matches.length}`,
      matches,
    });
    continue;
  }

  const file = matches[0];
  const bytes = await readFile(join(assetsDir, file));
  const rawKiB = toKiB(bytes.length);
  const gzipKiB = toKiB(gzipSync(bytes).length);
  const status = statusFor(rawKiB, gzipKiB, budget);

  results.push({
    name: budget.name,
    ok: status === 'ok',
    status,
    file,
    rawKiB,
    gzipKiB,
    maxRawKiB: budget.maxRawKiB,
    maxGzipKiB: budget.maxGzipKiB,
  });
}

const failed = results.filter((result) => !result.ok);
const report = {
  checkedAt: new Date().toISOString(),
  dist: assetsDir,
  passed: results.length - failed.length,
  failed: failed.length,
  results,
};

console.log(JSON.stringify(report, null, 2));

if (failed.length > 0) {
  process.exit(1);
}
