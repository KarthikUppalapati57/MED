import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportsDir = path.join(root, 'reports');
const docsDir = path.join(root, 'docs');
fs.mkdirSync(reportsDir, { recursive: true });

const schemaPath = path.join(root, 'live_workflow_schema_audit.json');
const restAuditPath = path.join(root, 'live_supabase_rest_audit.json');
const tableCountsPath = path.join(root, 'live_table_counts.txt');

if (!fs.existsSync(schemaPath)) {
  console.error('Missing live_workflow_schema_audit.json. Refresh the live schema audit first.');
  process.exit(1);
}

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const restAudit = fs.existsSync(restAuditPath)
  ? JSON.parse(fs.readFileSync(restAuditPath, 'utf8'))
  : {};

const columnsByTable = schema.columns || {};
const tableNames = Object.keys(columnsByTable).sort();

const canonicalOperational = new Set([
  'invoices',
  'invoice_line_items',
  'invoice_allocations',
  'invoice_documents',
  'invoice_ingestion_jobs',
  'invoice_action_reasons',
  'invoice_audit_events',
  'payments',
  'scheduled_payments',
  'scheduled_payment_invoices',
  'payment_accounts',
  'ledger_bills',
  'ledger_payments',
  'ledger_entries',
  'general_ledger_entries',
  'accounting_export_queue',
  'accounting_sync_logs',
  'gl_mappings',
  'purchase_orders',
  'purchase_order_items',
  'receivings',
  'receiving_items',
  'vendors',
  'vendor_aliases',
  'vendor_items',
  'vendor_item_mappings',
  'vendor_item_prices',
  'vendor_statements',
  'vendor_statement_lines',
  'vendor_issues',
  'products',
  'inventory',
  'inventory_movements',
  'count_sheets',
  'count_sessions',
  'wastage_logs',
  'recipes',
  'recipe_ingredients',
  'smart_prep_plans',
  'operational_settings',
  'budget_targets',
  'closed_periods',
  'location_groups',
  'pos_items',
  'pos_menu_mapping',
  'pos_sales_data',
  'ai_insights',
  'domain_events',
  'processing_jobs',
  'approval_policies',
  'approval_instances',
  'approval_steps',
  'credit_requests',
  'tolerance_configurations',
  'invoice_line_matches',
  'reconciliation_variances',
  'employees',
  'employee_shifts',
  'integrations',
  'api_keys',
  'webhook_endpoints',
  'webhook_events_queue',
  'webhook_delivery_logs',
  'edi_transmissions',
  'transfers',
  'intercompany_transfers',
  'purchase_cards',
  'purchase_card_transactions',
]);

const accessControl = new Set([
  'organizations',
  'brands',
  'locations',
  'profiles',
  'organization_members',
  'brand_members',
  'location_members',
  'roles',
  'permissions',
  'role_permissions',
  'user_roles',
  'invitations',
  'plans',
  'onboarding_progress',
]);

const publicIntake = new Set([
  'access_requests',
  'contact_requests',
  'demo_requests',
]);

const systemTables = new Set([
  'health_monitor',
  'system_health_check',
  'error_logs',
  'event_logs',
  'vw_slow_queries',
  'dim_date',
]);

const globalReference = new Set([
  'global_vendor_items',
  'invoice_action_reasons',
]);

const parentScopedChildren = new Set([
  'approval_steps',
  'purchase_order_items',
  'scheduled_payment_invoices',
  'role_permissions',
  'vendor_statement_lines',
  'webhook_delivery_logs',
  'webhook_subscriptions',
]);

function classifyTable(table) {
  if (table.startsWith('archived_')) return 'archive';
  if (/^(fact_|dim_|mv_|v_|vw_)/.test(table)) return 'derived';
  if (canonicalOperational.has(table)) return 'canonical';
  if (accessControl.has(table)) return 'access_control';
  if (publicIntake.has(table)) return 'public_intake';
  if (systemTables.has(table)) return 'system';
  if (globalReference.has(table)) return 'global_reference';
  return 'unclassified';
}

function readCounts() {
  const counts = {};

  for (const entry of restAudit.counts || []) {
    if (entry?.name) counts[entry.name] = entry.count ?? null;
  }

  if (fs.existsSync(tableCountsPath)) {
    const text = fs.readFileSync(tableCountsPath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([^:]+):\s*(\d+)/);
      if (match) counts[match[1]] = Number(match[2]);
    }
  }

  return counts;
}

function walk(dir, extensions = /\.(js|jsx|ts|tsx|mjs|sql|md)$/) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath, extensions);
    return extensions.test(entry.name) ? [fullPath] : [];
  });
}

function relative(file) {
  return path.relative(root, file).replaceAll('\\', '/');
}

