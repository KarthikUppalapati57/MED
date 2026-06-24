import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const routerSource = read('src/router.jsx');
const moduleConfigUrl = pathToFileURL(path.join(root, 'src/lib/moduleConfig.js')).href;
const { MODULE_DEFINITIONS, getModuleForPage, isUngatedAuthPage } = await import(moduleConfigUrl);

const routeMatch = routerSource.match(/export const legacyRoutes = \{([\s\S]*?)\n\};/);
if (!routeMatch) {
  throw new Error('Could not find legacyRoutes in src/router.jsx');
}

const registeredPages = [...routeMatch[1].matchAll(/"([A-Za-z0-9_]+)"\s*:/g)].map((match) => match[1]);
const uniqueRegisteredPages = [...new Set(registeredPages)].sort();

const mappedPages = new Map();
for (const [moduleKey, definition] of Object.entries(MODULE_DEFINITIONS)) {
  for (const page of definition.pages || []) {
    if (!mappedPages.has(page)) mappedPages.set(page, []);
    mappedPages.get(page).push(moduleKey);
  }
}

const missingMappings = uniqueRegisteredPages.filter((page) => !getModuleForPage(page) && !isUngatedAuthPage(page));
const staleMappings = [...mappedPages.keys()].filter((page) => !uniqueRegisteredPages.includes(page));
const duplicateMappings = [...mappedPages.entries()].filter(([, modules]) => modules.length > 1);

if (missingMappings.length || staleMappings.length || duplicateMappings.length) {
  console.error('Module artifact audit failed.');
  if (missingMappings.length) {
    console.error(`\nRegistered pages missing module mapping (${missingMappings.length}):`);
    missingMappings.forEach((page) => console.error(`  - ${page}`));
  }
  if (staleMappings.length) {
    console.error(`\nModule mappings pointing to unregistered pages (${staleMappings.length}):`);
    staleMappings.forEach((page) => console.error(`  - ${page} -> ${mappedPages.get(page).join(', ')}`));
  }
  if (duplicateMappings.length) {
    console.error(`\nPages mapped to multiple modules (${duplicateMappings.length}):`);
    duplicateMappings.forEach(([page, modules]) => console.error(`  - ${page} -> ${modules.join(', ')}`));
  }
  process.exit(1);
}

console.log(`Module artifact audit passed: ${uniqueRegisteredPages.length} registered pages covered by ${Object.keys(MODULE_DEFINITIONS).length} modules.`);