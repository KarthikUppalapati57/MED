/**
 * Development-only Inventory Usage Report demo dataset.
 * Used only when VITE_PERFORMANCE_DEMO === "true". Never written to the database.
 */

const CATEGORIES = [
  'Produce', 'Meat', 'Seafood', 'Dairy', 'Bakery', 'Beverage',
  'Frozen', 'Dry Goods', 'Packaging', 'Cleaning Supplies',
];

const LOCATIONS = [
  { id: 'demo-loc-1', name: 'Downtown' },
  { id: 'demo-loc-2', name: 'Airport' },
  { id: 'demo-loc-3', name: 'Midtown' },
];

const PRODUCTS = [
  { name: 'Romaine Hearts', category: 'Produce', unit: 'Case', cost: 28.5 },
  { name: 'Roma Tomatoes', category: 'Produce', unit: 'Case', cost: 22 },
  { name: 'Ribeye Trim', category: 'Meat', unit: 'Pound', cost: 14.2 },
  { name: 'Ground Beef 80/20', category: 'Meat', unit: 'Pound', cost: 4.85 },
  { name: 'Chicken Breast', category: 'Meat', unit: 'Pound', cost: 3.95 },
  { name: 'Atlantic Salmon', category: 'Seafood', unit: 'Pound', cost: 11.4 },
  { name: 'Shrimp 16/20', category: 'Seafood', unit: 'Pound', cost: 9.8 },
  { name: 'Whole Milk', category: 'Dairy', unit: 'Gallon', cost: 3.65 },
  { name: 'Heavy Cream', category: 'Dairy', unit: 'Quart', cost: 4.2 },
  { name: 'Cheddar Block', category: 'Dairy', unit: 'Pound', cost: 5.1 },
  { name: 'Burger Buns', category: 'Bakery', unit: 'Case', cost: 18 },
  { name: 'Cola Syrup', category: 'Beverage', unit: 'Each', cost: 42 },
  { name: 'Fry Cut Potatoes', category: 'Frozen', unit: 'Case', cost: 26.5 },
  { name: 'AP Flour', category: 'Dry Goods', unit: 'Bag', cost: 16.8 },
  { name: 'To-Go Containers', category: 'Packaging', unit: 'Case', cost: 34 },
  { name: 'Degreaser', category: 'Cleaning Supplies', unit: 'Each', cost: 12.5 },
  { name: 'Uncounted Special', category: 'Miscellaneous', unit: 'Case', cost: 40, missingCounts: true },
];