function scanTextFiles(files) {
  const functions = new Map();
  const policies = new Map();
  const triggers = new Map();
  const tableReferences = new Map(tableNames.map((table) => [table, []]));
  const tenantSchemaReferences = [];
  const serviceRoleFiles = [];

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = relative(file);

    for (const match of text.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)/gi)) {
      const name = match[1];
      if (!functions.has(name)) functions.set(name, []);
      functions.get(name).push(rel);
    }

    for (const match of text.matchAll(/CREATE\s+POLICY\s+("?[^"\n]+"?|[a-zA-Z0-9_]+)\s+ON\s+([a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)/gi)) {
      const key = `${match[2]}::${match[1].replaceAll('"', '')}`;
      if (!policies.has(key)) policies.set(key, []);
      policies.get(key).push(rel);
    }

    for (const match of text.matchAll(/CREATE\s+TRIGGER\s+([a-zA-Z0-9_]+)/gi)) {
      const name = match[1];
      if (!triggers.has(name)) triggers.set(name, []);
      triggers.get(name).push(rel);
    }

    for (const table of tableNames) {
      const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const patterns = [
        new RegExp(`from\\(['"]${escaped}['"]\\)`, 'i'),
        new RegExp(`\\bpublic\\.${escaped}\\b`, 'i'),
        new RegExp(`createEntityClient\\(['"]${escaped}['"]`, 'i'),
      ];
      if (patterns.some((pattern) => pattern.test(text))) {
        tableReferences.get(table).push(rel);
      }
    }

    if (/tenant_schema|tenant_template|tenant_registry|tenant_select_rows|tenant_insert_row|tenant_update_row|tenant_delete_row/i.test(text)) {
      tenantSchemaReferences.push(rel);
    }

    if (/SERVICE_ROLE|service_role|SUPABASE_SERVICE_ROLE_KEY/i.test(text)) {
      serviceRoleFiles.push(rel);
    }
  }

  return {
    functions: [...functions.entries()].map(([name, files]) => ({ name, files: [...new Set(files)].sort() })),
    policies: [...policies.entries()].map(([name, files]) => ({ name, files: [...new Set(files)].sort() })),
    triggers: [...triggers.entries()].map(([name, files]) => ({ name, files: [...new Set(files)].sort() })),
    tableReferences: Object.fromEntries([...tableReferences.entries()].map(([table, files]) => [table, [...new Set(files)].sort()])),
    tenantSchemaReferences: [...new Set(tenantSchemaReferences)].sort(),
    serviceRoleFiles: [...new Set(serviceRoleFiles)].sort(),
  };
}

const counts = readCounts();
const files = [
  ...walk(path.join(root, 'src')),
  ...walk(path.join(root, 'supabase')),
  ...walk(path.join(root, 'scripts')),
  ...walk(path.join(root, 'docs')),
];
const scan = scanTextFiles(files);

const tableInventory = tableNames.map((table) => {
  const columns = columnsByTable[table] || [];
  const classification = classifyTable(table);
  const hasOrgId = columns.includes('organization_id');
  const hasBrandId = columns.includes('brand_id');
  const hasLocationId = columns.includes('location_id');
  const hasCreatedAt = columns.includes('created_at');
  const hasUpdatedAt = columns.includes('updated_at');
  const rowCount = counts[table] ?? null;
  const references = scan.tableReferences[table] || [];
  const tenantOwned = ['canonical', 'access_control'].includes(classification)
    && !globalReference.has(table)
    && !parentScopedChildren.has(table)
    && table !== 'plans';

  const risks = [];
  if (tenantOwned && !hasOrgId && !['organizations', 'plans'].includes(table)) {
    risks.push('missing_organization_id_or_parent_scope_review');
  }
  if (classification === 'canonical' && rowCount === 0) risks.push('empty_canonical_table_review');
  if (classification === 'unclassified') risks.push('needs_domain_classification');
  if (references.length === 0 && classification === 'canonical') risks.push('canonical_table_without_code_reference_review');

  return {
    table,
    classification,
    rowCount,
    columnCount: columns.length,
    tenantScope: {
      hasOrgId,
      hasBrandId,
      hasLocationId,
      parentScoped: parentScopedChildren.has(table),
    },
    auditColumns: {
      hasCreatedAt,
      hasUpdatedAt,
      hasCreatedBy: columns.includes('created_by'),
      hasUpdatedBy: columns.includes('updated_by'),
      hasDeletedAt: columns.includes('deleted_at'),
    },
    referenceCount: references.length,
    risks,
  };
});

const riskSummary = tableInventory.reduce((acc, table) => {
  for (const risk of table.risks) acc[risk] = (acc[risk] || 0) + 1;
  return acc;
}, {});

