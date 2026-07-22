import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(root, '..');
const outDir = path.join(workspaceRoot, 'outputs', 'solution-architecture-workflows');
const dataPath = path.join(workspaceRoot, 'outputs', 'module-workflow-visual-presentation.json');
const modules = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function esc(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }
function clean(value) { return String(value || '').replace(/^edge:\s*/i, '').replace(/^rpc:\s*/i, '').replace(/^trigger:\s*/i, '').replace(/^policy:\s*/i, '').trim(); }
function first(items, fallback) { return (items && items.length ? clean(items[0]) : fallback); }
function nth(items, n, fallback) { return (items && items[n] ? clean(items[n]) : fallback); }
function wrap(text, max = 24) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > max && line) { lines.push(line); line = word; }
    else line = (line + ' ' + word).trim();
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}
function textBlock(lines, x, y, cls = 'label', lh = 17, anchor = 'middle') {
  return lines.map((line, idx) => `<text class="${cls}" x="${x}" y="${y + idx * lh}" text-anchor="${anchor}">${esc(line)}</text>`).join('');
}
function processNode(id, x, y, w, h, title, subtitle = '', tone = 'process') {
  const titleLines = wrap(title, 24);
  const subLines = subtitle ? wrap(subtitle, 28).slice(0, h <= 80 ? 1 : 2) : [];
  return `<g id="${id}" class="node ${tone}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12"></rect>${textBlock(titleLines, x + w/2, y + 30, 'node-title')}${subLines.length ? textBlock(subLines, x + w/2, y + h - 8 - (subLines.length-1)*14, 'node-sub', 14) : ''}</g>`;
}
function statusNode(id, x, y, label, tone = 'status') {
  const w = 172, h = 40;
  return `<g id="${id}" class="status ${tone}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20"></rect>${textBlock(wrap(label, 22), x + w/2, y + 25, 'status-text', 14)}</g>`;
}
function decisionNode(id, cx, cy, title) {
  const w = 150, h = 92;
  const points = `${cx},${cy-h/2} ${cx+w/2},${cy} ${cx},${cy+h/2} ${cx-w/2},${cy}`;
  return `<g id="${id}" class="decision"><polygon points="${points}"></polygon>${textBlock(wrap(title, 17), cx, cy - 6, 'decision-text', 14)}</g>`;
}
function dbNode(id, x, y, w, h, title, subtitle = '') {
  const top = y + 16;
  return `<g id="${id}" class="dbnode"><path d="M ${x} ${top} C ${x} ${y} ${x+w} ${y} ${x+w} ${top} L ${x+w} ${y+h-16} C ${x+w} ${y+h} ${x} ${y+h} ${x} ${y+h-16} Z"></path><ellipse cx="${x+w/2}" cy="${top}" rx="${w/2}" ry="16"></ellipse>${textBlock(wrap(title, 21), x+w/2, y+43, 'node-title')}${subtitle ? textBlock(wrap(subtitle, 24), x+w/2, y+h-30, 'node-sub', 14) : ''}</g>`;
}
function arrow(x1, y1, x2, y2, label = '', cls = 'arrow') {
  const midX = (x1 + x2)/2;
  const midY = (y1 + y2)/2;
  const pathD = Math.abs(x2-x1) > 10 && Math.abs(y2-y1) > 10
    ? `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
    : `M ${x1} ${y1} L ${x2} ${y2}`;
  return `<g><path class="${cls}" d="${pathD}"></path>${label ? `<text class="edge-label" x="${midX}" y="${midY-7}" text-anchor="middle">${esc(label)}</text>` : ''}</g>`;
}

const custom = {
  'Invoices': {
    stages: ['Received', 'StoredInBucket', 'DBRecordCreated', 'AIExtracting', 'PendingReview', 'Approved', 'PaymentScheduled', 'InvoicePaid', 'AccountingSync'],
    steps: [
      ['Staff upload/email', 'Invoice PDF enters UI or email intake'],
      ['Private storage write', 'Supabase Storage invoices bucket'],
      ['Invoice row created', 'status = extracting'],
      ['Extraction workflow', 'Docling parse then Gemini fallback'],
      ['Normalize and upsert lines', 'save_invoice_workflow / line item RPC'],
      ['Manager review', 'Editable fields, validation, approval'],
      ['AP route decision', 'autopay, queue, history, or accounting'],
      ['Payment and ledger', 'scheduled/completed payment plus ledger bill'],
      ['Accounting sync', 'export queue / sync-accounting']
    ],
    decision: 'Approved?', yes: 'route AP', no: 'reject + notify'
  },
  'Payments': {
    stages: ['Queue', 'Validate', 'Schedule', 'Gateway', 'Webhook', 'History', 'Reconcile'],
    steps: [
      ['Open payable queue', 'Approved unpaid invoices'],
      ['Validate AP route', 'payable status and permissions'],
      ['Schedule payment', 'schedule_invoice_payment / batch'],
      ['Gateway dispatch', 'ACH, Checkbook, Stripe/PayPal'],
      ['Webhook callback', 'payout-webhook / checkbook-webhook'],
      ['Record history', 'payments and ledger_payments'],
      ['Reconcile', 'variance and accounting export']
    ],
    decision: 'Payment cleared?', yes: 'mark paid', no: 'retry or void'
  },
  'Inventory': {
    stages: ['Stock', 'Receive', 'Move', 'Count', 'POSSync', 'AvT', 'Waste'],
    steps: [
      ['Inventory list', 'Current stock by location'],
      ['Receiving', 'PO/invoice receiving updates quantity'],
      ['Transfers', 'internal movement and commissary flows'],
      ['Stock counts', 'count sessions and count sheets'],
      ['POS sync', 'sales depletion from POS'],
      ['AvT costing', 'actual vs theoretical variance'],
      ['Waste log', 'wastage and fact sync']
    ],
    decision: 'Variance?', yes: 'manager review', no: 'snapshot close'
  },
  'Orders': {
    stages: ['Guide', 'PO', 'Approval', 'Send', 'Receive', 'Match', 'Inventory'],
    steps: [
      ['Order guide', 'vendor items and par levels'],
      ['Create PO', 'auto_orders / purchase_orders'],
      ['Approval rule', 'threshold and role check'],
      ['Send to vendor', 'email/API/vendor workflow'],
      ['Receiving', 'receiving_items and purchase order receipt'],
      ['Invoice match', 'three-way match with invoice'],
      ['Inventory update', 'stock and costing updates']
    ],
    decision: 'Needs approval?', yes: 'manager approval', no: 'send order'
  },
  'Dashboard': {
    stages: ['Context', 'Metrics', 'Rules', 'Widgets', 'Actions', 'Reports'],
    steps: [
      ['Tenant context', 'organization/brand/location scope'],
      ['Metric RPCs', 'role dashboard summary and facts'],
      ['Rules engine', 'dashboard rules and escalation'],
      ['Widgets render', 'charts, tasks, budgets'],
      ['Action status', 'review logs and handoffs'],
      ['Scheduled reports', 'dashboard-report-scheduler']
    ],
    decision: 'Action needed?', yes: 'assign task', no: 'monitor'
  },
  'Performance': {
    stages: ['Scope', 'Facts', 'Forecast', 'Variance', 'Benchmark', 'Report'],
    steps: [
      ['Select view', 'Performance, Executive BI, Custom Reports'],
      ['Read fact tables', 'sales, labor, invoices, inventory'],
      ['Forecast', 'labor and sales projections'],
      ['Variance analysis', 'PnL and AvT drivers'],
      ['Benchmark', 'cross-location comparison'],
      ['Export/report', 'saved custom report']
    ],
    decision: 'Variance threshold?', yes: 'explain + action', no: 'publish'
  },
  'Notifications': {
    stages: ['Event', 'Notify', 'Filter', 'Open', 'Resolve'],
    steps: [
      ['Workflow event', 'invoice, approval, system, alert'],
      ['Notification row', 'notifications insert/realtime'],
      ['Notifications filtering', 'unread and approval filters'],
      ['Deep link', 'open source workflow'],
      ['Resolve', 'mark read or complete approval']
    ],
    decision: 'Approval item?', yes: 'route to approval', no: 'mark read'
  },
  'Products': {
    stages: ['Catalog', 'VendorMap', 'AIReview', 'Approve', 'Sync'],
    steps: [
      ['Product catalog', 'products and master catalog'],
      ['Vendor mapping', 'vendor item mappings and prices'],
      ['AI verification', 'global vendor item trust queue'],
      ['Manager review', 'approve category/product match'],
      ['Sync downstream', 'recipes, inventory, purchase reports']
    ],
    decision: 'Trusted match?', yes: 'publish product', no: 'review queue'
  },
  'Smart Prep': {
    stages: ['Forecast', 'RecipeData', 'Generate', 'Voice', 'Publish'],
    steps: [
      ['Sales forecast', 'POS and performance inputs'],
      ['Recipe/prep inputs', 'recipes and prepared items'],
      ['Generate prep sheet', 'generate-prep-sheet / smartprep cron'],
      ['Voice assistant', 'voice-copilot parser'],
      ['Publish plan', 'prep actions for kitchen']
    ],
    decision: 'Adjust plan?', yes: 'manager edit', no: 'publish'
  },
  'Commissary': {
    stages: ['Request', 'Allocate', 'Route', 'Transfer', 'Receive'],
    steps: [
      ['Location request', 'commissary order demand'],
      ['Allocate stock', 'source inventory availability'],
      ['Route planning', 'commissary routes/stops'],
      ['Intercompany transfer', 'intercompany_transfers'],
      ['Location receiving', 'inventory movement completed']
    ],
    decision: 'Stock available?', yes: 'fulfill', no: 'substitute/backorder'
  },
  'Recipes': {
    stages: ['Recipe', 'Ingredients', 'Cost', 'Menu', 'Publish'],
    steps: [
      ['Recipe list', 'recipes and prepared items'],
      ['Ingredient mapping', 'recipe_ingredients / products'],
      ['Dynamic costing', 'price updates recalculate cost'],
      ['Menu engineering', 'PMIX and margin analysis'],
      ['Publish setup', 'menu or delivery sync']
    ],
    decision: 'Margin issue?', yes: 'adjust recipe/price', no: 'publish'
  },
  'Vendors': {
    stages: ['Profile', 'Items', 'Statements', 'Recon', 'Routing'],
    steps: [
      ['Vendor profile', 'vendors and contacts'],
      ['Vendor items', 'catalog, prices, mapping'],
      ['Statement intake', 'vendor statements and lines'],
      ['Reconciliation', 'match statements, invoices, payments'],
      ['AP routing', 'vendor payment preferences']
    ],
    decision: 'Statement mismatch?', yes: 'resolve variance', no: 'approve route'
  },
  'Labor': {
    stages: ['Forecast', 'Schedule', 'Shift', 'Clock', 'Payroll'],
    steps: [
      ['Labor forecast', 'forecast-labor function'],
      ['Schedule shifts', 'shift_schedules / employees'],
      ['Shift board', 'trades and manager approvals'],
      ['Time clock', 'clock events and exceptions'],
      ['Payroll export', 'payroll ready data']
    ],
    decision: 'Over budget?', yes: 'adjust schedule', no: 'publish'
  },
  'Accounting': {
    stages: ['Ledger', 'Mapping', 'Queue', 'Sync', 'Recon', 'Close'],
    steps: [
      ['Financial dashboard', 'ledger and AP status'],
      ['GL mapping', 'sales/vendor/PMIX mapping'],
      ['Export queue', 'accounting_export_queue'],
      ['Sync accounting', 'sync-accounting function'],
      ['Reconcile', 'payments, vendor statements, variances'],
      ['Close books', 'budgets and closed periods']
    ],
    decision: 'Out of balance?', yes: 'investigate variance', no: 'close period'
  },
  'Organization Settings': {
    stages: ['Hierarchy', 'Roles', 'Approvals', 'MFA', 'Policy'],
    steps: [
      ['Hierarchy setup', 'org, brand, location groups'],
      ['Custom roles', 'roles and user_roles'],
      ['Approval policies', 'approval limits and workflow'],
      ['Security and MFA', 'MFA and auth controls'],
      ['Policy enforcement', 'RBAC + RLS tenant scope']
    ],
    decision: 'Policy change?', yes: 'audit + notify', no: 'enforce'
  },
  'Team Members': {
    stages: ['Invite', 'Accept', 'Scope', 'Access', 'Audit'],
    steps: [
      ['Invite user', 'invite-user/team-worker'],
      ['Accept invitation', 'accept_invitation RPC'],
      ['Assign scope', 'org/brand/location memberships'],
      ['Access check', 'moduleConfig and permissions'],
      ['Audit membership', 'profile and invitation logs']
    ],
    decision: 'Role allowed?', yes: 'activate access', no: 'reject escalation'
  },
  'Restaurant Setup': {
    stages: ['Onboard', 'Brand', 'POS', 'Devices', 'Rules'],
    steps: [
      ['Business verification', 'onboarding workflow'],
      ['Brand/location setup', 'locations and groups'],
      ['POS integration', 'pos config and sync'],
      ['Shared devices', 'KDS/scales/mobile'],
      ['Notification rules', 'routing and alerts']
    ],
    decision: 'Setup complete?', yes: 'activate tenant', no: 'continue onboarding'
  },
  'Integrations Hub': {
    stages: ['Configure', 'Auth', 'Receive', 'Dispatch', 'Monitor'],
    steps: [
      ['Integration setup', 'API keys/webhook endpoints'],
      ['Credential storage', 'secure integration credentials'],
      ['Inbound event', 'POS/accounting/EDI webhook'],
      ['Dispatch queue', 'webhook dispatcher / EDI queue'],
      ['Monitor logs', 'webhook logs and retries']
    ],
    decision: 'Delivery failed?', yes: 'retry/dead letter', no: 'mark delivered'
  },
  'Audit Logs': {
    stages: ['Event', 'Scope', 'Write', 'Review', 'Export'],
    steps: [
      ['Workflow event', 'frontend, DB trigger, or function'],
      ['Tenant scope', 'organization/location boundary'],
      ['Audit write', 'audit_logs and event logs'],
      ['Review console', 'org/platform audit views'],
      ['Compliance export', 'SOC2/audit evidence']
    ],
    decision: 'Sensitive event?', yes: 'platform audit', no: 'tenant audit'
  }
};

function flowFor(mod) {
  const c = custom[mod.module] || {
    stages: [mod.module, 'Workflow', 'Functions', 'Database', 'Controls'],
    steps: (mod.workflow || []).map((s, i) => [s, [mod.ui, mod.functions, mod.db, mod.security][i]?.[0] || 'live artifact']),
    decision: 'Valid?', yes: 'continue', no: 'review'
  };
  const steps = c.steps.length >= 5 ? c.steps : [...c.steps, ...((mod.workflow || []).map((s, i) => [s, nth(mod.functions, i, 'service')]))].slice(0, 5);
  while (steps.length < 5) steps.push([`Step ${steps.length + 1}`, nth(mod.functions, steps.length, 'live dependency')]);
  return { ...c, steps };
}

function svgFor(mod) {
  const f = flowFor(mod);
  const id = slug(mod.module);
  const W = 1800;
  const mainX = 760;
  const y0 = 118;
  const gap = 124;
  const H = Math.max(1250, y0 + f.steps.length * gap + 430);
  const shapes = [];
  const lines = [];
  shapes.push(`<text class="title" x="${W/2}" y="48" text-anchor="middle">${esc(mod.module)} flow</text>`);
  shapes.push(`<text class="subtitle" x="${W/2}" y="76" text-anchor="middle">Solution architecture workflow - UI, automation, database, controls, and outcomes</text>`);
  f.steps.forEach((step, i) => {
    const y = y0 + i * gap;
    shapes.push(statusNode(`state-${i}`, mainX - 86, y - 50, f.stages[i] || `State ${i+1}`));
    shapes.push(processNode(`step-${i}`, mainX - 145, y, 290, 78, step[0], step[1], i === 0 ? 'start' : 'process'));
    if (i > 0) lines.push(arrow(mainX, y - gap + 78, mainX, y - 2));
  });
  const decisionY = y0 + f.steps.length * gap + 16;
  lines.push(arrow(mainX, decisionY - gap + 78, mainX, decisionY - 48));
  shapes.push(decisionNode('decision', mainX, decisionY, f.decision || 'Decision?'));
  shapes.push(processNode('yes', mainX - 390, decisionY + 92, 260, 70, f.yes || 'Continue', first(mod.functions, 'approved path'), 'success'));
  shapes.push(processNode('no', mainX + 130, decisionY + 92, 260, 70, f.no || 'Exception', first(mod.security, 'exception path'), 'exception'));
  lines.push(arrow(mainX - 75, decisionY, mainX - 260, decisionY + 92, 'Yes'));
  lines.push(arrow(mainX + 75, decisionY, mainX + 260, decisionY + 92, 'No'));

  const leftX = 70;
  const rightX = 1340;
  shapes.push(processNode('ui-artifacts', leftX, 140, 310, 118, 'UI / Service files', (mod.ui || []).slice(0,3).map(clean).join('\n'), 'artifact'));
  shapes.push(dbNode('db-artifacts', leftX, 430, 310, 140, 'Core DB tables', (mod.db || []).slice(0,4).map(clean).join('\n')));
  shapes.push(processNode('fn-artifacts', rightX, 140, 330, 145, 'Functions / RPC', (mod.functions || []).slice(0,4).map(clean).join('\n'), 'artifact'));
  shapes.push(processNode('sec-artifacts', rightX, 430, 330, 160, 'Triggers / RLS / RBAC', (mod.security || []).slice(0,4).map(clean).join('\n'), 'control'));
  shapes.push(processNode('outcome', mainX - 190, H - 150, 380, 88, `Lifecycle complete`, `Evidence: ${(mod.ui || []).length} files, ${(mod.functions || []).length} functions, ${(mod.db || []).length} tables`, 'end'));
  lines.push(arrow(leftX + 310, 199, mainX - 145, y0 + 38, 'user action'));
  lines.push(arrow(rightX, 212, mainX + 145, y0 + gap * 2 + 38, 'service call'));
  lines.push(arrow(leftX + 310, 500, mainX - 145, y0 + gap * 3 + 38, 'read/write'));
  lines.push(arrow(rightX, 510, mainX + 145, decisionY, 'enforce'));
  lines.push(arrow(mainX - 260, decisionY + 162, mainX - 70, H - 150));
  lines.push(arrow(mainX + 260, decisionY + 162, mainX + 70, H - 150, 'after retry'));

  const all = [...lines, ...shapes].join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <marker id="arrow-${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#4b5f69"/></marker>
  <linearGradient id="bg-${id}" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#f8fbfc"/><stop offset="1" stop-color="#edf3f5"/></linearGradient>
</defs>
<style>
  .bg{fill:url(#bg-${id});}.title{font:800 28px Segoe UI,Arial;fill:#102027}.subtitle{font:500 13px Segoe UI,Arial;fill:#60737c}.node rect,.status rect,.decision polygon,.dbnode path{stroke-width:1.7;filter:drop-shadow(0 8px 14px rgba(16,32,39,.09));}.node-title{font:800 13px Segoe UI,Arial;fill:#102027}.node-sub{font:500 11px Segoe UI,Arial;fill:#52656e;white-space:pre}.label{font:700 12px Segoe UI,Arial;fill:#102027}.status rect{fill:#e9f7f8;stroke:#7abdc5}.status-text{font:800 12px Segoe UI,Arial;fill:#0f4e55}.start rect{fill:#eef9f6;stroke:#65a879}.process rect{fill:#fff;stroke:#91a6ae}.artifact rect{fill:#f7f7ff;stroke:#858bd8}.control rect{fill:#fff6f6;stroke:#d9868b}.success rect{fill:#f2fbf4;stroke:#6aaa77}.exception rect{fill:#fff9ed;stroke:#d4a84d}.end rect{fill:#102027;stroke:#102027}.end .node-title,.end .node-sub{fill:#fff}.decision polygon{fill:#fff7df;stroke:#d1a64c}.decision-text{font:800 12px Segoe UI,Arial;fill:#4d3a0c}.dbnode path{fill:#f3fbf5;stroke:#69a875}.dbnode ellipse{fill:#ffffff;stroke:#69a875;stroke-width:1.7}.arrow{fill:none;stroke:#4b5f69;stroke-width:2.1;marker-end:url(#arrow-${id})}.edge-label{font:700 11px Segoe UI,Arial;fill:#667780}.swimlane{fill:#fff;stroke:#d9e4e7;stroke-width:1}.lane-title{font:800 12px Segoe UI,Arial;fill:#60737c;text-transform:uppercase}
</style>
<rect class="bg" width="${W}" height="${H}" rx="0"/>
<rect class="swimlane" x="38" y="104" width="390" height="${H - 170}" rx="18"/><text class="lane-title" x="70" y="128">Artifact inputs</text>
<rect class="swimlane" x="690" y="104" width="140" height="${H - 170}" rx="18" opacity="0.55"/><text class="lane-title" x="712" y="128">Lifecycle</text>
<rect class="swimlane" x="1285" y="104" width="430" height="${H - 170}" rx="18"/><text class="lane-title" x="1340" y="128">Automation and controls</text>
${all}
</svg>`;
}

