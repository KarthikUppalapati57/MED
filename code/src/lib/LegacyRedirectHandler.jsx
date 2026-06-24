/**
 * LegacyRedirectHandler
 *
 * Converts old /Module?tab=value URLs into the current nested route shape.
 * This keeps bookmarks, notifications, and older dashboard links from opening a
 * module on its default tab by accident.
 */

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const LEGACY_REDIRECT_MAP = {
  // Inventory
  '/Inventory:inventory': '/Inventory/inventory-list',
  '/Inventory:inventory-list': '/Inventory/inventory-list',
  '/Inventory:overview': '/Inventory/summary',
  '/Inventory:summary': '/Inventory/summary',
  '/Inventory:receiving': '/Inventory/receiving',
  '/Inventory:avt': '/Inventory/avt',
  '/Inventory:pos-sync': '/Inventory/pos-sync',
  '/Inventory:transfers': '/Inventory/transfers',
  '/Inventory:wastage': '/Inventory/wastage-log',
  '/Inventory:wastage-log': '/Inventory/wastage-log',
  '/Inventory:counts': '/Inventory/counts',
  '/Inventory:count-sheets': '/Inventory/count-sheets',
  '/Inventory:waste-summary': '/Inventory/waste-summary',
  '/Inventory:daily-snapshot': '/Inventory/daily-snapshot',
  '/Inventory:hardware-setup': '/Inventory/hardware-setup',

  // Payments
  '/Payments:invoices': '/Payments/invoices',
  '/Payments:payment-queue': '/Payments/invoices',
  '/Payments:payable-queue': '/Payments/invoices',
  '/Payments:schedule': '/Payments/schedule',
  '/Payments:scheduled-payments': '/Payments/schedule',
  '/Payments:history': '/Payments/history',
  '/Payments:payment-history': '/Payments/history',
  '/Payments:reconciliation': '/Payments/reconciliation',
  '/Payments:setup': '/Payments/setup',
  '/Payments:gateway-setup': '/Payments/setup',
  '/Payments:subscription': '/Payments/subscription',

  // Products
  '/Products:products': '/Products/all-products',
  '/Products:all-products': '/Products/all-products',
  '/Products:catalog': '/Products/all-products',
  '/Products:master-catalog': '/Products/all-products',
  '/Products:ai-verification': '/Products/ai-verification',
  '/Products:new-review': '/Products/ai-verification',
  '/Products:price-variances': '/Products/price-variances',
  '/Products:purchase-report': '/Products/purchase-report',

  // Orders
  '/AutoOrdering:all-orders': '/AutoOrdering/all-orders',
  '/AutoOrdering:purchase-order': '/AutoOrdering/all-orders',
  '/AutoOrdering:create': '/AutoOrdering/place-order',
  '/AutoOrdering:place-order': '/AutoOrdering/place-order',
  '/AutoOrdering:invoice-approval': '/AutoOrdering/invoice-approval',
  '/AutoOrdering:transfers': '/AutoOrdering/transfers',
  '/AutoOrdering:receiving': '/AutoOrdering/receiving',
  '/AutoOrdering:order-setup': '/AutoOrdering/order-setup',

  // Recipes
  '/Recipes:recipes': '/Recipes/recipes-list',
  '/Recipes:recipes-list': '/Recipes/recipes-list',
  '/Recipes:prepared-items': '/Recipes/prepared-items',
  '/Recipes:menu-analysis': '/Recipes/menu-analysis',
  '/Recipes:setup': '/Recipes/setup',

  // Labor
  '/Labor:summary': '/Labor/summary',
  '/Labor:shifts': '/Labor/shifts',
  '/Labor:employees': '/Labor/employees',
  '/Labor:setup': '/Labor/setup',

  // Accounting
  '/Accounting:dashboard': '/Accounting/dashboard',
  '/Accounting:export': '/Accounting/export',
  '/Accounting:bill-pay': '/Accounting/bill-pay',
  '/Accounting:reconciliation': '/Accounting/reconciliation',
  '/Accounting:gl-mapping': '/Accounting/gl-mapping',
  '/Accounting:sales-mapping': '/Accounting/sales-mapping',
  '/Accounting:export-queue': '/Accounting/export-queue',
  '/Accounting:vendor-mapping': '/Accounting/vendor-mapping',
  '/Accounting:pmix-mapping': '/Accounting/pmix-mapping',
  '/Accounting:payment-accounts': '/Accounting/payment-accounts',
  '/Accounting:budgets': '/Accounting/budgets',
  '/Accounting:period-budgets': '/Accounting/budgets',
  '/Accounting:close-books': '/Accounting/close-books',

  // Organization settings
  '/OrgManagement:hierarchy': '/OrgManagement/hierarchy',
  '/OrgManagement:groups': '/OrgManagement/groups',
  '/OrgManagement:security': '/OrgManagement/security',
  '/OrgManagement:roles': '/OrgManagement/roles',
  '/OrgManagement:approvals': '/OrgManagement/approvals',
  '/OrgManagement:approval': '/OrgManagement/approvals',

  // Vendors
  '/Vendors:vendors': '/Vendors/vendors',
  '/Vendors:vendor-items': '/Vendors/vendor-items',
  '/Vendors:statements': '/Vendors/statements',

  // Platform console
  '/PlatformAdmin:requests': '/PlatformAdmin/requests',
  '/PlatformAdmin:invite': '/PlatformAdmin/invite',
  '/PlatformAdmin:accounting': '/PlatformAdmin/accounting',
  '/PlatformAdmin:tenant-migration': '/PlatformAdmin/tenant-migration',
  '/PlatformAdmin:ocr': '/PlatformAdmin/ocr',
};

export default function LegacyRedirectHandler() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (!tab) return;

    const lookupKey = `${location.pathname}:${tab}`;
    const canonical = LEGACY_REDIRECT_MAP[lookupKey];
    if (!canonical) return;

    params.delete('tab');
    const remaining = params.toString();
    const target = remaining ? `${canonical}?${remaining}` : canonical;
    navigate(target, { replace: true });
  }, [location.pathname, location.search, navigate]);

  return null;
}