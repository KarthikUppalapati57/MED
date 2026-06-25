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
  console.error('Missing Supabase URL or service role key.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase.rpc('inspect_database_architecture');
if (error) {
  console.error('Architecture inspection failed:', error.message);
  process.exit(1);
}

const inspection = data || {};
const publicTables = (inspection.tables || []).filter((table) => table.schema_name === 'public' && ['table', 'partitioned_table'].includes(table.kind));
const publicFunctions = (inspection.functions || []).filter((fn) => fn.schema_name === 'public');
const publicTriggers = publicTables.flatMap((table) => (table.triggers || []).map((trigger) => ({ ...trigger, table_name: table.table_name })));

const tableFindings = publicTables.map((table) => {
  const columns = table.columns || [];
  const columnNames = new Set(columns.map((column) => column.column_name));
  const policies = table.policies || [];
  const indexes = (inspection.indexes || []).filter((index) => index.schema_name === table.schema_name && index.table_name === table.table_name);
  const hasOrg = columnNames.has('organization_id');
  const hasBrand = columnNames.has('brand_id');
  const hasLocation = columnNames.has('location_id');
  const hasRls = table.rls_enabled === true;
  const orgIndexed = indexes.some((index) => /\borganization_id\b/i.test(index.definition || ''));
  const publicPolicyRisk = policies.some((policy) => {
    const expr = `${policy.using_expression || ''} ${policy.check_expression || ''}`.toLowerCase();
    const roleText = JSON.stringify(policy.roles || []).toLowerCase();
    return roleText.includes('anon') || expr.includes('true') || expr.includes('auth.role() = \'anon\'');
  });
  const missingScope = !hasOrg && !hasBrand && !hasLocation && ![
    'permissions',
    'plans',
    'feature_flags',
    'schema_versions',
    'database_health_metrics',
    'tenant_schema_retirement_archive',
  ].includes(table.table_name);

  return {
    table_name: table.table_name,
    kind: table.kind,
    estimated_rows: table.estimated_rows,
    columns: columns.length,
    has_organization_id: hasOrg,
    has_brand_id: hasBrand,
    has_location_id: hasLocation,
    rls_enabled: hasRls,
    policy_count: policies.length,
    index_count: indexes.length,
    organization_indexed: orgIndexed,
    public_policy_risk: publicPolicyRisk,
    missing_scope_review: missingScope,
    triggers: (table.triggers || []).length,
  };
});

const rlsFindings = tableFindings.filter((table) => !table.rls_enabled || table.public_policy_risk || table.missing_scope_review);
const scopeFindings = tableFindings.filter((table) => table.has_organization_id && !table.organization_indexed);
const securityDefiners = publicFunctions.filter((fn) => fn.security_definer);
const financialFunctionNames = publicFunctions
  .filter((fn) => /(invoice|payment|payout|ledger|bill|credit|checkbook|dwolla|stripe|paypal|accounting)/i.test(fn.function_name))
  .map((fn) => `${fn.function_name}(${fn.identity_arguments})`)
  .sort();

const edgeFunctionFiles = fs.existsSync(path.join(root, 'supabase', 'functions'))
  ? fs.readdirSync(path.join(root, 'supabase', 'functions'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
      .map((entry) => entry.name)
      .sort()
  : [];

const sourceFiles = [];
for (const base of ['src', 'supabase/functions', 'scripts']) {
  const basePath = path.join(root, base);
  if (!fs.existsSync(basePath)) continue;
  const stack = [basePath];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else sourceFiles.push(path.relative(root, full).replaceAll(path.sep, '/'));
    }
  }
}

const summary = {
  generated_at: new Date().toISOString(),
  schemas: (inspection.schemas || []).map((schema) => schema.schema_name).sort(),
  table_count: publicTables.length,
  function_count: publicFunctions.length,
  security_definer_function_count: securityDefiners.length,
  trigger_count: publicTriggers.length,
  policy_count: publicTables.reduce((sum, table) => sum + (table.policies || []).length, 0),
  index_count: (inspection.indexes || []).filter((index) => index.schema_name === 'public').length,
  edge_function_count: edgeFunctionFiles.length,
  source_file_count: sourceFiles.length,
  rls_or_scope_review_count: rlsFindings.length,
  org_index_review_count: scopeFindings.length,
  financial_function_count: financialFunctionNames.length,
};

const plan = [
  {
    phase: 1,
    name: 'Control-plane naming cleanup',
    reason: 'Schema-per-tenant is removed, but names like tenant migration remain in UI/docs/scripts and can confuse operators.',
    actions: [
      'Rename TenantMigrationPanel or replace it with a Shared Tenancy Health panel.',
      'Rename tenantRouting/tenantReporting/tenantCutover compatibility shims or remove them if imports are gone.',
      'Update docs so tenant_registry is described as historical/shared-public tenancy metadata only.',
    ],
  },
  {
    phase: 2,
    name: 'Canonical table ownership and RLS audit',
    reason: `${rlsFindings.length} public tables need RLS/scope review from live metadata.`,
    actions: [
      'Classify every public table as organization, brand, location, global reference, platform-only, or archive.',
      'Add/fix organization_id, brand_id, or location_id where needed.',
      'Remove permissive or ambiguous policies and add policy tests for owner, manager, staff, platform admin, and cross-org denial.',
    ],
  },
  {
    phase: 3,
    name: 'Scope indexes and scale readiness',
    reason: `${scopeFindings.length} organization-scoped tables may need organization_id-leading indexes for 10k-client scale.`,
    actions: [
      'Add organization_id-leading composite indexes for high-volume list/filter paths.',
      'Review invoice, payment, inventory, POS, webhook, audit, and dashboard query plans.',
      'Keep partitioning selective; use it only for very large append-only logs and time-series tables.',
    ],
  },
  {
    phase: 4,
    name: 'Financial workflow server-side hardening',
    reason: `${financialFunctionNames.length} live public functions touch invoice/payment/ledger/accounting domains.`,
    actions: [
      'Move remaining client-side financial writes behind tenant-safe SECURITY DEFINER RPCs.',
      'Require idempotency keys for money movement and payout flows.',
      'Enforce organization scope inside every financial RPC and write audit/domain events in the same transaction.',
    ],
  },
  {
    phase: 5,
    name: 'Edge Function security and consistency pass',
    reason: `${edgeFunctionFiles.length} Edge Function directories are deployed or deployable.`,
    actions: [
      'Audit service-role use, CORS, auth checks, org-scope validation, and idempotency in every Edge Function.',
      'Standardize shared helpers for Supabase admin/client creation and request validation.',
      'Add smoke tests for invoice-processing, payout, Checkbook/Dwolla/Stripe webhooks, POS sync, and webhook dispatcher.',
    ],
  },
  {
    phase: 6,
    name: 'Operational observability and release gates',
    reason: 'The DB is now shared-public; access mistakes must be caught before production blast radius grows.',
    actions: [
      'Add CI gates for DB lint, build, RLS policy tests, function smoke tests, and cross-org denial tests.',
      'Create dashboards for RLS denials, failed financial RPC validation, webhook failures, payout failures, and suspicious cross-org attempts.',
      'Keep the tenant schema retirement archive service-role-only and add retention/export policy.',
    ],
  },
];

const report = {
  summary,
  table_findings: tableFindings.sort((a, b) => a.table_name.localeCompare(b.table_name)),
  rls_or_scope_findings: rlsFindings.sort((a, b) => a.table_name.localeCompare(b.table_name)),
  organization_index_findings: scopeFindings.sort((a, b) => a.table_name.localeCompare(b.table_name)),
  security_definer_functions: securityDefiners.map((fn) => ({
    function_name: fn.function_name,
    identity_arguments: fn.identity_arguments,
    result_type: fn.result_type,
    volatility: fn.volatility,
  })).sort((a, b) => a.function_name.localeCompare(b.function_name) || a.identity_arguments.localeCompare(b.identity_arguments)),
  financial_functions: financialFunctionNames,
  triggers: publicTriggers.sort((a, b) => a.table_name.localeCompare(b.table_name) || a.trigger_name.localeCompare(b.trigger_name)),
  edge_functions: edgeFunctionFiles,
  source_files: sourceFiles.sort(),
  implementation_plan: plan,
  raw_inspection: inspection,
};

fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });

