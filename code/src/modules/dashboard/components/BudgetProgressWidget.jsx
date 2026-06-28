import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { BarChart3 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Helper functions (copied from dashboard utils)
function currency(value) {
  const numeric = Number(value || 0);
  return numeric < 0 ? `-$${Math.abs(numeric).toFixed(2)}` : `$${numeric.toFixed(2)}`;
}
function percent(value) {
  if (!Number.isFinite(Number(value))) return '0%';
  return `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(1)}%`;
}

function SectionCard({ title, description, children }) {
  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
      <div className="flex flex-col space-y-1.5 p-6 pb-4">
        <h3 className="font-semibold leading-none tracking-tight">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="p-6 pt-0">{children}</div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center border rounded-lg border-dashed bg-secondary/30">
      <Icon className="w-10 h-10 mb-4 text-muted-foreground/50" />
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm mt-2">{description}</p>
    </div>
  );
}

export default function BudgetProgressWidget({ metrics }) {
  const { organization } = useAuth();
  
  const { data: budgets = [] } = useQuery({
    queryKey: ['dashboard-budgets', organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('organization_id', organization?.id);
      if (error) {
        console.warn('Budgets table might not exist yet', error);
        return [];
      }
      return data || [];
    },
    enabled: !!organization?.id,
  });

  // Re-map the metrics.budgetPacing using the actual hard budgets from the database
  const enhancedPacing = metrics.budgetPacing.map(item => {
    const dbBudget = budgets.find(b => b.gl_category.toLowerCase() === item.category.toLowerCase() || 
                                      (item.category.toLowerCase().includes('cogs') && b.gl_category.toLowerCase() === 'food') ||
                                      (item.category.toLowerCase().includes('labor') && b.gl_category.toLowerCase() === 'labor'));
    
    // Use database target if available, otherwise fallback to the derived target
    const target = dbBudget?.budget_limit ? Number(dbBudget.budget_limit) : item.target;
    const actual = item.actual;
    const pacing = target > 0 ? (actual - target) / target * 100 : 0;
    const remaining = target - actual;
    const isGood = remaining >= 0;

    return { ...item, target, actual, pacing, remaining, isGood };
  });

  const hasBudgetData = enhancedPacing.some((item) => Number(item.actual || 0) > 0 || Number(item.target || 0) > 0);

  return (
    <SectionCard title="Budget Pacing" description="Hard limits vs actual spend for this accounting period (Set limits in Accounting > Budgets).">
      {!hasBudgetData && (
        <EmptyState
          icon={BarChart3}
          title="No budget targets or actuals yet"
          description="Set period targets in Accounting > Budgets to unlock hard-limit progress tracking."
        />
      )}
      {hasBudgetData && (
      <div className="space-y-4">
        {enhancedPacing.slice(0, 8).map((item) => {
          const progress = item.target ? Math.min((item.actual / item.target) * 100, 140) : 0;
          return (
            <div key={item.category} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.category}</p>
                  <p className="text-xs text-muted-foreground">
                    Actual {currency(item.actual)} / Limit {currency(item.target)}
                  </p>
                </div>
                <Badge className={item.isGood ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-rose-50 text-rose-700 border-rose-200'}>
                  {item.isGood ? 'Under Limit' : 'Over Budget!'}
                </Badge>
              </div>
              <Progress value={progress} className={cn("h-2", !item.isGood && "bg-rose-100 [&>div]:bg-rose-600")} />
              <p className={cn('text-xs font-medium', item.remaining >= 0 ? 'text-teal-600' : 'text-rose-600')}>
                {item.remaining >= 0 ? `${currency(item.remaining)} remaining` : `${currency(Math.abs(item.remaining))} over limit`}
              </p>
            </div>
          );
        })}
      </div>
      )}
    </SectionCard>
  );
}
