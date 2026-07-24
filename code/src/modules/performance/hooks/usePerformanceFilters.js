import { useCallback, useEffect, useMemo, useState } from 'react';
import { previousEquivalentPeriod } from '@/modules/performance/services/categoryPerformanceCalculations';

function startOfMonthIso(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function endOfMonthIso(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

/**
 * Shared Performance filter state for Category Report and future tabs.
 */
export function usePerformanceFilters(defaults = {}) {
  const initialFrom = defaults.dateFrom || startOfMonthIso();
  const initialTo = defaults.dateTo || endOfMonthIso();
  const initialComparison = previousEquivalentPeriod(initialFrom, initialTo);

  const [dateFrom, setDateFrom] = useState(initialFrom);
  const [dateTo, setDateTo] = useState(initialTo);
  const [comparisonDateFrom, setComparisonDateFrom] = useState(
    defaults.comparisonDateFrom || initialComparison.comparisonDateFrom
  );
  const [comparisonDateTo, setComparisonDateTo] = useState(
    defaults.comparisonDateTo || initialComparison.comparisonDateTo
  );
  const [locationIds, setLocationIds] = useState(defaults.locationIds || []);
  const [categoryIds, setCategoryIds] = useState(defaults.categoryIds || []);
  const [vendorIds, setVendorIds] = useState(defaults.vendorIds || []);
  const [autoComparison, setAutoComparison] = useState(true);

  // Resync to the caller's active-location default whenever it changes (e.g. the user
  // switches location mid-session). A stale locationIds filter here would otherwise keep
  // querying a location the backend's exact-location-match scope no longer returns rows for.
  const defaultLocationIdsKey = JSON.stringify(defaults.locationIds || []);
  useEffect(() => {
    setLocationIds(defaults.locationIds || []);
  }, [defaultLocationIdsKey]);

  const syncComparison = useCallback((from, to) => {
    const next = previousEquivalentPeriod(from, to);
    setComparisonDateFrom(next.comparisonDateFrom);
    setComparisonDateTo(next.comparisonDateTo);
  }, []);

  const updateDateRange = useCallback(
    (from, to) => {
      setDateFrom(from);
      setDateTo(to);
      if (autoComparison) syncComparison(from, to);
    },
    [autoComparison, syncComparison]
  );

  const clearFilters = useCallback(() => {
    const from = startOfMonthIso();
    const to = endOfMonthIso();
    setDateFrom(from);
    setDateTo(to);
    syncComparison(from, to);
    setLocationIds([]);
    setCategoryIds([]);
    setVendorIds([]);
    setAutoComparison(true);
  }, [syncComparison]);

  const filters = useMemo(
    () => ({
      dateFrom,
      dateTo,
      comparisonDateFrom,
      comparisonDateTo,
      locationIds,
      categoryIds,
      vendorIds,
    }),
    [
      dateFrom,
      dateTo,
      comparisonDateFrom,
      comparisonDateTo,
      locationIds,
      categoryIds,
      vendorIds,
    ]
  );

  return {
    filters,
    dateFrom,
    dateTo,
    comparisonDateFrom,
    comparisonDateTo,
    locationIds,
    categoryIds,
    vendorIds,
    autoComparison,
    setDateFrom,
    setDateTo,
    setComparisonDateFrom,
    setComparisonDateTo,
    setLocationIds,
    setCategoryIds,
    setVendorIds,
    setAutoComparison,
    updateDateRange,
    clearFilters,
    syncComparison,
  };
}

export default usePerformanceFilters;
