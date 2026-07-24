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
import { api } from '@/lib/apiClient';
import { filterByContext } from '@/lib/contextUtils';
import { useAuthQueries } from '@/hooks/useAuthQuery';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import UsageReportPage from '@/modules/performance/tabs/UsageReport/UsageReportPage';
import { formatMoney, formatPct } from '@/modules/performance/services/performanceAnalytics';

const COLORS = ['#0f766e', '#b45309', '#be123c', '#1d4ed8', '#7c3aed'];

function recipeName(recipe) {
  return recipe.name || recipe.recipe_name || recipe.menu_item_name || recipe.title || 'Recipe';
}

function numberFrom(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

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
  const scopedFilter = React.useCallback(
    (data) => filterByContext(data || [], { organization, brand, location }),
    [organization, brand, location]
  );

  const results = useAuthQueries({
    queries: [
      {
        queryKey: ['inventory_recipes_recipe_margin', organization?.id, brand?.brand_id || brand?.id, location?.id],
        queryFn: () => api.entities.Recipe.list('-updated_at', { limit: 5000 }),
        select: scopedFilter,
        enabled: !!organization?.id,
      },
    ],
  });

  const query = results[0] || {};
  const recipes = query.data || [];

  const analytics = useMemo(() => {
    const rows = recipes.map((recipe) => {
      const cost = numberFrom(recipe.cost_per_serving, recipe.total_cost, recipe.recipe_cost, recipe.food_cost);
      const price = numberFrom(recipe.selling_price, recipe.suggested_price, recipe.menu_price, recipe.price);
      const targetMargin = Number(recipe.target_margin_percent || recipe.target_margin || 0);
      const margin = price > 0 ? ((price - cost) / price) * 100 : null;
      const pressure = margin == null ? 0 : Math.max(0, targetMargin > 0 ? targetMargin - margin : 30 - margin);
      return {
        id: recipe.id,
        name: recipeName(recipe),
        cost,
        price,
        margin,
        targetMargin,
        pressure,
      };
    });

    const calculable = rows.filter((row) => row.margin != null);
    const riskRows = calculable
      .filter((row) => (row.targetMargin > 0 && row.margin < row.targetMargin) || row.margin < 30)
      .sort((a, b) => b.pressure - a.pressure)
      .slice(0, 7);
    const averageMargin = calculable.length
      ? calculable.reduce((sum, row) => sum + row.margin, 0) / calculable.length
      : 0;
    const averageCost = calculable.length
      ? calculable.reduce((sum, row) => sum + row.cost, 0) / calculable.length
      : 0;
    const healthyPct = calculable.length
      ? ((calculable.length - riskRows.length) / calculable.length) * 100
      : 0;

    return { rows, calculable, riskRows, averageMargin, averageCost, healthyPct };
  }, [recipes]);

  const isEmpty = !query.isLoading && analytics.rows.length === 0;
  const radialData = [{ name: 'Healthy margin', value: Math.max(0, Math.min(100, analytics.healthyPct)), fill: '#0f766e' }];

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">Inventory + Recipes</p>
          <h2 className="text-2xl font-semibold tracking-tight mt-1">Inventory & Recipes</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Actual inventory usage, stock risk, recipe cost, and recipe margin pressure using the five active modules.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatPill
          icon={ChefHat}
          label="Average recipe margin"
          value={query.isLoading ? '...' : formatPct(analytics.averageMargin)}
          tone={analytics.averageMargin >= 35 ? 'good' : analytics.averageMargin >= 25 ? 'warn' : 'risk'}
        />
        <StatPill
          icon={ShieldAlert}
          label="Margin pressure recipes"
          value={query.isLoading ? '...' : String(analytics.riskRows.length)}
          tone={analytics.riskRows.length ? 'risk' : 'good'}
        />
        <StatPill
          icon={PackageCheck}
          label="Average recipe cost"
          value={query.isLoading ? '...' : formatMoney(analytics.averageCost, 'USD')}
          tone="default"
        />
      </div>

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
              ) : analytics.riskRows.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center">
                  No recipe margin pressure detected from current recipe pricing.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.riskRows} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-16} textAnchor="end" height={72} />
                    <YAxis tickFormatter={(value) => `${value}%`} />
                    <Tooltip formatter={(value, name) => [name === 'cost' || name === 'price' ? formatMoney(value, 'USD') : formatPct(value), name]} />
                    <Bar dataKey="margin" name="Margin" radius={[4, 4, 0, 0]}>
                      {analytics.riskRows.map((entry, index) => (
                        <Cell key={entry.id || entry.name} fill={entry.margin < 20 ? '#be123c' : COLORS[index % COLORS.length]} />
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
              <Badge variant="outline">{analytics.calculable.length} priced recipes</Badge>
              <Badge variant={analytics.riskRows.length ? 'destructive' : 'secondary'}>{analytics.riskRows.length} pressure items</Badge>
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
