/**
 * Development-only Price Movers demo dataset.
 * Used only when VITE_PERFORMANCE_DEMO === "true". Never written to the database.
 */

const CATEGORIES = [
  'Produce', 'Meat', 'Seafood', 'Dairy', 'Bakery', 'Beverage',
  'Frozen', 'Dry Goods', 'Packaging', 'Cleaning Supplies',
];

const VENDORS = [
  'Sysco Metro', 'US Foods East', 'Gordon Food Service', 'FreshPoint Produce',
  'Prime Cut Meats', 'Coastal Catch', 'Dairy Farmers Co-op', 'Pantry Wholesale',
  'Beverage Partners', 'PackRight Distributors', 'CleanPro Supply', 'Arctic Frozen Foods',
];

const PRODUCTS = [
  { name: 'Romaine Hearts', category: 'Produce', unit: 'Case', base: 28.5 },
  { name: 'Roma Tomatoes', category: 'Produce', unit: 'Case', base: 22.0 },
  { name: 'Ribeye Trim', category: 'Meat', unit: 'Pound', base: 14.2 },
  { name: 'Ground Beef 80/20', category: 'Meat', unit: 'Pound', base: 4.85 },
  { name: 'Chicken Breast', category: 'Meat', unit: 'Pound', base: 3.95 },
  { name: 'Atlantic Salmon', category: 'Seafood', unit: 'Pound', base: 11.4 },
  { name: 'Shrimp 16/20', category: 'Seafood', unit: 'Pound', base: 9.8 },
  { name: 'Whole Milk', category: 'Dairy', unit: 'Gallon', base: 3.65 },
  { name: 'Heavy Cream', category: 'Dairy', unit: 'Quart', base: 4.2 },
  { name: 'Cheddar Block', category: 'Dairy', unit: 'Pound', base: 5.1 },
  { name: 'Burger Buns', category: 'Bakery', unit: 'Case', base: 18.0 },
  { name: 'Cola Syrup', category: 'Beverage', unit: 'Each', base: 42.0 },
  { name: 'Fry Cut Potatoes', category: 'Frozen', unit: 'Case', base: 26.5 },
  { name: 'AP Flour', category: 'Dry Goods', unit: 'Bag', base: 16.8 },
  { name: 'To-Go Containers', category: 'Packaging', unit: 'Case', base: 34.0 },
  { name: 'Degreaser', category: 'Cleaning Supplies', unit: 'Each', base: 12.5 },
  { name: 'Unmapped Special Item', category: 'Miscellaneous', unit: 'Case', base: 40, unmapped: true },
  { name: 'Mixed Unit Item', category: 'Produce', unit: 'Each', base: 2.5, dualUnit: true },
];