const jsonPath = path.join(root, 'reports', 'architecture-inspection-report.json');
const mdPath = path.join(root, 'docs', 'architecture_inspection_plan.md');
fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

const lines = [
  '# Architecture Inspection Plan',
  '',
  `Generated: ${summary.generated_at}`,
  '',
  '## Live Summary',
  '',
  `- Schemas: ${summary.schemas.join(', ')}`,
  `- Public tables/views inspected: ${summary.table_count}`,
  `- Public functions inspected: ${summary.function_count}`,
  `- SECURITY DEFINER functions: ${summary.security_definer_function_count}`,
  `- Triggers inspected: ${summary.trigger_count}`,
  `- RLS policies inspected: ${summary.policy_count}`,
  `- Public indexes inspected: ${summary.index_count}`,
  `- Edge Function directories inspected: ${summary.edge_function_count}`,
  `- Source files inventoried: ${summary.source_file_count}`,
  `- RLS/scope review items: ${summary.rls_or_scope_review_count}`,
  `- Organization index review items: ${summary.org_index_review_count}`,
  `- Financial-domain functions: ${summary.financial_function_count}`,
  '',
  '## Highest-Risk Findings',
  '',
  '| Area | Count | Meaning |',
  '| --- | ---: | --- |',
  `| RLS or scope review | ${summary.rls_or_scope_review_count} | Tables missing RLS, missing ownership scope, or carrying broad policies. |`,
  `| Organization index review | ${summary.org_index_review_count} | Organization-scoped tables without an obvious organization_id index. |`,
  `| SECURITY DEFINER functions | ${summary.security_definer_function_count} | Must be reviewed for search_path, scope checks, and privilege boundaries. |`,
  `| Financial functions | ${summary.financial_function_count} | Money/invoice/accounting workflows that need idempotency and audit guarantees. |`,
  '',
  '## RLS / Scope Review Tables',
  '',
];

