/**
 * Development-only Category Report demo dataset.
 * Never written to the database. Used only when VITE_PERFORMANCE_DEMO === "true".
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
  'Smallwares',
  'Miscellaneous',
];

const VENDOR_NAMES = [
  'Sysco Metro',
  'US Foods East',
  'Gordon Food Service',
  'FreshPoint Produce',
  'Seafood Direct',
  'Dairy Farmers Co-op',
  'Artisan Bakery Supply',
  'Beverage Partners',
  'Arctic Frozen Foods',
  'Pantry Wholesale',
  'PackRight Distributors',
  'CleanPro Supply',
  'KitchenWorks Smallwares',
  'Harbor Provisions',
  'Valley Farms',
  'Prime Cut Meats',
  'Coastal Catch',
  'Urban Beverage Co',
  'EcoPack Solutions',
  'FacilityCare Supply',
];

const PRODUCT_POOL = {
  Produce: ['Romaine Hearts', 'Roma Tomatoes', 'Yellow Onions', 'Baby Spinach', 'Avocados', 'Lemons'],
  Meat: ['Ribeye Trim', 'Ground Beef 80/20', 'Chicken Breast', 'Pork Shoulder', 'Bacon Slab'],
  Seafood: ['Atlantic Salmon', 'Shrimp 16/20', 'Cod Loins', 'Mussels', 'Calamari Rings'],
  Dairy: ['Whole Milk', 'Heavy Cream', 'Cheddar Block', 'Butter Unsalted', 'Greek Yogurt'],
  Bakery: ['Sourdough Loaf', 'Burger Buns', 'Croissants', 'Flour Tortillas', 'Dinner Rolls'],
  Beverage: ['Cola Syrup', 'Orange Juice', 'Sparkling Water', 'Iced Tea Concentrate', 'Espresso Beans'],
  Frozen: ['Fry Cut Potatoes', 'Peas IQF', 'Ice Cream Mix', 'Frozen Berries', 'Phyllo Dough'],
  'Dry Goods': ['AP Flour', 'Cane Sugar', 'Kosher Salt', 'Rice 25lb', 'Pasta Penne'],
  Packaging: ['To-Go Containers', 'Paper Bags', 'Portion Cups', 'Napkins', 'Straws'],
  'Cleaning Supplies': ['Degreaser', 'Sanitizer Tabs', 'Floor Cleaner', 'Gloves Nitrile', 'Trash Liners'],
  Smallwares: ['Hotel Pans', 'Cutting Boards', 'Ladles', 'Thermometers', 'Storage Tubs'],
  Miscellaneous: ['Office Supplies', 'Uniforms', 'First Aid Kits', 'Misc Hardware', 'Guest Amenities'],
};

const LOCATIONS = [
  { id: 'demo-loc-downtown', name: 'Downtown' },
  { id: 'demo-loc-airport', name: 'Airport' },
  { id: 'demo-loc-midtown', name: 'Midtown' },
];

/** Stable seeded PRNG (mulberry32). */
function createRng(seed = 20260721) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function pctChange(current, previous) {
  if (previous === 0 && current === 0) return 0;
  if (previous === 0) return null;
  return round2(((current - previous) / Math.abs(previous)) * 100);
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Builds a full in-memory purchasing analytics universe once.
 */
function buildUniverse() {
  const rng = createRng(42);
  const vendors = VENDOR_NAMES.map((name, i) => ({
    id: `demo-vendor-${String(i + 1).padStart(2, '0')}`,
    name,
  }));

  // Category weight profile (current period spend share targets)
  const weights = {
    Produce: 0.14,
    Meat: 0.31,
    Seafood: 0.09,
    Dairy: 0.11,
    Bakery: 0.05,
    Beverage: 0.06,
    Frozen: 0.07,
    'Dry Goods': 0.05,
    Packaging: 0.04,
    'Cleaning Supplies': 0.03,
    Smallwares: 0.02,
    Miscellaneous: 0.03,
  };

  const currentEnd = new Date(Date.UTC(2026, 6, 20)); // Jul 20, 2026
  const currentStart = new Date(Date.UTC(2026, 6, 1)); // Jul 1
  const previousEnd = new Date(Date.UTC(2026, 5, 30));
  const previousStart = new Date(Date.UTC(2026, 5, 1));
  const trendStart = new Date(Date.UTC(2026, 1, 1)); // Feb → Jul (6 months)

  const targetCurrentTotal = 428500;
  const invoices = [];
  let invoiceSeq = 10001;

  // Generate ~320 invoices across 6 months, biased to current + previous months
  for (let i = 0; i < 320; i += 1) {
    const bucket = rng();
    let invoiceDate;
    if (bucket < 0.42) {
      // current month
      invoiceDate = addDays(currentStart, Math.floor(rng() * 20));
    } else if (bucket < 0.72) {
      // previous month
      invoiceDate = addDays(previousStart, Math.floor(rng() * 30));
    } else {
      // earlier months in 6-month window
      const monthOffset = Math.floor(rng() * 4); // Feb–May
      invoiceDate = new Date(Date.UTC(2026, 1 + monthOffset, 1 + Math.floor(rng() * 27)));
    }

    const category = pickWeightedCategory(rng, weights);
    const vendor = vendors[Math.floor(rng() * vendors.length)];
    const location = LOCATIONS[Math.floor(rng() * LOCATIONS.length)];
    const base = targetCurrentTotal * (weights[category] || 0.05);
    const amount = round2(Math.max(85, (base / 28) * (0.35 + rng() * 1.4)));

    const products = PRODUCT_POOL[category] || ['Generic Item'];
    const lineCount = 1 + Math.floor(rng() * 4);
    const productRows = [];
    let remaining = amount;
    for (let l = 0; l < lineCount; l += 1) {
      const isLast = l === lineCount - 1;
      const lineSpend = isLast ? remaining : round2(remaining * (0.2 + rng() * 0.35));
      remaining = round2(remaining - lineSpend);
      const qty = round2(1 + rng() * 24);
      const unit = round2(lineSpend / qty);
      productRows.push({
        product: products[Math.floor(rng() * products.length)],
        productId: `demo-prod-${category.slice(0, 3).toLowerCase()}-${l}-${i}`,
        quantityPurchased: qty,
        currentUnitPrice: unit,
        averageUnitPrice: round2(unit * (0.92 + rng() * 0.12)),
        totalSpend: lineSpend,
        vendor: vendor.name,
        priceChange: round2(unit * (rng() * 0.08 - 0.03)),
      });
    }

    invoices.push({
      invoiceId: `demo-inv-${invoiceSeq}`,
      invoiceNumber: `INV-${invoiceSeq}`,
      date: isoDate(invoiceDate),
      vendor: vendor.name,
      vendorId: vendor.id,
      amount,
      status: rng() > 0.08 ? 'approved' : 'paid',
      location: location.name,
      locationId: location.id,
      category,
      products: productRows,
    });
    invoiceSeq += 1;
  }

  return {
    vendors,
    invoices,
    currentStart: isoDate(currentStart),
    currentEnd: isoDate(currentEnd),
    previousStart: isoDate(previousStart),
    previousEnd: isoDate(previousEnd),
    trendStart: isoDate(trendStart),
    weights,
  };
}

function pickWeightedCategory(rng, weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
  for (const [name, w] of entries) {
    roll -= w;
    if (roll <= 0) return name;
  }
  return entries[entries.length - 1][0];
}

const UNIVERSE = buildUniverse();

function inRange(dateStr, from, to) {
  if (!from || !to) return true;
  return dateStr >= from && dateStr <= to;
}

function filterInvoices({ dateFrom, dateTo, categoryNames, vendorIds, locationIds }) {
  return UNIVERSE.invoices.filter((inv) => {
    if (!inRange(inv.date, dateFrom, dateTo)) return false;
    if (categoryNames?.length && !categoryNames.includes(inv.category)) return false;
    if (vendorIds?.length && !vendorIds.includes(inv.vendorId)) return false;
    if (locationIds?.length && !locationIds.includes(inv.locationId)) return false;
    return true;
  });
}

function aggregateByCategory(invoices) {
  const map = new Map();
  for (const inv of invoices) {
    const row = map.get(inv.category) || {
      category: inv.category,
      spend: 0,
      invoiceIds: new Set(),
      vendorIds: new Set(),
      vendorSpend: new Map(),
    };
    row.spend = round2(row.spend + inv.amount);
    row.invoiceIds.add(inv.invoiceId);
    row.vendorIds.add(inv.vendorId);
    row.vendorSpend.set(inv.vendor, round2((row.vendorSpend.get(inv.vendor) || 0) + inv.amount));
    map.set(inv.category, row);
  }
  return [...map.values()].map((r) => {
    let largestVendor = null;
    let largestSpend = -1;
    for (const [vendor, spend] of r.vendorSpend.entries()) {
      if (spend > largestSpend) {
        largestSpend = spend;
        largestVendor = vendor;
      }
    }
    return {
      category: r.category,
      spend: r.spend,
      invoiceCount: r.invoiceIds.size,
      vendorCount: r.vendorIds.size,
      largestVendor,
    };
  });
}

/**
 * Returns a Category Report payload matching get_category_performance_report shape.
 */
export function getCategoryReportDemoData(params = {}) {
  const dateFrom = params.dateFrom || UNIVERSE.currentStart;
  const dateTo = params.dateTo || UNIVERSE.currentEnd;
  const comparisonDateFrom = params.comparisonDateFrom || UNIVERSE.previousStart;
  const comparisonDateTo = params.comparisonDateTo || UNIVERSE.previousEnd;
  const categoryNames = params.categoryNames || params.categoryIds || null;
  const vendorIds = params.vendorIds || null;
  const locationIds = params.locationIds || null;
  const selectedCategory = params.selectedCategory || null;
  const trendCategories = params.trendCategories || null;
  const timezone = params.timezone || 'UTC';

  const currentInvoices = filterInvoices({
    dateFrom,
    dateTo,
    categoryNames,
    vendorIds,
    locationIds,
  });
  const previousInvoices = filterInvoices({
    dateFrom: comparisonDateFrom,
    dateTo: comparisonDateTo,
    categoryNames,
    vendorIds,
    locationIds,
  });

  const currentAgg = aggregateByCategory(currentInvoices);
  const previousAgg = aggregateByCategory(previousInvoices);
  const prevMap = new Map(previousAgg.map((r) => [r.category, r]));

  const allCats = new Set([
    ...CATEGORIES,
    ...currentAgg.map((r) => r.category),
    ...previousAgg.map((r) => r.category),
  ]);

  const tableRows = [...allCats]
    .map((category) => {
      const cur = currentAgg.find((r) => r.category === category);
      const prev = prevMap.get(category);
      const currentSpend = round2(cur?.spend || 0);
      const previousSpend = round2(prev?.spend || 0);
      const absoluteVariance = round2(currentSpend - previousSpend);
      const percentageVariance = pctChange(currentSpend, previousSpend);
      const invoiceCount = cur?.invoiceCount || 0;
      const budget =
        category === 'Dairy' ? 38000 :
        category === 'Meat' ? 140000 :
        category === 'Produce' ? 62000 :
        null;
      const budgetVariance = budget == null ? null : round2(currentSpend - budget);
      return {
        category,
        currentSpend,
        previousSpend,
        absoluteVariance,
        percentageVariance,
        percentageOfTotal: 0,
        invoiceCount,
        vendorCount: cur?.vendorCount || 0,
        averageInvoiceValue: invoiceCount ? round2(currentSpend / invoiceCount) : 0,
        largestVendor: cur?.largestVendor || null,
        budget,
        budgetVariance,
        trendStatus:
          percentageVariance == null ? 'new' :
          percentageVariance > 5 ? 'up' :
          percentageVariance < -5 ? 'down' : 'flat',
      };
    })
    .filter((r) => r.currentSpend > 0 || r.previousSpend > 0)
    .sort((a, b) => b.currentSpend - a.currentSpend);

  const totalSpend = round2(tableRows.reduce((s, r) => s + r.currentSpend, 0));
  const previousSpend = round2(tableRows.reduce((s, r) => s + r.previousSpend, 0));
  const absoluteChange = round2(totalSpend - previousSpend);
  const percentageChange = pctChange(totalSpend, previousSpend);
  const invoiceCount = new Set(currentInvoices.map((i) => i.invoiceId)).size;

  for (const row of tableRows) {
    row.percentageOfTotal = totalSpend ? round2((row.currentSpend / totalSpend) * 100) : 0;
  }

  const largest = tableRows[0]
    ? {
        category: tableRows[0].category,
        spend: tableRows[0].currentSpend,
        percentageOfTotal: tableRows[0].percentageOfTotal,
      }
    : null;

  const minSpend = Math.max(100, totalSpend * 0.01);
  const fastest = [...tableRows]
    .filter((r) => r.currentSpend >= minSpend && r.percentageVariance != null)
    .sort((a, b) => (b.percentageVariance || 0) - (a.percentageVariance || 0))[0];

  const topThree = tableRows.slice(0, 3).reduce((s, r) => s + r.currentSpend, 0);
  const categoriesOverBudget = tableRows.filter(
    (r) => r.budget != null && r.currentSpend > r.budget
  ).length;

  const categoryBreakdown = tableRows.map((r) => ({
    category: r.category,
    currentSpend: r.currentSpend,
    previousSpend: r.previousSpend,
    absoluteVariance: r.absoluteVariance,
    percentageVariance: r.percentageVariance,
    percentageOfTotal: r.percentageOfTotal,
  }));

  // Distribution: top 8 + Other
  const distSource = tableRows.filter((r) => r.currentSpend > 0);
  const distribution = distSource.slice(0, 8).map((r) => ({
    category: r.category,
    spend: r.currentSpend,
    isOther: false,
    percentageOfTotal: r.percentageOfTotal,
  }));
  const otherSpend = round2(distSource.slice(8).reduce((s, r) => s + r.currentSpend, 0));
  if (otherSpend > 0) {
    distribution.push({
      category: 'Other',
      spend: otherSpend,
      isOther: true,
      percentageOfTotal: totalSpend ? round2((otherSpend / totalSpend) * 100) : 0,
    });
  }

  // Pareto
  let cumulative = 0;
  const pareto = distSource.map((r, idx) => {
    cumulative += r.currentSpend;
    return {
      category: r.category,
      spend: r.currentSpend,
      rank: idx + 1,
      sharePercentage: r.percentageOfTotal,
      cumulativePercentage: totalSpend ? round2((cumulative / totalSpend) * 100) : 0,
    };
  });

  // Monthly trend (6 months) for top categories
  const topTrendCats = (trendCategories?.length
    ? trendCategories
    : tableRows.slice(0, 5).map((r) => r.category));
  const trendMap = new Map();
  for (const inv of UNIVERSE.invoices) {
    if (!topTrendCats.includes(inv.category)) continue;
    if (inv.date < UNIVERSE.trendStart || inv.date > dateTo) continue;
    if (vendorIds?.length && !vendorIds.includes(inv.vendorId)) continue;
    if (locationIds?.length && !locationIds.includes(inv.locationId)) continue;
    const d = new Date(`${inv.date}T00:00:00Z`);
    const bucket = monthKey(d);
    const key = `${bucket}::${inv.category}`;
    const prev = trendMap.get(key) || {
      bucket,
      bucketStart: `${bucket}-01`,
      category: inv.category,
      spend: 0,
    };
    prev.spend = round2(prev.spend + inv.amount);
    trendMap.set(key, prev);
  }
  const trend = [...trendMap.values()].sort((a, b) =>
    a.bucketStart === b.bucketStart
      ? a.category.localeCompare(b.category)
      : a.bucketStart.localeCompare(b.bucketStart)
  );

  // Vendor contribution for selected / largest category
  const vendorCategory =
    selectedCategory ||
    tableRows.find((r) => r.currentSpend > 0)?.category ||
    'Produce';
  const vendorCurrent = currentInvoices.filter((i) => i.category === vendorCategory);
  const vendorPrev = previousInvoices.filter((i) => i.category === vendorCategory);
  const vendorMap = new Map();
  for (const inv of vendorCurrent) {
    const row = vendorMap.get(inv.vendorId) || {
      category: vendorCategory,
      vendor: inv.vendor,
      vendorId: inv.vendorId,
      spend: 0,
      invoiceIds: new Set(),
    };
    row.spend = round2(row.spend + inv.amount);
    row.invoiceIds.add(inv.invoiceId);
    vendorMap.set(inv.vendorId, row);
  }
  const vendorPrevMap = new Map();
  for (const inv of vendorPrev) {
    vendorPrevMap.set(inv.vendorId, round2((vendorPrevMap.get(inv.vendorId) || 0) + inv.amount));
  }
  const vendorTotal = [...vendorMap.values()].reduce((s, r) => s + r.spend, 0);
  const vendorContribution = [...vendorMap.values()]
    .map((r) => {
      const previous = vendorPrevMap.get(r.vendorId) || 0;
      return {
        category: r.category,
        vendor: r.vendor,
        vendorId: r.vendorId,
        spend: r.spend,
        sharePercentage: vendorTotal ? round2((r.spend / vendorTotal) * 100) : 0,
        invoiceCount: r.invoiceIds.size,
        previousSpend: previous,
        absoluteChange: round2(r.spend - previous),
        percentageChange: pctChange(r.spend, previous),
      };
    })
    .sort((a, b) => b.spend - a.spend);

  const produce = tableRows.find((r) => r.category === 'Produce');
  const meat = tableRows.find((r) => r.category === 'Meat');
  const dairy = tableRows.find((r) => r.category === 'Dairy');
  const insights = [
    produce?.percentageVariance != null
      ? {
          id: 'demo-produce-change',
          impact: Math.abs(produce.absoluteVariance),
          text: `Produce spend ${produce.absoluteVariance >= 0 ? 'increased' : 'decreased'} ${Math.abs(produce.percentageVariance).toFixed(0)}% compared with the previous period.`,
        }
      : null,
    meat
      ? {
          id: 'demo-meat-share',
          impact: meat.currentSpend,
          text: `Meat accounted for ${meat.percentageOfTotal.toFixed(0)}% of total purchasing spend.`,
        }
      : null,
    {
      id: 'demo-top-three',
      impact: topThree,
      text: `Three categories represented ${totalSpend ? ((topThree / totalSpend) * 100).toFixed(0) : 0}% of all purchasing spend.`,
    },
    dairy?.budgetVariance != null && dairy.budgetVariance > 0
      ? {
          id: 'demo-dairy-budget',
          impact: dairy.budgetVariance,
          text: `Dairy exceeded budget by $${Math.round(dairy.budgetVariance).toLocaleString()}.`,
        }
      : null,
    vendorContribution[0]?.sharePercentage >= 40
      ? {
          id: 'demo-vendor-dom',
          impact: vendorContribution[0].spend,
          text: `${vendorContribution[0].vendor} contributed ${vendorContribution[0].sharePercentage.toFixed(0)}% of ${vendorCategory} spend.`,
        }
      : null,
  ]
    .filter(Boolean)
    .sort((a, b) => b.impact - a.impact);

  return {
    summary: {
      totalSpend,
      previousSpend,
      absoluteChange,
      percentageChange,
      largestCategory: largest,
      fastestGrowingCategory: fastest
        ? {
            category: fastest.category,
            currentSpend: fastest.currentSpend,
            previousSpend: fastest.previousSpend,
            percentageChange: fastest.percentageVariance,
            absoluteChange: fastest.absoluteVariance,
          }
        : null,
      activeCategoryCount: tableRows.filter((r) => r.currentSpend > 0).length,
      topThreeConcentrationPercentage: totalSpend ? round2((topThree / totalSpend) * 100) : 0,
      averageInvoiceValue: invoiceCount ? round2(totalSpend / invoiceCount) : 0,
      categoriesOverBudget,
      invoiceCount,
      uncategorizedSpend: 0,
    },
    categoryBreakdown,
    trend,
    distribution,
    pareto,
    vendorContribution,
    tableRows,
    insights,
    metadata: {
      currency: 'USD',
      timezone,
      dataFreshness: '2026-07-20 18:00',
      hasBudgetData: true,
      granularity: 'month',
      spendDefinition:
        'Demo Mode purchasing spend (development only). Not sourced from invoice_allocations.',
      demoMode: true,
      filterOptions: {
        categories: CATEGORIES,
        vendors: UNIVERSE.vendors.map((v) => ({ id: v.id, name: v.name })),
        locations: LOCATIONS,
      },
      selectedCategory: vendorCategory,
    },
  };
}

/**
 * Returns drill-down payload for one category.
 */
export function getCategoryDrilldownDemoData({ category, ...params } = {}) {
  const report = getCategoryReportDemoData({ ...params, selectedCategory: category });
  const dateFrom = params.dateFrom || UNIVERSE.currentStart;
  const dateTo = params.dateTo || UNIVERSE.currentEnd;
  const comparisonDateFrom = params.comparisonDateFrom || UNIVERSE.previousStart;
  const comparisonDateTo = params.comparisonDateTo || UNIVERSE.previousEnd;

  const cat = category || report.metadata.selectedCategory || 'Produce';
  const current = filterInvoices({
    dateFrom,
    dateTo,
    categoryNames: [cat],
    vendorIds: params.vendorIds,
    locationIds: params.locationIds,
  });
  const previous = filterInvoices({
    dateFrom: comparisonDateFrom,
    dateTo: comparisonDateTo,
    categoryNames: [cat],
    vendorIds: params.vendorIds,
    locationIds: params.locationIds,
  });

  const totalSpend = round2(current.reduce((s, i) => s + i.amount, 0));
  const previousSpend = round2(previous.reduce((s, i) => s + i.amount, 0));
  const invoiceCount = current.length;
  const vendorCount = new Set(current.map((i) => i.vendorId)).size;

  const vendorContribution = (report.vendorContribution || []).filter((v) => v.category === cat);
  const vendors = vendorContribution.map((v) => ({
    vendor: v.vendor,
    vendorId: v.vendorId,
    spend: v.spend,
    sharePercentage: v.sharePercentage,
    invoiceCount: v.invoiceCount,
    averageInvoice: v.invoiceCount ? round2(v.spend / v.invoiceCount) : 0,
    absoluteChange: v.absoluteChange,
    percentageChange: v.percentageChange,
  }));

  const productMap = new Map();
  for (const inv of current) {
    for (const p of inv.products) {
      const key = p.product;
      const row = productMap.get(key) || {
        product: p.product,
        productId: p.productId,
        quantityPurchased: 0,
        currentUnitPrice: p.currentUnitPrice,
        averageUnitPrice: p.averageUnitPrice,
        totalSpend: 0,
        vendor: p.vendor,
        priceChange: p.priceChange,
      };
      row.quantityPurchased = round2(row.quantityPurchased + p.quantityPurchased);
      row.totalSpend = round2(row.totalSpend + p.totalSpend);
      row.currentUnitPrice = p.currentUnitPrice;
      productMap.set(key, row);
    }
  }
  const products = [...productMap.values()].sort((a, b) => b.totalSpend - a.totalSpend);

  const invoices = current
    .map((inv) => ({
      invoiceId: inv.invoiceId,
      invoiceNumber: inv.invoiceNumber,
      date: inv.date,
      vendor: inv.vendor,
      amount: inv.amount,
      status: inv.status,
      location: inv.location,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    category: cat,
    summary: {
      totalSpend,
      previousSpend,
      absoluteChange: round2(totalSpend - previousSpend),
      percentageChange: pctChange(totalSpend, previousSpend),
      invoiceCount,
      vendorCount,
      averageInvoiceValue: invoiceCount ? round2(totalSpend / invoiceCount) : 0,
      percentageOfTotal: report.summary.totalSpend
        ? round2((totalSpend / report.summary.totalSpend) * 100)
        : 0,
      budgetVariance: report.tableRows.find((r) => r.category === cat)?.budgetVariance ?? null,
    },
    vendors,
    products,
    invoices,
  };
}

export const categoryReportDemoMeta = {
  categories: CATEGORIES,
  vendorCount: VENDOR_NAMES.length,
  invoiceCount: UNIVERSE.invoices.length,
  locations: LOCATIONS,
};

export default getCategoryReportDemoData;
