import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(root, '..');
const outDir = path.join(workspaceRoot, 'outputs', 'module-workflow-visuals');
const csvPath = path.join(workspaceRoot, 'outputs', 'module-wise-live-artifacts.csv');

const modules = [
  { name: 'Dashboard', steps: ['Load tenant context', 'Aggregate KPIs', 'Render role dashboard', 'Schedule dashboard reports'], keywords: ['dashboard', 'report', 'summary', 'notification', 'budget'] },
  { name: 'Performance', steps: ['Select performance view', 'Read sales/labor/inventory facts', 'Compute variance and forecasts', 'Show BI widgets'], keywords: ['performance', 'benchmark', 'forecast', 'variance', 'pnl', 'sales'] },
  { name: 'Notifications', steps: ['Listen for notifications', 'Filter unread approvals', 'Open target workflow', 'Mark read or resolve'], keywords: ['notification', 'inbox', 'approval'] },
  { name: 'Invoices', steps: ['Upload or ingest invoice', 'Run extraction', 'Review and validate', 'Approve and route AP', 'Sync ledger/payment state'], keywords: ['invoice', 'approval', 'three_way', 'extraction', 'ledger'] },
  { name: 'Payments', steps: ['Open payable queue', 'Schedule or pay invoice', 'Record payment history', 'Reconcile payout', 'Update gateway/accounting'], keywords: ['payment', 'payable', 'scheduled', 'gateway', 'payout', 'bill'] },
  { name: 'Products', steps: ['Open product catalog', 'Map vendor items', 'Run AI verification', 'Review purchases', 'Update product master'], keywords: ['product', 'catalog', 'vendor_item', 'global_vendor', 'purchase'] },
  { name: 'Inventory', steps: ['Review inventory list', 'Receive/transfer stock', 'Sync POS usage', 'Count stock/waste', 'Calculate AvT costing'], keywords: ['inventory', 'stock', 'wastage', 'count', 'avt', 'pos'] },
  { name: 'Orders', steps: ['Build order guide', 'Place purchase order', 'Receive goods', 'Match invoice', 'Update inventory'], keywords: ['order', 'purchase_order', 'receiving', 'procurement', 'auto'] },
  { name: 'Smart Prep', steps: ['Read sales forecast', 'Generate prep plan', 'Use voice/copilot input', 'Publish prep sheet'], keywords: ['smartprep', 'prep', 'forecast'] },
  { name: 'Commissary', steps: ['Create commissary order', 'Allocate source inventory', 'Transfer to locations', 'Track fulfillment'], keywords: ['commissary', 'intercompany', 'transfer'] },
  { name: 'Recipes', steps: ['Open recipe list', 'Map ingredients', 'Cost prepared items', 'Analyze menu engineering', 'Publish setup changes'], keywords: ['recipe', 'menu', 'ingredient', 'pmix', 'prepared'] },
  { name: 'Vendors', steps: ['Manage vendor profile', 'Map vendor items', 'Review statements', 'Resolve reconciliation', 'Set AP routing'], keywords: ['vendor', 'statement', 'vendor_item', 'routing', 'bidding'] },
  { name: 'Labor', steps: ['Review labor summary', 'Forecast staffing', 'Schedule shifts', 'Track time clock', 'Export payroll'], keywords: ['labor', 'shift', 'employee', 'payroll', 'schedule', 'time'] },
  { name: 'Accounting', steps: ['Open accounting dashboard', 'Map GL accounts', 'Queue exports', 'Sync ledger', 'Reconcile and close books'], keywords: ['accounting', 'ledger', 'gl', 'export', 'reconciliation', 'budget'] },
  { name: 'Organization Settings', steps: ['Load hierarchy', 'Manage roles', 'Configure approvals', 'Enforce MFA/security', 'Update tenant settings'], keywords: ['organization', 'role', 'hierarchy', 'security', 'approval', 'mfa'] },
  { name: 'Team Members', steps: ['Invite user', 'Assign role/scope', 'Accept invitation', 'Update profile access', 'Audit membership'], keywords: ['user', 'team', 'profile', 'invitation', 'member'] },
  { name: 'Restaurant Setup', steps: ['Configure location/brand', 'Connect POS', 'Set notifications', 'Register devices', 'Complete onboarding'], keywords: ['setup', 'pos', 'device', 'location', 'brand', 'onboarding'] },
  { name: 'Integrations Hub', steps: ['Create API/webhook config', 'Receive POS/accounting/EDI data', 'Dispatch webhook', 'Sync external systems', 'Log integration events'], keywords: ['integration', 'api', 'webhook', 'pos', 'edi', 'accounting'] },
  { name: 'Audit Logs', steps: ['Capture workflow event', 'Write audit row', 'Apply tenant scope', 'Review org/platform logs', 'Export compliance evidence'], keywords: ['audit', 'log', 'event', 'vault', 'compliance'] },
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted && ch === '"' && next === '"') { cell += '"'; i++; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (!quoted && ch === ',') { row.push(cell); cell = ''; continue; }
    if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = ''; continue;
    }
    cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const [header, ...data] = rows;
  return data.map((values) => Object.fromEntries(header.map((key, idx) => [key, values[idx] || ''])));
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function cleanName(value) {
  return String(value || '').replace(/^supabase\/functions\//, '').replace(/^src\/modules\//, '').replace(/^src\//, '').replace(/^supabase\/migrations\//, '');
}

function scoreItem(item, mod) {
  const hay = `${item.Name} ${item.Description}`.toLowerCase();
  let score = 0;
  for (const keyword of mod.keywords) if (hay.includes(keyword.toLowerCase())) score += 3;
  if (hay.includes(mod.name.toLowerCase().replaceAll(' ', ''))) score += 5;
  if (item.Name.includes('/pages/')) score += 8;
  if (item.Category.includes('Edge')) score += 4;
  if (item.Category.includes('RPC')) score += 3;
  if (item.Category.includes('Core DB')) score += 2;
  if (item.Name.startsWith('...')) score -= 20;
  return score;
}

function pick(rows, mod, category, limit, fallback = []) {
  const matched = rows
    .filter((row) => row.Module === mod.name && row.Category === category)
    .map((row) => ({ ...row, score: scoreItem(row, mod) }))
    .sort((a, b) => b.score - a.score || a.Name.localeCompare(b.Name));
  const values = uniq(matched.map((row) => cleanName(row.Name))).slice(0, limit);
  return values.length ? values : fallback;
}

function wrap(text, max = 28) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > max && line) { lines.push(line); line = word; }
    else line = (line + ' ' + word).trim();
  }
  if (line) lines.push(line);
  return lines;
}

