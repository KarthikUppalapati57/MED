import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(root, '..');
const outputs = path.join(workspaceRoot, 'outputs');
const livePath = path.join(outputs, 'module-workflow-visual-presentation.json');
const workbookPath = path.join(outputs, 'mevs_system_architecture_workbook_rows.json');
const outputPath = path.join(outputs, 'mevs-complete-live-artifact.html');

const liveModules = JSON.parse(fs.readFileSync(livePath, 'utf8'));
const workbook = JSON.parse(fs.readFileSync(workbookPath, 'utf8'));

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function trimItem(value) {
  return String(value || '')
    .replace(/^edge:\s*/, 'Edge: ')
    .replace(/^rpc:\s*/, 'RPC: ')
    .replace(/^trigger:\s*/, 'Trigger: ')
    .replace(/^policy:\s*/, 'Policy: ');
}
function compact(value, max = 58) {
  const text = trimItem(value).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}
function wrap(text, max = 24) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > max && current) { lines.push(current); current = word; }
    else current = (current + ' ' + word).trim();
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}
function svgText(lines, x, y, className, lineHeight = 18) {
  return lines.map((line, idx) => `<text class="${className}" x="${x}" y="${y + idx * lineHeight}">${esc(line)}</text>`).join('');
}
function node(x, y, w, h, label, meta, tone, number) {
  const title = wrap(label, 25);
  const subtitle = wrap(meta || '', 31).slice(0, 2);
  return `<g class="node ${tone}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14"></rect><circle cx="${x + 25}" cy="${y + 26}" r="14"></circle><text class="node-num" x="${x + 25}" y="${y + 31}" text-anchor="middle">${number}</text>${svgText(title, x + 48, y + 27, 'node-title', 17)}${svgText(subtitle, x + 22, y + 74, 'node-meta', 15)}</g>`;
}
function pillList(items, x, y, w, title, tone) {
  const shown = (items || []).slice(0, 6).map((item) => compact(item, 34));
  const more = items.length > shown.length ? [`+ ${items.length - shown.length} more`] : [];
  const rows = [...shown, ...more].map((item, idx) => {
    const ty = y + 50 + idx * 29;
    return `<g class="pill ${tone}"><rect x="${x + 18}" y="${ty - 18}" width="${w - 36}" height="23" rx="11"></rect><text x="${x + 30}" y="${ty - 2}">${esc(item)}</text></g>`;
  }).join('');
  return `<g class="artifact-card ${tone}"><rect x="${x}" y="${y}" width="${w}" height="250" rx="16"></rect><text class="artifact-title" x="${x + 18}" y="${y + 30}">${esc(title)}</text>${rows}</g>`;
}
function diagram(mod) {
  const workflow = mod.workflow || [];
  const main = [
    { label: workflow[0] || 'Open module', meta: (mod.ui || [])[0] || 'UI page', tone: 'ui' },
    { label: workflow[1] || 'Run workflow', meta: (mod.functions || [])[0] || 'service layer', tone: 'flow' },
    { label: workflow[2] || 'Automate process', meta: (mod.functions || [])[1] || 'RPC / Edge', tone: 'fn' },
    { label: workflow[3] || 'Persist records', meta: (mod.db || [])[0] || 'database table', tone: 'db' },
    { label: workflow[4] || 'Enforce controls', meta: (mod.security || [])[0] || 'RLS / RBAC', tone: 'sec' },
  ];
  const xs = [48, 285, 522, 759, 996];
  const arrowId = `arrow-${slug(mod.module)}`;
  const canvasId = `canvas-${slug(mod.module)}`;
  const arrows = xs.slice(0, -1).map((x, idx) => `<path class="flow-arrow" marker-end="url(#${arrowId})" d="M ${x + 188} 190 C ${x + 214} 190, ${xs[idx + 1] - 28} 190, ${xs[idx + 1]} 190"></path>`).join('');
  return `<svg class="workflow-svg" viewBox="0 0 1230 650" role="img" aria-label="${esc(mod.module)} workflow diagram"><defs><marker id="${arrowId}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker><linearGradient id="${canvasId}" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#f8fbfc"></stop><stop offset="1" stop-color="#edf5f7"></stop></linearGradient></defs><rect class="canvas-bg" x="0" y="0" width="1230" height="650" rx="22" fill="url(#${canvasId})"></rect><text class="diagram-title" x="44" y="52">${esc(mod.module)} Live Workflow</text><text class="diagram-subtitle" x="44" y="78">UI to workflow to functions/RPC to database to controls</text><g class="lane-labels"><text x="70" y="125">UI</text><text x="307" y="125">Workflow</text><text x="544" y="125">Functions</text><text x="789" y="125">Database</text><text x="1020" y="125">Security</text></g>${arrows}${main.map((item, idx) => node(xs[idx], 145, 188, 104, item.label, trimItem(item.meta), item.tone, idx + 1)).join('')}<path class="return-line" d="M 1090 274 C 1090 330, 142 330, 142 274"></path><text class="feedback-label" x="444" y="320">Realtime updates, audit events, and query invalidation return to the UI</text>${pillList(mod.ui || [], 48, 365, 260, 'Source files', 'ui')}${pillList(mod.functions || [], 338, 365, 260, 'Functions and RPC', 'fn')}${pillList(mod.db || [], 628, 365, 260, 'DB tables', 'db')}${pillList(mod.security || [], 918, 365, 260, 'Triggers / RLS / RBAC', 'sec')}</svg>`;
}
function listItems(items) { return (items || []).map((item) => `<li>${esc(trimItem(item))}</li>`).join(''); }
function evidence(mod) {
  return `<div class="evidence-grid"><section><h3>UI / Service Files</h3><ul>${listItems(mod.ui)}</ul></section><section><h3>Functions / RPC</h3><ul>${listItems(mod.functions)}</ul></section><section><h3>DB Tables</h3><ul>${listItems(mod.db)}</ul></section><section><h3>Triggers / RLS / RBAC</h3><ul>${listItems(mod.security)}</ul></section></div>`;
}
function tableForSheet(sheet) {
  const head = sheet.columns.map((col) => `<th>${esc(col)}</th>`).join('');
  const rows = sheet.rows.map((row, idx) => `<tr><td class="rownum">${idx + 1}</td>${sheet.columns.map((col) => `<td>${esc(row[col] || '')}</td>`).join('')}</tr>`).join('');
  return `<div class="table-scroll"><table><thead><tr><th>#</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function summaryCards() {
  const totalRows = workbook.sheets.reduce((sum, s) => sum + s.row_count, 0);
  const totalFunctions = liveModules.reduce((sum, mod) => sum + (mod.functions || []).length, 0);
  const totalDb = liveModules.reduce((sum, mod) => sum + (mod.db || []).length, 0);
  return `<div class="stats"><div class="stat"><strong>${liveModules.length}</strong><span>Live modules</span></div><div class="stat"><strong>${workbook.sheets.length}</strong><span>Workbook sheets</span></div><div class="stat"><strong>${totalRows}</strong><span>Workbook rows</span></div><div class="stat"><strong>${totalFunctions}</strong><span>Function/RPC links</span></div><div class="stat"><strong>${totalDb}</strong><span>DB table links</span></div></div>`;
}

const moduleNav = liveModules.map((mod, i) => `<a href="#module-${slug(mod.module)}" data-target="module-${slug(mod.module)}"><span>${String(i + 1).padStart(2, '0')}</span>${esc(mod.module)}</a>`).join('');
const sheetNav = workbook.sheets.map((sheet, i) => `<a href="#sheet-${slug(sheet.name)}" data-target="sheet-${slug(sheet.name)}"><span>S${i + 1}</span>${esc(sheet.name)}</a>`).join('');
const moduleSections = liveModules.map((mod) => `<article id="module-${slug(mod.module)}" class="panel module-card searchable" data-search="${esc(JSON.stringify(mod).toLowerCase())}"><header class="panel-header"><div><p class="eyebrow">Live module workflow</p><h2>${esc(mod.module)}</h2></div><div class="counts"><span>${(mod.ui || []).length} files</span><span>${(mod.functions || []).length} functions</span><span>${(mod.db || []).length} tables</span><span>${(mod.security || []).length} controls</span></div></header><div class="diagram-wrap">${diagram(mod)}</div>${evidence(mod)}</article>`).join('\n');
const sheetSections = workbook.sheets.map((sheet) => `<article id="sheet-${slug(sheet.name)}" class="panel sheet-card searchable" data-search="${esc(JSON.stringify(sheet).toLowerCase())}"><header class="panel-header"><div><p class="eyebrow">Excel source sheet</p><h2>${esc(sheet.name)}</h2><p class="subline">${sheet.row_count} rows • ${sheet.columns.length} columns • Source: ${esc(workbook.source_file)}</p></div></header>${tableForSheet(sheet)}</article>`).join('\n');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>MEVS Complete Live Artifact</title><style>
:root{--ink:#102027;--muted:#64757d;--line:#dbe6e9;--panel:#fff;--bg:#f3f7f8;--nav:#101820;--brand:#14a7ad;--amber:#b68a2d;--indigo:#6268c9;--green:#438a56;--red:#be5b62}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font-family:Segoe UI,Inter,Arial,sans-serif}.app{display:grid;grid-template-columns:312px minmax(0,1fr);min-height:100vh}.sidebar{position:sticky;top:0;height:100vh;background:var(--nav);color:#eaf2f3;padding:22px 18px;overflow:auto}.brand{border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:18px;margin-bottom:14px}.brand h1{font-size:19px;margin:0 0 8px;line-height:1.2}.brand p{font-size:12px;color:#a9bbc1;line-height:1.45;margin:0}.search{width:100%;height:38px;border:1px solid rgba(255,255,255,.18);background:#17232c;color:#fff;border-radius:8px;padding:0 12px;margin:12px 0}.nav-group{margin-top:14px}.nav-title{font-size:11px;font-weight:800;text-transform:uppercase;color:#7fbec4;margin:16px 10px 8px}.nav{display:flex;flex-direction:column;gap:4px}.nav a{display:flex;align-items:center;gap:10px;color:#c9d7db;text-decoration:none;border-radius:8px;padding:9px 10px;font-size:13px}.nav a span{font-size:11px;color:#7fbec4;min-width:25px}.nav a:hover,.nav a.active{background:rgba(20,167,173,.16);color:#fff}.content{padding:30px 34px 80px;min-width:0}.hero{background:linear-gradient(135deg,#fff 0%,#eef8f9 100%);border:1px solid var(--line);border-radius:18px;padding:28px 30px;margin-bottom:22px;box-shadow:0 16px 40px rgba(16,32,39,.07)}.hero h1{font-size:35px;margin:0 0 10px}.hero p{max-width:980px;color:var(--muted);line-height:1.55;margin:0}.stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-top:22px}.stat{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px}.stat strong{display:block;font-size:25px}.stat span{font-size:11px;text-transform:uppercase;color:var(--muted);font-weight:700}.section-title{margin:32px 0 12px;font-size:22px}.panel{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:22px;margin:18px 0 28px;box-shadow:0 12px 34px rgba(16,32,39,.06);scroll-margin-top:24px}.panel-header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:16px}.eyebrow{margin:0 0 4px;color:var(--brand);font-size:12px;font-weight:800;text-transform:uppercase}.panel-header h2{font-size:28px;margin:0}.subline{margin:7px 0 0;color:var(--muted);font-size:13px}.counts{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}.counts span{border:1px solid var(--line);background:#f8fbfc;border-radius:999px;padding:7px 10px;font-size:12px;color:#40525b}.diagram-wrap{overflow:auto;border:1px solid #d7e4e7;border-radius:16px;background:#f7fbfc}.workflow-svg{display:block;min-width:1120px;width:100%;height:auto}.canvas-bg{stroke:#d8e6e9}.diagram-title{font-size:30px;font-weight:800;fill:#102027}.diagram-subtitle{font-size:14px;fill:#667780}.lane-labels text{font-size:12px;font-weight:800;fill:#52656e;text-transform:uppercase}.flow-arrow{fill:none;stroke:#60737c;stroke-width:2.2}marker path{fill:#60737c}.node rect{stroke-width:1.6;filter:drop-shadow(0 8px 13px rgba(16,32,39,.08))}.node circle{fill:#fff;stroke-width:1.4}.node.ui rect,.artifact-card.ui>rect{fill:#f4fbfc;stroke:#78bbc4}.node.ui circle,.pill.ui rect{stroke:#78bbc4}.node.flow rect{fill:#fffaf0;stroke:#d4a84d}.node.flow circle{stroke:#d4a84d}.node.fn rect,.artifact-card.fn>rect{fill:#f7f7ff;stroke:#858bd8}.node.fn circle,.pill.fn rect{stroke:#858bd8}.node.db rect,.artifact-card.db>rect{fill:#f4fbf5;stroke:#74aa7a}.node.db circle,.pill.db rect{stroke:#74aa7a}.node.sec rect,.artifact-card.sec>rect{fill:#fff6f6;stroke:#d9868b}.node.sec circle,.pill.sec rect{stroke:#d9868b}.node-num{font-size:12px;font-weight:800;fill:#102027}.node-title{font-size:13px;font-weight:800;fill:#102027}.node-meta{font-size:11px;fill:#52656e}.return-line{fill:none;stroke:#93a6ad;stroke-width:1.6;stroke-dasharray:6 7}.feedback-label{font-size:12px;fill:#61737c}.artifact-card>rect{stroke-width:1.4;fill:#fff}.artifact-title{font-size:15px;font-weight:800;fill:#102027}.pill rect{fill:#fff;stroke-width:1}.pill text{font-size:11px;fill:#2f424b}.evidence-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:14px}.evidence-grid section{border:1px solid var(--line);border-radius:12px;background:#fbfdfe;padding:14px;min-width:0}.evidence-grid h3{font-size:14px;margin:0 0 10px}.evidence-grid ul{margin:0;padding-left:17px;color:#3b4f58;font-size:12px;line-height:1.55;overflow-wrap:anywhere}.table-scroll{overflow:auto;border:1px solid var(--line);border-radius:14px;max-height:720px}table{border-collapse:separate;border-spacing:0;width:100%;min-width:1250px;background:#fff;font-size:12px}th{position:sticky;top:0;background:#eaf4f6;color:#1d3038;text-align:left;font-size:12px;padding:10px;border-bottom:1px solid var(--line);z-index:1}td{vertical-align:top;padding:10px;border-bottom:1px solid #edf2f3;border-right:1px solid #edf2f3;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}.rownum{font-weight:800;color:#6a7b82;background:#f8fbfc;width:54px}.hidden{display:none!important}@media(max-width:1150px){.app{grid-template-columns:1fr}.sidebar{position:relative;height:auto}.nav{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}.content{padding:20px}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.evidence-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media print{.app{display:block}.sidebar{display:none}.content{padding:0}.panel,.hero{box-shadow:none}.panel{break-inside:avoid}.diagram-wrap,.table-scroll{overflow:visible;max-height:none}.workflow-svg{min-width:0}.evidence-grid{grid-template-columns:repeat(4,1fr)}}
</style></head><body><div class="app"><aside class="sidebar"><div class="brand"><h1>MEVS Complete Artifact</h1><p>Live module workflows plus every row from the architecture workbook in one navigable HTML.</p></div><input id="search" class="search" placeholder="Search everything"><div class="nav-group"><div class="nav-title">Live Modules</div><nav class="nav">${moduleNav}</nav></div><div class="nav-group"><div class="nav-title">Workbook Sheets</div><nav class="nav">${sheetNav}</nav></div></aside><main class="content"><section class="hero searchable" id="overview"><h1>Complete Live System Artifact</h1><p>This file combines the live repository artifact extraction with the Excel architecture workbook. Use the side menu or search to navigate modules, workflow diagrams, source files, functions, database tables, triggers, RLS policies, RBAC rules, and every workbook row without leaving this page.</p>${summaryCards()}</section><h2 class="section-title">Live Module Workflow Diagrams</h2>${moduleSections}<h2 class="section-title">Excel Workbook Row Format</h2>${sheetSections}</main></div><script>
const links=[...document.querySelectorAll('.nav a')];const panels=[...document.querySelectorAll('.searchable')];const search=document.getElementById('search');const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){links.forEach(a=>a.classList.toggle('active',a.dataset.target===entry.target.id));}})},{rootMargin:'-35% 0px -55% 0px',threshold:0});document.querySelectorAll('.panel').forEach(p=>observer.observe(p));search.addEventListener('input',()=>{const q=search.value.trim().toLowerCase();panels.forEach(panel=>{const hay=(panel.dataset.search||panel.textContent).toLowerCase();panel.classList.toggle('hidden',!!q&&!hay.includes(q));});links.forEach(link=>{const target=document.getElementById(link.dataset.target);link.style.display=target&&!target.classList.contains('hidden')?'flex':'none';});});
</script></body></html>`;

fs.writeFileSync(outputPath, html, 'utf8');
console.log(outputPath);
