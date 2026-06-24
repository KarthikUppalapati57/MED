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
  performance: {
    label: "Performance",
    pages: ["Performance"],
    minRole: "location_manager",
    icon: "Activity",
  },
  executive_bi: {
    label: "Executive BI",
    pages: ["ExecutiveBI"],
    minRole: "org_owner",
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
  },
  payments: {
    label: "Bill Pay",
    pages: ["Payments"],
    minRole: "location_manager",
    icon: "CreditCard",
  },
  billing: {
    label: "Platform Subscription",
    pages: ["Billing"],
    minRole: "org_owner",
    icon: "CreditCard",
  },
  products: {
    label: "Products",
    pages: ["Products"],
    minRole: "ground_staff",
    icon: "Package",
  },
  inventory: {
    label: "Inventory",
    pages: ["Inventory", "AvTCosting"],
    minRole: "ground_staff",
    icon: "Warehouse",
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
  recipes: {
    label: "Recipes",
    pages: ["Recipes", "MenuEngineering", "DeliveryAggregator", "OrderOnline"],
    minRole: "location_manager",
    icon: "ChefHat",
  },
  vendors: {
    label: "Vendors",
    pages: ["Vendors", "VendorBidding"],
    minRole: "location_manager",
    icon: "Store",
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
    minRole: "org_owner",
    icon: "DollarSign",
  },
  admin: {
    label: "Organization Admin",
    pages: ["UserManagement", "OrgManagement", "AuditLogs", "FranchisorConsole"],
    minRole: "org_owner",
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
  },
  integrations: {
    label: "Integrations",
    pages: ["Integrations", "DeveloperPortal"],
    minRole: "org_owner",
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
const UNGATED_AUTH_PAGES = new Set(["OnboardingPage", "PaymentVerification"]);

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
 * - Org owners bypass subscription module restrictions
 * - Operational modules require explicit inclusion
 */
export function isPageInEnabledModules(pageName, enabledModules, userRole) {
  const moduleInfo = getModuleForPage(pageName);
  if (!moduleInfo) return isUngatedAuthPage(pageName);
  if (CORE_MODULE_KEYS.includes(moduleInfo.key)) return true;
  if (userRole === "org_owner") return true;
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