/**
 * moduleConfig.js Central module registry for RBAC & multi-tenant access control
 *
 * Each module defines:
 *   - label: Display name for sidebar & UI
 *   - pages: Array of page keys from router.jsx that belong to this module
 *   - minRole: Minimum role required to access this module
 *   - icon: Lucide icon name for UI rendering
 *
 * The enabled_modules field on organizations stores which module keys an org has
 * access to based on its subscription plan.
 */

export const MODULE_DEFINITIONS = {
  dashboard: {
    label: "Dashboard",
    pages: ["Dashboard", "MobileApp", "Notifications", "Profile"],
    minRole: "ground_staff",
    icon: "LayoutDashboard",
  },
  dashboard_reports: {
    label: "Dashboard Reports",
    pages: ["DashboardReports"],
    minRole: "location_manager",
    icon: "FileBarChart",
  },
  performance: {
    label: "Performance",
    pages: ["Performance"],
    minRole: "location_manager",
    icon: "Activity",
  },
  executive_bi: {
    label: "Executive BI",
    pages: ["ExecutiveBI"],
    minRole: "org_manager",
    icon: "Activity",
  },
  custom_reports: {
    label: "Custom Reports",
    pages: ["CustomReports"],
    minRole: "manager",
    icon: "FileBarChart",
  },
  invoices: {
    label: "Invoices",
    pages: ["Invoices"],
    minRole: "ground_staff",
    icon: "FileText",
    // org_manager/tenant_super_admin/branch_manager must switch into a specific location --
    // no org/brand-wide aggregate view. location_manager/ground_staff unaffected (fixed location).
    requiresLocation: true,
  },
  payments: {
    label: "Bill Pay",
    pages: ["Payments"],
    minRole: "location_manager",
    icon: "CreditCard",
    requiresLocation: true,
  },
  billing: {
    label: "Platform Subscription",
    pages: ["Billing"],
    minRole: "org_manager",
    icon: "CreditCard",
  },
  products: {
    label: "Products",
    pages: ["Products"],
    minRole: "ground_staff",
    icon: "Package",
    // Reference catalog, but still requires an active location -- brand-shared rows
    // resolve against the caller's currently active location's brand. No exceptions.
    requiresLocation: true,
  },
  inventory_management: {
    label: "Inventory",
    pages: ["Inventory"],
    minRole: "ground_staff",
    icon: "Warehouse",
    requiresLocation: true,
  },
  inventory: {
    label: "Inventory",
    pages: ["Inventory", "AvTCosting"],
    minRole: "ground_staff",
    icon: "Warehouse",
    requiresLocation: true,
  },
  orders: {
    label: "Orders",
    pages: ["AutoOrdering"],
    minRole: "location_manager",
    icon: "ShoppingCart",
  },
  smartprep: {
    label: "SmartPrep",
    pages: ["SmartPrep"],
    minRole: "location_manager",
    icon: "ChefHat",
  },
  commissary: {
    label: "Commissary",
    pages: ["Commissary"],
    minRole: "location_manager",
    icon: "Building2",
  },
  recipe_management: {
    label: "Recipes",
    pages: ["Recipes"],
    minRole: "location_manager",
    icon: "ChefHat",
    requiresLocation: true,
  },
  recipes: {
    label: "Recipes",
    pages: ["Recipes", "MenuEngineering", "DeliveryAggregator"],
    minRole: "location_manager",
    icon: "ChefHat",
    requiresLocation: true,
  },
  vendor_management: {
    label: "Vendors",
    pages: ["Vendors"],
    minRole: "location_manager",
    icon: "Store",
    requiresLocation: true,
  },
  vendors: {
    label: "Vendors",
    pages: ["Vendors", "VendorBidding"],
    minRole: "location_manager",
    icon: "Store",
    requiresLocation: true,
  },
  labor: {
    label: "Labor",
    pages: ["Labor", "LaborSchedules", "TimeClock", "TipPooling", "PayrollExport", "ShiftBoard"],
    minRole: "location_manager",
    icon: "Users",
  },
  accounting: {
    label: "Accounting",
    pages: ["Accounting"],
    minRole: "org_manager",
    icon: "DollarSign",
  },
  organization_management: {
    label: "Organization Management",
    pages: ["OrgManagement"],
    minRole: "org_manager",
    icon: "Building2",
  },
  audit_logs: {
    label: "Audit Logs",
    pages: ["AuditLogs"],
    minRole: "org_manager",
    icon: "ClipboardList",
  },
  admin: {
    label: "Organization Admin",
    pages: ["UserManagement", "OrgManagement", "AuditLogs", "FranchisorConsole"],
    minRole: "org_manager",
    icon: "Users",
  },
  setup: {
    label: "Setup",
    pages: ["RestaurantSetup"],
    minRole: "location_manager",
    icon: "Settings",
  },
  food_safety: {
    label: "Food Safety",
    pages: ["FoodSafety"],
    minRole: "manager",
    icon: "ShieldCheck",
  },
  kitchen_displays: {
    label: "Kitchen Displays",
    pages: ["KDS", "DigitalMenu"],
    minRole: "ground_staff",
    icon: "Monitor",
    // Unlike other modules, this has no meaningful multi-location view -- a kitchen
    // display can't show "every location's orders at once". Checked by ProtectedModule.
    requiresLocation: true,
  },
  integrations: {
    label: "Integrations",
    pages: ["Integrations", "DeveloperPortal"],
    minRole: "org_manager",
    icon: "Settings",
  },
  crm_marketing: {
    label: "CRM & Marketing",
    pages: ["CRM"],
    minRole: "location_manager",
    icon: "MessagesSquare",
  },
  ai_insights: {
    label: "AI Insights",
    pages: ["AiInsights"],
    minRole: "manager",
    icon: "Sparkles",
  },
  platform: {
    label: "Platform Console",
    pages: [
      "PlatformAdmin",
      "PlatformOrganizations",
      "PlatformUserManagement",
      "PlatformUsers",
      "PlatformPlans",
      "PlatformInvoices",
      "PlatformAuditLogs",
      "AuditVault",
    ],
    minRole: "platform_admin",
    icon: "Shield",
  },
};

