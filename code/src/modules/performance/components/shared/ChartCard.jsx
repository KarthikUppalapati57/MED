import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ChartCard({ title, description, actions, children, className }) {
  return (
    <Card className={cn('border-border/50', className)}>
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
        </div>
        {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
      </CardHeader>
      <CardContent className="pt-2">{children}</CardContent>
    </Card>
  );
}

export function ChartEmptyState({
  message = 'No purchasing data was found for the selected filters.',
  onClearFilters,
  onChangeDates,
  onViewInvoices,
}) {
  return (
    <div className="min-h-[220px] flex flex-col items-center justify-center text-center gap-3 px-4">
      <p className="text-sm text-muted-foreground max-w-md">{message}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {onChangeDates ? (
          <Button type="button" size="sm" variant="outline" onClick={onChangeDates}>
            Change date range
          </Button>
        ) : null}
        {onClearFilters ? (
          <Button type="button" size="sm" variant="outline" onClick={onClearFilters}>
            Clear filters
          </Button>
        ) : null}
        {onViewInvoices ? (
          <Button type="button" size="sm" onClick={onViewInvoices}>
            View invoices
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ChartErrorState({ message = 'Something went wrong loading this chart.', onRetry }) {
  return (
    <div className="min-h-[220px] flex flex-col items-center justify-center text-center gap-3 px-4">
      <p className="text-sm text-destructive">{message}</p>
      {onRetry ? (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function ChartLoadingState({ height = 240 }) {
  return (
    <div className="space-y-3" style={{ minHeight: height }}>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-[180px] w-full" />
    </div>
  );
}

export default ChartCard;
