import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChefHat, PackageCheck, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import UsageReportPage from '@/modules/performance/tabs/UsageReport/UsageReportPage';
import { formatMoney, formatPct } from '@/modules/performance/services/performanceAnalytics';
import {
  prepareRecipeRows,
  summarizeRecipeCoverage,
} from '@/modules/performance/services/inventoryRecipeCalculations';
import { fetchLocationRecipeAnalytics } from '@/modules/performance/services/performanceRecipeCatalog';

const COLORS = ['#0f766e', '#b45309', '#be123c', '#1d4ed8', '#7c3aed'];

function StatPill({ icon: Icon, label, value, tone = 'default' }) {
  const toneClass = {
    good: 'bg-teal-50 text-teal-900 border-teal-200',
    warn: 'bg-amber-50 text-amber-900 border-amber-200',
    risk: 'bg-rose-50 text-rose-900 border-rose-200',
    default: 'bg-muted/40 text-foreground border-border/50',
  }[tone];

  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="flex items-center gap-2 text-xs opacity-80">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      <p className="text-xl font-semibold mt-2">{value}</p>
    </div>
  );
}

function RecipeMarginPanel() {
  const { organization, brand, location } = useAuth();
  const query = useAuthQuery({
    queryKey: [
      'inventory_recipes_recipe_margin',
      organization?.id,
      brand?.brand_id || brand?.id,
      location?.id,
    ],
    queryFn: () => fetchLocationRecipeAnalytics({ organization, brand, location }),
    enabled: Boolean(organization?.id && location?.id),
    throwOnError: false,
  });
  const recipes = query.data || [];

  const analytics = useMemo(() => {
    const coverage = summarizeRecipeCoverage(recipes);
    const rows = prepareRecipeRows(recipes);
    const pressureRows = rows
      .filter((row) => row.calculable)
      .map((row) => ({
        ...row,
        pressure: Math.max(
          0,
          row.targetMargin !== null
            ? row.targetMargin - row.grossMargin
            : 30 - row.grossMargin
        ),
      }))
      .filter((row) => row.pressure > 0);
    const chartRows = pressureRows
      .sort((a, b) => b.pressure - a.pressure)
      .slice(0, 7);
    const averageCost = coverage.calculableRows.length
      ? coverage.calculableRows.reduce((sum, row) => sum + row.ingredientCost, 0)
        / coverage.calculableRows.length
      : null;
    const healthyPct = coverage.calculableCount
      ? ((coverage.calculableCount - pressureRows.length) / coverage.calculableCount) * 100
      : null;

    return { ...coverage, rows, pressureRows, chartRows, averageCost, healthyPct };
  }, [recipes]);

  const isEmpty = !query.isLoading && !query.isError && analytics.rows.length === 0;
  const radialData = [{
    name: 'Healthy margin',
    value: Math.max(0, Math.min(100, analytics.healthyPct ?? 0)),
    fill: '#0f766e',
  }];

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">Inventory + Recipes</p>
          <h2 className="text-2xl font-semibold tracking-tight mt-1">Inventory & Recipes</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Actual inventory usage, current-state stock risk, current-state recipe cost, and current-state recipe margin pressure using the five active modules.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatPill
          icon={ChefHat}
          label="Median current recipe margin"
          value={query.isLoading ? '...' : formatPct(analytics.medianMargin)}
          tone={
            analytics.medianMargin === null
              ? 'default'
              : analytics.medianMargin >= 35
                ? 'good'
                : analytics.medianMargin >= 25
                  ? 'warn'
                  : 'risk'
          }
        />
        <StatPill
          icon={ShieldAlert}
          label="Margin pressure recipes"
          value={query.isLoading ? '...' : String(analytics.pressureRows.length)}
          tone={analytics.pressureRows.length ? 'risk' : 'good'}
        />
        <StatPill
          icon={PackageCheck}
          label="Average current recipe cost"
          value={query.isLoading ? '...' : formatMoney(analytics.averageCost, 'USD')}
          tone="default"
        />
      </div>

      {query.isError ? (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">
            Recipe analytics could not be loaded: {query.error?.message || 'Unknown error'}
          </CardContent>
        </Card>
      ) : null}
      {!query.isLoading && analytics.partial ? (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardContent className="p-4 text-sm text-amber-900">
            Source partially complete: recipe margin coverage is partial: {analytics.calculableCount} of {analytics.totalCount}
            {' '}recipes have a stored recipe cost and a positive effective location price.
          </CardContent>
        </Card>
      ) : null}
      {!query.isLoading && analytics.storedCostOnlyCount > 0 ? (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardContent className="p-4 text-sm text-amber-900">
            {analytics.storedCostOnlyCount} recipes use the Recipe module’s stored cost because
            normalized ingredient cost snapshots are incomplete. Margins remain calculable, but
            ingredient-level cost provenance is partial, not failed or complete.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2 glass-card border-border/50 shadow-sm hover-lift">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recipe margin pressure</CardTitle>
            <CardDescription>Recipes below target margin or below a 30% margin watch line.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {query.isLoading ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading recipe margin...</div>
              ) : isEmpty ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center">
                  No recipe price and cost data is available yet.
                </div>
              ) : analytics.pressureRows.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center">
                  No recipe margin pressure detected from current recipe pricing.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.chartRows} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="recipeName" tick={{ fontSize: 11 }} interval={0} angle={-16} textAnchor="end" height={72} />
                    <YAxis tickFormatter={(value) => `${value}%`} />
                    <Tooltip formatter={(value, name) => [name === 'cost' || name === 'price' ? formatMoney(value, 'USD') : formatPct(value), name]} />
                    <Bar dataKey="grossMargin" name="Margin" radius={[4, 4, 0, 0]}>
                      {analytics.chartRows.map((entry, index) => (
                        <Cell key={entry.id || entry.recipeName} fill={entry.grossMargin < 20 ? '#be123c' : COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-border/50 shadow-sm hover-lift">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Margin health</CardTitle>
            <CardDescription>Share of recipes with acceptable margin data.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart innerRadius="64%" outerRadius="90%" data={radialData} startAngle={90} endAngle={-270}>
                  <RadialBar dataKey="value" cornerRadius={8} background={{ fill: '#e2e8f0' }} />
                  <Tooltip formatter={(value) => formatPct(value)} />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center -mt-28 mb-12 pointer-events-none">
              <div className="text-center">
                <p className="text-3xl font-semibold">{query.isLoading ? '...' : formatPct(analytics.healthyPct)}</p>
                <p className="text-xs text-muted-foreground mt-1">healthy</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{analytics.calculableCount} calculable recipes</Badge>
              {analytics.storedCostOnlyCount ? (
                <Badge variant="outline">
                  {analytics.storedCostOnlyCount} using stored recipe cost
                </Badge>
              ) : null}
              <Badge variant={analytics.pressureRows.length ? 'destructive' : 'secondary'}>
                {analytics.pressureRows.length} pressure items
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function InventoryRecipesPage({ periodStart, periodEnd } = {}) {
  return (
    <div className="space-y-6">
      <RecipeMarginPanel />
      <UsageReportPage periodStart={periodStart} periodEnd={periodEnd} />
    </div>
  );
}