export const ALL_MODULE_KEYS = Object.keys(MODULE_DEFINITIONS);

// These authenticated setup routes are handled by App.jsx state gates before the
// normal module router. They are not subscription modules.
const UNGATED_AUTH_PAGES = new Set(["BusinessVerification", "CompleteOnboarding", "OnboardingPage"]);

// Core modules that are always accessible regardless of subscription plan.
const CORE_MODULE_KEYS = ["dashboard", "setup"];

function normalizePageName(pageName) {
  if (!pageName) return "";
  return String(pageName).split(/[/?#]/)[0];
}

export function isUngatedAuthPage(pageName) {
  return UNGATED_AUTH_PAGES.has(normalizePageName(pageName));
}

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
    const mod = MODULE_DEFINITIONS[String(moduleKey).toLowerCase()];
    if (mod) mod.pages.forEach(p => pages.add(p));
  });
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
 * - Only explicitly ungated setup pages are allowed outside module mapping
 * - Core modules are always allowed
 * - Operational modules require explicit inclusion
 */
export function isPageInEnabledModules(pageName, enabledModules, userRole) {
  const moduleInfo = getModuleForPage(pageName);
  if (!moduleInfo) return isUngatedAuthPage(pageName);
  if (CORE_MODULE_KEYS.includes(moduleInfo.key)) return true;
  const modulesList = enabledModules || [];
  const normalizedList = modulesList.map(m => String(m).toLowerCase());
  return normalizedList.includes(moduleInfo.key.toLowerCase());
}

/**
 * Reverse lookup: Given a page name, route path, or module key, find the module.
 * Returns { key, label, pages, minRole, icon } or null if not found.
 */
export function getModuleForPage(pageName) {
  const normalized = normalizePageName(pageName);
  const directModule = MODULE_DEFINITIONS[normalized.toLowerCase()];
  if (directModule) return { key: normalized.toLowerCase(), ...directModule };

  for (const [key, mod] of Object.entries(MODULE_DEFINITIONS)) {
    if (mod.pages.includes(normalized)) return { key, ...mod };
  }
  return null;
}

/**
 * Given a plan's features (array of module keys), returns the list of included modules.
 */
export function getModulesForPlan(planFeatures) {
  if (!planFeatures || planFeatures.length === 0) return [];
  return planFeatures
    .filter(key => MODULE_DEFINITIONS[key])
    .map(key => ({ key, ...MODULE_DEFINITIONS[key] }));
}