function htmlIndex(files) {
  const nav = files.map(({mod, file}, i) => `<a href="#${slug(mod.module)}"><span>${String(i+1).padStart(2,'0')}</span>${esc(mod.module)}</a>`).join('');
  const sections = files.map(({mod, file}) => `<section id="${slug(mod.module)}"><header><h2>${esc(mod.module)}</h2><p>${(mod.functions||[]).length} functions/RPCs • ${(mod.db||[]).length} DB tables • ${(mod.security||[]).length} controls</p></header><img src="solution-architecture-workflows/${path.basename(file)}" alt="${esc(mod.module)} workflow"></section>`).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MEVS Solution Architecture Workflows</title><style>body{margin:0;background:#f3f7f8;color:#102027;font-family:Segoe UI,Arial,sans-serif}.app{display:grid;grid-template-columns:280px 1fr}.side{position:sticky;top:0;height:100vh;overflow:auto;background:#101820;color:white;padding:22px}.side h1{font-size:18px;margin:0 0 12px}.side a{display:flex;gap:10px;color:#d8e6e9;text-decoration:none;padding:8px 10px;border-radius:8px;font-size:13px}.side a:hover{background:rgba(20,167,173,.18)}.side span{color:#7fc7cd}.content{padding:28px}section{background:white;border:1px solid #d9e4e7;border-radius:18px;margin:0 0 26px;padding:20px;box-shadow:0 12px 34px rgba(16,32,39,.06)}header{display:flex;justify-content:space-between;gap:18px;align-items:end}h2{margin:0;font-size:26px}p{margin:0;color:#667780}img{display:block;width:100%;height:auto;margin-top:16px;border:1px solid #d9e4e7;border-radius:14px}@media(max-width:900px){.app{display:block}.side{position:relative;height:auto}}</style></head><body><div class="app"><aside class="side"><h1>Solution Architecture Workflows</h1>${nav}</aside><main class="content">${sections}</main></div></body></html>`;
}

fs.mkdirSync(outDir, { recursive: true });
const files = [];
for (const mod of modules) {
  const file = path.join(outDir, `${slug(mod.module)}-solution-workflow.svg`);
  fs.writeFileSync(file, svgFor(mod), 'utf8');
  files.push({ mod, file });
}
const index = path.join(workspaceRoot, 'outputs', 'solution-architecture-workflows.html');
fs.writeFileSync(index, htmlIndex(files), 'utf8');
console.log(JSON.stringify({index, folder: outDir, count: files.length}, null, 2));




