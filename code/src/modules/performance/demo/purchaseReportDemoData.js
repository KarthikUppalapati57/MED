/**
 * Development-only Purchase Report demo dataset.
 * Used only when VITE_PERFORMANCE_DEMO === "true". Never written to the database.
 */

const CATEGORIES = [
  'Produce', 'Meat', 'Seafood', 'Dairy', 'Bakery', 'Beverage',
  'Frozen', 'Dry Goods', 'Packaging', 'Cleaning Supplies',
];

const VENDORS = [
  'Sysco Metro', 'US Foods East', 'Gordon Food Service', 'FreshPoint Produce',
  'Prime Cut Meats', 'Coastal Catch', 'Dairy Farmers Co-op', 'Pantry Wholesale',
  'Beverage Partners', 'PackRight Distributors',
];

const PRODUCTS = [
  { name: 'Romaine Hearts', category: 'Produce', unit: 'Case', base: 28.5 },
  { name: 'Roma Tomatoes', category: 'Produce', unit: 'Case', base: 22 },
  { name: 'Ribeye Trim', category: 'Meat', unit: 'Pound', base: 14.2 },
  { name: 'Ground Beef 80/20', category: 'Meat', unit: 'Pound', base: 4.85 },
  { name: 'Chicken Breast', category: 'Meat', unit: 'Pound', base: 3.95 },
  { name: 'Atlantic Salmon', category: 'Seafood', unit: 'Pound', base: 11.4 },
  { name: 'Shrimp 16/20', category: 'Seafood', unit: 'Pound', base: 9.8 },
  { name: 'Whole Milk', category: 'Dairy', unit: 'Gallon', base: 3.65 },
  { name: 'Heavy Cream', category: 'Dairy', unit: 'Quart', base: 4.2 },
  { name: 'Cheddar Block', category: 'Dairy', unit: 'Pound', base: 5.1 },
  { name: 'Burger Buns', category: 'Bakery', unit: 'Case', base: 18 },
  { name: 'Cola Syrup', category: 'Beverage', unit: 'Each', base: 42 },
  { name: 'Fry Cut Potatoes', category: 'Frozen', unit: 'Case', base: 26.5 },
  { name: 'AP Flour', category: 'Dry Goods', unit: 'Bag', base: 16.8 },
  { name: 'To-Go Containers', category: 'Packaging', unit: 'Case', base: 34 },
  { name: 'Degreaser', category: 'Cleaning Supplies', unit: 'Each', base: 12.5 },
];

