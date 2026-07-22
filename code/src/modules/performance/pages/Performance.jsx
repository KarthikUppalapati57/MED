import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DollarSign, TrendingUp, AlertTriangle, Package, Users } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAuthQueries } from '@/hooks/useAuthQuery';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/apiClient';
import { filterByContext } from '@/lib/contextUtils';
import { toast } from "sonner";
import { format } from 'date-fns';

const AvTCosting = React.lazy(() => import('@/modules/inventory/pages/AvTCosting'));
const SalesReportWidget = React.lazy(() => import('@/modules/performance/components/SalesReportWidget').then((module) => ({ default: module.SalesReportWidget })));
const SalesForecastWidget = React.lazy(() => import('@/modules/performance/components/SalesForecastWidget').then((module) => ({ default: module.SalesForecastWidget })));
const UsageReportPage = React.lazy(() => import('@/modules/performance/tabs/UsageReport/UsageReportPage'));
const PredictiveAlerts = React.lazy(() => import('@/modules/labor/components/PredictiveAlerts'));
const PerformanceTrendChart = React.lazy(() => import('@/modules/performance/components/PerformanceCharts').then((module) => ({ default: module.PerformanceTrendChart })));
const CategoryReportPage = React.lazy(() => import('@/modules/performance/tabs/CategoryReport/CategoryReportPage'));
const PriceMoversPage = React.lazy(() => import('@/modules/performance/tabs/PriceMovers/PriceMoversPage'));
const BudgetSetupPage = React.lazy(() => import('@/modules/performance/tabs/BudgetSetup/BudgetSetupPage'));
const OverviewAnalyticsPage = React.lazy(() => import('@/modules/performance/tabs/Overview/OverviewAnalyticsPage'));
const PurchaseReportPage = React.lazy(() => import('@/modules/performance/tabs/PurchaseReport/PurchaseReportPage'));
const LocationBenchmarkingPage = React.lazy(() => import('@/modules/performance/tabs/LocationBenchmarking/LocationBenchmarkingPage'));
const VarianceBreakdownPage = React.lazy(() => import('@/modules/performance/tabs/VarianceBreakdown/VarianceBreakdownPage'));
const ActionCenterPage = React.lazy(() => import('@/modules/performance/tabs/ActionCenter/ActionCenterPage'));
const DailyCostCashPage = React.lazy(() => import('@/modules/performance/tabs/DailyCostCash/DailyCostCashPage'));

function ChartFallback() {
  return (
    <div className="h-full min-h-[240px] w-full flex items-center justify-center text-sm text-muted-foreground">
      Loading chart...
    </div>
  );
}

function TabFallback() {
  return (
    <div className="min-h-[280px] w-full flex items-center justify-center text-sm text-muted-foreground">
      Loading report...
    </div>
  );
}

const money = (value) => `$${Number(value || 0).toLocaleString(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})}`;

const pct = (value) => `${Number(value || 0).toFixed(1)}%`;

const sameDate = (value, target) => {
  if (!value || !target) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === target;
};