function svgText(lines, x, y, options = {}) {
  const size = options.size || 13;
  const fill = options.fill || '#172026';
  const weight = options.weight || 500;
  return lines.map((line, idx) => `<text x="${x}" y="${y + idx * (size + 4)}" font-family="Segoe UI, Arial" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`).join('\n');
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function boxSvg(x, y, w, h, title, items, color) {
  const titleLines = wrap(title, 22);
  const shown = items.slice(0, 5);
  const extra = items.length > shown.length ? [`+ ${items.length - shown.length} more`] : [];
  const body = [...shown, ...extra].flatMap((item) => wrap(`- ${item}`, 30));
  return `<g>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${color.fill}" stroke="${color.stroke}" stroke-width="1.5"/>
  <rect x="${x}" y="${y}" width="${w}" height="34" rx="8" fill="${color.header}"/>
  ${svgText(titleLines, x + 14, y + 23, { size: 14, fill: '#0f1720', weight: 700 })}
  ${svgText(body, x + 14, y + 58, { size: 11, fill: '#263238', weight: 500 })}
</g>`;
}

function arrowSvg(x1, y1, x2, y2) {
  return `<path d="M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}" fill="none" stroke="#50606b" stroke-width="2" marker-end="url(#arrow)"/>`;
}

function modulePayload(rows, mod) {
  const ui = pick(rows, mod, 'UI pages/source', 6, mod.steps.slice(0, 2));
  const edge = pick(rows, mod, 'Edge Function', 4);
  const rpc = pick(rows, mod, 'RPC/DB Function', 5);
  const db = pick(rows, mod, 'Core DB Tables', 7, ['profiles', 'organizations']);
  const triggers = pick(rows, mod, 'Trigger', 4);
  const policies = pick(rows, mod, 'RLS Policy', 4);
  const functions = [...edge.map((item) => `edge: ${item}`), ...rpc.map((item) => `rpc: ${item}`)].slice(0, 8);
  const security = [...triggers.map((item) => `trigger: ${item}`), ...policies.map((item) => `policy: ${item}`)].slice(0, 8);
  return { ui, workflow: mod.steps, functions: functions.length ? functions : ['direct Supabase query/service helper'], db, security: security.length ? security : ['RBAC from moduleConfig', 'tenant RLS/shared policies'] };
}

function svgForModule(mod, payload) {
  const width = 1600;
  const height = 920;
  const cols = [40, 350, 660, 970, 1280];
  const y = 170;
  const w = 270;
  const h = 500;
  const colors = [
    { fill: '#f7fbfc', stroke: '#7ab7c2', header: '#dff4f7' },
    { fill: '#fffdf7', stroke: '#d6b769', header: '#fff0bf' },
    { fill: '#f8f8ff', stroke: '#8f97d6', header: '#e6e8ff' },
    { fill: '#f7fbf7', stroke: '#72aa7b', header: '#def2df' },
    { fill: '#fff8f8', stroke: '#d48a8a', header: '#ffe1e1' },
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#50606b"/></marker>
</defs>
<rect width="1600" height="920" fill="#ffffff"/>
<text x="40" y="58" font-family="Segoe UI, Arial" font-size="34" font-weight="800" fill="#0f1720">${escapeXml(mod.name)} - Live Workflow Artifact</text>
<text x="40" y="92" font-family="Segoe UI, Arial" font-size="15" fill="#50606b">Live code scan: UI pages connect through workflow steps into functions/RPCs, database tables, triggers, RLS, and RBAC.</text>
${arrowSvg(cols[0] + w, y + 250, cols[1], y + 250)}
${arrowSvg(cols[1] + w, y + 250, cols[2], y + 250)}
${arrowSvg(cols[2] + w, y + 250, cols[3], y + 250)}
${arrowSvg(cols[3] + w, y + 250, cols[4], y + 250)}
${boxSvg(cols[0], y, w, h, '1. UI pages', payload.ui, colors[0])}
${boxSvg(cols[1], y, w, h, '2. Workflow', payload.workflow, colors[1])}
${boxSvg(cols[2], y, w, h, '3. Functions / RPC', payload.functions, colors[2])}
${boxSvg(cols[3], y, w, h, '4. DB tables', payload.db, colors[3])}
${boxSvg(cols[4], y, w, h, '5. Triggers / RLS / RBAC', payload.security, colors[4])}
<text x="40" y="745" font-family="Segoe UI, Arial" font-size="13" fill="#50606b">Generated from repository artifacts under code/src, code/supabase/functions, code/supabase/migrations, and src/lib/moduleConfig.js.</text>
</svg>`;
}

function vdxBox(id, x, y, w, h, title, items, fill = 'RGB(248,251,252)') {
  const text = [title, '', ...items.slice(0, 7), ...(items.length > 7 ? [`+ ${items.length - 7} more`] : [])].join('\n');
  return `<Shape ID="${id}" Type="Shape" LineStyle="3" FillStyle="3" TextStyle="3">
<XForm><PinX>${x}</PinX><PinY>${y}</PinY><Width>${w}</Width><Height>${h}</Height><LocPinX>${w / 2}</LocPinX><LocPinY>${h / 2}</LocPinY><Angle>0</Angle></XForm>
<Geom IX="0"><MoveTo IX="1"><X>0</X><Y>0</Y></MoveTo><LineTo IX="2"><X>${w}</X><Y>0</Y></LineTo><LineTo IX="3"><X>${w}</X><Y>${h}</Y></LineTo><LineTo IX="4"><X>0</X><Y>${h}</Y></LineTo><LineTo IX="5"><X>0</X><Y>0</Y></LineTo></Geom>
<Fill><FillForegnd>${fill}</FillForegnd></Fill><Text>${escapeXml(text)}</Text></Shape>`;
}

function vdxLine(id, x1, y1, x2, y2) {
  const w = Math.abs(x2 - x1) || 0.01;
  const h = Math.abs(y2 - y1) || 0.01;
  const pinX = Math.min(x1, x2) + w / 2;
  const pinY = Math.min(y1, y2) + h / 2;
  return `<Shape ID="${id}" Type="Shape" LineStyle="3"><XForm><PinX>${pinX}</PinX><PinY>${pinY}</PinY><Width>${w}</Width><Height>${h}</Height><LocPinX>${w / 2}</LocPinX><LocPinY>${h / 2}</LocPinY><Angle>0</Angle></XForm><Geom IX="0"><MoveTo IX="1"><X>0</X><Y>0</Y></MoveTo><LineTo IX="2"><X>${w}</X><Y>${h}</Y></LineTo></Geom></Shape>`;
}

function buildVdx(pages) {
  let shapeId = 1;
  const pageXml = pages.map(({ mod, payload }, pageIndex) => {
    const y = 3.6;
    const boxW = 2.1;
    const boxH = 3.25;
    const xs = [1.25, 3.8, 6.35, 8.9, 11.45];
    const shapes = [];
    shapes.push(vdxBox(shapeId++, 6.5, 7.15, 12.2, 0.55, `${mod.name} - live workflow artifact`, [], 'RGB(222,244,247)'));
    shapes.push(vdxBox(shapeId++, xs[0], y, boxW, boxH, '1. UI pages', payload.ui, 'RGB(247,251,252)'));
    shapes.push(vdxBox(shapeId++, xs[1], y, boxW, boxH, '2. Workflow', payload.workflow, 'RGB(255,253,247)'));
    shapes.push(vdxBox(shapeId++, xs[2], y, boxW, boxH, '3. Functions / RPC', payload.functions, 'RGB(248,248,255)'));
    shapes.push(vdxBox(shapeId++, xs[3], y, boxW, boxH, '4. DB tables', payload.db, 'RGB(247,251,247)'));
    shapes.push(vdxBox(shapeId++, xs[4], y, boxW, boxH, '5. Triggers / RLS / RBAC', payload.security, 'RGB(255,248,248)'));
    for (let i = 0; i < xs.length - 1; i++) shapes.push(vdxLine(shapeId++, xs[i] + boxW / 2 + 1.05, y, xs[i + 1] - boxW / 2, y));
    return `<Page ID="${pageIndex}" Name="${escapeXml(mod.name)}"><PageSheet><PageProps><PageWidth>13.3</PageWidth><PageHeight>7.5</PageHeight></PageProps></PageSheet><Shapes>${shapes.join('\n')}</Shapes></Page>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<VisioDocument xmlns="http://schemas.microsoft.com/visio/2003/core"><DocumentProperties><Title>MEVS Module Workflow Visual Artifacts</Title></DocumentProperties><Pages>${pageXml}</Pages></VisioDocument>`;
}

function markdownFor(mod, payload, svgFile) {
  return `## ${mod.name}\n\n![${mod.name} workflow](module-workflow-visuals/${svgFile})\n\n- UI: ${payload.ui.join(', ')}\n- Functions/RPC: ${payload.functions.join(', ')}\n- DB: ${payload.db.join(', ')}\n- Triggers/RLS/RBAC: ${payload.security.join(', ')}\n`;
}

if (!fs.existsSync(csvPath)) {
  throw new Error(`Missing ${csvPath}. Run scripts/generate-module-live-artifacts.mjs first.`);
}

fs.mkdirSync(outDir, { recursive: true });
const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
const pages = [];
let md = `# MEVS Module Workflow Visual Presentation\n\nGenerated: ${new Date().toISOString().slice(0, 10)}\n\nThis is the visual presentation layer: each module shows the live connection from UI to workflow, functions/RPCs, DB tables, triggers, RLS, and RBAC.\n\n`;

for (const mod of modules) {
  const payload = modulePayload(rows, mod);
  const safe = mod.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const svgFile = `${safe}-workflow.svg`;
  fs.writeFileSync(path.join(outDir, svgFile), svgForModule(mod, payload));
  pages.push({ mod, payload });
  md += markdownFor(mod, payload, svgFile) + '\n';
}

fs.writeFileSync(path.join(workspaceRoot, 'outputs', 'module-workflow-visual-presentation.md'), md);
fs.writeFileSync(path.join(workspaceRoot, 'outputs', 'module-workflow-visual-presentation-visio.vdx'), buildVdx(pages));
fs.writeFileSync(path.join(workspaceRoot, 'outputs', 'module-workflow-visual-presentation.json'), JSON.stringify(pages.map(({ mod, payload }) => ({ module: mod.name, ...payload })), null, 2));

console.log(JSON.stringify({
  outputs: [
    path.join(workspaceRoot, 'outputs', 'module-workflow-visual-presentation-visio.vdx'),
    path.join(workspaceRoot, 'outputs', 'module-workflow-visual-presentation.md'),
    path.join(workspaceRoot, 'outputs', 'module-workflow-visual-presentation.json'),
    outDir,
  ],
  modules: pages.length,
}, null, 2));

