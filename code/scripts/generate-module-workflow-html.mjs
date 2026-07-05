import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(root, '..');
const input = path.join(workspaceRoot, 'outputs', 'module-workflow-visual-presentation.json');
const output = path.join(workspaceRoot, 'outputs', 'module-workflow-visual-presentation.html');

const modules = JSON.parse(fs.readFileSync(input, 'utf8'));

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function trimItem(value) {
  return String(value || '')
    .replace(/^edge:\s*/, 'Edge: ')
    .replace(/^rpc:\s*/, 'RPC: ')
    .replace(/^trigger:\s*/, 'Trigger: ')
    .replace(/^policy:\s*/, 'Policy: ')
    .replace(/^dashboard\//, 'dashboard/')
    .replace(/^invoices\//, 'invoices/')
    .replace(/^payments\//, 'payments/')
    .replace(/^inventory\//, 'inventory/')
    .replace(/^performance\//, 'performance/')
    .replace(/^accounting\//, 'accounting/')
    .replace(/^vendors\//, 'vendors/')
    .replace(/^admin\//, 'admin/');
}

function wrap(text, max = 24) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > max && current) {
      lines.push(current);
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
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
  return `<g class="node ${tone}">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14"></rect>
    <circle cx="${x + 25}" cy="${y + 26}" r="14"></circle>
    <text class="node-num" x="${x + 25}" y="${y + 31}" text-anchor="middle">${number}</text>
    ${svgText(title, x + 48, y + 27, 'node-title', 17)}
    ${svgText(subtitle, x + 22, y + 74, 'node-meta', 15)}
  </g>`;
}

function pillList(items, x, y, w, title, tone) {
  const shown = items.slice(0, 6).map(trimItem);
  const more = items.length > shown.length ? [`+ ${items.length - shown.length} more`] : [];
  const all = [...shown, ...more];
  const rows = all.map((item, idx) => {
    const ty = y + 50 + idx * 29;
    const label = item.length > 33 ? `${item.slice(0, 31)}...` : item;
    return `<g class="pill ${tone}"><rect x="${x + 18}" y="${ty - 18}" width="${w - 36}" height="23" rx="11"></rect><text x="${x + 30}" y="${ty - 2}">${esc(label)}</text></g>`;
  }).join('');
  return `<g class="artifact-card ${tone}">
    <rect x="${x}" y="${y}" width="${w}" height="250" rx="16"></rect>
    <text class="artifact-title" x="${x + 18}" y="${y + 30}">${esc(title)}</text>
    ${rows}
  </g>`;
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
  return `<svg class="workflow-svg" viewBox="0 0 1230 650" role="img" aria-label="${esc(mod.module)} workflow diagram">
    <defs>
      <marker id="${arrowId}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker>
      <linearGradient id="${canvasId}" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#f8fbfc"></stop><stop offset="1" stop-color="#eef5f7"></stop></linearGradient>
    </defs>
    <rect class="canvas-bg" x="0" y="0" width="1230" height="650" rx="22" fill="url(#${canvasId})"></rect>
    <text class="diagram-title" x="44" y="52">${esc(mod.module)} Live Workflow</text>
    <text class="diagram-subtitle" x="44" y="78">UI to workflow to functions/RPC to database to controls</text>
    <g class="lane-labels">
      <text x="70" y="125">UI</text><text x="307" y="125">Workflow</text><text x="544" y="125">Functions</text><text x="789" y="125">Database</text><text x="1020" y="125">Security</text>
    </g>
    ${arrows}
    ${main.map((item, idx) => node(xs[idx], 145, 188, 104, item.label, trimItem(item.meta), item.tone, idx + 1)).join('')}
    <path class="return-line" d="M 1090 274 C 1090 330, 142 330, 142 274"></path>
    <text class="feedback-label" x="444" y="320">Realtime updates, audit events, and query invalidation return to the UI</text>
    ${pillList(mod.ui || [], 48, 365, 260, 'Source files', 'ui')}
    ${pillList(mod.functions || [], 338, 365, 260, 'Functions and RPC', 'fn')}
    ${pillList(mod.db || [], 628, 365, 260, 'DB tables', 'db')}
    ${pillList(mod.security || [], 918, 365, 260, 'Triggers / RLS / RBAC', 'sec')}
  </svg>`;
}

function listItems(items) {
  return items.slice(0, 8).map((item) => `<li>${esc(trimItem(item))}</li>`).join('');
}

const totalFunctions = modules.reduce((sum, mod) => sum + (mod.functions || []).length, 0);
const totalDb = modules.reduce((sum, mod) => sum + (mod.db || []).length, 0);
const totalSecurity = modules.reduce((sum, mod) => sum + (mod.security || []).length, 0);

const nav = modules.map((mod, idx) => `<a href="#${slug(mod.module)}" data-target="${slug(mod.module)}"><span>${String(idx + 1).padStart(2, '0')}</span>${esc(mod.module)}</a>`).join('');
const cards = modules.map((mod) => `<article id="${slug(mod.module)}" class="module-card" data-module="${esc(mod.module.toLowerCase())}">
  <header class="module-header">
    <div><p class="eyebrow">Module artifact</p><h2>${esc(mod.module)}</h2></div>
    <div class="counts"><span>${(mod.ui || []).length} files</span><span>${(mod.functions || []).length} functions</span><span>${(mod.db || []).length} tables</span><span>${(mod.security || []).length} controls</span></div>
  </header>
  <div class="diagram-wrap">${diagram(mod)}</div>
  <div class="evidence-grid">
    <section><h3>UI Pages</h3><ul>${listItems(mod.ui || [])}</ul></section>
    <section><h3>Functions / RPC</h3><ul>${listItems(mod.functions || [])}</ul></section>
    <section><h3>DB Tables</h3><ul>${listItems(mod.db || [])}</ul></section>
    <section><h3>Triggers / RLS / RBAC</h3><ul>${listItems(mod.security || [])}</ul></section>
  </div>
</article>`).join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MEVS Module Workflow Visual Presentation</title>
<style>
:root{--ink:#102027;--muted:#667780;--line:#dbe5e8;--panel:#ffffff;--bg:#f4f7f8;--nav:#101820;--brand:#14a7ad;--amber:#b68a2d;--indigo:#6268c9;--green:#438a56;--red:#be5b62;}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font-family:Segoe UI,Inter,Arial,sans-serif;letter-spacing:0}.app{display:grid;grid-template-columns:292px minmax(0,1fr);min-height:100vh}.sidebar{position:sticky;top:0;height:100vh;background:var(--nav);color:#eaf2f3;padding:22px 18px;overflow:auto}.brand{border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:18px;margin-bottom:16px}.brand h1{font-size:19px;line-height:1.2;margin:0 0 8px}.brand p{font-size:12px;color:#a9bbc1;margin:0;line-height:1.45}.search{width:100%;height:38px;border:1px solid rgba(255,255,255,.18);background:#17232c;color:#fff;border-radius:8px;padding:0 12px;margin:12px 0 14px}.nav{display:flex;flex-direction:column;gap:4px}.nav a{display:flex;align-items:center;gap:10px;color:#c9d7db;text-decoration:none;border-radius:8px;padding:9px 10px;font-size:13px}.nav a span{font-size:11px;color:#7fbec4;min-width:22px}.nav a:hover,.nav a.active{background:rgba(20,167,173,.16);color:#fff}.content{padding:30px 34px 70px;min-width:0}.hero{background:linear-gradient(135deg,#ffffff 0%,#eef8f9 100%);border:1px solid var(--line);border-radius:18px;padding:28px 30px;margin-bottom:22px;box-shadow:0 16px 40px rgba(16,32,39,.07)}.hero h1{font-size:34px;margin:0 0 10px}.hero p{color:var(--muted);max-width:920px;line-height:1.55;margin:0}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:22px}.stat{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px}.stat strong{font-size:25px;display:block}.stat span{font-size:12px;color:var(--muted);text-transform:uppercase}.module-card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:22px;margin:20px 0 28px;box-shadow:0 12px 34px rgba(16,32,39,.06);scroll-margin-top:24px}.module-header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:16px}.eyebrow{margin:0 0 4px;color:var(--brand);font-size:12px;font-weight:800;text-transform:uppercase}.module-header h2{font-size:28px;margin:0}.counts{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}.counts span{border:1px solid var(--line);background:#f8fbfc;border-radius:999px;padding:7px 10px;font-size:12px;color:#40525b}.diagram-wrap{overflow:auto;border:1px solid #d7e4e7;border-radius:16px;background:#f7fbfc}.workflow-svg{display:block;min-width:1120px;width:100%;height:auto}.canvas-bg{stroke:#d8e6e9}.diagram-title{font-size:30px;font-weight:800;fill:#102027}.diagram-subtitle{font-size:14px;fill:#667780}.lane-labels text{font-size:12px;font-weight:800;fill:#52656e;text-transform:uppercase}.flow-arrow{fill:none;stroke:#60737c;stroke-width:2.2}marker path{fill:#60737c}.node rect{stroke-width:1.6;filter:drop-shadow(0 8px 13px rgba(16,32,39,.08))}.node circle{fill:#fff;stroke-width:1.4}.node.ui rect,.artifact-card.ui>rect{fill:#f4fbfc;stroke:#78bbc4}.node.ui circle,.pill.ui rect{stroke:#78bbc4}.node.flow rect{fill:#fffaf0;stroke:#d4a84d}.node.flow circle{stroke:#d4a84d}.node.fn rect,.artifact-card.fn>rect{fill:#f7f7ff;stroke:#858bd8}.node.fn circle,.pill.fn rect{stroke:#858bd8}.node.db rect,.artifact-card.db>rect{fill:#f4fbf5;stroke:#74aa7a}.node.db circle,.pill.db rect{stroke:#74aa7a}.node.sec rect,.artifact-card.sec>rect{fill:#fff6f6;stroke:#d9868b}.node.sec circle,.pill.sec rect{stroke:#d9868b}.node-num{font-size:12px;font-weight:800;fill:#102027}.node-title{font-size:13px;font-weight:800;fill:#102027}.node-meta{font-size:11px;fill:#52656e}.return-line{fill:none;stroke:#93a6ad;stroke-width:1.6;stroke-dasharray:6 7}.feedback-label{font-size:12px;fill:#61737c}.artifact-card>rect{stroke-width:1.4;fill:#fff}.artifact-title{font-size:15px;font-weight:800;fill:#102027}.pill rect{fill:#fff;stroke-width:1}.pill text{font-size:11px;fill:#2f424b}.evidence-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:14px}.evidence-grid section{border:1px solid var(--line);border-radius:12px;background:#fbfdfe;padding:14px}.evidence-grid h3{font-size:14px;margin:0 0 10px}.evidence-grid ul{margin:0;padding-left:17px;color:#3b4f58;font-size:12px;line-height:1.55}.hidden{display:none!important}@media(max-width:1100px){.app{grid-template-columns:1fr}.sidebar{position:relative;height:auto}.nav{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}.content{padding:20px}.stats,.evidence-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media print{.app{display:block}.sidebar{display:none}.content{padding:0}.module-card{break-inside:avoid;box-shadow:none}.hero{box-shadow:none}.diagram-wrap{overflow:visible}.workflow-svg{min-width:0}.evidence-grid{grid-template-columns:repeat(4,1fr)}}
</style>
</head>
<body>
<div class="app">
  <aside class="sidebar"><div class="brand"><h1>MEVS Workflow Artifacts</h1><p>Single-page visual plan for module UI, workflow, functions, DB, triggers, RLS, and RBAC.</p></div><input id="search" class="search" placeholder="Search modules"><nav class="nav" id="nav">${nav}</nav></aside>
  <main class="content">
    <section class="hero"><h1>Module Workflow Visual Presentation</h1><p>Every module is shown as a connected live artifact: source UI files feed workflow actions, call Edge Functions/RPCs, read and write database tables, and are protected by triggers, RLS policies, and RBAC gates.</p><div class="stats"><div class="stat"><strong>${modules.length}</strong><span>Modules</span></div><div class="stat"><strong>${totalFunctions}</strong><span>Function links</span></div><div class="stat"><strong>${totalDb}</strong><span>DB table links</span></div><div class="stat"><strong>${totalSecurity}</strong><span>Controls</span></div></div></section>
    ${cards}
  </main>
</div>
<script>
const links=[...document.querySelectorAll('.nav a')];
const cards=[...document.querySelectorAll('.module-card')];
const search=document.getElementById('search');
const visibleCards=()=>cards.filter(card=>!card.classList.contains('hidden'));
const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){links.forEach(a=>a.classList.toggle('active',a.dataset.target===entry.target.id));}})},{rootMargin:'-35% 0px -55% 0px',threshold:0});
cards.forEach(card=>observer.observe(card));
search.addEventListener('input',()=>{const q=search.value.trim().toLowerCase();cards.forEach(card=>{const hit=!q||card.textContent.toLowerCase().includes(q)||card.dataset.module.includes(q);card.classList.toggle('hidden',!hit);});links.forEach(link=>{const target=document.getElementById(link.dataset.target);link.style.display=target&&!target.classList.contains('hidden')?'flex':'none';});});
</script>
</body>
</html>`;

fs.writeFileSync(output, html);
console.log(output);


