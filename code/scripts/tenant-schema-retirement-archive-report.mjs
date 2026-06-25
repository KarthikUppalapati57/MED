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

const { data, error } = await supabase
  .from('tenant_schema_retirement_archive')
  .select('retired_at,migration_name,organization_id,schema_name,table_name,row_count,metadata')
  .order('schema_name', { ascending: true })
  .order('table_name', { ascending: true });

if (error) {
  console.error('Tenant schema retirement archive report failed:', error.message);
  process.exit(1);
}

const rows = data || [];
const nonEmpty = rows.filter((row) => Number(row.row_count || 0) > 0);
const bySchema = new Map();

for (const row of rows) {
  if (!bySchema.has(row.schema_name)) {
    bySchema.set(row.schema_name, {
      schema_name: row.schema_name,
      organization_id: row.organization_id,
      archived_tables: 0,
      archived_tables_with_rows: 0,
      archived_rows: 0,
      retired_at: row.retired_at,
    });
  }

  const item = bySchema.get(row.schema_name);
  const rowCount = Number(row.row_count || 0);
  item.archived_tables += 1;
  item.archived_rows += rowCount;
  if (rowCount > 0) item.archived_tables_with_rows += 1;
}

const summary = {
  generated_at: new Date().toISOString(),
  schema_count: bySchema.size,
  archived_table_count: rows.length,
  archived_tables_with_rows: nonEmpty.length,
  archived_rows: rows.reduce((sum, row) => sum + Number(row.row_count || 0), 0),
};

const report = {
  summary,
  schemas: [...bySchema.values()].sort((a, b) => a.schema_name.localeCompare(b.schema_name)),
  non_empty_tables: nonEmpty
    .map((row) => ({
      schema_name: row.schema_name,
      table_name: row.table_name,
      organization_id: row.organization_id,
      row_count: Number(row.row_count || 0),
      retired_at: row.retired_at,
    }))
    .sort((a, b) => a.schema_name.localeCompare(b.schema_name) || a.table_name.localeCompare(b.table_name)),
};

fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });

const jsonPath = path.join(root, 'reports', 'tenant-schema-retirement-archive.json');
const markdownPath = path.join(root, 'docs', 'tenant_schema_retirement_archive.md');

fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

const lines = [
  '# Tenant Schema Retirement Archive',
  '',
  `Generated: ${summary.generated_at}`,
  '',
  '## Summary',
  '',
  `- Archived tenant schemas: ${summary.schema_count}`,
  `- Archived schema/table pairs: ${summary.archived_table_count}`,
  `- Archived tables with rows: ${summary.archived_tables_with_rows}`,
  `- Archived rows: ${summary.archived_rows}`,
  '',
  '## Schema Summary',
  '',
  '| Schema | Organization | Archived Tables | Tables With Rows | Archived Rows | Retired At |',
  '| --- | --- | ---: | ---: | ---: | --- |',
  ...report.schemas.map((row) => `| ${row.schema_name} | ${row.organization_id || ''} | ${row.archived_tables} | ${row.archived_tables_with_rows} | ${row.archived_rows} | ${row.retired_at || ''} |`),
  '',
  '## Non-Empty Archived Tables',
  '',
];

if (report.non_empty_tables.length === 0) {
  lines.push('No archived tenant tables contained rows.');
} else {
  lines.push('| Schema | Table | Organization | Archived Rows | Retired At |');
  lines.push('| --- | --- | --- | ---: | --- |');
  for (const row of report.non_empty_tables) {
    lines.push(`| ${row.schema_name} | ${row.table_name} | ${row.organization_id || ''} | ${row.row_count} | ${row.retired_at || ''} |`);
  }
}

lines.push('', '## Notes', '');
lines.push('- Full row JSON for each archived table is stored in `public.tenant_schema_retirement_archive.rows_json` with service-role-only access.');
lines.push('- Legacy `tenant_*` schemas and `tenant_template` were dropped after the back-migration guard passed.');

fs.writeFileSync(markdownPath, `${lines.join('\n')}\n`);

console.log(JSON.stringify({
  status: 'ok',
  json: path.relative(root, jsonPath),
  markdown: path.relative(root, markdownPath),
  summary,
}, null, 2));
