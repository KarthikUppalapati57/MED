import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import CategoryReportPage from '@/modules/performance/tabs/CategoryReport/CategoryReportPage';
import PriceMoversPage from '@/modules/performance/tabs/PriceMovers/PriceMoversPage';

function FocusCard({ tone, title, body, meta }) {
  const toneClass = {
    teal: 'border-teal-200 bg-teal-50/60 text-teal-950',
    amber: 'border-amber-200 bg-amber-50/60 text-amber-950',
    blue: 'border-blue-200 bg-blue-50/60 text-blue-950',
  }[tone] || 'border-border/50 bg-card text-foreground';

  return (
    <Card className={`shadow-sm ${toneClass}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs mt-1 opacity-80 leading-relaxed">{body}</p>
          </div>
          <Badge variant="secondary" className="shrink-0 bg-white/70 text-current border border-current/10">
            {meta}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SpendProductsPage({ periodStart, periodEnd } = {}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">Invoices + Products</p>
          <h2 className="text-2xl font-semibold tracking-tight mt-1">Spend & Products</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Category spend, budget variance, vendor concentration, and product price movement in one working view.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <FocusCard
          tone="teal"
          title="Budget exposure"
          body="Compare allocated category budgets against actual invoice allocation spend."
          meta="Budget vs Actual"
        />
        <FocusCard
          tone="amber"
          title="Product price movement"
          body="Find products where latest invoice prices are moving above prior cost baselines."
          meta="Price Movers"
        />
        <FocusCard
          tone="blue"
          title="Vendor and invoice drilldown"
          body="Trace spend changes back to vendors, products, and source invoices."
          meta="Drilldown"
        />
      </div>

      <CategoryReportPage periodStart={periodStart} periodEnd={periodEnd} />
      <PriceMoversPage periodStart={periodStart} periodEnd={periodEnd} />
    </div>
  );
}
