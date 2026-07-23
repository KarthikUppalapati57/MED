import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TrendingDown } from "lucide-react";
import { useAuth } from '@/lib/AuthContext';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { api } from '@/lib/apiClient';
import { filterByContext } from '@/lib/contextUtils';

const VarianceWaterfallChart = React.lazy(() => import('@/modules/performance/components/PerformanceCharts').then((module) => ({ default: module.VarianceWaterfallChart })));

function ChartFallback() {
  return (
    <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
      Loading chart...
    </div>
  );
}

// Negative driver value = margin loss (cost increase / revenue loss), positive = margin gain.
export function ExplainableVarianceWidget({ varianceTotal = 0, laborVariance = 0, periodStart, periodEnd }) {
  const { organization, brand, location } = useAuth();

  const filterCb = React.useCallback((data) => filterByContext(data, { organization, brand, location }), [organization, brand, location]);

  const { data: wastageLogs, isLoading: wastageLoading } = useAuthQuery({
    queryKey: ['wastage_logs', organization?.id, periodStart, periodEnd],
    queryFn: () => api.entities.WastageLog.list(),
    select: React.useCallback((data) => filterCb(data).filter((log) => {
      if (!log.created_at) return false;
      const key = new Date(log.created_at).toISOString().slice(0, 10);
      return (!periodStart || key >= periodStart) && (!periodEnd || key <= periodEnd);
    }), [filterCb, periodStart, periodEnd]),
    enabled: !!organization?.id,
  });

  const { data: priceMoversSummary, isLoading: priceMoversLoading } = useAuthQuery({
    queryKey: ['price_movers_summary', organization?.id, brand?.brand_id || brand?.id, location?.id, periodStart, periodEnd],
    queryFn: () => api.reports.getPriceMoversReport({
      organizationId: organization?.id,
      locationIds: location?.id ? [location.id] : null,
      dateFrom: periodStart,
      dateTo: periodEnd,
    }),
    enabled: !!organization?.id && !!periodStart && !!periodEnd,
  });

  const isLoading = wastageLoading || priceMoversLoading;

  const varianceBreakdown = useMemo(() => {
    const wasteValue = (wastageLogs || []).reduce((sum, log) => sum + Number(log.value || 0), 0);
    const unfavorableImpact = Number(priceMoversSummary?.summary?.estimatedUnfavorableImpact || 0);
    const favorableImpact = Number(priceMoversSummary?.summary?.estimatedFavorableImpact || 0);
    const priceImpact = -(unfavorableImpact + favorableImpact);

    const drivers = [
      {
        category: 'Invoice Price Changes',
        value: Math.round(priceImpact),
        desc: 'Net vendor price increases minus decreases vs. the prior comparable period',
        color: priceImpact >= 0 ? '#10b981' : '#ef4444',
      },
      {
        category: 'Waste / Spoilage',
        value: -Math.round(wasteValue),
        desc: 'Logged waste in prep & expired inventory',
        color: '#ef4444',
      },
      {
        category: 'Labor Pacing',
        value: -Math.round(laborVariance),
        desc: 'Labor cost above/below target for the period',
        color: laborVariance > 0 ? '#ef4444' : '#10b981',
      },
    ].filter((driver) => driver.value !== 0);

    const explained = drivers.reduce((sum, driver) => sum + driver.value, 0);
    const residual = Math.round(varianceTotal - explained);
    if (Math.abs(residual) >= 1) {
      drivers.push({
        category: 'Other / Unexplained',
        value: residual,
        desc: 'Remaining variance not yet attributed to a known driver (e.g. AvT theoretical usage, product mix)',
        color: '#f59e0b',
      });
    }
    return drivers;
  }, [wastageLogs, priceMoversSummary, laborVariance, varianceTotal]);

  const explainedPct = useMemo(() => {
    if (!varianceTotal) return 0;
    const explainedAbs = varianceBreakdown
      .filter((driver) => driver.category !== 'Other / Unexplained')
      .reduce((sum, driver) => sum + Math.abs(driver.value), 0);
    return Math.min(100, Math.round((explainedAbs / Math.abs(varianceTotal)) * 100));
  }, [varianceBreakdown, varianceTotal]);

  if (isLoading) {
    return (
      <div className="h-full min-h-[280px] w-full flex items-center justify-center text-sm text-muted-foreground">
        Loading variance drivers...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="glass-card shadow-sm border-border/50 flex flex-col justify-center">
          <CardHeader className="pb-2">
            <CardTitle>Total Variance</CardTitle>
            <CardDescription>Difference between budgeted and actual performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-4xl font-bold flex items-center ${varianceTotal < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              <TrendingDown className="w-8 h-8 mr-2" />
              {varianceTotal < 0 ? '-' : '+'}${Math.abs(varianceTotal).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </div>
            <p className="text-sm font-medium text-muted-foreground mt-2">
              {varianceBreakdown.length === 0
                ? 'No price, waste, or labor drivers logged for this period yet.'
                : `We have isolated the root causes of ${explainedPct}% of this variance.`}
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card shadow-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle>Top Drivers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {varianceBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No variance drivers for this period.</p>
            ) : (
              [...varianceBreakdown].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 3).map((item, idx) => (
                <div key={idx} className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full`} style={{backgroundColor: item.color}}></div>
                    <span className="font-medium text-sm">{item.category}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold text-sm ${item.value > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {item.value > 0 ? '+' : '-'}${Math.abs(item.value).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card shadow-sm border-border/50">
        <CardHeader>
          <CardTitle>Variance Waterfall Analysis</CardTitle>
          <CardDescription>Visual breakdown of exactly where margin was gained or lost this period</CardDescription>
        </CardHeader>
        <CardContent className="h-[350px]">
          {varianceBreakdown.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No variance drivers for this period.</div>
          ) : (
            <React.Suspense fallback={<ChartFallback />}>
              <VarianceWaterfallChart data={varianceBreakdown} />
            </React.Suspense>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
