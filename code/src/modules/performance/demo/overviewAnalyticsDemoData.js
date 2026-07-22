/**
 * Development-only Overview Analytics demo dataset.
 * Used only when VITE_PERFORMANCE_DEMO === "true". Never written to the database.
 */

const CATEGORIES = [
  'Produce', 'Meat', 'Seafood', 'Dairy', 'Bakery', 'Beverage',
  'Frozen', 'Dry Goods', 'Packaging', 'Cleaning Supplies',
];

const VENDORS = [
  'Sysco Metro', 'US Foods East', 'Gordon Food Service', 'FreshPoint Produce',
  'Prime Cut Meats', 'Coastal Catch', 'Dairy Farmers Co-op', 'Pantry Wholesale',
];

const LOCATIONS = [
  { id: 'demo-loc-1', name: 'Downtown' },
  { id: 'demo-loc-2', name: 'Airport' },
  { id: 'demo-loc-3', name: 'Midtown' },
  { id: 'demo-loc-4', name: 'Suburban' },
];

const MODULES = [
  { key: 'Invoice', label: 'Invoice', color: '#0f766e' },
  { key: 'Inventory', label: 'Inventory', color: '#b45309' },
  { key: 'Products', label: 'Products', color: '#1d4ed8' },
  { key: 'Payments', label: 'Payments', color: '#be123c' },
  { key: 'Recipes', label: 'Recipes', color: '#7c3aed' },
];

function createRng(seed = 33) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function round(n, d = 2) {
  const f = 10 ** d;
  return Math.round(Number(n) * f) / f;
}

function buildCostDrivers() {
  const rng = createRng(44);
  const drivers = [];

  CATEGORIES.forEach((category, idx) => {
    const vendor = VENDORS[idx % VENDORS.length];
    const vendorId = `demo-v-${(idx % VENDORS.length) + 1}`;
    const amount = round(4200 + rng() * 18000);
    const changePct = round((rng() - 0.35) * 28, 1);
    drivers.push({
      id: `driver-${idx + 1}`,
      category,
      vendor,
      vendorId,
      driver: `${category} — ${vendor}`,
      amount,
      changePct,
      changeAmount: round(amount * (changePct / 100) / (1 + changePct / 100)),
      module: MODULES[idx % MODULES.length].key,
      trendStatus: changePct > 5 ? 'increasing' : changePct < -3 ? 'decreasing' : 'stable',
      lastActivity: `2026-07-${String(12 + (idx % 8)).padStart(2, '0')}`,
    });
  });

  return drivers.sort((a, b) => b.amount - a.amount);
}

const COST_DRIVERS = buildCostDrivers();

export function getOverviewAnalyticsDemoData(params = {}) {
  let locations = [...LOCATIONS];
  if (params.locationIds?.length) {
    locations = locations.filter((l) => params.locationIds.includes(l.id));
  }

  const rng = createRng(88);
  const totalPurchases = round(185000 + rng() * 42000);
  const inventoryValue = round(92000 + rng() * 28000);
  const paymentsOutstanding = round(34000 + rng() * 16000);
  const recipeCostExposure = round(48000 + rng() * 12000);

  const spendTrend = Array.from({ length: 8 }, (_, i) => ({
    bucket: `W${i + 1}`,
    bucketStart: `2026-06-${String(i * 7 + 1).padStart(2, '0')}`,
    spend: round(totalPurchases / 8 * (0.85 + rng() * 0.3)),
    inventoryValue: round(inventoryValue * (0.92 + rng() * 0.16)),
    paymentsOutstanding: round(paymentsOutstanding * (0.88 + rng() * 0.24)),
  }));

  const moduleMix = MODULES.map((m, idx) => {
    const spend = round(
      idx === 0 ? totalPurchases * 0.38 :
      idx === 1 ? inventoryValue * 0.55 :
      idx === 2 ? totalPurchases * 0.12 :
      idx === 3 ? paymentsOutstanding * 1.1 :
      recipeCostExposure * 0.85
    );
    return { module: m.label, moduleKey: m.key, spend, color: m.color };
  });
  const moduleTotal = moduleMix.reduce((s, m) => s + m.spend, 0);
  moduleMix.forEach((m) => {
    m.percentage = moduleTotal ? round((m.spend / moduleTotal) * 100, 1) : 0;
  });

  const locationSpendComparison = locations.map((loc, idx) => ({
    location: loc.name,
    locationId: loc.id,
    spend: round(totalPurchases / locations.length * (0.75 + idx * 0.12 + rng() * 0.15)),
    inventoryValue: round(inventoryValue / locations.length * (0.8 + rng() * 0.4)),
    paymentsOutstanding: round(paymentsOutstanding / locations.length * (0.7 + rng() * 0.5)),
  }));

  let tableRows = [...COST_DRIVERS];
  if (params.categoryNames?.length) {
    tableRows = tableRows.filter((r) => params.categoryNames.includes(r.category));
  }
  if (params.vendorIds?.length) {
    tableRows = tableRows.filter((r) => params.vendorIds.includes(r.vendorId));
  }

  const topDriver = tableRows[0];
  const risingDrivers = tableRows.filter((r) => r.changePct > 8).length;

  return {
    summary: {
      totalPurchases,
      inventoryValue,
      paymentsOutstanding,
      recipeCostExposure,
      activeModules: MODULES.length,
      locationCount: locations.length,
      costDriverCount: tableRows.length,
      previousTotalPurchases: round(totalPurchases * 0.94),
      purchaseChangePct: round(((totalPurchases - totalPurchases * 0.94) / (totalPurchases * 0.94)) * 100, 1),
    },
    spendTrend,
    moduleMix,
    locationSpendComparison,
    tableRows,
    insights: [
      {
        id: 'purchases-total',
        impact: totalPurchases,
        text: `Total purchasing spend is $${totalPurchases.toLocaleString()} across Invoice, Inventory, Products, Payments, and Recipes modules.`,
      },
      {
        id: 'top-driver',
        impact: topDriver?.amount || 0,
        text: topDriver
          ? `${topDriver.category} spend via ${topDriver.vendor} is the largest cost driver at $${topDriver.amount.toLocaleString()} (${topDriver.changePct >= 0 ? '+' : ''}${topDriver.changePct}% vs prior).`
          : 'No cost drivers match the current filters.',
      },
      {
        id: 'payments-outstanding',
        impact: paymentsOutstanding,
        text: `$${paymentsOutstanding.toLocaleString()} in payments outstanding — review Payments module for overdue vendor balances.`,
      },
      {
        id: 'rising-drivers',
        impact: risingDrivers,
        text: `${risingDrivers} category/vendor cost drivers increased more than 8% period-over-period; prioritize price review in Price Movers.`,
      },
    ],
    metadata: {
      currency: 'USD',
      timezone: params.timezone || 'UTC',
      dataFreshness: '2026-07-20 18:00',
      demoMode: true,
      modules: MODULES.map((m) => m.key),
      filterOptions: {
        categories: CATEGORIES,
        locations: LOCATIONS,
        vendors: VENDORS.map((name, idx) => ({ id: `demo-v-${idx + 1}`, name })),
      },
    },
  };
}
