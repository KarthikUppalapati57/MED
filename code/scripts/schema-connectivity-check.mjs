import fs from 'node:fs';
import path from 'node:path';

const schemaPath = 'live_workflow_schema_audit.json';
if (!fs.existsSync(schemaPath)) {
  console.error(`Missing ${schemaPath}. Refresh the live schema audit before running this check.`);
  process.exit(1);
}

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const columnsByTable = schema.columns || {};
const apiClient = fs.readFileSync('src/lib/apiClient.js', 'utf8');
const entityToTable = {};

for (const match of apiClient.matchAll(/(\w+):\s*createEntityClient\(['"]([^'"]+)['"]/g)) {
  entityToTable[match[1]] = match[2];
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, out);
    } else if (/\.(jsx?|tsx?|ts)$/.test(entry.name)) {
      out.push(fullPath.replaceAll('\\', '/'));
    }
  }
  return out;
}

function compact(value) {
  return value.slice(0, 180).replace(/\s+/g, ' ');
}

const issues = [];

function checkTable(file, table, context) {
  if (!table || !columnsByTable[table]) {
    issues.push({ type: 'missing_table', file, table, context });
  }
}

function checkSelect(file, table, select, context) {
  if (!table) return;
  if (!columnsByTable[table]) {
    checkTable(file, table, context);
    return;
  }
  if (!select || select === '*' || select.includes('(')) return;

  const allowed = new Set(columnsByTable[table]);
  const tokens = select
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split(':').pop().trim())
    .map((part) => part.split(/\s+/)[0].trim())
    .filter((part) => part && !part.includes('*') && !part.includes('('));

  for (const column of tokens) {
    if (!allowed.has(column)) {
      issues.push({ type: 'missing_column', file, table, column, context });
    }
  }
}

function checkOrder(file, table, orderBy, context) {
  if (!table || !orderBy) return;
  if (!columnsByTable[table]) {
    checkTable(file, table, context);
    return;
  }
  const column = orderBy.replace(/^-/, '');
  if (column && !columnsByTable[table].includes(column)) {
    issues.push({ type: 'bad_order', file, table, column, context });
  }
}

for (const file of [...walk('src'), ...walk('supabase/functions')]) {
  const text = fs.readFileSync(file, 'utf8');

  for (const match of text.matchAll(/from\(['"]([^'"]+)['"]\)/g)) {
    checkTable(file, match[1], match[0]);
  }

  for (const match of text.matchAll(/from\(['"]([^'"]+)['"]\)[\s\S]{0,160}?\.select\(['"]([^'"]*)['"]/g)) {
    checkSelect(file, match[1], match[2], compact(match[0]));
  }

  for (const match of text.matchAll(/api\.entities\.(\w+)\.list\(([^)]{0,700})\)/g)) {
    const table = entityToTable[match[1]];
    const args = match[2];
    const context = compact(match[0]);
    checkTable(file, table, context);
    checkOrder(file, table, args.match(/^\s*['"]([^'"]+)['"]/)?.[1], context);
    checkSelect(file, table, args.match(/select\s*:\s*['"]([^'"]+)['"]/)?.[1], context);
  }

  for (const match of text.matchAll(/api\.entities\.(\w+)\.filter\(([^)]{0,700})\)/g)) {
    const table = entityToTable[match[1]];
    const args = match[2];
    const context = compact(match[0]);
    checkTable(file, table, context);
    checkOrder(file, table, args.match(/orderBy\s*:\s*['"]([^'"]+)['"]/)?.[1], context);
    checkSelect(file, table, args.match(/select\s*:\s*['"]([^'"]+)['"]/)?.[1], context);
  }
}

const uniqueIssues = [];
const seen = new Set();
for (const issue of issues) {
  const key = JSON.stringify(issue);
  if (!seen.has(key)) {
    seen.add(key);
    uniqueIssues.push(issue);
  }
}

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  schemaGeneratedAt: schema.generatedAt,
  issues: uniqueIssues.length,
  results: uniqueIssues,
}, null, 2));

if (uniqueIssues.length) process.exit(1);
