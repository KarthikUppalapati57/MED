/**
 * Development-only Location Benchmarking demo dataset.
 * Used only when VITE_PERFORMANCE_DEMO === "true". Never written to the database.
 */

const CATEGORIES = [
  'Produce', 'Meat', 'Seafood', 'Dairy', 'Bakery', 'Beverage',
  'Frozen', 'Dry Goods', 'Packaging', 'Cleaning Supplies',
];

const LOCATIONS = [
  { id: 'demo-loc-1', name: 'Downtown', tier: 'flagship' },
  { id: 'demo-loc-2', name: 'Airport', tier: 'high-volume' },
  { id: 'demo-loc-3', name: 'Midtown', tier: 'standard' },
  { id: 'demo-loc-4', name: 'Suburban', tier: 'standard' },
  { id: 'demo-loc-5', name: 'Waterfront', tier: 'seasonal' },
];

function createRng(seed = 51) {
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

function buildLocationRows() {
  const rng = createRng(66);
  const baselineCost = 42.5;

  return LOCATIONS.map((loc, idx) => {
    const costPerLocation = round(baselineCost * (0.82 + idx * 0.06 + rng() * 0.18), 2);
    const spend = round(28000 + rng() * 52000);
    const inventoryValue = round(spend * (0.35 + rng() * 0.25));
    const paymentCompletionPct = round(78 + rng() * 20, 1);
    const recipeCoveragePct = round(62 + rng() * 35, 1);
    const variancePct = round(((costPerLocation - baselineCost) / baselineCost) * 100, 1);

    return {
      locationId: loc.id,
      location: loc.name,
      tier: loc.tier,
      spend,
      inventoryValue,
      costPerLocation,
      paymentCompletionPct,
      recipeCoveragePct,
      variancePct,
      invoiceCount: 45 + Math.floor(rng() * 80),
      productCount: 120 + Math.floor(rng() * 200),
      efficiencyScore: round(100 - Math.abs(variancePct) * 1.2 - (100 - paymentCompletionPct) * 0.3 - (100 - recipeCoveragePct) * 0.2, 1),
    };
  });
}

const LOCATION_ROWS = buildLocationRows();

export function getLocationBenchmarkingDemoData(params = {}) {
  let rows = [...LOCATION_ROWS];

  if (params.locationIds?.length) {
    rows = rows.filter((r) => params.locationIds.includes(r.locationId));
  }

  const sortedByCost = [...rows].sort((a, b) => a.costPerLocation - b.costPerLocation);
  const best = sortedByCost[0];
  const worst = sortedByCost[sortedByCost.length - 1];
  const avgVariancePct = rows.length
    ? round(rows.reduce((s, r) => s + r.variancePct, 0) / rows.length, 1)
    : 0;

  const locationCostComparison = rows.map((r) => ({
    location: r.location,
    locationId: r.locationId,
    spend: r.spend,
    costPerLocation: r.costPerLocation,
    inventoryValue: r.inventoryValue,
    variancePct: r.variancePct,
  }));

  const categoryCostByLocation = [];
  const rng = createRng(77);
  for (const cat of CATEGORIES.slice(0, 6)) {
    for (const loc of rows) {
      categoryCostByLocation.push({
        category: cat,
        location: loc.location,
        locationId: loc.locationId,
        costPerUnit: round(8 + rng() * 24 + loc.variancePct * 0.15, 2),
        spend: round(800 + rng() * 4200 + Math.abs(loc.variancePct) * 40),
      });
    }
  }

  const efficiencyRanking = [...rows]
    .sort((a, b) => b.efficiencyScore - a.efficiencyScore)
    .map((r, idx) => ({
      rank: idx + 1,
      location: r.location,
      locationId: r.locationId,
      efficiencyScore: r.efficiencyScore,
      costPerLocation: r.costPerLocation,
      paymentCompletionPct: r.paymentCompletionPct,
      recipeCoveragePct: r.recipeCoveragePct,
    }));

  const highestVariance = [...rows].sort((a, b) => b.variancePct - a.variancePct)[0];

  return {
    summary: {
      locationsCompared: rows.length,
      bestCostPerLocation: best
        ? { location: best.location, costPerLocation: best.costPerLocation }
        : null,
      worstCostPerLocation: worst
        ? { location: worst.location, costPerLocation: worst.costPerLocation }
        : null,
      avgVariancePct,
      totalSpend: round(rows.reduce((s, r) => s + r.spend, 0)),
      avgPaymentCompletionPct: rows.length
        ? round(rows.reduce((s, r) => s + r.paymentCompletionPct, 0) / rows.length, 1)
        : 0,
      avgRecipeCoveragePct: rows.length
        ? round(rows.reduce((s, r) => s + r.recipeCoveragePct, 0) / rows.length, 1)
        : 0,
    },
    locationCostComparison,
    categoryCostByLocation,
    efficiencyRanking,
    tableRows: rows.sort((a, b) => b.spend - a.spend),
    insights: [
      {
        id: 'locations-compared',
        impact: rows.length,
        text: `Benchmarking ${rows.length} locations across Invoice, Inventory, Products, Payments, and Recipes data.`,
      },
      {
        id: 'best-worst',
        impact: best && worst ? round(worst.costPerLocation - best.costPerLocation) : 0,
        text: best && worst
          ? `${best.location} has the lowest cost/location ($${best.costPerLocation.toFixed(2)}); ${worst.location} is highest at $${worst.costPerLocation.toFixed(2)} — a $${round(worst.costPerLocation - best.costPerLocation).toFixed(2)} gap.`
          : 'Insufficient location data for comparison.',
      },
      {
        id: 'variance',
        impact: avgVariancePct,
        text: `Average variance from org baseline is ${avgVariancePct >= 0 ? '+' : ''}${avgVariancePct}% — ${Math.abs(avgVariancePct) > 10 ? 'investigate outlier locations' : 'within expected range'}.`,
      },
      {
        id: 'highest-variance',
        impact: highestVariance?.variancePct || 0,
        text: highestVariance
          ? `${highestVariance.location} shows the highest cost variance (+${highestVariance.variancePct}%) with ${highestVariance.recipeCoveragePct}% recipe coverage — recipe gaps may inflate food cost.`
          : 'No variance outliers detected.',
      },
    ],
    metadata: {
      currency: 'USD',
      timezone: params.timezone || 'UTC',
      dataFreshness: '2026-07-20 18:00',
      demoMode: true,
      modules: ['Invoice', 'Inventory', 'Products', 'Payments', 'Recipes'],
      filterOptions: {
        categories: CATEGORIES,
        locations: LOCATIONS,
      },
    },
  };
}
