import { finiteOrNull, normalizedCategoryKey } from '@/modules/performance/services/overviewBudgetCalculations';

function isoDay(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function inclusiveDayCount(from, to) {
  const start = isoDay(from);
  const end = isoDay(to);
  if (!start || !end || end < start) return null;
  return Math.round((end - start) / 86400000) + 1;
}

export function getComparisonSemantics(filters = {}) {
  const currentDays = inclusiveDayCount(filters.dateFrom, filters.dateTo);
  const comparisonDays = inclusiveDayCount(filters.comparisonDateFrom, filters.comparisonDateTo);
  const valid = currentDays !== null && comparisonDays !== null;
  return {
    valid,
    currentDays,
    comparisonDays,
    unequalLength: valid && currentDays !== comparisonDays,
  };
}

export function prepareCategoryRows(rows = [], { comparisonValid = true } = {}) {
  return rows
    .map((row) => {
      const currentSpend = finiteOrNull(row.currentSpend);
      const previousSpend = comparisonValid ? finiteOrNull(row.previousSpend) : null;
      const absoluteVariance =
        currentSpend !== null && previousSpend !== null
          ? currentSpend - previousSpend
          : null;
      const percentageVariance =
        absoluteVariance !== null && previousSpend !== 0
          ? (absoluteVariance / Math.abs(previousSpend)) * 100
          : null;
      return {
        ...row,
        currentSpend,
        previousSpend,
        absoluteVariance,
        percentageVariance,
        dataStatus:
          currentSpend === null
            ? 'unavailable'
            : !comparisonValid || previousSpend === null
              ? 'comparison_unavailable'
              : previousSpend === 0
                ? 'new_or_zero_baseline'
                : 'complete',
      };
    })
    .filter((row) => row.category && row.currentSpend !== null)
    .sort((a, b) => b.currentSpend - a.currentSpend)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function findDuplicateLookingLabels(rows = [], accessor = 'category') {
  const groups = new Map();
  for (const row of rows) {
    const label = String(row?.[accessor] || '').trim();
    if (!label) continue;
    const key = normalizedCategoryKey(label);
    const labels = groups.get(key) || new Set();
    labels.add(label);
    groups.set(key, labels);
  }
  return [...groups.values()]
    .filter((labels) => labels.size > 1)
    .map((labels) => [...labels].sort());
}

export function preparePriceMoverRows(rows = []) {
  const prepared = rows.map((row) => {
    const currentPrice = finiteOrNull(row.currentPrice);
    const previousPrice = finiteOrNull(row.previousPrice);
    const comparable =
      row.comparabilityStatus === 'comparable' &&
      currentPrice !== null &&
      previousPrice !== null;
    const priceChange = comparable ? currentPrice - previousPrice : null;
    const percentageChange =
      comparable && previousPrice !== 0
        ? (priceChange / Math.abs(previousPrice)) * 100
        : null;
    const estimatedImpact = finiteOrNull(row.estimatedImpact);
    const impactReliable = comparable && estimatedImpact !== null;
    const direction =
      impactReliable && estimatedImpact > 0
        ? 'adverse'
        : impactReliable && estimatedImpact < 0
          ? 'favorable'
          : impactReliable
            ? 'no_material_impact'
          : comparable && priceChange > 0
            ? 'price_up_impact_unavailable'
            : comparable && priceChange < 0
              ? 'price_down_impact_unavailable'
              : comparable
                ? 'no_change'
                : 'not_comparable';
    const confidence = impactReliable
      ? 'complete'
      : comparable
        ? 'price_only'
        : currentPrice !== null
          ? 'comparison_missing'
          : 'current_price_missing';
    return {
      ...row,
      currentPrice,
      previousPrice,
      priceChange,
      percentageChange,
      estimatedImpact: impactReliable ? estimatedImpact : null,
      quantity: null,
      impactReliable,
      direction,
      confidence,
    };
  });

  return prepared.sort((a, b) => {
    if (a.impactReliable !== b.impactReliable) return a.impactReliable ? -1 : 1;
    if (a.impactReliable && b.impactReliable) {
      return Math.abs(b.estimatedImpact) - Math.abs(a.estimatedImpact);
    }
    return Math.abs(b.priceChange || 0) - Math.abs(a.priceChange || 0);
  });
}

export function buildPriceMoverChartGroups(rows = [], limit = 10) {
  const prepared = preparePriceMoverRows(rows);
  return {
    adverse: prepared
      .filter((row) => row.impactReliable && row.estimatedImpact > 0)
      .sort((a, b) => b.estimatedImpact - a.estimatedImpact)
      .slice(0, limit),
    favorable: prepared
      .filter((row) => row.impactReliable && row.estimatedImpact < 0)
      .sort((a, b) => a.estimatedImpact - b.estimatedImpact)
      .slice(0, limit),
    priceOnly: prepared
      .filter((row) => !row.impactReliable && row.priceChange !== null && row.priceChange !== 0)
      .sort((a, b) => Math.abs(b.priceChange) - Math.abs(a.priceChange))
      .slice(0, limit),
  };
}
