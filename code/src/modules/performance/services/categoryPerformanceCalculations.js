/**
 * Pure calculation helpers for Category Report purchasing analytics.
 * Kept client-side for unit tests; server RPC mirrors the same rules.
 */

export const UNCATEGORIZED = 'Uncategorized';

export function resolveCategoryName(raw) {
  const name = typeof raw === 'string' ? raw.trim() : '';
  return name || UNCATEGORIZED;
}

export function percentageChange(current, previous) {
  const curr = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0) {
    if (curr === 0) return 0;
    return null;
  }
  return ((curr - prev) / Math.abs(prev)) * 100;
}

export function absoluteChange(current, previous) {
  return (Number(current) || 0) - (Number(previous) || 0);
}

export function shareOfTotal(part, total) {
  const t = Number(total) || 0;
  if (t === 0) return 0;
  return ((Number(part) || 0) / t) * 100;
}

export function averageInvoiceValue(totalSpend, invoiceCount) {
  const count = Number(invoiceCount) || 0;
  if (count === 0) return 0;
  return (Number(totalSpend) || 0) / count;
}

export function topThreeConcentration(categorySpendsSortedDesc, totalSpend) {
  const total = Number(totalSpend) || 0;
  if (total === 0) return 0;
  const top = (categorySpendsSortedDesc || []).slice(0, 3).reduce((sum, v) => sum + (Number(v) || 0), 0);
  return (top / total) * 100;
}

/**
 * Fastest-growing category among those meeting a minimum spend threshold
 * in the current period (avoids tiny-base % spikes).
 */
export function fastestGrowingCategory(rows, { minSpend = 100 } = {}) {
  const eligible = (rows || []).filter((row) => (Number(row.currentSpend) || 0) >= minSpend);
  if (eligible.length === 0) return null;

  let best = null;
  for (const row of eligible) {
    const pct = percentageChange(row.currentSpend, row.previousSpend);
    if (pct === null) continue;
    if (!best || pct > best.percentageChange) {
      best = {
        category: row.category,
        currentSpend: Number(row.currentSpend) || 0,
        previousSpend: Number(row.previousSpend) || 0,
        percentageChange: pct,
        absoluteChange: absoluteChange(row.currentSpend, row.previousSpend),
      };
    }
  }
  return best;
}

export function largestSpendCategory(rows, totalSpend) {
  const sorted = [...(rows || [])].sort(
    (a, b) => (Number(b.currentSpend) || 0) - (Number(a.currentSpend) || 0)
  );
  const top = sorted[0];
  if (!top || (Number(top.currentSpend) || 0) <= 0) return null;
  return {
    category: top.category,
    spend: Number(top.currentSpend) || 0,
    percentageOfTotal: shareOfTotal(top.currentSpend, totalSpend),
  };
}

/**
 * Pareto cumulative % by descending spend.
 */
export function buildPareto(rows) {
  const sorted = [...(rows || [])]
    .map((r) => ({
      category: r.category,
      spend: Number(r.currentSpend) || 0,
    }))
    .filter((r) => r.spend > 0)
    .sort((a, b) => b.spend - a.spend);

  const total = sorted.reduce((s, r) => s + r.spend, 0);
  let cumulative = 0;
  return sorted.map((row, index) => {
    cumulative += row.spend;
    return {
      category: row.category,
      spend: row.spend,
      rank: index + 1,
      sharePercentage: shareOfTotal(row.spend, total),
      cumulativePercentage: shareOfTotal(cumulative, total),
      crossesEighty: cumulative >= total * 0.8 && cumulative - row.spend < total * 0.8,
    };
  });
}

export function trendGranularity(dateFrom, dateTo) {
  const from = new Date(`${dateFrom}T00:00:00`);
  const to = new Date(`${dateTo}T00:00:00`);
  const days = Math.max(1, Math.round((to - from) / 86400000) + 1);
  if (days <= 31) return 'day';
  if (days <= 120) return 'week';
  return 'month';
}

/**
 * Previous equivalent period ending the day before dateFrom.
 */
export function previousEquivalentPeriod(dateFrom, dateTo) {
  const from = new Date(`${dateFrom}T00:00:00`);
  const to = new Date(`${dateTo}T00:00:00`);
  const days = Math.max(1, Math.round((to - from) / 86400000) + 1);
  const comparisonTo = new Date(from);
  comparisonTo.setDate(comparisonTo.getDate() - 1);
  const comparisonFrom = new Date(comparisonTo);
  comparisonFrom.setDate(comparisonFrom.getDate() - (days - 1));
  const iso = (d) => d.toISOString().slice(0, 10);
  return {
    comparisonDateFrom: iso(comparisonFrom),
    comparisonDateTo: iso(comparisonTo),
    dayCount: days,
  };
}

