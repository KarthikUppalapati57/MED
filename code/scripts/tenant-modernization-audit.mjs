import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const checks = [
  {
    name: 'Schema-per-tenant env flags enabled',
    severity: 'blocker',
    files: ['.env', '.env.local', '.env.production'],
    patterns: [
      /VITE_TENANT_SCHEMA_ACCESS_ENABLED\s*=\s*true/i,
      /VITE_TENANT_SCHEMA_READS_ENABLED\s*=\s*true/i,
      /VITE_TENANT_SCHEMA_WRITES_ENABLED\s*=\s*true/i,
    ],
  },
  {
    name: 'Tenant schema provisioning references',
    severity: 'warn',
    globs: ['supabase/migrations', 'src', 'supabase/functions'],
    patterns: [/provision_tenant_schema/i, /auto_provision_new_tenant_schema/i],
  },
  {
    name: 'Tenant routed RPC references',
    severity: 'warn',
    globs: ['src', 'supabase/functions', 'supabase/migrations'],
    patterns: [/tenant_select_rows/i, /tenant_insert_row/i, /tenant_update_row/i, /tenant_delete_row/i],
  },
  {
    name: 'Tenant template propagation references',
    severity: 'warn',
    globs: ['supabase/migrations', 'supabase/functions'],
    patterns: [/tenant_template/i, /tenant_template_tables/i],
  },
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return [fullPath];
  });
}

function candidateFiles(check) {
  const explicit = (check.files || [])
    .map((file) => path.join(root, file))
    .filter((file) => fs.existsSync(file));

  const walked = (check.globs || []).flatMap((dir) => walk(path.join(root, dir)));
  return [...new Set([...explicit, ...walked])].filter((file) =>
    /\.(js|mjs|ts|tsx|sql|md|env|local|production)$/.test(file)
  );
}

const findings = [];

for (const check of checks) {
  for (const file of candidateFiles(check)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of check.patterns) {
      if (!pattern.test(text)) continue;
      findings.push({
        severity: check.severity,
        check: check.name,
        file: path.relative(root, file),
        pattern: pattern.source,
      });
    }
  }
}

const blockers = findings.filter((finding) => finding.severity === 'blocker');

console.log(JSON.stringify({
  status: blockers.length > 0 ? 'blocked' : 'ok',
  blocker_count: blockers.length,
  finding_count: findings.length,
  findings,
}, null, 2));

if (blockers.length > 0) {
  process.exitCode = 1;
}