if (rlsFindings.length === 0) {
  lines.push('No RLS/scope review findings from the current heuristic.');
} else {
  lines.push('| Table | RLS | Org | Brand | Location | Policies | Public Policy Risk | Missing Scope Review |');
  lines.push('| --- | --- | --- | --- | --- | ---: | --- | --- |');
  for (const row of rlsFindings.slice(0, 80)) {
    lines.push(`| ${row.table_name} | ${row.rls_enabled ? 'yes' : 'no'} | ${row.has_organization_id ? 'yes' : 'no'} | ${row.has_brand_id ? 'yes' : 'no'} | ${row.has_location_id ? 'yes' : 'no'} | ${row.policy_count} | ${row.public_policy_risk ? 'yes' : 'no'} | ${row.missing_scope_review ? 'yes' : 'no'} |`);
  }
}

lines.push('', '## Implementation Plan', '');
for (const item of plan) {
  lines.push(`### Phase ${item.phase}: ${item.name}`);
  lines.push('');
  lines.push(`Reason: ${item.reason}`);
  lines.push('');
  for (const action of item.actions) lines.push(`- ${action}`);
  lines.push('');
}

lines.push('## Notes', '');
lines.push('- This report uses live database metadata from `public.inspect_database_architecture()` plus local source inventory.');
lines.push('- Heuristics are intentionally conservative; each finding should be confirmed before schema changes.');
lines.push('- The full raw metadata is in `reports/architecture-inspection-report.json`.');

fs.writeFileSync(mdPath, `${lines.join('\n')}\n`);

console.log(JSON.stringify({
  status: 'ok',
  json: path.relative(root, jsonPath),
  markdown: path.relative(root, mdPath),
  summary,
}, null, 2));
