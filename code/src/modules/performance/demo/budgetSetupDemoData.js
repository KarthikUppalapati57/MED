/**
 * Development-only Budget Setup demo dataset.
 * Used only when VITE_PERFORMANCE_DEMO === "true". Never written to the database.
 */

export const BUDGET_SETUP_DEMO_CATEGORIES = [
  'Produce',
  'Meat',
  'Seafood',
  'Dairy',
  'Bakery',
  'Beverage',
  'Frozen',
  'Dry Goods',
  'Packaging',
  'Cleaning Supplies',
];

export const BUDGET_SETUP_DEMO_LOCATIONS = [
  { id: 'demo-loc-1', name: 'Downtown' },
  { id: 'demo-loc-2', name: 'Airport' },
  { id: 'demo-loc-3', name: 'Midtown' },
];

/** Seed targets for org-wide scope (amounts only — in memory). */
export function getBudgetSetupDemoSeedTargets(periodStart, periodEnd) {
  return {
    Produce: { id: 'demo-bt-1', category: 'Produce', target_amount: 12000, period_start: periodStart, period_end: periodEnd, location_id: null },
    Meat: { id: 'demo-bt-2', category: 'Meat', target_amount: 18500, period_start: periodStart, period_end: periodEnd, location_id: null },
    Seafood: { id: 'demo-bt-3', category: 'Seafood', target_amount: 9200, period_start: periodStart, period_end: periodEnd, location_id: null },
    Dairy: { id: 'demo-bt-4', category: 'Dairy', target_amount: 6400, period_start: periodStart, period_end: periodEnd, location_id: null },
    Beverage: { id: 'demo-bt-5', category: 'Beverage', target_amount: 4100, period_start: periodStart, period_end: periodEnd, location_id: null },
    // Remaining categories intentionally have no budget configured
  };
}

export function getBudgetSetupDemoMeta() {
  return {
    demoMode: true,
    categoryCount: BUDGET_SETUP_DEMO_CATEGORIES.length,
    locationCount: BUDGET_SETUP_DEMO_LOCATIONS.length,
    note: 'Demo categories/locations for UI evaluation. Not persisted to the database.',
  };
}
