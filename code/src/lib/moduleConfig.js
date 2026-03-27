export const MODULE_DEFINITIONS = {
  dashboard:      { label: "Dashboard",         pages: ["Dashboard"] },
  invoices:       { label: "Invoices",          pages: ["Invoices"] },
  inventory:      { label: "Inventory",         pages: ["Inventory"] },
  recipes:        { label: "Recipes",           pages: ["Recipes"] },
  admin:          { label: "Admin",              pages: ["SuperAdmin", "Stakeholders", "OrgSettings", "UserManagement"] },
};

export const ALL_MODULE_KEYS = Object.keys(MODULE_DEFINITIONS);

export function getEnabledPages(enabledModules) {
  if (!enabledModules || enabledModules.length === 0) return null;
  const pages = new Set();
  enabledModules.forEach(moduleKey => {
    const mod = MODULE_DEFINITIONS[moduleKey];
    if (mod) mod.pages.forEach(p => pages.add(p));
  });
  return pages;
}

export function isPageInEnabledModules(pageName, enabledModules) {
  const pages = getEnabledPages(enabledModules);
  if (pages === null) return true;
  return pages.has(pageName);
}