export function aggregateSpendByCategory(allocations) {
  const map = new Map();
  for (const row of allocations || []) {
    const category = resolveCategoryName(row.category_name ?? row.category);
    const amount = Number(row.amount) || 0;
    const prev = map.get(category) || { category, spend: 0, invoiceIds: new Set(), vendorIds: new Set() };
    prev.spend += amount;
    if (row.invoice_id) prev.invoiceIds.add(row.invoice_id);
    if (row.vendor_id) prev.vendorIds.add(row.vendor_id);
    map.set(category, prev);
  }
  return [...map.values()].map((r) => ({
    category: r.category,
    spend: r.spend,
    invoiceCount: r.invoiceIds.size,
    vendorCount: r.vendorIds.size,
  }));
}

export function buildCategoryComparisonRows(currentRows, previousRows) {
  const prevMap = new Map((previousRows || []).map((r) => [r.category, r]));
  const categories = new Set([
    ...(currentRows || []).map((r) => r.category),
    ...(previousRows || []).map((r) => r.category),
  ]);

  return [...categories].map((category) => {
    const current = currentRows.find((r) => r.category === category);
    const previous = prevMap.get(category);
    const currentSpend = Number(current?.spend) || 0;
    const previousSpend = Number(previous?.spend) || 0;
    return {
      category,
      currentSpend,
      previousSpend,
      absoluteVariance: absoluteChange(currentSpend, previousSpend),
      percentageVariance: percentageChange(currentSpend, previousSpend),
      invoiceCount: Number(current?.invoiceCount) || 0,
      vendorCount: Number(current?.vendorCount) || 0,
    };
  }).sort((a, b) => b.currentSpend - a.currentSpend);
}

export function buildInsights({ summary, tableRows, vendorContribution }) {
  const insights = [];
  const money = (n) =>
    `$${Math.abs(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  for (const row of tableRows || []) {
    const pct = row.percentageVariance;
    if (pct === null || pct === undefined) continue;
    if (Math.abs(row.absoluteVariance || 0) < 1) continue;
    const direction = row.absoluteVariance >= 0 ? 'increased' : 'decreased';
    insights.push({
      id: `cat-change-${row.category}`,
      impact: Math.abs(Number(row.absoluteVariance) || 0),
      text:
        pct === null
          ? `${row.category} spend ${direction} by ${money(row.absoluteVariance)} compared with the previous period.`
          : `${row.category} spend ${direction} ${Math.abs(pct).toFixed(1)}% compared with the previous period.`,
    });
  }

  if (summary?.largestCategory?.category) {
    insights.push({
      id: 'largest-share',
      impact: Number(summary.largestCategory.spend) || 0,
      text: `${summary.largestCategory.category} accounted for ${(summary.largestCategory.percentageOfTotal || 0).toFixed(0)}% of total purchasing spend.`,
    });
  }

  if (summary?.topThreeConcentrationPercentage != null) {
    insights.push({
      id: 'top-three',
      impact: (Number(summary.totalSpend) || 0) * ((Number(summary.topThreeConcentrationPercentage) || 0) / 100),
      text: `Three categories represented ${(summary.topThreeConcentrationPercentage || 0).toFixed(0)}% of all purchasing spend.`,
    });
  }

  const topVendor = (vendorContribution || [])[0];
  if (topVendor && topVendor.sharePercentage >= 40) {
    insights.push({
      id: `vendor-dom-${topVendor.vendor}`,
      impact: Number(topVendor.spend) || 0,
      text: `${topVendor.vendor} contributed ${(topVendor.sharePercentage || 0).toFixed(0)}% of ${topVendor.category || 'category'} spend.`,
    });
  }

  return insights
    .filter((i) => i.text && i.impact > 0)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 8);
}

export function groupSmallCategories(rows, { maxVisible = 12, otherLabel = 'Other' } = {}) {
  const sorted = [...(rows || [])].sort(
    (a, b) => (Number(b.currentSpend ?? b.spend) || 0) - (Number(a.currentSpend ?? a.spend) || 0)
  );
  if (sorted.length <= maxVisible) return sorted;

  const visible = sorted.slice(0, maxVisible - 1);
  const rest = sorted.slice(maxVisible - 1);
  const otherSpend = rest.reduce((s, r) => s + (Number(r.currentSpend ?? r.spend) || 0), 0);
  const otherPrev = rest.reduce((s, r) => s + (Number(r.previousSpend) || 0), 0);

  return [
    ...visible,
    {
      category: otherLabel,
      currentSpend: otherSpend,
      previousSpend: otherPrev,
      spend: otherSpend,
      isOther: true,
    },
  ];
}
