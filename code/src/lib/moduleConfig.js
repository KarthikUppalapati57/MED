/**
 * moduleConfig.js — Central module registry for RBAC & multi-tenant access control
 * 
 * Each module defines:
 *   - label: Display name for sidebar & UI
 *   - pages: Array of page keys (from pages.config.js) that belong to this module
 *   - minRole: Minimum role required to access this module
 *   - icon: Lucide icon name for UI rendering
 * 
 * The enabled_modules field on the organizations table (jsonb array)
 * stores which module keys an org has access to based on their subscription plan.
 */

export const MODULE_DEFINITIONS = {
  dashboard:  { label: "Dashboard",       pages: ["Dashboard"],                                  minRole: "ground_staff",     icon: "LayoutDashboard" },
  invoices:   { label: "Invoices",        pages: ["Invoices"],                                   minRole: "ground_staff",     icon: "FileText" },
  payments:   { label: "Bill Pay",        pages: ["Payments"],                                   minRole: "location_manager", icon: "CreditCard" },
  products:   { label: "Products",        pages: ["Products"],                                   minRole: "ground_staff",     icon: "Package" },
  inventory:  { label: "Inventory",       pages: ["Inventory"],                                  minRole: "ground_staff",     icon: "Warehouse" },
  orders:     { label: "Orders",          pages: ["AutoOrdering"],                               minRole: "location_manager", icon: "ShoppingCart" },
  recipes:    { label: "Recipes",         pages: ["Recipes"],                                    minRole: "location_manager", icon: "ChefHat" },
  vendors:    { label: "Vendors",         pages: ["Vendors"],                                    minRole: "location_manager", icon: "Store" },
  admin:      { label: "Admin",           pages: ["UserManagement", "OrgManagement", "AuditLogs"], minRole: "location_manager", icon: "Users" },
  platform:   { label: "Platform Admin",  pages: ["PlatformAdmin"],                              minRole: "platform_admin",   icon: "Shield" },
};

export const ALL_MODULE_KEYS = Object.keys(MODULE_DEFINITIONS);

/**
 * Returns the Set of page names that are enabled for the given module list.
 * If enabledModules is null/empty, returns null (meaning "all pages allowed").
 */
export function getEnabledPages(enabledModules) {
  if (!enabledModules || enabledModules.length === 0) return null;
  const pages = new Set();
  enabledModules.forEach(moduleKey => {
    const mod = MODULE_DEFINITIONS[moduleKey];
    if (mod) mod.pages.forEach(p => pages.add(p));
  });
  return pages;
}

/**
 * Checks if a specific page is enabled given the org's enabled module list.
 * Returns true if enabledModules is empty (no restrictions) or if the page is found.
 */
export function isPageInEnabledModules(pageName, enabledModules) {
  const pages = getEnabledPages(enabledModules);
  if (pages === null) return true;
  return pages.has(pageName);
}

/**
 * Reverse lookup: Given a page name, find the module it belongs to.
 * Returns { key, label, pages, minRole, icon } or null if not found.
 */
export function getModuleForPage(pageName) {
  for (const [key, mod] of Object.entries(MODULE_DEFINITIONS)) {
    if (mod.pages.includes(pageName)) return { key, ...mod };
  }
  return null;
}

/**
 * Given a plan's features (array of module keys), returns the list of
 * module definitions that are included.
 */
export function getModulesForPlan(planFeatures) {
  if (!planFeatures || planFeatures.length === 0) return [];
  return planFeatures
    .filter(key => MODULE_DEFINITIONS[key])
    .map(key => ({ key, ...MODULE_DEFINITIONS[key] }));
}
