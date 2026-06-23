/**
 * LegacyRedirectHandler
 *
 * Runs once on mount and checks whether the current URL uses the old
 * ?tab= search-param pattern that existed before the routing migration.
 *
 * If a matching legacy URL is detected it issues a client-side replace
 * redirect to the new canonical nested path so that browser history
 * stays clean and existing bookmarks / shared links keep working.
 *
 * Map format:  "/Module?tab=value"  →  "/Module/subpath"
 *
 * Add new entries here whenever a module tab is migrated.
 */

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Legacy tab → canonical sub-path map
// Key:   "<pathname>:<tab-value>"
// Value: "<canonical-path>"   (absolute)
// ---------------------------------------------------------------------------
const LEGACY_REDIRECT_MAP = {
  // ── Inventory ────────────────────────────────────────────────────────────
  '/Inventory:overview':       '/Inventory/overview',
  '/Inventory:items':          '/Inventory/items',
  '/Inventory:receiving':      '/Inventory/receiving',
  '/Inventory:wastage':        '/Inventory/wastage',
  '/Inventory:adjustments':    '/Inventory/adjustments',
  '/Inventory:alerts':         '/Inventory/alerts',

  // ── Payments ─────────────────────────────────────────────────────────────
  '/Payments:ap-overview':     '/Payments/ap-overview',
  '/Payments:ap-aging':        '/Payments/ap-aging',
  '/Payments:payment-history': '/Payments/payment-history',
  '/Payments:payment-queue':   '/Payments/payment-queue',

  // ── Products ─────────────────────────────────────────────────────────────
  '/Products:products':        '/Products/products',
  '/Products:categories':      '/Products/categories',
  '/Products:units':           '/Products/units',
  '/Products:prep-list':       '/Products/prep-list',

  // ── AutoOrdering ─────────────────────────────────────────────────────────
  '/AutoOrdering:all-orders':  '/AutoOrdering/all-orders',
  '/AutoOrdering:create':      '/AutoOrdering/create',
  '/AutoOrdering:recurring':   '/AutoOrdering/recurring',
  '/AutoOrdering:history':     '/AutoOrdering/history',

  // ── Recipes ──────────────────────────────────────────────────────────────
  '/Recipes:recipes':          '/Recipes/recipes-list',
  '/Recipes:prepared-items':   '/Recipes/prepared-items',
  '/Recipes:menu-analysis':    '/Recipes/menu-analysis',
  '/Recipes:recipe-viewer':    '/Recipes/recipe-viewer',

  // ── Labor ────────────────────────────────────────────────────────────────
  '/Labor:summary':            '/Labor/summary',
  '/Labor:shifts':             '/Labor/shifts',
  '/Labor:employees':          '/Labor/employees',
  '/Labor:scheduler':          '/Labor/scheduler',

  // ── Accounting ───────────────────────────────────────────────────────────
  '/Accounting:dashboard':         '/Accounting/dashboard',
  '/Accounting:export':            '/Accounting/export',
  '/Accounting:reconciliation':    '/Accounting/reconciliation',
  '/Accounting:vendor-mapping':    '/Accounting/vendor-mapping',
  '/Accounting:gl-mapping':        '/Accounting/gl-mapping',
  '/Accounting:sales-mapping':     '/Accounting/sales-mapping',
  '/Accounting:pmix-mapping':      '/Accounting/pmix-mapping',
  '/Accounting:close-books':       '/Accounting/close-books',
  '/Accounting:period-budgets':    '/Accounting/period-budgets',
  '/Accounting:payouts':           '/Accounting/payouts',
  '/Accounting:export-queue':      '/Accounting/export-queue',

  // ── OrgManagement ────────────────────────────────────────────────────────
  '/OrgManagement:hierarchy':      '/OrgManagement/hierarchy',
  '/OrgManagement:security':       '/OrgManagement/security',
  '/OrgManagement:roles':          '/OrgManagement/roles',
  '/OrgManagement:approval':       '/OrgManagement/approval',

  // ── Vendors ──────────────────────────────────────────────────────────────
  '/Vendors:vendors':          '/Vendors/vendors',
  '/Vendors:vendor-items':     '/Vendors/vendor-items',
  '/Vendors:statements':       '/Vendors/statements',

  // ── PlatformAdmin ────────────────────────────────────────────────────────
  '/PlatformAdmin:requests':   '/PlatformAdmin/requests',
  '/PlatformAdmin:invite':     '/PlatformAdmin/invite',
  '/PlatformAdmin:ocr':        '/PlatformAdmin/ocr',
};

export default function LegacyRedirectHandler() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');

    if (!tab) return; // Nothing to redirect

    const lookupKey = `${location.pathname}:${tab}`;
    const canonical = LEGACY_REDIRECT_MAP[lookupKey];

    if (canonical) {
      // Preserve any other search params except 'tab'
      params.delete('tab');
      const remaining = params.toString();
      const target = remaining ? `${canonical}?${remaining}` : canonical;

      console.debug(`[LegacyRedirect] ${location.pathname}?tab=${tab} → ${target}`);
      navigate(target, { replace: true });
    }
    // If no mapping exists, let the page render as-is — it will show its default tab
  }, [location.pathname, location.search, navigate]);

  return null; // Render nothing
}
