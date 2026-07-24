import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const UsageReportPage = React.lazy(() => import('@/modules/performance/tabs/UsageReport/UsageReportPage'));
const CategoryReportPage = React.lazy(() => import('@/modules/performance/tabs/CategoryReport/CategoryReportPage'));
const PriceMoversPage = React.lazy(() => import('@/modules/performance/tabs/PriceMovers/PriceMoversPage'));
const BudgetSetupPage = React.lazy(() => import('@/modules/performance/tabs/BudgetSetup/BudgetSetupPage'));
const PhaseOneOverview = React.lazy(() => import('@/modules/performance/components/PhaseOneOverview'));

function startOfMonthIso(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
}

function endOfMonthIso(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0];
}

function TabFallback() {
  return (
    <div className="min-h-[280px] w-full flex items-center justify-center text-sm text-muted-foreground">
      Loading report...
    </div>
  );
}

function ComingSoonPanel({ title, description, available }) {
  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          <Badge variant="secondary" className="w-fit">Coming Soon</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground max-w-3xl">
          Phase 1 Performance is limited to Invoices, Payments, Products, Inventory, and Recipes. This view needs Sales, Labor, POS, forecasting, or advanced cross-location inputs, so it will stay disabled until a later phase.
        </p>
        {available ? (
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
            <p className="text-sm font-medium mb-2">Available now in Phase 1</p>
            <div className="flex flex-wrap gap-2">
              {available.map((item) => (
                <Badge key={item} variant="outline">{item}</Badge>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

const ACTIVE_PHASE_ONE = ['Budget Setup', 'Category Report', 'Price Movers', 'Usage Report', 'Phase 1 Overview'];

export default function Performance() {
  const now = new Date();
  const [activeTab, setActiveTab] = useState('overview');
  const [periodStart, setPeriodStart] = useState(startOfMonthIso(now));
  const [periodEnd, setPeriodEnd] = useState(endOfMonthIso(now));

  return (
    <div className="space-y-6 animate-fade-in-scale flex flex-col h-full w-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Performance Analytics</h1>
          <p className="text-muted-foreground mt-1 text-lg">
            Phase 1 analytics across invoices, payments, products, inventory, and recipes.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-card border border-border/50 p-1.5 rounded-lg shadow-sm">
          <Input
            type="date"
            value={periodStart}
            onChange={(event) => setPeriodStart(event.target.value)}
            className="w-[140px] h-9 border-none bg-transparent"
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            value={periodEnd}
            onChange={(event) => setPeriodEnd(event.target.value)}
            className="w-[140px] h-9 border-none bg-transparent"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col">
        <TabsList className="mb-6 flex flex-wrap gap-2 h-auto bg-transparent border-b rounded-none w-full justify-start shrink-0">
          <TabsTrigger value="overview" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Overview</TabsTrigger>
          <TabsTrigger value="budget" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Budget Setup</TabsTrigger>
          <TabsTrigger value="category" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Category Report</TabsTrigger>
          <TabsTrigger value="movers" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Price Movers</TabsTrigger>
          <TabsTrigger value="usage_report" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Usage Report</TabsTrigger>
          <TabsTrigger value="daily_pnl" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Daily P&L</TabsTrigger>
          <TabsTrigger value="pnl" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Controllable P&L</TabsTrigger>
          <TabsTrigger value="sales_report" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Sales Report</TabsTrigger>
          <TabsTrigger value="sales_forecast" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Sales Forecast</TabsTrigger>
          <TabsTrigger value="avt" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Theoretical Usage (AvT)</TabsTrigger>
          <TabsTrigger value="benchmarking" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Benchmarking</TabsTrigger>
          <TabsTrigger value="variance" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Variance Breakdown</TabsTrigger>
          <TabsTrigger value="action_center" className="data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent">Action Center</TabsTrigger>
        </TabsList>

        <div className="flex-1 w-full relative">
          <TabsContent value="overview" className="space-y-6 m-0 h-full">
            <React.Suspense fallback={<TabFallback />}>
              <PhaseOneOverview
                periodStart={periodStart}
                periodEnd={periodEnd}
                onOpenTab={setActiveTab}
              />
            </React.Suspense>
          </TabsContent>

          <TabsContent value="budget" className="space-y-6 m-0">
            <React.Suspense fallback={<TabFallback />}>
              <BudgetSetupPage />
            </React.Suspense>
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

          <TabsContent value="usage_report" className="space-y-6 m-0">
            <React.Suspense fallback={<TabFallback />}>
              <UsageReportPage />
            </React.Suspense>
          </TabsContent>

          <TabsContent value="daily_pnl" className="space-y-6 m-0">
            <ComingSoonPanel
              title="Daily P&L"
              description="Daily P&L needs sales and labor inputs, which are outside the five Phase 1 modules."
              available={ACTIVE_PHASE_ONE}
            />
          </TabsContent>

          <TabsContent value="pnl" className="space-y-6 m-0">
            <ComingSoonPanel
              title="Controllable P&L"
              description="Full P&L needs sales, labor, and prime-cost guardrails. Phase 1 will focus on invoice/product category budgets and spend."
              available={['Budget vs Actual Categories', 'Payment Exposure', 'Inventory Usage', 'Recipe Margin Signals']}
            />
          </TabsContent>

          <TabsContent value="sales_report" className="space-y-6 m-0">
            <ComingSoonPanel
              title="Sales Report"
              description="Sales reporting needs POS or sales imports, which are planned after Phase 1."
              available={['Invoice Spend Trend', 'Payment Status Exposure', 'Product Price Movers']}
            />
          </TabsContent>

          <TabsContent value="sales_forecast" className="space-y-6 m-0">
            <ComingSoonPanel
              title="Sales Forecast"
              description="Forecasting needs historical sales and demand signals. It will be enabled after POS/sales data is in scope."
              available={['Inventory Risk', 'Recipe Margin Pressure', 'Category Spend Trend']}
            />
          </TabsContent>

          <TabsContent value="avt" className="space-y-0 m-0">
            <ComingSoonPanel
              title="Theoretical Usage (AvT)"
              description="Theoretical usage needs POS/menu depletion models. Phase 1 keeps actual inventory usage and invoice-product analytics active."
              available={['Usage Report', 'Inventory Risk', 'Product Price Movers']}
            />
          </TabsContent>

          <TabsContent value="benchmarking" className="space-y-0 m-0">
            <ComingSoonPanel
              title="Benchmarking"
              description="Cross-location and peer benchmarking will come after the Phase 1 module data is stable across locations."
              available={['Phase 1 Overview', 'Category Report', 'Budget Setup']}
            />
          </TabsContent>

          <TabsContent value="variance" className="space-y-6 m-0">
            <ComingSoonPanel
              title="Variance Breakdown"
              description="Advanced variance waterfall needs sales, labor, and forecast baselines. Phase 1 variance is available in Budget vs Actual and Category Report."
              available={['Budget Variance', 'Category Variance', 'Price Movement Impact']}
            />
          </TabsContent>

          <TabsContent value="action_center" className="space-y-6 m-0">
            <ComingSoonPanel
              title="Action Center"
              description="The full action center uses AI, sales, labor, and workflow automation. Phase 1 action signals are shown in the Overview."
              available={['Overview Action Signals', 'Over-Budget Categories', 'Payment Exposure', 'Inventory Risk']}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}