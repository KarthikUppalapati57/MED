import React, { useState } from 'react';
import {
  Activity,
  BarChart3,
  Boxes,
  CalendarDays,
  ChefHat,
  CreditCard,
  FileText,
  LineChart,
  Target,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/AuthContext';

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
    <div className="performance-panel-card min-h-[280px] w-full flex items-center justify-center text-sm text-muted-foreground" string="progress">
      Loading report...
    </div>
  );
}

function ComingSoonPanel({ title, description, available }) {
  return (
    <Card className="performance-panel-card overflow-hidden" string="progress">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <Badge className="mb-3 w-fit bg-brand/10 text-brand border border-brand/20">Next analytics layer</Badge>
            <CardTitle>{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          <Badge variant="secondary" className="w-fit border border-border/70">Coming Soon</Badge>
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
const PERFORMANCE_ROLES = new Set([
  'location_manager',
  'branch_manager',
  'brand_manager',
  'org_manager',
  'tenant_super_admin',
  'platform_admin',
]);
const ACTIVE_TAB_VALUES = ['overview', 'budget', 'spend_products', 'inventory_recipes'];
const TAB_CLASS = 'performance-tab-button data-[state=active]:is-active';
const TAB_ITEMS = [
  { value: 'overview', label: 'Overview', icon: BarChart3, status: 'Live' },
  { value: 'budget', label: 'Budgets', icon: Target, status: 'Live' },
  { value: 'spend_products', label: 'Spend & Products', icon: FileText, status: 'Live' },
  { value: 'inventory_recipes', label: 'Inventory & Recipes', icon: Boxes, status: 'Live' },
  { value: 'daily_pnl', label: 'Daily P&L', icon: LineChart, status: 'Soon' },
  { value: 'pnl', label: 'Controllable P&L', icon: TrendingUp, status: 'Soon' },
  { value: 'sales_report', label: 'Sales Report', icon: BarChart3, status: 'Soon' },
  { value: 'sales_forecast', label: 'Sales Forecast', icon: Activity, status: 'Soon' },
  { value: 'avt', label: 'Theoretical Usage', icon: ChefHat, status: 'Soon' },
  { value: 'benchmarking', label: 'Benchmarking', icon: Boxes, status: 'Soon' },
  { value: 'variance', label: 'Variance Breakdown', icon: LineChart, status: 'Soon' },
  { value: 'action_center', label: 'Action Center', icon: Activity, status: 'Soon' },
];

function formatShortDate(value) {
  if (!value) return 'Not set';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function PerformanceHero({ periodStart, periodEnd, setPeriodStart, setPeriodEnd, activeTab }) {
  const activeLiveCount = ACTIVE_TAB_VALUES.length;
  const tabStatus = ACTIVE_TAB_VALUES.includes(activeTab) ? 'Live analysis' : 'Planned analysis';

  return (
    <section className="performance-command-hero" string="progress">
      <div className="performance-command-grid">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="performance-hero-badge">Performance Command Center</Badge>
            <Badge className="performance-hero-badge performance-hero-badge-live">{tabStatus}</Badge>
          </div>
          <h1 className="mt-4 max-w-4xl text-3xl font-black tracking-tight text-white md:text-5xl">
            Turn spend, inventory, and recipe pressure into decisions.
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-white/80 md:text-base">
            A sharper analytics cockpit for budgets, category spend, product movement, payment exposure, inventory usage, and recipe margin signals.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="performance-hero-stat">
              <span>Live views</span>
              <strong>{activeLiveCount}</strong>
              <small>ready now</small>
            </div>
            <div className="performance-hero-stat">
              <span>Inputs</span>
              <strong>5</strong>
              <small>modules connected</small>
            </div>
            <div className="performance-hero-stat">
              <span>Period</span>
              <strong>{formatShortDate(periodStart)} - {formatShortDate(periodEnd)}</strong>
              <small>analysis window</small>
            </div>
          </div>
        </div>

        <div className="performance-focus-panel">
          <div className="performance-focus-topline">
            <div>
              <span>Analytics coverage</span>
              <strong>Active layer</strong>
            </div>
            <Badge className="bg-white/15 text-white border border-white/20">{activeLiveCount}/12 tabs</Badge>
          </div>
          <div className="performance-focus-meter">
            <span style={{ width: `${Math.round((activeLiveCount / TAB_ITEMS.length) * 100)}%` }} />
          </div>
          <div className="performance-date-card">
            <CalendarDays className="h-4 w-4 text-white/70" />
            <Input
              type="date"
              value={periodStart}
              max={periodEnd}
              onChange={(event) => setPeriodStart(event.target.value)}
              className="h-9 border-white/10 bg-white/10 text-white [color-scheme:dark]"
            />
            <Input
              type="date"
              value={periodEnd}
              min={periodStart}
              onChange={(event) => setPeriodEnd(event.target.value)}
              className="h-9 border-white/10 bg-white/10 text-white [color-scheme:dark]"
            />
          </div>
          <div className="performance-source-list">
            {[
              { label: 'Invoices', icon: FileText },
              { label: 'Payments', icon: CreditCard },
              { label: 'Products', icon: Boxes },
              { label: 'Inventory', icon: Boxes },
              { label: 'Recipes', icon: ChefHat },
            ].map((source) => (
              <div key={source.label}>
                <source.icon className="h-4 w-4" />
                <span>{source.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Performance() {
  const now = new Date();
  const { location, role } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [periodStart, setPeriodStart] = useState(startOfMonthIso(now));
  const [periodEnd, setPeriodEnd] = useState(endOfMonthIso(now));

  if (role && !PERFORMANCE_ROLES.has(role)) {
    return (
      <Card className="m-6">
        <CardHeader>
          <CardTitle>Performance access restricted</CardTitle>
          <CardDescription>
            Performance reporting is available to location managers and higher roles.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!location?.id) {
    return (
      <Card className="m-6">
        <CardHeader>
          <CardTitle>Select a location</CardTitle>
          <CardDescription>
            Performance reporting always requires one active location. Choose a location from the
            global organization and location selector to continue.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="performance-visual-page space-y-6 animate-fade-in-scale flex flex-col h-full w-full" string="progress">
      <PerformanceHero
        periodStart={periodStart}
        periodEnd={periodEnd}
        setPeriodStart={setPeriodStart}
        setPeriodEnd={setPeriodEnd}
        activeTab={activeTab}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col">
        <TabsList className="performance-tab-grid mb-6 h-auto shrink-0">
          {TAB_ITEMS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className={TAB_CLASS}>
              <tab.icon className="h-4 w-4" />
              <span>{tab.label}</span>
              <Badge variant={tab.status === 'Live' ? 'default' : 'secondary'} className="ml-auto text-[10px]">
                {tab.status}
              </Badge>
            </TabsTrigger>
          ))}
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