function createRng(seed = 62) {
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

function buildPurchaseRows() {
  const rng = createRng(71);
  const rows = [];

  PRODUCTS.forEach((p, idx) => {
    const units = round(40 + rng() * 180, 1);
    const unitCost = round(p.base * (0.92 + rng() * 0.18), 4);
    const amount = round(units * unitCost);
    const vendor = VENDORS[idx % VENDORS.length];

    rows.push({
      productId: `demo-prod-${idx + 1}`,
      product: p.name,
      category: p.category,
      vendor,
      vendorId: `demo-v-${(idx % VENDORS.length) + 1}`,
      unit: p.unit,
      units,
      unitCost,
      amount,
      invoiceCount: 2 + Math.floor(rng() * 8),
      lastPurchased: `2026-07-${String(5 + (idx % 15)).padStart(2, '0')}`,
    });
  });

  for (let i = 0; i < 8; i += 1) {
    const p = PRODUCTS[i % PRODUCTS.length];
    const rng2 = createRng(100 + i);
    const units = round(20 + rng2() * 60, 1);
    const unitCost = round(p.base * (0.95 + rng2() * 0.1), 4);
    rows.push({
      productId: `demo-prod-extra-${i}`,
      product: `${p.name} (Alt SKU)`,
      category: p.category,
      vendor: VENDORS[(i + 3) % VENDORS.length],
      vendorId: `demo-v-${((i + 3) % VENDORS.length) + 1}`,
      unit: p.unit,
      units,
      unitCost,
      amount: round(units * unitCost),
      invoiceCount: 1 + Math.floor(rng2() * 4),
      lastPurchased: `2026-07-${String(1 + (i % 20)).padStart(2, '0')}`,
    });
  }

  return rows;
}

const PURCHASE_ROWS = buildPurchaseRows();

export function getPurchaseReportDemoData(params = {}) {
  let rows = [...PURCHASE_ROWS];

  if (params.categoryNames?.length) {
    rows = rows.filter((r) => params.categoryNames.includes(r.category));
  }
  if (params.vendorIds?.length) {
    rows = rows.filter((r) => params.vendorIds.includes(r.vendorId));
  }

  const totalPurchased = round(rows.reduce((s, r) => s + r.amount, 0));
  const totalUnits = round(rows.reduce((s, r) => s + r.units, 0), 1);
  const invoiceCount = rows.reduce((s, r) => s + r.invoiceCount, 0);
  const vendorSet = new Set(rows.map((r) => r.vendorId));
  const avgCostPerUnit = totalUnits ? round(totalPurchased / totalUnits, 4) : 0;

  const catMap = new Map();
  for (const r of rows) {
    const row = catMap.get(r.category) || { category: r.category, spend: 0, units: 0, productCount: 0 };
    row.spend += r.amount;
    row.units += r.units;
    row.productCount += 1;
    catMap.set(r.category, row);
  }
  const spendByCategory = [...catMap.values()]
    .map((r) => ({ ...r, spend: round(r.spend), units: round(r.units, 1) }))
    .sort((a, b) => b.spend - a.spend);

  const vendorMap = new Map();
  for (const r of rows) {
    const row = vendorMap.get(r.vendor) || {
      vendor: r.vendor,
      vendorId: r.vendorId,
      spend: 0,
      invoiceCount: 0,
      productCount: 0,
    };
    row.spend += r.amount;
    row.invoiceCount += r.invoiceCount;
    row.productCount += 1;
    vendorMap.set(r.vendor, row);
  }
  const spendByVendor = [...vendorMap.values()]
    .map((r) => ({ ...r, spend: round(r.spend) }))
    .sort((a, b) => b.spend - a.spend);

  const rng = createRng(99);
  const weeklyPurchaseTrend = Array.from({ length: 6 }, (_, i) => ({
    bucket: `Week ${i + 1}`,
    bucketStart: `2026-06-${String(i * 7 + 1).padStart(2, '0')}`,
    spend: round(totalPurchased / 6 * (0.8 + rng() * 0.4)),
    invoiceCount: Math.max(1, Math.floor(invoiceCount / 6 * (0.7 + rng() * 0.6))),
  }));

  const topCategory = spendByCategory[0];
  const topVendor = spendByVendor[0];

  return {
    summary: {
      totalPurchased,
      invoiceCount,
      avgCostPerUnit,
      vendorCount: vendorSet.size,
      productCount: rows.length,
      totalUnits,
      previousTotalPurchased: round(totalPurchased * 0.91),
      topCategory: topCategory ? { category: topCategory.category, spend: topCategory.spend } : null,
      topVendor: topVendor ? { vendor: topVendor.vendor, spend: topVendor.spend } : null,
    },
    spendByCategory,
    spendByVendor,
    weeklyPurchaseTrend,
    tableRows: rows.sort((a, b) => b.amount - a.amount),
    insights: [
      {
        id: 'total-purchased',
        impact: totalPurchased,
        text: `$${totalPurchased.toLocaleString()} purchased across ${rows.length} products from ${vendorSet.size} vendors (${invoiceCount} invoice lines).`,
      },
      {
        id: 'top-category',
        impact: topCategory?.spend || 0,
        text: topCategory
          ? `${topCategory.category} is the top spend category at $${topCategory.spend.toLocaleString()} (${round((topCategory.spend / totalPurchased) * 100, 1)}% of total).`
          : 'No category data for current filters.',
      },
      {
        id: 'top-vendor',
        impact: topVendor?.spend || 0,
        text: topVendor
          ? `${topVendor.vendor} is the largest vendor by spend ($${topVendor.spend.toLocaleString()}); consider consolidating orders for volume pricing.`
          : 'No vendor data for current filters.',
      },
      {
        id: 'avg-cost',
        impact: avgCostPerUnit,
        text: `Weighted average cost per unit is $${avgCostPerUnit.toFixed(2)} — compare against Price Movers for products above category median.`,
      },
    ],
    metadata: {
      currency: 'USD',
      timezone: params.timezone || 'UTC',
      dataFreshness: '2026-07-20 18:00',
      demoMode: true,
      modules: ['Invoice', 'Products', 'Payments'],
      filterOptions: {
        categories: CATEGORIES,
        vendors: VENDORS.map((name, idx) => ({ id: `demo-v-${idx + 1}`, name })),
      },
    },
  };
}
