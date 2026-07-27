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
const duplicateRegisteredPages = [...new Set(
  registeredPages.filter((page, index) => registeredPages.indexOf(page) !== index)
)].sort();

const canonicalMatch = routerSource.match(/export const canonicalRoutes = \[([\s\S]*?)\n\];/);
if (!canonicalMatch) {
  throw new Error('Could not find canonicalRoutes in src/router.jsx');
}

const canonicalPages = [...canonicalMatch[1].matchAll(/pageName:\s*"([A-Za-z0-9_]+)"/g)].map((match) => match[1]);
const canonicalPagesMissingLegacyRoute = [...new Set(
  canonicalPages.filter((page) => !uniqueRegisteredPages.includes(page))
)].sort();

const setupMatch = routerSource.match(/export const setupRoutes = \{([\s\S]*?)\n\};/);
if (!setupMatch) {
  throw new Error('Could not find setupRoutes in src/router.jsx');
}

const setupPages = [...setupMatch[1].matchAll(/\b([A-Za-z0-9_]+)\s*,?/g)]
  .map((match) => match[1])
  .filter((page) => /^[A-Z]/.test(page));

const mappedPages = new Map();
for (const [moduleKey, definition] of Object.entries(MODULE_DEFINITIONS)) {
  for (const page of definition.pages || []) {
    if (!mappedPages.has(page)) mappedPages.set(page, []);
    mappedPages.get(page).push(moduleKey);
  }
}

const missingMappings = uniqueRegisteredPages.filter((page) => !getModuleForPage(page) && !isUngatedAuthPage(page));
const staleMappings = [...mappedPages.keys()].filter((page) => !uniqueRegisteredPages.includes(page));
const allowedDuplicateMappings = new Set([
  'AuditLogs::admin,audit_logs',
  'Inventory::inventory,inventory_management',
  'OrgManagement::admin,organization_management',
  'Recipes::recipe_management,recipes',
  'UserManagement::admin,organization_management,team_members',
  'Vendors::vendor_management,vendors',
]);
const duplicateMappings = [...mappedPages.entries()].filter(([page, modules]) => {
  if (modules.length <= 1) return false;
  const signature = `${page}::${[...modules].sort().join(',')}`;
  return !allowedDuplicateMappings.has(signature);
});
const gatedSetupPages = setupPages.filter((page) => !getModuleForPage(page) && !isUngatedAuthPage(page));

if (
  duplicateRegisteredPages.length
  || canonicalPagesMissingLegacyRoute.length
  || missingMappings.length
  || staleMappings.length
  || duplicateMappings.length
  || gatedSetupPages.length
) {
  console.error('Module artifact audit failed.');
  if (duplicateRegisteredPages.length) {
    console.error(`\nDuplicate legacy route registrations (${duplicateRegisteredPages.length}):`);
    duplicateRegisteredPages.forEach((page) => console.error(`  - ${page}`));
  }
  if (canonicalPagesMissingLegacyRoute.length) {
    console.error(`\nCanonical routes missing legacy route registrations (${canonicalPagesMissingLegacyRoute.length}):`);
    canonicalPagesMissingLegacyRoute.forEach((page) => console.error(`  - ${page}`));
  }
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
  if (gatedSetupPages.length) {
    console.error(`\nSetup routes that are neither module-mapped nor explicitly ungated (${gatedSetupPages.length}):`);
    gatedSetupPages.forEach((page) => console.error(`  - ${page}`));
  }
  process.exit(1);
}

console.log(`Module artifact audit passed: ${uniqueRegisteredPages.length} registered pages, ${canonicalPages.length} canonical routes, and ${setupPages.length} setup routes covered by ${Object.keys(MODULE_DEFINITIONS).length} modules.`);
