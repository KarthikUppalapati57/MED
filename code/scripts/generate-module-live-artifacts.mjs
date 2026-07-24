import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(root, '..');
const outDir = path.join(workspaceRoot, 'outputs');

const read = (file) => fs.readFileSync(file, 'utf8');
const exists = (file) => fs.existsSync(file);
const rel = (file) => path.relative(root, file).replaceAll(path.sep, '/');

function walk(dir, predicate = () => true) {
  if (!exists(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, predicate));
    else if (predicate(full)) files.push(full);
  }
  return files;
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function extractAll(source, regex, index = 1) {
  return [...source.matchAll(regex)].map((match) => match[index]).filter(Boolean);
}

function titleCase(value) {
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

const moduleDefinitions = [
  {
    name: 'Dashboard',
    aliases: ['dashboard', 'mobile app', 'profile'],
    moduleDirs: ['dashboard'],
    pages: ['Dashboard', 'MobileApp', 'Notifications', 'Profile'],
    submodules: ['Role dashboard', 'Daily snapshot', 'Budget progress', 'Report scheduling'],
  },
  {
    name: 'Performance',
    aliases: ['performance', 'executive bi', 'custom reports', 'benchmark', 'pnl', 'forecast'],
    moduleDirs: ['performance'],
    pages: ['Performance', 'ExecutiveBI', 'CustomReports'],
    submodules: ['Performance dashboard', 'Executive BI', 'Custom reports', 'Cross-location benchmarking'],
  },
  {
    name: 'Notifications',
    aliases: ['notifications', 'inbox', 'notification'],
    moduleDirs: ['dashboard'],
    pages: ['Notifications'],
    submodules: ['Unread alerts', 'Approvals', 'System notifications'],
  },
  {
    name: 'Invoices',
    aliases: ['invoice', 'invoices', 'approval workflow', 'three way', 'document intake'],
    moduleDirs: ['invoices'],
    pages: ['Invoices'],
    submodules: ['Invoice upload', 'Invoice review', 'Approval workflow', 'Three-way match', 'Document viewer'],
  },
  {
    name: 'Payments',
    aliases: ['payment', 'payments', 'bill pay', 'payable', 'scheduled payment', 'gateway', 'payout'],
    moduleDirs: ['payments', 'billing'],
    pages: ['Payments', 'Billing'],
    submodules: ['Payable queue', 'Scheduled payments', 'Payment history', 'Reconciliation', 'Gateway setup', 'Platform subscription'],
  },
  {
    name: 'Products',
    aliases: ['product', 'products', 'catalog', 'global vendor item', 'purchase report'],
    moduleDirs: ['products'],
    pages: ['Products'],
    submodules: ['All products', 'Master catalog', 'AI verification queue', 'Product review', 'Purchase report'],
  },
  {
    name: 'Inventory',
    aliases: ['inventory', 'stock', 'wastage', 'waste', 'count', 'avt', 'pos sync', 'receiving', 'transfer'],
    moduleDirs: ['inventory'],
    pages: ['Inventory', 'AvTCosting'],
    submodules: ['Inventory list', 'Receiving', 'Actual vs Theoretical costing', 'POS sync', 'Transfer', 'Summary', 'Wastage log', 'Stock counts', 'Count sheets', 'Waste summary', 'Daily snapshot', 'Hardware and scales'],
  },
  {
    name: 'Orders',
    aliases: ['order', 'orders', 'auto order', 'purchase order', 'procurement', 'receiving'],
    moduleDirs: ['orders'],
    pages: ['AutoOrdering'],
    submodules: ['All orders', 'Purchase order', 'Place order', 'Invoice approval', 'Internal transfers', 'Receiving', 'Order setup'],
  },
  {
    name: 'Smart Prep',
    aliases: ['smartprep', 'smart prep', 'prep sheet', 'prep'],
    moduleDirs: ['smartprep'],
    pages: ['SmartPrep'],
    submodules: ['Prep plan', 'Voice assistant', 'Prep sheet generation'],
  },
  {
    name: 'Commissary',
    aliases: ['commissary', 'intercompany'],
    moduleDirs: ['commissary'],
    pages: ['Commissary'],
    submodules: ['Commissary orders', 'Location fulfillment', 'Inventory transfers'],
  },
  {
    name: 'Recipes',
    aliases: ['recipe', 'recipes', 'prepared items', 'menu engineering', 'delivery aggregator'],
    moduleDirs: ['recipes'],
    pages: ['Recipes', 'MenuEngineering', 'DeliveryAggregator'],
    submodules: ['Recipe list', 'Prepared items', 'Menu engineering', 'Setup'],
  },
  {
    name: 'Vendors',
    aliases: ['vendor', 'vendors', 'vendor item', 'vendor statement', 'bidding', 'logistics'],
    moduleDirs: ['vendors'],
    pages: ['Vendors', 'VendorBidding'],
    submodules: ['Vendors list', 'Vendor items', 'Statements', 'Reconciliation', 'AP routing', 'Bidding and logistics'],
  },
  {
    name: 'Labor',
    aliases: ['labor', 'employee', 'employees', 'shift', 'schedule', 'time clock', 'payroll', 'tip'],
    moduleDirs: ['labor'],
    pages: ['Labor', 'LaborSchedules', 'TimeClock', 'TipPooling', 'PayrollExport', 'ShiftBoard'],
    submodules: ['Labor summary', 'Shift and scheduling', 'Employees', 'Setup'],
  },
  {
    name: 'Accounting',
    aliases: ['accounting', 'ledger', 'gl mapping', 'export queue', 'close books', 'bill pay', 'reconciliation'],
    moduleDirs: ['accounting'],
    pages: ['Accounting'],
    submodules: ['Dashboard', 'Export', 'Bill pay', 'Export queue', 'Reconciliation', 'GL mapping', 'Sales mapping', 'Vendor mapping', 'PMIX mapping', 'Payment accounts', 'Budgets', 'Close books'],
  },
  {
    name: 'Organization Settings',
    aliases: ['organization', 'org management', 'hierarchy', 'roles', 'mfa', 'security', 'approval'],
    moduleDirs: ['admin'],
    pages: ['OrgManagement', 'FranchisorConsole'],
    submodules: ['Hierarchy', 'Location group', 'Custom roles', 'Security and MFA', 'Approvals'],
  },
  {
    name: 'Team Members',
    aliases: ['team member', 'user management', 'profiles', 'invitations', 'invite'],
    moduleDirs: ['admin'],
    pages: ['UserManagement'],
    submodules: ['Team roster', 'Invitations', 'Role assignment'],
  },
  {
    name: 'Restaurant Setup',
    aliases: ['restaurant setup', 'setup', 'pos integration settings', 'store groupings', 'shared devices', 'notification rules', 'location brand settings', 'onboarding', 'business verification'],
    moduleDirs: ['setup'],
    pages: ['RestaurantSetup', 'OnboardingPage', 'BusinessVerification', 'PaymentVerification'],
    submodules: ['POS integration settings', 'Store groupings', 'Shared devices', 'Notification rules', 'Location/brand settings'],
  },
  {
    name: 'Integrations Hub',
    aliases: ['integration', 'integrations', 'developer portal', 'api key', 'webhook', 'mcp', 'pos system', 'accounting system', 'edi'],
    moduleDirs: ['integrations'],
    pages: ['Integrations', 'DeveloperPortal'],
    submodules: ['MCP server', 'POS system', 'Accounting system', 'EDI', 'API keys', 'Webhooks'],
  },
  {
    name: 'Audit Logs',
    aliases: ['audit', 'audit logs', 'audit vault', 'event log'],
    moduleDirs: ['admin', 'platform'],
    pages: ['AuditLogs', 'PlatformAuditLogs', 'AuditVault'],
    submodules: ['Organization audit logs', 'Platform audit logs', 'SOC2 audit vault'],
  },
];

const routerSource = read(path.join(root, 'src/router.jsx'));
const moduleConfigSource = read(path.join(root, 'src/lib/moduleConfig.js'));
const pageImports = new Map();
for (const match of routerSource.matchAll(/const\s+([A-Za-z0-9_]+)\s*=\s*React\.lazy\(\(\)\s*=>\s*import\('([^']+)'/g)) {
  pageImports.set(match[1], `${match[2].replace(/^\.\//, 'src/')}.jsx`);
}

const moduleConfig = {};
for (const match of moduleConfigSource.matchAll(/([a-z0-9_]+):\s*\{\s*label:\s*"([^"]+)",\s*pages:\s*\[([^\]]*)\],\s*minRole:\s*"([^"]+)"/g)) {
  const pages = extractAll(match[3], /"([^"]+)"/g);
  moduleConfig[match[1]] = { key: match[1], label: match[2], pages, minRole: match[4] };
}

const srcFiles = walk(path.join(root, 'src'), (file) => /\.(jsx?|tsx?)$/.test(file));
const moduleFiles = walk(path.join(root, 'src/modules'), (file) => /\.(jsx?|tsx?)$/.test(file));
const libFiles = walk(path.join(root, 'src/lib'), (file) => /\.(jsx?|tsx?)$/.test(file));
const hookFiles = walk(path.join(root, 'src/hooks'), (file) => /\.(jsx?|tsx?)$/.test(file));
const sqlFiles = walk(path.join(root, 'supabase/migrations'), (file) => file.endsWith('.sql'));
const edgeFiles = walk(path.join(root, 'supabase/functions'), (file) => /index\.ts$|deno\.json$/.test(file));

const fileTextCache = new Map();
function fileText(file) {
  if (!fileTextCache.has(file)) fileTextCache.set(file, read(file));
  return fileTextCache.get(file);
}

function extractJsArtifacts(files) {
  const text = files.map(fileText).join('\n');
  return {
    tables: uniq([
      ...extractAll(text, /\.from\(\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)/g),
      ...extractAll(text, /table:\s*['"`]([a-zA-Z0-9_]+)['"`]/g),
    ]),
    rpcs: uniq(extractAll(text, /\.rpc\(\s*['"`]([a-zA-Z0-9_]+)['"`]/g)),
    invokes: uniq(extractAll(text, /\.functions\.invoke\(\s*['"`]([a-zA-Z0-9_-]+)['"`]/g)),
  };
}

function migrationSummary(file) {
  const text = fileText(file);
  return {
    file,
    tables: uniq([
      ...extractAll(text, /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)/gi),
      ...extractAll(text, /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?([a-zA-Z0-9_]+)/gi),
      ...extractAll(text, /on\s+(?:public\.)?([a-zA-Z0-9_]+)\s+(?:for|to|using|enable|force)/gi),
    ]),
    triggers: uniq(extractAll(text, /create\s+(?:or\s+replace\s+)?trigger\s+([a-zA-Z0-9_]+)/gi)),
    functions: uniq(extractAll(text, /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-zA-Z0-9_]+)/gi)),
    policies: uniq(extractAll(text, /create\s+policy\s+"?([^"\n]+?)"?\s+on\s+(?:public\.)?([a-zA-Z0-9_]+)/gi, 1)),
    rlsTables: uniq(extractAll(text, /alter\s+table\s+(?:public\.)?([a-zA-Z0-9_]+)\s+(?:enable|force)\s+row\s+level\s+security/gi)),
  };
}

const migrations = sqlFiles.map(migrationSummary);

function classifyByAliases(files, aliases) {
  const lowerAliases = aliases.map((item) => item.toLowerCase());
  return files.filter((file) => {
    const haystack = `${rel(file)}\n${fileText(file).slice(0, 250000)}`.toLowerCase();
    return lowerAliases.some((alias) => haystack.includes(alias));
  });
}

function resolveSourceImport(fromFile, importPath) {
  if (importPath.startsWith('@/')) return path.join(root, 'src', importPath.slice(2));
  if (importPath.startsWith('./') || importPath.startsWith('../')) return path.resolve(path.dirname(fromFile), importPath);
  return null;
}

function withKnownExtension(base) {
  if (!base) return null;
  const candidates = [`${base}.js`, `${base}.jsx`, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.js'), path.join(base, 'index.jsx'), base];
  return candidates.find((candidate) => exists(candidate) && fs.statSync(candidate).isFile());
}

function importedSharedFiles(seedFiles) {
  const found = new Set();
  const queue = [...seedFiles];
  while (queue.length) {
    const file = queue.shift();
    if (!exists(file)) continue;
    const text = fileText(file);
    for (const match of text.matchAll(/from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const importPath = match[1] || match[2];
      if (!importPath) continue;
      if (!importPath.startsWith('@/lib/') && !importPath.startsWith('@/hooks/') && !importPath.startsWith('@/utils')) continue;
      const resolved = withKnownExtension(resolveSourceImport(file, importPath));
      if (!resolved || found.has(resolved)) continue;
      found.add(resolved);
      if (rel(resolved).startsWith('src/lib/') || rel(resolved).startsWith('src/hooks/')) queue.push(resolved);
    }
  }
  return [...found];
}

function filesForModule(def) {
  const explicitPages = def.pages.map((page) => pageImports.get(page)).filter(Boolean).map((p) => path.join(root, p));
  const dirs = def.moduleDirs.flatMap((dir) => walk(path.join(root, 'src/modules', dir), (file) => /\.(jsx?|tsx?)$/.test(file)));
  const direct = uniq([...explicitPages, ...dirs].map((file) => path.resolve(file))).map((file) => file);
  const sharedImports = importedSharedFiles(direct);
  return uniq([...direct, ...sharedImports].map(rel));
}

const sharedTables = new Set([
  'profiles',
  'organizations',
  'organization_members',
  'brands',
  'brand_members',
  'locations',
  'location_members',
  'notifications',
  'audit_logs',
  'event_log',
  'roles',
  'user_roles',
  'plans',
  'webhook_events',
  'error_logs',
  'tenant_registry',
]);

function matchedMigrations(def, tables, rpcs) {
  const aliases = def.aliases.map((alias) => alias.toLowerCase());
  const specificTables = tables.filter((table) => !sharedTables.has(table));
  return migrations.filter((migration) => {
    const migrationRel = rel(migration.file).toLowerCase();
    const text = fileText(migration.file).toLowerCase();
    const hasAlias = aliases.some((alias) => migrationRel.includes(alias.replaceAll(' ', '_')) || migrationRel.includes(alias.replaceAll(' ', '-')));
    const hasTable = specificTables.some((table) => migration.tables.includes(table) || text.includes(`public.${table.toLowerCase()}`));
    const hasRpc = rpcs.some((rpc) => migration.functions.includes(rpc) || text.includes(`${rpc.toLowerCase()}(`));
    return hasAlias || hasTable || hasRpc;
  });
}

function edgeFunctionsForModule(def, invokes) {
  const aliases = def.aliases.map((alias) => alias.toLowerCase());
  const dirs = uniq(edgeFiles.map((file) => rel(path.dirname(file)).split('/').slice(0, 3).join('/')));
  return dirs.filter((dir) => {
    const functionName = dir.split('/').pop();
    if (invokes.includes(functionName)) return true;
    const text = walk(path.join(root, dir), (file) => /\.(ts|json)$/.test(file)).map(fileText).join('\n').toLowerCase();
    return aliases.some((alias) => dir.toLowerCase().includes(alias.replaceAll(' ', '-')) || text.includes(alias));
  });
}

function describeFile(file) {
  const name = path.basename(file);
  const base = name.replace(/\.(jsx?|tsx?|sql|ts)$/i, '');
  if (file.includes('/pages/')) return `${base} page for ${titleCase(base)} workflow and tab routing.`;
  if (file.includes('/components/')) return `${base} component used inside the module workflow.`;
  if (file.includes('/src/lib/')) return `${base} shared service/config helper used by this module.`;
  if (file.includes('/src/hooks/')) return `${base} shared React hook used by this module.`;
  if (file.includes('/supabase/functions/')) return `${base} Edge Function runtime artifact.`;
  if (file.includes('/supabase/migrations/')) return `${base} database migration touching schema, RLS, triggers, or workflow RPCs.`;
  return `${base} source artifact.`;
}

function shortList(items, limit = 16) {
  if (items.length <= limit) return items;
  return [...items.slice(0, limit), `...and ${items.length - limit} more`];
}

function isModuleSpecificSource(file, def) {
  if (file.startsWith('src/modules/')) return true;
  const lower = file.toLowerCase();
  const genericShared = ['apiClient.js', 'AuthContext.jsx', 'moduleConfig.js', 'supabaseClient.js', 'query-client.js', 'utils.js'];
  if (genericShared.some((name) => lower.endsWith(name.toLowerCase()))) return false;
  return def.aliases.some((alias) => lower.includes(alias.toLowerCase().replaceAll(' ', '')) || lower.includes(alias.toLowerCase().replaceAll(' ', '-')));
}

function artifactFor(def) {
  const sourceRel = filesForModule(def);
  const dataRel = sourceRel.filter((file) => isModuleSpecificSource(file, def));
  const dataAbs = dataRel.map((file) => path.join(root, file));
  const jsArtifacts = extractJsArtifacts(dataAbs.filter(exists));
  const migrationsForModule = matchedMigrations(def, jsArtifacts.tables, jsArtifacts.rpcs);
  const edgeFunctions = edgeFunctionsForModule(def, jsArtifacts.invokes);
  const migrationSpecificTables = migrationsForModule.flatMap((m) => m.tables).filter((table) => !sharedTables.has(table));
  const allTables = uniq([...jsArtifacts.tables, ...migrationSpecificTables]);
  const allRpcs = uniq([...jsArtifacts.rpcs, ...migrationsForModule.flatMap((m) => m.functions)]);
  const allTriggers = uniq(migrationsForModule.flatMap((m) => m.triggers));
  const allPolicies = uniq(migrationsForModule.flatMap((m) => m.policies));
  const allRls = uniq(migrationsForModule.flatMap((m) => m.rlsTables));
  const moduleConfigMatches = Object.values(moduleConfig).filter((config) =>
    config.pages.some((page) => def.pages.includes(page)) ||
    config.label.toLowerCase() === def.name.toLowerCase()
  );
  return {
    ...def,
    sourceFiles: sourceRel,
    tables: allTables,
    rpcs: allRpcs,
    edgeFunctions,
    triggers: allTriggers,
    policies: allPolicies,
    rlsTables: allRls,
    migrations: migrationsForModule.map((m) => rel(m.file)),
    moduleConfigMatches,
  };
}

const artifacts = moduleDefinitions.map(artifactFor);

fs.mkdirSync(outDir, { recursive: true });

const generatedAt = new Date().toISOString().slice(0, 10);
let markdown = `# MEVS Module-Wise Live Artifacts\n\nGenerated: ${generatedAt}\n\nSource of truth: React files under \`code/src\`, Supabase migrations under \`code/supabase/migrations\`, Edge Functions under \`code/supabase/functions\`, and RBAC registry \`code/src/lib/moduleConfig.js\`.\n\n`;
markdown += `## Presentation Notes\n\n- The attached Visio XML file is \`module-wise-live-artifacts-visio.vdx\`; open it in Microsoft Visio and save as \`.vsdx\` if required.\n- "Tables" are detected from frontend Supabase calls and matching migrations. Some modules share cross-cutting tables such as \`profiles\`, \`organizations\`, \`locations\`, \`audit_logs\`, and \`notifications\`.\n- RLS/RBAC is summarized from SQL policies and \`MODULE_DEFINITIONS\`; final enforcement still depends on the active remote database migration state.\n\n`;

for (const artifact of artifacts) {
  markdown += `## ${artifact.name}\n\n`;
  if (artifact.submodules.length) markdown += `Submodules/workflows: ${artifact.submodules.join(', ')}.\n\n`;

  markdown += `### 1. UI Pages\n`;
  const uiFiles = artifact.sourceFiles.filter((file) => file.includes('/pages/') || file.includes('/components/') || file.includes('/src/lib/') || file.includes('/src/hooks/'));
  for (const file of shortList(uiFiles, 28)) {
    markdown += `- \`${file}\`: ${file.startsWith('...') ? '' : describeFile(file)}\n`;
  }
  if (!uiFiles.length) markdown += `- No dedicated UI source file detected; workflow may be embedded in another module or pending implementation.\n`;

  markdown += `\n### 2. Triggers\n`;
  for (const trigger of shortList(artifact.triggers, 20)) markdown += `- \`${trigger}\`: Database trigger found in matched migrations for this workflow.\n`;
  if (!artifact.triggers.length) markdown += `- No module-specific trigger detected in migrations; workflow appears UI/RPC-driven or shares generic updated-at/audit triggers.\n`;

  markdown += `\n### 3. Migration Files\n`;
  for (const file of shortList(artifact.migrations, 28)) markdown += `- \`${file}\`: ${describeFile(file)}\n`;
  if (!artifact.migrations.length) markdown += `- No clearly matching migration file detected by static scan.\n`;

  markdown += `\n### 4. Functions\n`;
  for (const fn of shortList(artifact.edgeFunctions, 16)) markdown += `- \`${fn}\`: Edge Function connected to this module by invocation, name, or content match.\n`;
  for (const rpc of shortList(artifact.rpcs, 24)) markdown += `- \`${rpc}\`: Supabase RPC/database function used or defined for this module.\n`;
  if (!artifact.edgeFunctions.length && !artifact.rpcs.length) markdown += `- No dedicated Edge Function/RPC detected; module appears to use direct table queries or shared services.\n`;

  markdown += `\n### 5. Core DB Tables\n`;
  for (const table of shortList(artifact.tables, 36)) markdown += `- \`${table}\`\n`;
  if (!artifact.tables.length) markdown += `- No direct Supabase table detected by static scan.\n`;

  markdown += `\n### 6. RLS / RBAC Policies\n`;
  const rbac = artifact.moduleConfigMatches.map((config) => `\`${config.key}\` (${config.label}) requires minimum role \`${config.minRole}\`; pages: ${config.pages.join(', ')}`);
  for (const line of uniq(rbac)) markdown += `- RBAC: ${line}.\n`;
  for (const table of shortList(artifact.rlsTables, 24)) markdown += `- RLS table: \`${table}\` has row-level security enabled/forced in matched migrations.\n`;
  for (const policy of shortList(artifact.policies, 20)) markdown += `- Policy: \`${policy}\` found in matched migrations.\n`;
  if (!rbac.length && !artifact.rlsTables.length && !artifact.policies.length) markdown += `- No dedicated policy detected; likely governed by shared tenant policies and role checks.\n`;
  markdown += `\n`;
}

fs.writeFileSync(path.join(outDir, 'module-wise-live-artifacts.md'), markdown);

const csvRows = [['Module', 'Category', 'Name', 'Description']];
for (const artifact of artifacts) {
  for (const file of artifact.sourceFiles) csvRows.push([artifact.name, 'UI pages/source', file, describeFile(file)]);
  for (const trigger of artifact.triggers) csvRows.push([artifact.name, 'Trigger', trigger, 'Database trigger found in matched migrations']);
  for (const file of artifact.migrations) csvRows.push([artifact.name, 'Migration Files', file, describeFile(file)]);
  for (const fn of artifact.edgeFunctions) csvRows.push([artifact.name, 'Edge Function', fn, 'Edge Function connected to module']);
  for (const rpc of artifact.rpcs) csvRows.push([artifact.name, 'RPC/DB Function', rpc, 'Supabase RPC/database function']);
  for (const table of artifact.tables) csvRows.push([artifact.name, 'Core DB Tables', table, 'Detected table dependency']);
  for (const policy of artifact.policies) csvRows.push([artifact.name, 'RLS Policy', policy, 'Policy found in matched migrations']);
}
const csv = csvRows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
fs.writeFileSync(path.join(outDir, 'module-wise-live-artifacts.csv'), csv);

function buildVdx(artifactsForDiagram) {
  const width = 11;
  const rowHeight = 1.05;
  const startY = 10.5;
  let shapeId = 1;
  const shapes = [];
  const addBox = (x, y, w, h, text, fill = 'RGB(242,248,250)') => {
    const id = shapeId++;
    shapes.push(`
      <Shape ID="${id}" Type="Shape" LineStyle="3" FillStyle="3" TextStyle="3">
        <XForm>
          <PinX>${x}</PinX><PinY>${y}</PinY><Width>${w}</Width><Height>${h}</Height><LocPinX>${w / 2}</LocPinX><LocPinY>${h / 2}</LocPinY><Angle>0</Angle>
        </XForm>
        <Geom IX="0">
          <MoveTo IX="1"><X>0</X><Y>0</Y></MoveTo>
          <LineTo IX="2"><X>${w}</X><Y>0</Y></LineTo>
          <LineTo IX="3"><X>${w}</X><Y>${h}</Y></LineTo>
          <LineTo IX="4"><X>0</X><Y>${h}</Y></LineTo>
          <LineTo IX="5"><X>0</X><Y>0</Y></LineTo>
        </Geom>
        <Fill><FillForegnd>${fill}</FillForegnd></Fill>
        <Text>${xmlEscape(text)}</Text>
      </Shape>`);
    return id;
  };

  addBox(5.5, 11.7, 10.2, 0.7, 'MEVS Platform Module-Wise Live Artifacts', 'RGB(220,241,245)');
  addBox(1.1, 10.8, 1.8, 0.45, 'Module', 'RGB(228,236,247)');
  addBox(3.05, 10.8, 1.8, 0.45, 'UI Pages', 'RGB(228,236,247)');
  addBox(5.0, 10.8, 1.8, 0.45, 'Tables', 'RGB(228,236,247)');
  addBox(6.95, 10.8, 1.8, 0.45, 'Functions', 'RGB(228,236,247)');
  addBox(8.9, 10.8, 1.8, 0.45, 'Triggers/RLS', 'RGB(228,236,247)');

  artifactsForDiagram.forEach((artifact, index) => {
    const y = startY - (index + 1) * rowHeight;
    addBox(1.1, y, 1.8, 0.82, artifact.name, 'RGB(245,250,252)');
    addBox(3.05, y, 1.8, 0.82, `${artifact.sourceFiles.filter((f) => f.includes('/pages/')).length} pages\n${artifact.sourceFiles.filter((f) => f.includes('/components/')).length} components`, 'RGB(255,255,255)');
    addBox(5.0, y, 1.8, 0.82, shortList(artifact.tables, 4).join('\n'), 'RGB(255,255,255)');
    addBox(6.95, y, 1.8, 0.82, shortList([...artifact.edgeFunctions.map((f) => f.split('/').pop()), ...artifact.rpcs], 4).join('\n'), 'RGB(255,255,255)');
    addBox(8.9, y, 1.8, 0.82, `Triggers: ${artifact.triggers.length}\nPolicies: ${artifact.policies.length}\nRLS: ${artifact.rlsTables.length}`, 'RGB(255,255,255)');
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<VisioDocument xmlns="http://schemas.microsoft.com/visio/2003/core">
  <DocumentProperties><Title>MEVS Module-Wise Live Artifacts</Title><Subject>Module artifact map</Subject></DocumentProperties>
  <Pages>
    <Page ID="0" Name="Module Artifacts">
      <PageSheet>
        <PageProps><PageWidth>${width}</PageWidth><PageHeight>22</PageHeight></PageProps>
      </PageSheet>
      <Shapes>${shapes.join('\n')}
      </Shapes>
    </Page>
  </Pages>
</VisioDocument>`;
}

fs.writeFileSync(path.join(outDir, 'module-wise-live-artifacts-visio.vdx'), buildVdx(artifacts));

const summary = {
  generatedAt,
  outputs: [
    path.join(outDir, 'module-wise-live-artifacts.md'),
    path.join(outDir, 'module-wise-live-artifacts.csv'),
    path.join(outDir, 'module-wise-live-artifacts-visio.vdx'),
  ],
  modules: artifacts.map((artifact) => ({
    name: artifact.name,
    sourceFiles: artifact.sourceFiles.length,
    tables: artifact.tables.length,
    rpcs: artifact.rpcs.length,
    edgeFunctions: artifact.edgeFunctions.length,
    triggers: artifact.triggers.length,
    migrations: artifact.migrations.length,
    policies: artifact.policies.length,
  })),
};

fs.writeFileSync(path.join(outDir, 'module-wise-live-artifacts-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));



