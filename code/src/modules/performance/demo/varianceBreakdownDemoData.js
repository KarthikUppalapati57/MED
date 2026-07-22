/**
 * Development-only Variance Breakdown demo dataset.
 * Explainable purchasing/usage variance — not POS sales. Never written to the database.
 */

const CATEGORIES = [
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

const LOCATIONS = [
  { id: 'demo-loc-1', name: 'Downtown' },
  { id: 'demo-loc-2', name: 'Airport' },
  { id: 'demo-loc-3', name: 'Midtown' },
];

const MODULES = ['Invoice', 'Inventory', 'Products', 'Recipes'];

function createRng(seed = 73) {
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

function buildDriverRows(rng) {
  return CATEGORIES.map((category, idx) => {
    const priceVar = round((rng() - 0.35) * 4200);
    const volumeVar = round((rng() - 0.4) * 3800);
    const mixOtherVar = round((rng() - 0.5) * 900);
    const total = round(priceVar + volumeVar + mixOtherVar);
    return {
      id: `demo-var-${idx + 1}`,
      category,
      priceVariance: priceVar,
      volumeVariance: volumeVar,
      mixOtherVariance: mixOtherVar,
      totalVariance: total,
      pctOfTotal: 0,
      primaryModule: MODULES[idx % MODULES.length],
      invoiceCount: Math.floor(4 + rng() * 18),
      usageVariancePct: round((rng() - 0.45) * 22, 1),
    };
  });
}

export function getVarianceBreakdownDemoData(params = {}) {
  const rng = createRng(91);
  let rows = buildDriverRows(rng);

  if (params.categoryNames?.length) {
    rows = rows.filter((r) => params.categoryNames.includes(r.category));
  }

  const totalVariance = round(rows.reduce((s, r) => s + r.totalVariance, 0));
  const priceVariance = round(rows.reduce((s, r) => s + r.priceVariance, 0));
  const volumeVariance = round(rows.reduce((s, r) => s + r.volumeVariance, 0));
  const mixOtherVariance = round(rows.reduce((s, r) => s + r.mixOtherVariance, 0));

  rows = rows.map((r) => ({
    ...r,
    pctOfTotal: totalVariance ? round((r.totalVariance / totalVariance) * 100, 1) : 0,
  }));

  const sorted = [...rows].sort((a, b) => Math.abs(b.totalVariance) - Math.abs(a.totalVariance));

  const waterfall = [
    { step: 'Baseline Spend', value: 84200, type: 'baseline' },
    ...sorted.slice(0, 6).flatMap((r) => [
      { step: `${r.category} Price`, value: r.priceVariance, type: 'price', category: r.category },
      { step: `${r.category} Volume`, value: r.volumeVariance, type: 'volume', category: r.category },
    ]),
    { step: 'Mix / Other', value: mixOtherVariance, type: 'mix' },
    { step: 'Actual Spend', value: round(84200 + totalVariance), type: 'total' },
  ];

  const varianceDrivers = sorted.slice(0, 8).map((r) => ({
    category: r.category,
    priceVariance: r.priceVariance,
    volumeVariance: r.volumeVariance,
    mixOtherVariance: r.mixOtherVariance,
    totalVariance: r.totalVariance,
  }));

  const varianceByCategory = sorted.map((r) => ({
    category: r.category,
    priceVariance: r.priceVariance,
    volumeVariance: r.volumeVariance,
    mixOtherVariance: r.mixOtherVariance,
    totalVariance: r.totalVariance,
  }));

  const varianceTrend = Array.from({ length: 8 }, (_, i) => ({
    bucket: `W${i + 1}`,
    bucketStart: `2026-06-${String(i * 7 + 1).padStart(2, '0')}`,
    totalVariance: round(totalVariance * (0.55 + i * 0.07) + (rng() - 0.5) * 800),
    priceVariance: round(priceVariance * (0.5 + i * 0.08) + (rng() - 0.5) * 400),
    volumeVariance: round(volumeVariance * (0.48 + i * 0.07) + (rng() - 0.5) * 350),
    mixOtherVariance: round(mixOtherVariance * (0.4 + i * 0.05) + (rng() - 0.5) * 120),
  }));

  const moduleBreakdown = MODULES.map((module, i) => ({
    module,
    variance: round(
      rows.filter((r) => r.primaryModule === module).reduce((s, r) => s + Math.abs(r.totalVariance), 0) ||
        1200 + i * 800
    ),
    driverCount: rows.filter((r) => r.primaryModule === module).length,
  }));

  const largestDriver = sorted[0] || null;
  const favorableCategories = rows.filter((r) => r.totalVariance < 0).length;
  const unfavorableCategories = rows.filter((r) => r.totalVariance > 0).length;

  return {
    summary: {
      totalVariance,
      priceVariance,
      volumeVariance,
      mixOtherVariance,
      baselineSpend: 84200,
      actualSpend: round(84200 + totalVariance),
      favorableCategories,
      unfavorableCategories,
      largestDriver: largestDriver
        ? {
            category: largestDriver.category,
            totalVariance: largestDriver.totalVariance,
            priceVariance: largestDriver.priceVariance,
            volumeVariance: largestDriver.volumeVariance,
          }
        : null,
      driverCount: rows.length,
    },
    waterfall,
    varianceDrivers,
    varianceByCategory,
    varianceTrend,
    moduleBreakdown,
    tableRows: sorted,
    insights: [
      {
        id: 'total-variance',
        impact: Math.abs(totalVariance),
        text: `Total explainable variance is ${totalVariance >= 0 ? '+' : ''}$${totalVariance.toLocaleString()} vs baseline — driven by invoice price changes and inventory usage shifts (not POS sales).`,
      },
      {
        id: 'price-drivers',
        impact: Math.abs(priceVariance),
        text: `Price variance accounts for $${Math.abs(priceVariance).toLocaleString()} (${totalVariance ? round((priceVariance / totalVariance) * 100, 0) : 0}% of total). Review Price Movers and vendor contracts for top categories.`,
      },
      {
        id: 'volume-drivers',
        impact: Math.abs(volumeVariance),
        text: `Volume variance of $${Math.abs(volumeVariance).toLocaleString()} reflects purchasing quantity and inventory usage changes — cross-check Usage Report for count coverage.`,
      },
      {
        id: 'largest-category',
        impact: largestDriver ? Math.abs(largestDriver.totalVariance) : 0,
        text: largestDriver
          ? `${largestDriver.category} is the largest variance driver at $${Math.abs(largestDriver.totalVariance).toLocaleString()} (${largestDriver.pctOfTotal}% of total).`
          : 'No variance drivers in the selected filters.',
      },
    ],
    metadata: {
      currency: 'USD',
      timezone: params.timezone || 'UTC',
      dataFreshness: '2026-07-20 18:00',
      demoMode: true,
      varianceDefinition:
        'Explainable variance decomposes purchasing spend changes into price (unit cost), volume (qty/usage), and mix/other. Based on invoices and inventory — not POS sales.',
      sourceModules: MODULES,
      filterOptions: {
        categories: CATEGORIES,
        locations: LOCATIONS,
      },
    },
  };
}

export default getVarianceBreakdownDemoData;