const inventory = {
  generatedAt: new Date().toISOString(),
  sourceSchemaGeneratedAt: schema.generatedAt,
  tableCount: tableInventory.length,
  classificationCounts: tableInventory.reduce((acc, table) => {
    acc[table.classification] = (acc[table.classification] || 0) + 1;
    return acc;
  }, {}),
  riskSummary,
  functionCount: scan.functions.length,
  policyCount: scan.policies.length,
  triggerCount: scan.triggers.length,
  tenantSchemaReferenceCount: scan.tenantSchemaReferences.length,
  serviceRoleFileCount: scan.serviceRoleFiles.length,
  tables: tableInventory,
  functions: scan.functions,
  policies: scan.policies,
  triggers: scan.triggers,
  tenantSchemaReferences: scan.tenantSchemaReferences,
  serviceRoleFiles: scan.serviceRoleFiles,
};

const jsonPath = path.join(reportsDir, 'database-modernization-inventory.json');
fs.writeFileSync(jsonPath, `${JSON.stringify(inventory, null, 2)}\n`);

function tableRows(rows) {
  return rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
}

const highRiskRows = tableInventory
  .filter((table) => table.risks.length)
  .sort((a, b) => a.classification.localeCompare(b.classification) || a.table.localeCompare(b.table))
  .map((table) => [
    `\`${table.table}\``,
    table.classification,
    String(table.rowCount ?? 'unknown'),
    table.risks.map((risk) => `\`${risk}\``).join('<br>'),
  ]);

const canonicalRows = tableInventory
  .filter((table) => table.classification === 'canonical')
  .sort((a, b) => a.table.localeCompare(b.table))
  .map((table) => [
    `\`${table.table}\``,
    String(table.rowCount ?? 'unknown'),
    table.tenantScope.hasOrgId ? 'yes' : table.tenantScope.parentScoped ? 'parent' : 'no',
    table.tenantScope.hasBrandId ? 'yes' : 'no',
    table.tenantScope.hasLocationId ? 'yes' : 'no',
    table.referenceCount ? String(table.referenceCount) : '0',
  ]);

const md = `# Database Modernization Inventory

Generated: ${inventory.generatedAt}

Source schema artifact: \`live_workflow_schema_audit.json\` (${schema.generatedAt || 'unknown'})

## Executive Findings

- Tables inventoried: ${inventory.tableCount}
- Classification counts: ${Object.entries(inventory.classificationCounts).map(([key, value]) => `\`${key}\` ${value}`).join(', ')}
- SQL functions found in migrations/source: ${inventory.functionCount}
- RLS policies found in migrations/source: ${inventory.policyCount}
- Triggers found in migrations/source: ${inventory.triggerCount}
- Files still referencing schema-per-tenant artifacts: ${inventory.tenantSchemaReferenceCount}
- Files referencing service-role access: ${inventory.serviceRoleFileCount}

## Risk Summary

${Object.keys(riskSummary).length ? tableRows([
  ['Risk', 'Count'],
  ...Object.entries(riskSummary).sort().map(([risk, count]) => [`\`${risk}\``, String(count)]),
]) : 'No table-level inventory risks found.'}

## Canonical Operational Tables

${tableRows([
  ['Table', 'Rows', 'organization_id', 'brand_id', 'location_id', 'Code refs'],
  ...canonicalRows,
])}

## Tables Requiring Review

${highRiskRows.length ? tableRows([
  ['Table', 'Class', 'Rows', 'Risks'],
  ...highRiskRows,
]) : 'No table review items found.'}

## Schema-Per-Tenant References

These files still reference tenant-schema, tenant-template, tenant-registry, or tenant-routed RPC artifacts. They are expected during the transition, but each must be retired or justified before schema-per-tenant can be removed completely.

${inventory.tenantSchemaReferences.map((file) => `- \`${file}\``).join('\n')}

## Service-Role Surfaces

Each file below must validate tenant scope internally before reading or writing tenant-owned data.

${inventory.serviceRoleFiles.map((file) => `- \`${file}\``).join('\n')}

## Next Required Actions

1. Review every \`missing_organization_id_or_parent_scope_review\` table and decide whether to add \`organization_id\` or document parent-scoped access.
2. Review every \`empty_canonical_table_review\` table and classify it as active, future, or candidate removal.
3. Replace app/entity usage of tenant-routed RPCs with direct public-table access protected by RLS/RBAC.
4. Inventory tenant schemas and row counts from the live database before any destructive cleanup.
5. Start Phase 4 hardening with RLS/RBAC tests for organization, brand, and location isolation.
`;

const mdPath = path.join(docsDir, 'database_modernization_inventory_2026-06-24.md');
fs.writeFileSync(mdPath, md);

console.log(JSON.stringify({
  status: 'ok',
  json: path.relative(root, jsonPath),
  markdown: path.relative(root, mdPath),
  tableCount: inventory.tableCount,
  riskSummary,
  tenantSchemaReferenceCount: inventory.tenantSchemaReferenceCount,
}, null, 2));
