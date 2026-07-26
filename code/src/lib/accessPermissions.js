export const PERMISSION_ACTIONS = [
  { key: 'read', label: 'Read' },
  { key: 'write', label: 'Write' },
  { key: 'update', label: 'Update' },
];

export const MODULE_PERMISSION_OPTIONS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'payments', label: 'Payments' },
  { key: 'products', label: 'Products' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'orders', label: 'Orders' },
  { key: 'recipes', label: 'Recipes' },
  { key: 'vendors', label: 'Vendors' },
  { key: 'performance', label: 'Performance' },
  { key: 'accounting', label: 'Accounting' },
  { key: 'admin', label: 'Admin' },
];

const MANAGER_MODULES = ['dashboard', 'invoices', 'payments', 'products', 'inventory', 'orders', 'recipes', 'vendors', 'performance', 'accounting'];
const STAFF_MODULES = ['dashboard', 'invoices', 'inventory'];

function actions(read = false, write = false, update = false) {
  return { read, write, update };
}

export function defaultPermissionMatrix(role = 'ground_staff') {
  const matrix = Object.fromEntries(MODULE_PERMISSION_OPTIONS.map(({ key }) => [key, actions(false, false, false)]));
  const grant = (modules, value) => modules.forEach((moduleKey) => { matrix[moduleKey] = { ...value }; });

  if (['platform_admin', 'tenant_super_admin', 'org_manager'].includes(role)) {
    grant(MODULE_PERMISSION_OPTIONS.map(({ key }) => key), actions(true, true, true));
  } else if (role === 'branch_manager') {
    grant(MANAGER_MODULES, actions(true, true, true));
  } else if (role === 'location_manager') {
    grant(MANAGER_MODULES, actions(true, true, true));
    matrix.accounting = actions(true, false, false);
  } else {
    grant(STAFF_MODULES, actions(true, false, false));
    matrix.invoices = actions(true, true, false);
    matrix.inventory = actions(true, true, true);
  }

  return matrix;
}

export function normalizePermissionMatrix(value, fallbackRole = 'ground_staff') {
  const fallback = defaultPermissionMatrix(fallbackRole);
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  return Object.fromEntries(MODULE_PERMISSION_OPTIONS.map(({ key }) => {
    const moduleValue = source[key] && typeof source[key] === 'object' ? source[key] : {};
    return [key, {
      read: Boolean(moduleValue.read ?? fallback[key]?.read),
      write: Boolean(moduleValue.write ?? fallback[key]?.write),
      update: Boolean(moduleValue.update ?? fallback[key]?.update),
    }];
  }));
}

export function enabledModulesFromPermissions(matrix) {
  return MODULE_PERMISSION_OPTIONS
    .filter(({ key }) => Object.values(matrix?.[key] || {}).some(Boolean))
    .map(({ key }) => key);
}