function createRng(seed = 41) {
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

function buildRows() {
  const rng = createRng(55);
  const rows = [];

  PRODUCTS.forEach((p, idx) => {
    const loc = LOCATIONS[idx % LOCATIONS.length];
    const opening = round(40 + rng() * 80, 2);
    const received = round(10 + rng() * 40, 2);
    const tin = round(rng() * 8, 2);
    const tout = round(rng() * 10, 2);
    const waste = round(rng() * 4, 2);
    const adjustment = round((rng() - 0.45) * 6, 2);
    const closing = p.missingCounts ? null : round(Math.max(0, opening + received + tin - tout + adjustment - (8 + rng() * 30)), 2);

    const calculable = !p.missingCounts && closing != null;
    const actualUsage = calculable
      ? round(opening + received + tin - tout + adjustment - closing, 4)
      : null;

    rows.push({
      inventoryId: `demo-inv-${idx + 1}`,
      productId: p.missingCounts ? null : `demo-prod-${idx + 1}`,
      product: p.name,
      category: p.category,
      location: loc.name,
      locationId: loc.id,
      openingQuantity: p.missingCounts ? null : opening,
      receivedQuantity: received,
      transfersIn: tin,
      transfersOut: tout,
      wasteQuantity: waste,
      adjustmentQuantity: adjustment,
      closingQuantity: closing,
      actualUsage,
      unit: p.unit,
      unitCost: p.cost,
      usageValue: actualUsage == null ? null : round(actualUsage * p.cost, 2),
      wasteValue: round(waste * p.cost, 2),
      countDate: p.missingCounts ? null : '2026-07-18',
      lastMovementDate: '2026-07-19',
      dataQualityStatus: calculable ? 'calculable' : 'not_calculable',
      abcClass: 'n/a',
    });
  });

  const calculable = rows
    .filter((r) => r.dataQualityStatus === 'calculable' && r.usageValue != null)
    .sort((a, b) => (b.usageValue || 0) - (a.usageValue || 0));
  const total = calculable.reduce((s, r) => s + (r.usageValue || 0), 0);
  let cum = 0;
  for (const r of calculable) {
    cum += r.usageValue || 0;
    if (total <= 0) r.abcClass = 'C';
    else if (cum <= total * 0.8) r.abcClass = 'A';
    else if (cum <= total * 0.95) r.abcClass = 'B';
    else r.abcClass = 'C';
  }

  return rows;
}

const DEMO_ROWS = buildRows();

export function getInventoryUsageDemoData(params = {}) {
  let rows = [...DEMO_ROWS];
  if (params.categoryNames?.length) {
    rows = rows.filter((r) => params.categoryNames.includes(r.category));
  }
  if (params.locationIds?.length) {
    rows = rows.filter((r) => params.locationIds.includes(r.locationId));
  }

  const calculable = rows.filter((r) => r.dataQualityStatus === 'calculable');
  const sum = (key) => round(rows.reduce((s, r) => s + (Number(r[key]) || 0), 0));
  const sumC = (key) => round(calculable.reduce((s, r) => s + (Number(r[key]) || 0), 0));

  const openingInventoryValue = round(
    rows.reduce((s, r) => s + (r.openingQuantity == null ? 0 : r.openingQuantity * r.unitCost), 0)
  );
  const closingInventoryValue = round(
    rows.reduce((s, r) => s + (r.closingQuantity == null ? 0 : r.closingQuantity * r.unitCost), 0)
  );

  const catMap = new Map();
  for (const r of calculable) {
    const row = catMap.get(r.category) || {
      category: r.category,
      usageValue: 0,
      usageQty: 0,
      wasteValue: 0,
      productCount: 0,
    };
    row.usageValue += r.usageValue || 0;
    row.usageQty += r.actualUsage || 0;
    row.wasteValue += r.wasteValue || 0;
    row.productCount += 1;
    catMap.set(r.category, row);
  }
  const usageByCategory = [...catMap.values()]
    .map((r) => ({
      ...r,
      usageValue: round(r.usageValue),
      usageQty: round(r.usageQty, 4),
      wasteValue: round(r.wasteValue),
    }))
    .sort((a, b) => b.usageValue - a.usageValue);

  const locMap = new Map();
  for (const r of rows) {
    const row = locMap.get(r.location) || {
      location: r.location,
      locationId: r.locationId,
      openingValue: 0,
      closingValue: 0,
      usageValue: 0,
      wasteValue: 0,
      receivedValue: 0,
    };
    row.openingValue += (r.openingQuantity || 0) * r.unitCost;
    row.closingValue += (r.closingQuantity || 0) * r.unitCost;
    row.usageValue += r.usageValue || 0;
    row.wasteValue += r.wasteValue || 0;
    row.receivedValue += (r.receivedQuantity || 0) * r.unitCost;
    locMap.set(r.location, row);
  }
  const locationComparison = [...locMap.values()].map((r) => ({
    ...r,
    openingValue: round(r.openingValue),
    closingValue: round(r.closingValue),
    usageValue: round(r.usageValue),
    wasteValue: round(r.wasteValue),
    receivedValue: round(r.receivedValue),
  }));

  const heatmap = [];
  for (const cat of CATEGORIES) {
    for (const loc of LOCATIONS) {
      const subset = rows.filter((r) => r.category === cat && r.location === loc.name);
      if (!subset.length) continue;
      heatmap.push({
        category: cat,
        location: loc.name,
        usageValue: round(subset.reduce((s, r) => s + (r.usageValue || 0), 0)),
        wasteValue: round(subset.reduce((s, r) => s + (r.wasteValue || 0), 0)),
      });
    }
  }

  const abcMap = { A: { class: 'A', productCount: 0, usageValue: 0 }, B: { class: 'B', productCount: 0, usageValue: 0 }, C: { class: 'C', productCount: 0, usageValue: 0 } };
  for (const r of rows) {
    if (!abcMap[r.abcClass]) continue;
    abcMap[r.abcClass].productCount += 1;
    abcMap[r.abcClass].usageValue += r.usageValue || 0;
  }
  const abc = Object.values(abcMap).map((r) => ({ ...r, usageValue: round(r.usageValue) }));

  const wasteValue = sum('wasteValue');
  const actualInventoryUsage = sumC('usageValue');
  const highestUsageCategory = usageByCategory[0]
    ? { category: usageByCategory[0].category, usageValue: usageByCategory[0].usageValue, usageQty: usageByCategory[0].usageQty }
    : null;
  const highestWasteProduct = [...rows].sort((a, b) => b.wasteValue - a.wasteValue)[0];

  const valueTrend = Array.from({ length: 6 }, (_, i) => ({
    bucket: `2026-06-${String(i * 7 + 1).padStart(2, '0')}`,
    receivedValue: round(800 + i * 120),
    usageProxyValue: round(700 + i * 90),
    wasteValue: round(40 + i * 8),
  }));

  const wasteTrend = Array.from({ length: 14 }, (_, i) => ({
    bucket: `2026-07-${String(i + 1).padStart(2, '0')}`,
    wasteValue: round(20 + (i % 5) * 12),
    wasteQty: round(2 + (i % 4) * 1.5, 2),
  }));

  return {
    summary: {
      openingInventoryValue,
      closingInventoryValue,
      inventoryReceived: round(rows.reduce((s, r) => s + r.receivedQuantity * r.unitCost, 0)),
      actualInventoryUsage,
      wasteValue,
      transfersIn: round(rows.reduce((s, r) => s + r.transfersIn * r.unitCost, 0)),
      transfersOut: round(rows.reduce((s, r) => s + r.transfersOut * r.unitCost, 0)),
      inventoryAdjustments: round(rows.reduce((s, r) => s + r.adjustmentQuantity * r.unitCost, 0)),
      highestUsageCategory,
      highestWasteProduct: highestWasteProduct
        ? {
            product: highestWasteProduct.product,
            category: highestWasteProduct.category,
            wasteValue: highestWasteProduct.wasteValue,
            wasteQty: highestWasteProduct.wasteQuantity,
          }
        : null,
      inventoryValueChange: round(closingInventoryValue - openingInventoryValue),
      uncountedOrMissing: rows.filter((r) => r.dataQualityStatus !== 'calculable').length,
      totalProducts: rows.length,
      calculableProducts: calculable.length,
    },
    waterfall: [
      { step: 'Opening', value: openingInventoryValue },
      { step: 'Receipts', value: round(rows.reduce((s, r) => s + r.receivedQuantity * r.unitCost, 0)) },
      { step: 'Transfers In', value: round(rows.reduce((s, r) => s + r.transfersIn * r.unitCost, 0)) },
      { step: 'Transfers Out', value: -round(rows.reduce((s, r) => s + r.transfersOut * r.unitCost, 0)) },
      { step: 'Adjustments', value: round(rows.reduce((s, r) => s + r.adjustmentQuantity * r.unitCost, 0)) },
      { step: 'Closing', value: -closingInventoryValue },
      { step: 'Actual Usage', value: actualInventoryUsage },
    ],
    usageByCategory,
    valueTrend,
    wasteTrend,
    productRanking: calculable.slice(0, 20).map((r) => ({
      product: r.product,
      productId: r.productId,
      inventoryId: r.inventoryId,
      category: r.category,
      location: r.location,
      actualUsage: r.actualUsage,
      usageValue: r.usageValue,
      wasteValue: r.wasteValue,
    })),
    locationComparison,
    heatmap,
    abc,
    tableRows: rows,
    insights: [
      {
        id: 'usage-total',
        impact: actualInventoryUsage,
        text: `Calculable actual inventory usage value is $${actualInventoryUsage.toLocaleString()} across ${calculable.length} products.`,
      },
      {
        id: 'waste',
        impact: wasteValue,
        text: `Waste value in period is $${wasteValue.toLocaleString()} (reported separately; not added into Actual Usage).`,
      },
      {
        id: 'uncounted',
        impact: rows.filter((r) => r.dataQualityStatus !== 'calculable').length,
        text: `${rows.filter((r) => r.dataQualityStatus !== 'calculable').length} inventory items are missing opening/closing counts (Actual Usage = Not Calculable).`,
      },
    ],
    metadata: {
      currency: 'USD',
      timezone: params.timezone || 'UTC',
      dataFreshness: '2026-07-20 18:00',
      demoMode: true,
      usageDefinition:
        'Demo Actual Usage = Opening + Receipts + Transfers In - Transfers Out + Adjustments(signed) - Closing. Waste separate. No POS.',
      filterOptions: {
        categories: CATEGORIES,
        locations: LOCATIONS,
      },
    },
  };
}

export function getInventoryUsageDrilldownDemoData({ inventoryId, productId, ...params } = {}) {
  const report = getInventoryUsageDemoData(params);
  const row =
    report.tableRows.find((r) => inventoryId && r.inventoryId === inventoryId) ||
    report.tableRows.find((r) => productId && r.productId === productId) ||
    report.tableRows.find((r) => r.dataQualityStatus === 'calculable') ||
    report.tableRows[0];

  if (!row) {
    return {
      inventoryId: null,
      summary: {},
      countHistory: [],
      receiptHistory: [],
      wasteHistory: [],
      transferHistory: [],
      adjustmentHistory: [],
      usageTrend: [],
      locationComparison: [],
      normalization: {},
    };
  }

  return {
    inventoryId: row.inventoryId,
    summary: {
      product: row.product,
      category: row.category,
      location: row.location,
      unit: row.unit,
      unitCost: row.unitCost,
      currentQuantity: row.closingQuantity ?? row.openingQuantity ?? 0,
      lastCountedDate: row.countDate,
    },
    countHistory: Array.from({ length: 6 }, (_, i) => ({
      sessionId: `demo-cs-${i + 1}`,
      date: `2026-07-${String(i * 3 + 1).padStart(2, '0')}`,
      countedQuantity: round((row.openingQuantity || 20) + i * 2, 2),
      status: 'completed',
    })),
    receiptHistory: Array.from({ length: 8 }, (_, i) => ({
      movementId: `demo-rcpt-${i + 1}`,
      date: `2026-07-${String((i % 18) + 1).padStart(2, '0')}`,
      quantity: round(5 + i, 2),
      sourceType: 'receiving',
      sourceId: `demo-recv-${i + 1}`,
      movementType: 'purchase_order',
    })),
    wasteHistory: Array.from({ length: 5 }, (_, i) => ({
      id: `demo-waste-${i + 1}`,
      date: `2026-07-${String(i * 2 + 2).padStart(2, '0')}`,
      quantity: round(0.5 + i * 0.3, 2),
      unit: row.unit,
      value: round((0.5 + i * 0.3) * row.unitCost, 2),
      reason: ['expired', 'damaged', 'spoiled', 'overproduction', 'other'][i % 5],
    })),
    transferHistory: [
      {
        movementId: 'demo-tin-1',
        date: '2026-07-08',
        quantity: row.transfersIn,
        class: 'transfer_in',
        sourceId: 'demo-xfer-1',
        movementType: 'transfer_in',
      },
      {
        movementId: 'demo-tout-1',
        date: '2026-07-12',
        quantity: -row.transfersOut,
        class: 'transfer_out',
        sourceId: 'demo-xfer-2',
        movementType: 'transfer_out',
      },
    ],
    adjustmentHistory: [
      {
        movementId: 'demo-adj-1',
        date: '2026-07-10',
        quantity: row.adjustmentQuantity,
        sourceType: 'manual',
        movementType: 'manual_adjustment',
      },
    ],
    usageTrend: Array.from({ length: 10 }, (_, i) => ({
      bucket: `2026-07-${String(i + 1).padStart(2, '0')}`,
      received: round(2 + (i % 3), 2),
      transfersIn: round(i % 4 === 0 ? 1 : 0, 2),
      transfersOut: round(i % 3 === 0 ? 1.5 : 0, 2),
      wasteQty: round(i % 5 === 0 ? 0.4 : 0, 2),
      adjustments: round(i % 6 === 0 ? 0.5 : 0, 2),
    })),
    locationComparison: LOCATIONS.map((loc, i) => ({
      location: loc.name,
      locationId: loc.id,
      currentQuantity: round((row.closingQuantity || 10) * (0.8 + i * 0.2), 2),
      unitCost: row.unitCost,
      value: round((row.closingQuantity || 10) * (0.8 + i * 0.2) * row.unitCost, 2),
    })),
    normalization: {
      reportUnit: row.unit,
      formula: 'Actual Usage = Opening + Receipts + Transfers In - Transfers Out + Adjustments(signed) - Closing',
      wasteRule: 'Waste is reported separately and is not added into Actual Usage',
      posExcluded: true,
      status: row.dataQualityStatus,
    },
  };
}

export default getInventoryUsageDemoData;
