import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const root = process.cwd();
const envFiles = ['.env.local', '.env'];

for (const file of envFiles) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) continue;

  const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const schemaArg = process.argv.find((arg) => arg.startsWith('--schema='));
const schemaName = schemaArg ? schemaArg.slice('--schema='.length) : null;

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/VITE_SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase.rpc('backfill_tenant_schema_missing_rows', {
  p_schema_name: schemaName,
  p_apply: apply,
});

if (error) {
  console.error('Tenant back-migration backfill failed:', error.message);
  process.exit(1);
}

const rows = data || [];
const actionable = rows.filter((row) => Number(row.missing_rows || 0) > 0 || row.error_text);
const errors = rows.filter((row) => row.error_text);
const summary = {
  generated_at: new Date().toISOString(),
  mode: apply ? 'apply' : 'dry_run',
  schema: schemaName || 'all',
  returned_rows: rows.length,
  actionable_tables: actionable.length,
  missing_rows: rows.reduce((sum, row) => sum + Number(row.missing_rows || 0), 0),
  inserted_rows: rows.reduce((sum, row) => sum + Number(row.inserted_rows || 0), 0),
  errored_tables: errors.length,
};

const report = { summary, actionable, rows };

fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });

const suffix = apply ? 'apply' : 'dry-run';
const jsonPath = path.join(root, 'reports', `tenant-backmigration-backfill-${suffix}.json`);
const markdownPath = path.join(root, 'docs', `tenant_backmigration_backfill_${suffix}.md`);

fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

const lines = [
  `# Tenant Back-Migration Backfill ${apply ? 'Apply' : 'Dry Run'}`,
  '',
  `Generated: ${summary.generated_at}`,
  '',
  '## Summary',
  '',
  `- Mode: ${summary.mode}`,
  `- Schema: ${summary.schema}`,
  `- Returned rows: ${summary.returned_rows}`,
  `- Actionable tables: ${summary.actionable_tables}`,
  `- Missing rows: ${summary.missing_rows}`,
  `- Inserted rows: ${summary.inserted_rows}`,
  `- Errored tables: ${summary.errored_tables}`,
  '',
  '## Actionable Tables',
  '',
];

if (actionable.length === 0) {
  lines.push('No missing rows or table errors were reported.');
} else {
  lines.push('| Schema | Table | Organization | Missing Rows | Inserted Rows | Error |');
  lines.push('| --- | --- | --- | ---: | ---: | --- |');
  for (const row of actionable) {
    lines.push(`| ${row.schema_name} | ${row.table_name} | ${row.organization_id || ''} | ${Number(row.missing_rows || 0)} | ${Number(row.inserted_rows || 0)} | ${(row.error_text || '').replace(/\|/g, '\\|')} |`);
  }
}

lines.push('', '## Notes', '');
lines.push('- Dry run reports rows that would be copied but does not mutate data.');
lines.push('- Apply mode copies only rows missing by `id` in the public table for the tenant organization.');
lines.push('- `organization_id` is forced from `tenant_registry`, even if the legacy tenant row contains a different value.');

fs.writeFileSync(markdownPath, `${lines.join('\n')}\n`);

console.log(JSON.stringify({
  status: errors.length ? 'completed_with_errors' : 'ok',
  json: path.relative(root, jsonPath),
  markdown: path.relative(root, markdownPath),
  summary,
}, null, 2));

if (errors.length) {
  process.exitCode = 2;
}