function createRng(seed = 77) {
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

function pct(curr, prev) {
  if (prev == null || curr == null) return null;
  if (prev === 0 && curr === 0) return 0;
  if (prev === 0) return null;
  return round(((curr - prev) / Math.abs(prev)) * 100, 2);
}

function impactEvidence({ qty = null, unit = null, currentPrice = null, previousPrice = null, priceChange = null, estimatedImpact = null, mappingStatus = null, comparable = true }) {
  const mappingConfidence =
    mappingStatus === 'verified'
      ? 'verified'
      : mappingStatus === 'mapped'
        ? 'mapped_unverified'
        : mappingStatus;
  const evidenceComplete = Boolean(
    comparable &&
      mappingConfidence === 'verified' &&
      qty != null &&
      qty !== 0 &&
      unit &&
      priceChange != null &&
      estimatedImpact != null
  );
  return {
    normalizedPurchasedQuantity: comparable ? qty : null,
    normalizedQuantityUnit: unit,
    currentWeightedUnitPrice: currentPrice,
    comparisonWeightedUnitPrice: comparable ? previousPrice : null,
    unitPriceDifference: comparable ? priceChange : null,
    mappingConfidence,
    impactEvidenceComplete: evidenceComplete,
    impactFormula: 'unitPriceDifference * normalizedPurchasedQuantity',
  };
}

function pickImpactEvidence(r) {
  return {
    normalizedPurchasedQuantity: r.normalizedPurchasedQuantity,
    normalizedQuantityUnit: r.normalizedQuantityUnit,
    currentWeightedUnitPrice: r.currentWeightedUnitPrice,
    comparisonWeightedUnitPrice: r.comparisonWeightedUnitPrice,
    unitPriceDifference: r.unitPriceDifference,
    mappingConfidence: r.mappingConfidence,
    impactEvidenceComplete: r.impactEvidenceComplete,
    impactFormula: r.impactFormula,
  };
}
function buildDemoRows() {
  const rng = createRng(91);
  const rows = [];

  PRODUCTS.forEach((p, idx) => {
    if (p.unmapped) {
      rows.push({
        productId: null,
        product: p.name,
        vendor: VENDORS[idx % VENDORS.length],
        vendorId: `demo-v-${(idx % VENDORS.length) + 1}`,
        category: p.category,
        unit: p.unit,
        packSize: '12/cs',
        currentPrice: p.base,
        previousPrice: null,
        priceChange: null,
        percentageChange: null,
        currentSpend: round(p.base * 40),
        estimatedImpact: null,
        invoiceCount: 3,
        lastPurchase: '2026-07-18',
        mappingStatus: 'unmapped',
        ...impactEvidence({ unit: p.unit, currentPrice: p.base, mappingStatus: 'unmapped', comparable: false }),
        comparabilityStatus: 'not_comparable',
        outlierStatus: 'n/a',
      });
      return;
    }

    if (p.dualUnit) {
      rows.push({
        productId: `demo-prod-${idx}`,
        product: p.name,
        vendor: VENDORS[idx % VENDORS.length],
        vendorId: `demo-v-${(idx % VENDORS.length) + 1}`,
        category: p.category,
        unit: 'Each',
        packSize: null,
        currentPrice: p.base,
        previousPrice: null,
        priceChange: null,
        percentageChange: null,
        currentSpend: round(p.base * 120),
        estimatedImpact: null,
        invoiceCount: 5,
        lastPurchase: '2026-07-15',
        mappingStatus: 'mapped',
        ...impactEvidence({ unit: 'Each', currentPrice: p.base, mappingStatus: 'mapped', comparable: false }),
        comparabilityStatus: 'not_comparable',
        outlierStatus: 'n/a',
      });
      return;
    }

    // Deterministic price moves: some up, some down, one outlier
    const move =
      idx === 2 ? 0.22 :
      idx === 5 ? -0.12 :
      idx === 11 ? 0.58 :
      (rng() - 0.42) * 0.28;

    const previousPrice = round(p.base, 4);
    const currentPrice = round(p.base * (1 + move), 4);
    const priceChange = round(currentPrice - previousPrice, 4);
    const percentageChange = pct(currentPrice, previousPrice);
    const qty = 80 + Math.floor(rng() * 220);
    const estimatedImpact = round(priceChange * qty, 2);
    const vendor = VENDORS[idx % VENDORS.length];
    const mappingStatus = rng() > 0.2 ? 'verified' : 'mapped';

    rows.push({
      productId: `demo-prod-${idx}`,
      product: p.name,
      vendor,
      vendorId: `demo-v-${(idx % VENDORS.length) + 1}`,
      category: p.category,
      unit: p.unit,
      packSize: p.unit === 'Case' ? '6/#10' : null,
      currentPrice,
      previousPrice,
      priceChange,
      percentageChange,
      currentSpend: round(currentPrice * qty, 2),
      estimatedImpact,
      ...impactEvidence({ qty, unit: p.unit, currentPrice, previousPrice, priceChange, estimatedImpact, mappingStatus }),
      invoiceCount: 4 + Math.floor(rng() * 12),
      lastPurchase: `2026-07-${String(10 + (idx % 10)).padStart(2, '0')}`,
      mappingStatus,
      comparabilityStatus: 'comparable',
      outlierStatus: Math.abs(percentageChange || 0) >= 50 ? 'outlier' : 'normal',
    });
  });

  // Extra rows for pagination/search density
  for (let i = 0; i < 40; i += 1) {
    const cat = CATEGORIES[i % CATEGORIES.length];
    const prev = round(5 + rng() * 40, 2);
    const delta = round((rng() - 0.45) * 0.2, 4);
    const curr = round(prev * (1 + delta), 4);
    const qty = 30 + Math.floor(rng() * 100);
    const change = round(curr - prev, 4);
    const percentageChange = pct(curr, prev);
    rows.push({
      productId: `demo-extra-${i}`,
      product: `${cat} Item ${i + 1}`,
      vendor: VENDORS[i % VENDORS.length],
      vendorId: `demo-v-${(i % VENDORS.length) + 1}`,
      category: cat,
      unit: i % 3 === 0 ? 'Case' : 'Pound',
      packSize: null,
      currentPrice: curr,
      previousPrice: prev,
      priceChange: change,
      percentageChange,
      currentSpend: round(curr * qty, 2),
      estimatedImpact: round(change * qty, 2),
      ...impactEvidence({ qty, unit: i % 3 === 0 ? 'Case' : 'Pound', currentPrice: curr, previousPrice: prev, priceChange: change, estimatedImpact: round(change * qty, 2), mappingStatus: 'mapped' }),
      invoiceCount: 2 + (i % 8),
      lastPurchase: `2026-07-${String(1 + (i % 20)).padStart(2, '0')}`,
      mappingStatus: 'mapped',
      comparabilityStatus: 'comparable',
      outlierStatus: Math.abs(percentageChange || 0) >= 50 ? 'outlier' : 'normal',
    });
  }

  return rows.sort((a, b) => (b.estimatedImpact || 0) - (a.estimatedImpact || 0));
}

const DEMO_ROWS = buildDemoRows();

export function getPriceMoversDemoData(params = {}) {
  let rows = [...DEMO_ROWS];
  if (params.categoryNames?.length) {
    rows = rows.filter((r) => params.categoryNames.includes(r.category));
  }
  if (params.vendorIds?.length) {
    rows = rows.filter((r) => params.vendorIds.includes(r.vendorId));
  }

  const comparable = rows.filter((r) => r.comparabilityStatus === 'comparable');
  const increases = comparable.filter((r) => (r.priceChange || 0) > 0);
  const decreases = comparable.filter((r) => (r.priceChange || 0) < 0);
  const unfavorable = round(increases.reduce((s, r) => s + Math.max(0, r.estimatedImpact || 0), 0));
  const favorable = round(decreases.reduce((s, r) => s + Math.min(0, r.estimatedImpact || 0), 0));
  const avgChange = comparable.length
    ? round(comparable.reduce((s, r) => s + (r.percentageChange || 0), 0) / comparable.length, 2)
    : null;

  const largestIncrease = [...increases].sort((a, b) => b.priceChange - a.priceChange)[0] || null;
  const largestDecrease = [...decreases].sort((a, b) => a.priceChange - b.priceChange)[0] || null;
  const mostVolatile = [...comparable]
    .filter((r) => r.percentageChange != null)
    .sort((a, b) => Math.abs(b.percentageChange) - Math.abs(a.percentageChange))[0] || null;

  const ranking = comparable.slice(0, 20).map((r) => ({
    product: r.product,
    productId: r.productId,
    vendor: r.vendor,
    category: r.category,
    percentageChange: r.percentageChange,
    priceChange: r.priceChange,
    estimatedImpact: r.estimatedImpact,
    currentPrice: r.currentPrice,
    ...pickImpactEvidence(r),
  }));

  const trendProducts = comparable.slice(0, 5);
  const trend = [];
  for (let day = 1; day <= 20; day += 1) {
    const date = `2026-07-${String(day).padStart(2, '0')}`;
    for (const p of trendProducts) {
      const wobble = 1 + ((day % 5) - 2) * 0.01;
      trend.push({
        bucket: date,
        bucketStart: date,
        product: p.product,
        productId: p.productId,
        unitCost: round((p.previousPrice || p.currentPrice) * wobble + (day / 20) * (p.priceChange || 0), 4),
      });
    }
  }

  const distribution = [
    { bucket: 4, label: '-20 to -10', count: decreases.filter((r) => r.percentageChange <= -10).length },
    { bucket: 5, label: '-10 to 0', count: decreases.filter((r) => r.percentageChange > -10).length },
    { bucket: 6, label: '0 to 10', count: increases.filter((r) => r.percentageChange < 10).length },
    { bucket: 7, label: '10 to 20', count: increases.filter((r) => r.percentageChange >= 10 && r.percentageChange < 20).length },
    { bucket: 8, label: '20 to 30', count: increases.filter((r) => r.percentageChange >= 20 && r.percentageChange < 30).length },
    { bucket: 10, label: '40 to 50', count: increases.filter((r) => r.percentageChange >= 40).length },
  ].filter((b) => b.count > 0);

  const scatter = comparable.map((r) => ({
    product: r.product,
    percentageChange: r.percentageChange,
    estimatedImpact: r.estimatedImpact,
    currentSpend: r.currentSpend,
    category: r.category,
    ...pickImpactEvidence(r),
  }));

  const catMap = new Map();
  for (const r of comparable) {
    const row = catMap.get(r.category) || { category: r.category, pcts: [], unfavorable: 0, count: 0 };
    row.pcts.push(r.percentageChange || 0);
    row.unfavorable += Math.max(0, r.estimatedImpact || 0);
    row.count += 1;
    catMap.set(r.category, row);
  }
  const categoryInflation = [...catMap.values()]
    .map((r) => ({
      category: r.category,
      averagePercentageChange: round(r.pcts.reduce((a, b) => a + b, 0) / r.pcts.length, 2),
      unfavorableImpact: round(r.unfavorable),
      productCount: r.count,
    }))
    .sort((a, b) => b.averagePercentageChange - a.averagePercentageChange);

  const vendorMap = new Map();
  for (const r of comparable) {
    const row = vendorMap.get(r.vendor) || {
      vendor: r.vendor,
      vendorId: r.vendorId,
      unfavorableImpact: 0,
      favorableImpact: 0,
      productsIncreased: 0,
      productCount: 0,
    };
    row.unfavorableImpact += Math.max(0, r.estimatedImpact || 0);
    row.favorableImpact += Math.min(0, r.estimatedImpact || 0);
    row.productCount += 1;
    if ((r.priceChange || 0) > 0) row.productsIncreased += 1;
    vendorMap.set(r.vendor, row);
  }
  const vendorImpact = [...vendorMap.values()]
    .map((r) => ({
      ...r,
      unfavorableImpact: round(r.unfavorableImpact),
      favorableImpact: round(r.favorableImpact),
      netImpact: round(r.unfavorableImpact + r.favorableImpact),
    }))
    .sort((a, b) => b.unfavorableImpact - a.unfavorableImpact);

  const insights = [
    {
      id: 'unfavorable-impact',
      impact: unfavorable,
      text: `Estimated unfavorable purchasing impact from price increases is $${unfavorable.toLocaleString()}.`,
    },
    largestIncrease
      ? {
          id: 'largest-inc',
          impact: Math.abs(largestIncrease.estimatedImpact || 0),
          text: `${largestIncrease.product} had the largest price increase (${largestIncrease.percentageChange}%).`,
        }
      : null,
    {
      id: 'non-comparable',
      impact: rows.filter((r) => r.comparabilityStatus === 'not_comparable').length,
      text: `${rows.filter((r) => r.comparabilityStatus === 'not_comparable').length} products are not comparable due to missing product mapping or incompatible units.`,
    },
    categoryInflation[0]
      ? {
          id: 'cat-inflation',
          impact: Math.abs(categoryInflation[0].averagePercentageChange) * 100,
          text: `${categoryInflation[0].category} shows the highest average price change (${categoryInflation[0].averagePercentageChange}%).`,
        }
      : null,
  ].filter(Boolean);

  return {
    summary: {
      productsWithIncreases: increases.length,
      productsWithDecreases: decreases.length,
      averagePriceChange: avgChange,
      estimatedUnfavorableImpact: unfavorable,
      estimatedFavorableImpact: favorable,
      largestPriceIncrease: largestIncrease
        ? {
            product: largestIncrease.product,
            vendor: largestIncrease.vendor,
            category: largestIncrease.category,
            priceChange: largestIncrease.priceChange,
            percentageChange: largestIncrease.percentageChange,
            estimatedImpact: largestIncrease.estimatedImpact,
            ...pickImpactEvidence(largestIncrease),
          }
        : null,
      largestPriceDecrease: largestDecrease
        ? {
            product: largestDecrease.product,
            vendor: largestDecrease.vendor,
            category: largestDecrease.category,
            priceChange: largestDecrease.priceChange,
            percentageChange: largestDecrease.percentageChange,
            estimatedImpact: largestDecrease.estimatedImpact,
            ...pickImpactEvidence(largestDecrease),
          }
        : null,
      mostVolatileProduct: mostVolatile
        ? {
            product: mostVolatile.product,
            vendor: mostVolatile.vendor,
            category: mostVolatile.category,
            percentageChange: mostVolatile.percentageChange,
            estimatedImpact: mostVolatile.estimatedImpact,
            ...pickImpactEvidence(mostVolatile),
          }
        : null,
      vendorsDrivingIncreases: new Set(increases.map((r) => r.vendorId)).size,
      nonComparableProducts: rows.filter((r) => r.comparabilityStatus === 'not_comparable').length,
      totalProducts: rows.length,
    },
    ranking,
    trend,
    distribution,
    scatter,
    categoryInflation,
    vendorImpact,
    tableRows: rows,
    insights,
    metadata: {
      currency: 'USD',
      timezone: params.timezone || 'UTC',
      dataFreshness: '2026-07-20 18:00',
      demoMode: true,
      priceDefinition:
        'Demo normalized weighted-average unit cost. Not Comparable rows return null % change.',
      outlierThresholdPercent: 50,
      filterOptions: {
        categories: CATEGORIES,
        vendors: VENDORS.map((name, i) => ({ id: `demo-v-${i + 1}`, name })),
      },
    },
  };
}

export function getPriceMoversDrilldownDemoData({ productId, productName, ...params } = {}) {
  const report = getPriceMoversDemoData(params);
  const row =
    report.tableRows.find((r) => productId && r.productId === productId) ||
    report.tableRows.find((r) => productName && r.product === productName) ||
    report.tableRows.find((r) => r.comparabilityStatus === 'comparable') ||
    report.tableRows[0];

  if (!row) {
    return {
      productId: null,
      summary: {},
      priceHistory: [],
      vendorComparison: [],
      purchaseHistory: [],
      normalization: {},
    };
  }

  const priceHistory = Array.from({ length: 12 }, (_, i) => {
    const day = i + 1;
    const unitCost = round(
      (row.previousPrice || row.currentPrice || 0) +
        ((row.priceChange || 0) * day) / 12,
      4
    );
    return {
      date: `2026-07-${String(day).padStart(2, '0')}`,
      unitCost,
      spend: round(unitCost * 20, 2),
      quantity: 20,
    };
  });

  const vendorComparison = VENDORS.slice(0, 4).map((vendor, i) => ({
    vendor,
    vendorId: `demo-v-${i + 1}`,
    currentPrice: round((row.currentPrice || 0) * (0.95 + i * 0.03), 4),
    spend: round((row.currentSpend || 0) / (i + 1.5), 2),
    invoiceCount: 2 + i,
    unit: row.unit,
  }));

  const purchaseHistory = Array.from({ length: 25 }, (_, i) => ({
    invoiceId: `demo-inv-pm-${i + 1}`,
    invoiceNumber: `INV-PM-${1000 + i}`,
    date: `2026-07-${String((i % 20) + 1).padStart(2, '0')}`,
    vendor: vendorComparison[i % vendorComparison.length].vendor,
    quantity: round(10 + (i % 7) * 3, 2),
    unitPrice: round((row.currentPrice || 0) * (0.97 + (i % 5) * 0.01), 4),
    normalizedUnitCost: round((row.currentPrice || 0) * (0.97 + (i % 5) * 0.01), 4),
    amount: round(80 + i * 12, 2),
    unit: row.unit,
    status: i % 9 === 0 ? 'paid' : 'approved',
    location: ['Downtown', 'Airport', 'Midtown'][i % 3],
  }));

  return {
    productId: row.productId,
    summary: {
      product: row.product,
      category: row.category,
      unit: row.unit,
      packSize: row.packSize,
      currentPrice: row.currentPrice,
      previousPrice: row.previousPrice,
      priceChange: row.priceChange,
      percentageChange: row.percentageChange,
      currentSpend: row.currentSpend,
      invoiceCount: row.invoiceCount,
      vendorCount: vendorComparison.length,
      ...pickImpactEvidence(row),
    },
    priceHistory,
    vendorComparison,
    purchaseHistory,
    normalization: {
      reportUnit: row.unit,
      packSize: row.packSize,
      conversionMultiplier: 1,
      formula: 'normalized_unit_cost = total_price / (quantity * COALESCE(conversion_multiplier, 1))',
      comparabilityRule: 'Same internal_product_id and normalized UOM required across periods',
      status: row.comparabilityStatus,
    },
  };
}

export default getPriceMoversDemoData;
