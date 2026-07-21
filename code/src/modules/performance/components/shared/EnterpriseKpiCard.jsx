import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ComparisonBadge } from './ComparisonBadge';

export function EnterpriseKpiCard({
  label,
  value,
  previousValue,
  absoluteChange,
  percentageChange,
  status = 'neutral',
  tooltip,
  loading = false,
  empty = false,
  error = false,
  emptyLabel = 'No data',
  unavailable = false,
  unavailableLabel = 'Unavailable',
  sublabel,
  className,
}) {
  if (loading) {
    return (
      <Card className={cn('border-border/50 h-[132px]', className)}>
        <CardContent className="p-4 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-4 w-20" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn('border-destructive/40 h-[132px]', className)}>
        <CardContent className="p-4 flex flex-col justify-center">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-sm text-destructive mt-2">Could not load</p>
        </CardContent>
      </Card>
    );
  }

  if (unavailable) {
    return (
      <Card className={cn('border-border/50 h-[132px] bg-muted/20', className)}>
        <CardContent className="p-4 flex flex-col justify-center">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            {label}
            {tooltip ? <KpiInfo text={tooltip} /> : null}
          </p>
          <p className="text-lg font-semibold text-muted-foreground mt-2">{unavailableLabel}</p>
        </CardContent>
      </Card>
    );
  }

  if (empty) {
    return (
      <Card className={cn('border-border/50 h-[132px]', className)}>
        <CardContent className="p-4 flex flex-col justify-center">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold text-muted-foreground mt-2">{emptyLabel}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('border-border/50 h-[132px]', className)}>
      <CardContent className="p-4 flex flex-col justify-between h-full">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          {label}
          {tooltip ? <KpiInfo text={tooltip} /> : null}
        </p>
        <div>
          <p className="text-2xl font-bold tracking-tight truncate">{value}</p>
          {sublabel ? <p className="text-xs text-muted-foreground mt-0.5 truncate">{sublabel}</p> : null}
        </div>
        <ComparisonBadge
          previousValue={previousValue}
          absoluteChange={absoluteChange}
          percentageChange={percentageChange}
          status={status}
        />
      </CardContent>
    </Card>
  );
}

function KpiInfo({ text }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="inline-flex text-muted-foreground/70 hover:text-foreground">
            <Info className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function KpiRibbon({ children, className }) {
  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3', className)}>
      {children}
    </div>
  );
}

export default EnterpriseKpiCard;