export default function Performance() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');

  const { organization, brand, location } = useAuth();
  const now = new Date();

  const [periodStart, setPeriodStart] = useState(
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  );
  const [periodEnd, setPeriodEnd] = useState(
    new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
  );

  const todayKey = now.toISOString().slice(0, 10);

  const filterCb = React.useCallback((data) => filterByContext(data, { organization, brand, location }), [organization, brand, location]);
  const needsSalesData = ['overview', 'pnl', 'sales_report', 'sales_forecast', 'variance'].includes(activeTab);
  const needsInvoices = ['overview', 'pnl'].includes(activeTab);
  const needsShifts = ['overview', 'pnl'].includes(activeTab);
  const needsAllocations = ['overview', 'pnl'].includes(activeTab);
  const needsLineItems = ['overview', 'movers'].includes(activeTab);
  const needsBudgetTargets = ['overview', 'pnl'].includes(activeTab);

  const results = useAuthQueries({
    queries: [
      {
        queryKey: ['performance_metrics', organization?.id, brand?.brand_id || brand?.id, location?.id, periodStart, periodEnd],
        queryFn: () => api.reports.getPerformanceMetrics(organization?.id, periodStart, periodEnd, brand?.brand_id || brand?.id, location?.id),
        enabled: !!organization?.id,
      },
      {
        queryKey: ['budget_targets', organization?.id, brand?.brand_id || brand?.id, location?.id, periodStart, periodEnd],
        queryFn: () => api.entities.BudgetTarget.filter({ organization_id: organization?.id }),
        select: React.useCallback((data) => filterByContext(data, { organization, brand, location })
          .filter((target) => target.period_start === periodStart && target.period_end === periodEnd), [organization, brand, location, periodStart, periodEnd]),
        enabled: !!organization?.id && needsBudgetTargets,
      }
    ]
  });

  const loadingMetrics = results[0].isLoading;
  const metricsData = results[0].data || {
    total_sales: 0, today_sales: 0, total_cogs: 0, today_cogs: 0,
    total_labor: 0, today_labor: 0, prime_cost: 0, pending_invoices_count: 0,
    trend_data: [], category_data: [], movers_data: []
  };

  const budgetTargets = results[1].data || [];

  const budgetByCategory = useMemo(() => {
    const map = {};
    budgetTargets.forEach((target) => {
      map[target.category] = target;
    });
    return map;
  }, [budgetTargets]);

  // --- CORE CALCULATIONS ---
  const totalSales = Number(metricsData.total_sales || 0);
  const totalLaborCost = Number(metricsData.total_labor || 0);
  const totalCogs = Number(metricsData.total_cogs || 0);
  const primeCost = Number(metricsData.prime_cost || 0);

  const salesBudgetTarget = Number(budgetByCategory.Sales?.target_amount || 0);
  const budget = salesBudgetTarget > 0 ? salesBudgetTarget : (totalSales > 0 ? totalSales * 0.95 : 0);
  const variance = budget > 0 ? ((totalSales - budget) / budget) * 100 : 0;

  // --- TREND DATA ---
  const trendData = metricsData.trend_data || [];

  // --- PRICE MOVERS ---
  const moversData = metricsData.movers_data || [];

  // --- P&L DATA ---
  const getTarget = (category, fallback) => Number(budgetByCategory[category]?.target_amount || fallback || 0);
  const pnlData = [
    { category: 'Sales', actual: totalSales, budget: getTarget('Sales', budget) },
    { category: 'COGS', actual: totalCogs, budget: getTarget('COGS', totalCogs * 0.95) },
    { category: 'Labor', actual: totalLaborCost, budget: getTarget('Labor', totalSales * 0.28) },
    { category: 'Controllables', actual: 0, budget: getTarget('Controllables', 0) },
    { category: 'Prime Cost', actual: primeCost, budget: getTarget('Prime Cost', totalCogs * 0.95 + (totalSales * 0.28)) },
  ].map((row) => ({
    ...row,
    variance: row.budget > 0 ? ((row.actual - row.budget) / row.budget) * 100 : 0,
  }));

  const handleExportPnlCSV = async () => {
    if (!pnlData || pnlData.length === 0) return toast.error("No data to export");
    const exportData = pnlData.map(d => ({
      Category: d.category,
      Actual: d.actual.toFixed(2),
      Budget: d.budget.toFixed(2),
      'Variance %': d.variance.toFixed(1) + '%'
    }));
    const { exportToCSV } = await import('@/lib/exportUtils');
    exportToCSV(exportData, `controllable-pnl-${format(new Date(), 'yyyy-MM-dd')}`);
  };

  const handleExportPnlPDF = async () => {
    if (!pnlData || pnlData.length === 0) return toast.error("No data to export");
    const columns = [
      { header: 'Category', dataKey: 'Category' },
      { header: 'Actual ($)', dataKey: 'Actual' },
      { header: 'Budget ($)', dataKey: 'Budget' },
      { header: 'Variance %', dataKey: 'Variance %' }
    ];
    const data = pnlData.map(d => ({
      Category: d.category,
      Actual: d.actual.toLocaleString(undefined, { minimumFractionDigits: 2 }),
      Budget: d.budget.toLocaleString(undefined, { minimumFractionDigits: 2 }),
      'Variance %': d.variance.toFixed(1) + '%'
    }));
    const { exportToPDF } = await import('@/lib/exportUtils');
    exportToPDF(columns, data, 'Controllable P&L', `controllable-pnl-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const dailyPnl = useMemo(() => {
    const todaysSales = Number(metricsData.today_sales || 0);
    const todaysInvoiceSpend = Number(metricsData.today_cogs || 0);
    const todaysLabor = Number(metricsData.today_labor || 0);

    const periodDaysElapsed = Math.max(1, Math.min(now.getDate(), new Date(periodEnd).getDate()));
    const dailySalesTarget = Number(budgetByCategory.Sales?.target_amount || 0) / periodDaysElapsed || (totalSales ? totalSales / periodDaysElapsed : 0);
    const dailyCogsTarget = Number(budgetByCategory.COGS?.target_amount || 0) / periodDaysElapsed || (todaysSales * 0.32);
    const dailyLaborTarget = Number(budgetByCategory.Labor?.target_amount || 0) / periodDaysElapsed || (todaysSales * 0.28);
    const dailyPrimeTarget = Number(budgetByCategory['Prime Cost']?.target_amount || 0) / periodDaysElapsed || (todaysSales * 0.6);
    const prime = todaysInvoiceSpend + todaysLabor;

    const pendingInvoicesCount = Number(metricsData.pending_invoices_count || 0);
    const missingInvoiceRisk = todaysSales > 0 && todaysInvoiceSpend === 0;
    const highPriceMovers = moversData.filter((item) => item.status === 'critical' || item.status === 'warning').slice(0, 5);

    const alerts = [];
    if (missingInvoiceRisk) alerts.push({ tone: 'orange', title: 'Sales without invoice spend', body: 'Today has POS sales but no same-day invoice spend. Confirm vendor documents are uploaded.' });
    if (todaysSales > 0 && (todaysInvoiceSpend / todaysSales) * 100 > 32) alerts.push({ tone: 'red', title: 'COGS above target', body: `Today COGS is ${pct((todaysInvoiceSpend / todaysSales) * 100)} against a 32.0% guardrail.` });
    if (todaysSales > 0 && (todaysLabor / todaysSales) * 100 > 28) alerts.push({ tone: 'red', title: 'Labor above target', body: `Today labor is ${pct((todaysLabor / todaysSales) * 100)} against a 28.0% guardrail.` });
    if (pendingInvoicesCount > 0) alerts.push({ tone: 'blue', title: `${pendingInvoicesCount} invoices need review`, body: 'Clear invoice review so AP, inventory, and P&L stay current.' });
    if (highPriceMovers.length > 0) alerts.push({ tone: 'orange', title: `${highPriceMovers.length} price movers`, body: 'Review vendor item price increases before they distort food cost.' });

    return {
      rows: [
        { label: 'Sales', actual: todaysSales, target: dailySalesTarget, kind: 'sales' },
        { label: 'COGS', actual: todaysInvoiceSpend, target: dailyCogsTarget, kind: 'cost' },
        { label: 'Labor', actual: todaysLabor, target: dailyLaborTarget, kind: 'cost' },
        { label: 'Prime Cost', actual: prime, target: dailyPrimeTarget, kind: 'cost' },
      ].map((row) => ({
        ...row,
        percentOfSales: todaysSales > 0 ? (row.actual / todaysSales) * 100 : 0,
        variance: row.target > 0 ? ((row.actual - row.target) / row.target) * 100 : 0,
      })),
      todaysSales,
      todaysInvoiceSpend,
      todaysLabor,
      prime,
      primePercent: todaysSales > 0 ? (prime / todaysSales) * 100 : 0,
      grossProfit: todaysSales - todaysInvoiceSpend,
      estimatedControllableProfit: todaysSales - prime,
      invoicesCaptured: 0,
      pendingInvoices: pendingInvoicesCount,
      highPriceMovers,
      alerts,
      coverage: [
        { label: 'POS Sales', ready: totalSales > 0, count: totalSales > 0 ? 1 : 0 },
        { label: 'Invoices', ready: totalCogs > 0, count: totalCogs > 0 ? 1 : 0 },
        { label: 'Labor', ready: totalLaborCost > 0, count: totalLaborCost > 0 ? 1 : 0 },
        { label: 'Budgets', ready: budgetTargets.length > 0, count: budgetTargets.length },
      ],
    };
  }, [metricsData, todayKey, budgetByCategory, periodEnd, totalSales, moversData, budgetTargets.length]);

  // --- HEALTH SCORE COMPUTATION ---
  const readySources = dailyPnl.coverage.filter(c => c.ready).length;
  const totalSources = dailyPnl.coverage.length;
  const healthScore = Math.round((readySources / totalSources) * 100);
  const showHealthBanner = readySources < totalSources && !loadingMetrics;

  return (
    <div className="space-y-6 animate-fade-in-scale flex flex-col h-full w-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Performance Analytics</h1>
          <p className="text-muted-foreground mt-1 text-lg">High-level KPIs, actual vs budget, and trend analysis.</p>
        </div>
        <div className="flex items-center gap-2 bg-card border border-border/50 p-1.5 rounded-lg shadow-sm">
          <Input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="w-[140px] h-9 border-none bg-transparent"
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="w-[140px] h-9 border-none bg-transparent"
          />
        </div>
      </div>

      {showHealthBanner && (
        <div className="bg-[#151110] border border-brand/20 rounded-xl p-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-5">
            <div className="relative flex items-center justify-center w-12 h-12">
              <svg className="w-12 h-12 transform -rotate-90">
                <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-brand/10" />
                <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" fill="transparent" strokeDasharray={125.6} strokeDashoffset={125.6 - (125.6 * healthScore) / 100} className="text-brand transition-all duration-1000 ease-in-out" />
              </svg>
              <div className="absolute flex items-center justify-center text-[10px] font-bold text-brand">
                {healthScore}%
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white/90">Data Health Score</h3>
              <p className="text-xs text-white/60 mt-0.5">
                {readySources} of {totalSources} accessible data sources are feeding this dashboard. {totalSources - readySources} sources still need setup or records.
              </p>
            </div>
          </div>
          <Button size="sm" className="bg-brand hover:bg-brand/90 text-white font-medium px-6 py-4 h-auto shadow-md transition-all" onClick={() => navigate('/Integrations')}>
            Complete Onboarding
          </Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col">
        <TabsList className="mb-6 flex flex-wrap gap-2 h-auto bg-transparent border-b rounded-none w-full justify-start shrink-0">
          <TabsTrigger value="overview" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Overview</TabsTrigger>
          <TabsTrigger value="daily_cost_cash" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Daily Cost & Cash</TabsTrigger>
          <TabsTrigger value="pnl" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Controllable P&L</TabsTrigger>
          <TabsTrigger value="category" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Category Report</TabsTrigger>
          <TabsTrigger value="movers" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Price Movers</TabsTrigger>
          <TabsTrigger value="purchase_report" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Purchase Report</TabsTrigger>
          <TabsTrigger value="sales_report" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Sales Report</TabsTrigger>
          <TabsTrigger value="sales_forecast" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Sales Forecast</TabsTrigger>
          <TabsTrigger value="usage_report" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Usage Report</TabsTrigger>
          <TabsTrigger value="avt" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Theoretical Usage (AvT)</TabsTrigger>
          <TabsTrigger value="benchmarking" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Location Benchmarking</TabsTrigger>
          <TabsTrigger value="variance" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Variance Breakdown</TabsTrigger>
          <TabsTrigger value="action_center" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Action Center</TabsTrigger>
          <TabsTrigger value="budget" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Budget Setup</TabsTrigger>
        </TabsList>

        <div className="flex-1 w-full relative">
                    <TabsContent value="overview" className="space-y-6 m-0 h-full">
            <React.Suspense fallback={<TabFallback />}>
              <OverviewAnalyticsPage />
            </React.Suspense>
          </TabsContent>

          <TabsContent value="daily_cost_cash" className="space-y-6 m-0">
            <React.Suspense fallback={<TabFallback />}>
              <DailyCostCashPage />
            </React.Suspense>
          </TabsContent>

          <TabsContent value="pnl" className="space-y-6 m-0">
            <Card className="glass-card shadow-sm border-border/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle>Controllable P&L</CardTitle>
                  <CardDescription>Period-to-date performance against budget</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleExportPnlCSV}>Export CSV</Button>
                  <Button variant="outline" size="sm" onClick={handleExportPnlPDF}>Export PDF</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto w-full">
                  <Table className="w-full">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Actual</TableHead>
                        <TableHead className="text-right">Budget</TableHead>
                        <TableHead className="text-right">Variance</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pnlData.map((item, idx) => {
                        const isPositive = item.category === 'Sales' ? item.variance >= 0 : item.variance <= 0;
                        return (
                          <TableRow key={idx}>
                            <TableCell className="font-medium whitespace-nowrap">{item.category}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">${item.actual.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">${item.budget.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <span className={isPositive ? 'text-resend-green' : 'text-resend-red'}>
                                {item.variance > 0 ? '+' : ''}{item.variance.toFixed(1)}%
                              </span>
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              {isPositive ? (
                                <Badge className="bg-resend-green/10 text-resend-green hover:bg-resend-green/20">On Target</Badge>
                              ) : (
                                <Badge className="bg-resend-red/10 text-resend-red hover:bg-resend-red/20">Over Budget</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="category" className="space-y-6 m-0">
            <React.Suspense fallback={<TabFallback />}>
              <CategoryReportPage />
            </React.Suspense>
          </TabsContent>

          <TabsContent value="movers" className="space-y-6 m-0">
            <React.Suspense fallback={<TabFallback />}>
              <PriceMoversPage />
            </React.Suspense>
          </TabsContent>

          <TabsContent value="purchase_report" className="space-y-6 m-0">
            <React.Suspense fallback={<TabFallback />}>
              <PurchaseReportPage />
            </React.Suspense>
          </TabsContent>

          <TabsContent value="budget" className="space-y-6 m-0">
            <React.Suspense fallback={<TabFallback />}>
              <BudgetSetupPage />
            </React.Suspense>
          </TabsContent>

          <TabsContent value="sales_report" className="space-y-6 m-0">
            {activeTab === 'sales_report' && (
              <React.Suspense fallback={<TabFallback />}>
                <SalesReportWidget salesData={salesData} />
              </React.Suspense>
            )}
          </TabsContent>

          <TabsContent value="sales_forecast" className="space-y-6 m-0">
            {activeTab === 'sales_forecast' && (
              <React.Suspense fallback={<TabFallback />}>
                <SalesForecastWidget salesData={salesData} />
              </React.Suspense>
            )}
          </TabsContent>

          <TabsContent value="usage_report" className="space-y-6 m-0">
            <React.Suspense fallback={<TabFallback />}>
              <UsageReportPage />
            </React.Suspense>
          </TabsContent>

          <TabsContent value="avt" className="space-y-0 m-0">
            {activeTab === 'avt' && (
              <React.Suspense fallback={<TabFallback />}>
                <AvTCosting />
              </React.Suspense>
            )}
          </TabsContent>

          <TabsContent value="benchmarking" className="space-y-6 m-0">
            <React.Suspense fallback={<TabFallback />}>
              <LocationBenchmarkingPage />
            </React.Suspense>
          </TabsContent>

          <TabsContent value="variance" className="space-y-6 m-0">
            <React.Suspense fallback={<TabFallback />}>
              <VarianceBreakdownPage />
            </React.Suspense>
          </TabsContent>

          <TabsContent value="action_center" className="space-y-6 m-0">
            <React.Suspense fallback={<TabFallback />}>
              <ActionCenterPage />
            </React.Suspense>
          </TabsContent>


        </div>
      </Tabs>
    </div>
  );
}
