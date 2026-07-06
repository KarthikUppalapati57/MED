import fs from 'node:fs';
import path from 'node:path';

const source = path.resolve('architecture/CEO_Azure_Migration_Strategy_and_Execution_Plan.md');
const target = path.resolve('architecture/CEO_Azure_Migration_Strategy_and_Execution_Plan.html');

const md = fs.readFileSync(source, 'utf8');

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(value) {
  return esc(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function table(lines) {
  const rows = lines
    .filter((line) => !/^\|\s*-/.test(line))
    .map((line) => line.trim().slice(1, -1).split('|').map((cell) => inline(cell.trim())));
  const [head, ...body] = rows;
  return `<table><thead><tr>${head.map((cell) => `<th>${cell}</th>`).join('')}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

const lines = md.split(/\r?\n/);
let html = '';
let i = 0;
let inList = false;

function closeList() {
  if (inList) {
    html += '</ul>';
    inList = false;
  }
}

while (i < lines.length) {
  const line = lines[i];

  if (line.startsWith('```')) {
    closeList();
    const lang = line.slice(3).trim();
    i += 1;
    const code = [];
    while (i < lines.length && !lines[i].startsWith('```')) {
      code.push(lines[i]);
      i += 1;
    }
    html += `<pre data-lang="${esc(lang)}"><code>${esc(code.join('\n'))}</code></pre>`;
    i += 1;
    continue;
  }

  if (/^\|.+\|$/.test(line.trim()) && i + 1 < lines.length && /^\|\s*-/.test(lines[i + 1].trim())) {
    closeList();
    const block = [line, lines[i + 1]];
    i += 2;
    while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) {
      block.push(lines[i]);
      i += 1;
    }
    html += table(block);
    continue;
  }

  if (/^---+$/.test(line.trim())) {
    closeList();
    html += '<hr>';
    i += 1;
    continue;
  }

  const heading = line.match(/^(#{1,6})\s+(.+)$/);
  if (heading) {
    closeList();
    const level = heading[1].length;
    html += `<h${level}>${inline(heading[2])}</h${level}>`;
    i += 1;
    continue;
  }

  const bullet = line.match(/^\s*-\s+(.+)$/);
  if (bullet) {
    if (!inList) {
      html += '<ul>';
      inList = true;
    }
    html += `<li>${inline(bullet[1])}</li>`;
    i += 1;
    continue;
  }

  if (!line.trim()) {
    closeList();
    i += 1;
    continue;
  }

  closeList();
  html += `<p>${inline(line)}</p>`;
  i += 1;
}
closeList();

const output = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RestOps / MED Azure Migration Strategy and Execution Plan</title>
<style>
  @page { size: Letter; margin: 0.65in; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Inter, Arial, Helvetica, sans-serif;
    color: #172033;
    background: #fff;
    font-size: 10.5pt;
    line-height: 1.45;
  }
  h1, h2, h3, h4 { color: #0b2f63; line-height: 1.15; page-break-after: avoid; }
  h1 {
    font-size: 25pt;
    margin: 0 0 10px;
    padding-bottom: 10px;
    border-bottom: 4px solid #0b559d;
  }
  h2 {
    margin-top: 26px;
    font-size: 17pt;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 5px;
  }
  h3 { font-size: 13.5pt; margin-top: 18px; }
  h4 { font-size: 11.5pt; margin-top: 14px; }
  p { margin: 8px 0; }
  ul { margin: 8px 0 10px 22px; padding: 0; }
  li { margin: 4px 0; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0 16px;
    page-break-inside: avoid;
    font-size: 9.2pt;
  }
  th {
    background: #0b559d;
    color: #fff;
    text-align: left;
    font-weight: 700;
    padding: 7px;
    border: 1px solid #0b559d;
  }
  td {
    padding: 7px;
    border: 1px solid #d8e1ee;
    vertical-align: top;
  }
  tr:nth-child(even) td { background: #f8fbff; }
  code {
    font-family: Consolas, Menlo, monospace;
    color: #18324f;
    background: #eef4fb;
    border: 1px solid #d6e2ef;
    border-radius: 3px;
    padding: 1px 4px;
  }
  pre {
    background: #0f172a;
    color: #e5edf8;
    padding: 12px;
    border-radius: 7px;
    overflow-wrap: break-word;
    white-space: pre-wrap;
    page-break-inside: avoid;
    font-size: 8.5pt;
  }
  pre code { background: transparent; border: 0; color: inherit; padding: 0; }
  hr {
    border: 0;
    border-top: 1px solid #d8e1ee;
    margin: 18px 0;
  }
  body > h1:first-of-type {
    margin-top: 0;
  }
  body > h1:first-of-type + h1 {
    font-size: 20pt;
    color: #17406f;
    border: 0;
    margin-top: 6px;
  }
  strong { color: #10253f; }
</style>
</head>
<body>
${html}
</body>
</html>`;

fs.writeFileSync(target, output);
console.log(target);
