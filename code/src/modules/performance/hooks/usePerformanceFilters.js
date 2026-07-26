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

  // Resync caller-owned defaults whenever the parent context changes. This keeps the
  // Performance header, active location, and report tabs from drifting out of sync.
  const defaultLocationIdsKey = JSON.stringify(defaults.locationIds || []);
  const defaultLocationIds = useMemo(() => defaults.locationIds || [], [defaultLocationIdsKey]);
  useEffect(() => {
    setLocationIds(defaultLocationIds);
  }, [defaultLocationIds]);

  useEffect(() => {
    if (!defaults.dateFrom || !defaults.dateTo) return;
    setDateFrom(defaults.dateFrom);
    setDateTo(defaults.dateTo);
    if (autoComparison) {
      const next = previousEquivalentPeriod(defaults.dateFrom, defaults.dateTo);
      setComparisonDateFrom(next.comparisonDateFrom);
      setComparisonDateTo(next.comparisonDateTo);
    }
  }, [defaults.dateFrom, defaults.dateTo, autoComparison]);

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
    setLocationIds(defaultLocationIds);
    setCategoryIds([]);
    setVendorIds([]);
    setAutoComparison(true);
  }, [syncComparison, defaultLocationIds]);

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


