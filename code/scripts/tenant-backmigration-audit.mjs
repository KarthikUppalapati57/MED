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

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/VITE_SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase.rpc('audit_tenant_schema_backmigration');

if (error) {
  console.error('Tenant back-migration audit failed:', error.message);
  process.exit(1);
}

const rows = data || [];
const nonEmpty = rows.filter((row) => Number(row.tenant_rows || 0) > 0);
const missing = rows.filter((row) => Number(row.missing_by_id || 0) > 0);
const rowCountOnlyWithData = nonEmpty.filter((row) => row.compare_mode === 'row_count_only');

const bySchema = new Map();
for (const row of rows) {
  const schema = row.schema_name;
  if (!bySchema.has(schema)) {
    bySchema.set(schema, {
      schema_name: schema,
      organization_id: row.organization_id,
      tenant_tables_with_rows: 0,
      tenant_rows: 0,
      missing_by_id: 0,
      row_count_only_tables_with_rows: 0,
    });
  }
  const item = bySchema.get(schema);
  const tenantRows = Number(row.tenant_rows || 0);
  const missingById = Number(row.missing_by_id || 0);
  item.tenant_rows += tenantRows;
  item.missing_by_id += missingById;
  if (tenantRows > 0) item.tenant_tables_with_rows += 1;
  if (tenantRows > 0 && row.compare_mode === 'row_count_only') item.row_count_only_tables_with_rows += 1;
}

const summary = {
  generated_at: new Date().toISOString(),
  schema_count: bySchema.size,
  audited_table_count: rows.length,
  non_empty_table_count: nonEmpty.length,
  tables_with_missing_rows: missing.length,
  missing_rows_by_id: missing.reduce((sum, row) => sum + Number(row.missing_by_id || 0), 0),
  row_count_only_tables_with_data: rowCountOnlyWithData.length,
};

const report = {
  summary,
  schemas: [...bySchema.values()].sort((a, b) => a.schema_name.localeCompare(b.schema_name)),
  missing_tables: missing
    .map((row) => ({
      organization_id: row.organization_id,
      schema_name: row.schema_name,
      table_name: row.table_name,
      tenant_rows: Number(row.tenant_rows || 0),
      public_rows_for_org: Number(row.public_rows_for_org || 0),
      missing_by_id: Number(row.missing_by_id || 0),
      compare_mode: row.compare_mode,
      sample_missing_ids: row.sample_missing_ids || [],
    }))
    .sort((a, b) => b.missing_by_id - a.missing_by_id || a.schema_name.localeCompare(b.schema_name) || a.table_name.localeCompare(b.table_name)),
  row_count_only_tables_with_data: rowCountOnlyWithData
    .map((row) => ({
      organization_id: row.organization_id,
      schema_name: row.schema_name,
      table_name: row.table_name,
      tenant_rows: Number(row.tenant_rows || 0),
      public_rows_for_org: Number(row.public_rows_for_org || 0),
      compare_mode: row.compare_mode,
    }))
    .sort((a, b) => b.tenant_rows - a.tenant_rows || a.schema_name.localeCompare(b.schema_name) || a.table_name.localeCompare(b.table_name)),
  rows,
};

fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });

const jsonPath = path.join(root, 'reports', 'tenant-backmigration-audit.json');
const markdownPath = path.join(root, 'docs', 'tenant_backmigration_audit.md');

fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

const lines = [
  '# Tenant Back-Migration Audit',
  '',
  `Generated: ${summary.generated_at}`,
  '',
  '## Summary',
  '',
  `- Tenant schemas audited: ${summary.schema_count}`,
  `- Schema/table pairs audited: ${summary.audited_table_count}`,
  `- Tenant tables with rows: ${summary.non_empty_table_count}`,
  `- Tables with rows missing from public by id: ${summary.tables_with_missing_rows}`,
  `- Total missing rows by id: ${summary.missing_rows_by_id}`,
  `- Row-count-only tables with data: ${summary.row_count_only_tables_with_data}`,
  '',
  '## Schema Summary',
  '',
  '| Schema | Organization | Tenant Tables With Rows | Tenant Rows | Missing By ID | Row-Count-Only Tables With Rows |',
  '| --- | --- | ---: | ---: | ---: | ---: |',
  ...report.schemas.map((row) => `| ${row.schema_name} | ${row.organization_id || ''} | ${row.tenant_tables_with_rows} | ${row.tenant_rows} | ${row.missing_by_id} | ${row.row_count_only_tables_with_rows} |`),
  '',
  '## Missing Rows By ID',
  '',
];

if (report.missing_tables.length === 0) {
  lines.push('No tenant rows with an `id` comparison are missing from public canonical tables.');
} else {
  lines.push('| Schema | Table | Organization | Tenant Rows | Public Rows For Org | Missing By ID | Sample Missing IDs |');
  lines.push('| --- | --- | --- | ---: | ---: | ---: | --- |');
  for (const row of report.missing_tables) {
    lines.push(`| ${row.schema_name} | ${row.table_name} | ${row.organization_id || ''} | ${row.tenant_rows} | ${row.public_rows_for_org} | ${row.missing_by_id} | ${(row.sample_missing_ids || []).join('<br>')} |`);
  }
}

lines.push('', '## Row-Count-Only Tables With Data', '');

if (report.row_count_only_tables_with_data.length === 0) {
  lines.push('No row-count-only tenant tables contain data.');
} else {
  lines.push('| Schema | Table | Organization | Tenant Rows | Public Rows For Org |');
  lines.push('| --- | --- | --- | ---: | ---: |');
  for (const row of report.row_count_only_tables_with_data) {
    lines.push(`| ${row.schema_name} | ${row.table_name} | ${row.organization_id || ''} | ${row.tenant_rows} | ${row.public_rows_for_org} |`);
  }
}

lines.push('', '## Notes', '');
lines.push('- `missing_by_id` is the actionable backfill count for tables that have stable `id` columns.');
lines.push('- `row_count_only` means the table lacks comparable `id` metadata in either tenant or public scope and needs manual table-specific review before copying.');
lines.push('- This audit is read-only. It does not copy, update, delete, or lock tenant data.');

fs.writeFileSync(markdownPath, `${lines.join('\n')}\n`);

console.log(JSON.stringify({
  status: 'ok',
  json: path.relative(root, jsonPath),
  markdown: path.relative(root, markdownPath),
  summary,
}, null, 2));
