import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const BudgetSetupPage = React.lazy(() => import('@/modules/performance/tabs/BudgetSetup/BudgetSetupPage'));
const PhaseOneOverview = React.lazy(() => import('@/modules/performance/components/PhaseOneOverview'));
const SpendProductsPage = React.lazy(() => import('@/modules/performance/tabs/SpendProducts/SpendProductsPage'));
const InventoryRecipesPage = React.lazy(() => import('@/modules/performance/tabs/InventoryRecipes/InventoryRecipesPage'));

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
          The first release uses Invoices, Payments, Products, Inventory, and Recipes. This view needs additional module inputs, so it will stay disabled until the next expansion.
        </p>
        {available ? (
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
            <p className="text-sm font-medium mb-2">Available now</p>
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

const ACTIVE_ANALYTICS = ['Overview', 'Budgets', 'Spend & Products', 'Inventory & Recipes'];
const TAB_CLASS = 'data-[state=active]:border-b-2 data-[state=active]:border-brand rounded-none bg-transparent';

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
            Analytics across invoices, payments, products, inventory, and recipes.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-card border border-border/50 p-1.5 rounded-lg shadow-sm">
          <Input
            type="date"
            value={periodStart}
            max={periodEnd}
            onChange={(event) => setPeriodStart(event.target.value)}
            className="w-[140px] h-9 border-none bg-transparent"
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            value={periodEnd}
            min={periodStart}
            onChange={(event) => setPeriodEnd(event.target.value)}
            className="w-[140px] h-9 border-none bg-transparent"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col">
        <TabsList className="mb-6 flex flex-wrap gap-2 h-auto bg-transparent border-b rounded-none w-full justify-start shrink-0">
          <TabsTrigger value="overview" className={TAB_CLASS}>Overview</TabsTrigger>
          <TabsTrigger value="budget" className={TAB_CLASS}>Budgets</TabsTrigger>
          <TabsTrigger value="spend_products" className={TAB_CLASS}>Spend & Products</TabsTrigger>
          <TabsTrigger value="inventory_recipes" className={TAB_CLASS}>Inventory & Recipes</TabsTrigger>
          <TabsTrigger value="daily_pnl" className={TAB_CLASS}>Daily P&L</TabsTrigger>
          <TabsTrigger value="pnl" className={TAB_CLASS}>Controllable P&L</TabsTrigger>
          <TabsTrigger value="sales_report" className={TAB_CLASS}>Sales Report</TabsTrigger>
          <TabsTrigger value="sales_forecast" className={TAB_CLASS}>Sales Forecast</TabsTrigger>
          <TabsTrigger value="avt" className={TAB_CLASS}>Theoretical Usage (AvT)</TabsTrigger>
          <TabsTrigger value="benchmarking" className={TAB_CLASS}>Benchmarking</TabsTrigger>
          <TabsTrigger value="variance" className={TAB_CLASS}>Variance Breakdown</TabsTrigger>
          <TabsTrigger value="action_center" className={TAB_CLASS}>Action Center</TabsTrigger>
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
              <BudgetSetupPage periodStart={periodStart} periodEnd={periodEnd} />
            </React.Suspense>
          </TabsContent>

          <TabsContent value="spend_products" className="space-y-6 m-0">
            <React.Suspense fallback={<TabFallback />}>
              <SpendProductsPage periodStart={periodStart} periodEnd={periodEnd} />
            </React.Suspense>
          </TabsContent>

          <TabsContent value="inventory_recipes" className="space-y-6 m-0">
            <React.Suspense fallback={<TabFallback />}>
              <InventoryRecipesPage periodStart={periodStart} periodEnd={periodEnd} />
            </React.Suspense>
          </TabsContent>

          <TabsContent value="daily_pnl" className="space-y-6 m-0">
            <ComingSoonPanel
              title="Daily P&L"
              description="Daily P&L needs sales and labor inputs, which are planned for a later expansion."
              available={ACTIVE_ANALYTICS}
            />
          </TabsContent>

          <TabsContent value="pnl" className="space-y-6 m-0">
            <ComingSoonPanel
              title="Controllable P&L"
              description="Full controllable P&L needs sales, labor, and prime-cost guardrails. Current analytics focus on spend, payments, inventory, and recipe margin pressure."
              available={['Budget exposure', 'Payment exposure', 'Inventory usage', 'Recipe margin signals']}
            />
          </TabsContent>

          <TabsContent value="sales_report" className="space-y-6 m-0">
            <ComingSoonPanel
              title="Sales Report"
              description="Sales reporting needs POS or sales imports, which are planned after the current module set."
              available={['Invoice spend trend', 'Payment status exposure', 'Product price movers']}
            />
          </TabsContent>

          <TabsContent value="sales_forecast" className="space-y-6 m-0">
            <ComingSoonPanel
              title="Sales Forecast"
              description="Forecasting needs historical sales and demand signals. It will be enabled after POS or sales data is in scope."
              available={['Inventory risk', 'Recipe margin pressure', 'Category spend trend']}
            />
          </TabsContent>

          <TabsContent value="avt" className="space-y-0 m-0">
            <ComingSoonPanel
              title="Theoretical Usage (AvT)"
              description="Theoretical usage needs POS/menu depletion models. Current analytics keep actual inventory usage and invoice-product analytics active."
              available={['Inventory & Recipes', 'Inventory risk', 'Product price movers']}
            />
          </TabsContent>

          <TabsContent value="benchmarking" className="space-y-0 m-0">
            <ComingSoonPanel
              title="Benchmarking"
              description="Cross-location and peer benchmarking will come after the current module data is stable across locations."
              available={['Overview', 'Spend & Products', 'Budgets']}
            />
          </TabsContent>

          <TabsContent value="variance" className="space-y-6 m-0">
            <ComingSoonPanel
              title="Variance Breakdown"
              description="Advanced variance waterfall needs sales, labor, and forecast baselines. Current variance is available in budget exposure, category performance, and price movement impact."
              available={['Budget variance', 'Category variance', 'Price movement impact']}
            />
          </TabsContent>

          <TabsContent value="action_center" className="space-y-6 m-0">
            <ComingSoonPanel
              title="Action Center"
              description="The full action center uses AI, sales, labor, and workflow automation. Current action signals are shown in the Overview."
              available={['Overview action signals', 'Over-budget categories', 'Payment exposure', 'Inventory risk']}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
