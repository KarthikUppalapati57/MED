import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TrendingDown } from "lucide-react";

const VarianceWaterfallChart = React.lazy(() => import('@/components/performance/PerformanceCharts').then((module) => ({ default: module.VarianceWaterfallChart })));

function ChartFallback() {
  return (
    <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
      Loading chart...
    </div>
  );
}

export function ExplainableVarianceWidget({ varianceTotal = -1250.00 }) {
  // Mock data to demonstrate the breakdown of variance
  // Negative means margin loss (cost increase / revenue loss)
  const varianceBreakdown = [
    { category: 'Invoice Price Changes', value: -450, desc: 'Vendor cost increases (e.g. Ground Beef +12%)', color: '#ef4444' }, // red-500
    { category: 'Product Mix', value: 150, desc: 'Higher sales of high-margin items (e.g. Soda)', color: '#10b981' }, // emerald-500
    { category: 'Waste / Spoilage', value: -320, desc: 'Logged waste in prep & expired inventory', color: '#ef4444' },
    { category: 'Labor Pacing', value: -480, desc: 'Over-staffing during slow periods (Tue/Wed)', color: '#ef4444' },
    { category: 'Theft / Unlogged', value: -150, desc: 'AvT variance not accounted for by waste logs', color: '#f59e0b' }, // amber-500
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="glass-card shadow-sm border-border/50 flex flex-col justify-center">
          <CardHeader className="pb-2">
            <CardTitle>Total Unexplained Variance</CardTitle>
            <CardDescription>Difference between theoretical budget and actual performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-rose-600 flex items-center">
              <TrendingDown className="w-8 h-8 mr-2" />
              -${Math.abs(varianceTotal).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </div>
            <p className="text-sm font-medium text-muted-foreground mt-2">
              We have successfully isolated the root causes of 88% of this margin loss.
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card shadow-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle>Top Drivers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {varianceBreakdown.sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 3).map((item, idx) => (
              <div key={idx} className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full`} style={{backgroundColor: item.color}}></div>
                  <span className="font-medium text-sm">{item.category}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-semibold text-sm ${item.value > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {item.value > 0 ? '+' : '-'}${Math.abs(item.value)}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card shadow-sm border-border/50">
        <CardHeader>
          <CardTitle>Variance Waterfall Analysis</CardTitle>
          <CardDescription>Visual breakdown of exactly where margin was gained or lost this period</CardDescription>
        </CardHeader>
        <CardContent className="h-[350px]">
          <React.Suspense fallback={<ChartFallback />}>
            <VarianceWaterfallChart data={varianceBreakdown} />
          </React.Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
