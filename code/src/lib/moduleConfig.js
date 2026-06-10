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
  recipes:    { label: "Recipes",         pages: ["Recipes", "MenuEngineering"], minRole: "location_manager", icon: "ChefHat" },
  vendors:    { label: "Vendors",         pages: ["Vendors"],                                    minRole: "location_manager", icon: "Store" },
  admin:      { label: "Admin",           pages: ["UserManagement", "OrgManagement", "AuditLogs"], minRole: "location_manager", icon: "Users" },
  integrations: { label: "Integrations",  pages: ["Integrations", "DeveloperPortal"], minRole: "org_owner", icon: "Settings" },
  performance:{ label: "Performance",     pages: ["Performance"], minRole: "manager", icon: "Activity" },
  platform:   { label: "Platform Admin",  pages: ["PlatformAdmin", "PlatformOrganizations", "PlatformUserManagement", "PlatformUsers", "PlatformPlans", "PlatformInvoices", "PlatformAuditLogs"], minRole: "platform_admin", icon: "Shield" },
  accounting: { label: "Accounting",      pages: ["Accounting"], minRole: "org_owner", icon: "DollarSign" },
  setup:      { label: "Setup",            pages: ["RestaurantSetup"], minRole: "location_manager", icon: "Settings" },
};

export const ALL_MODULE_KEYS = Object.keys(MODULE_DEFINITIONS);

// Core modules that are ALWAYS accessible regardless of subscription plan.
// These are non-revenue operational essentials.
const CORE_MODULE_KEYS = ['dashboard', 'admin'];

/**
 * Returns the Set of page names that are enabled for the given module list.
 * FAIL-CLOSED: If enabledModules is null/empty, only core module pages are returned.
 */
export function getEnabledPages(enabledModules) {
  const modulesList = (enabledModules && enabledModules.length > 0)
    ? enabledModules
    : CORE_MODULE_KEYS;
  const pages = new Set();
  modulesList.forEach(moduleKey => {
    const mod = MODULE_DEFINITIONS[moduleKey];
    if (mod) mod.pages.forEach(p => pages.add(p));
  });
  // Always include core module pages even if not explicitly listed
  CORE_MODULE_KEYS.forEach(key => {
    const mod = MODULE_DEFINITIONS[key];
    if (mod) mod.pages.forEach(p => pages.add(p));
  });
  return pages;
}

/**
 * Checks if a specific page is enabled given the org's enabled module list.
 * 
 * FAIL-CLOSED (secure-by-default):
 *   - Ungated pages (not in any module, e.g. Onboarding) → allowed
 *   - Core modules (dashboard, admin) → always allowed
 *   - Operational modules → ONLY allowed if explicitly in enabledModules
 */
export function isPageInEnabledModules(pageName, enabledModules) {
  const moduleInfo = getModuleForPage(pageName);
  // Ungated pages (not assigned to any module) are always allowed
  if (!moduleInfo) return true;
  // Core modules are always allowed
  if (CORE_MODULE_KEYS.includes(moduleInfo.key)) return true;
  // Operational modules: require explicit inclusion
  const modulesList = enabledModules || [];
  return modulesList.includes(moduleInfo.key);
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
