import React from 'react';
import { cn } from '@/lib/utils';
import { formatMoney, formatPct } from '@/modules/performance/services/performanceAnalytics';

export function ComparisonBadge({
  previousValue,
  absoluteChange,
  percentageChange,
  status = 'neutral',
  currency = 'USD',
  className,
}) {
  if (absoluteChange === undefined && percentageChange === undefined && previousValue === undefined) {
    return null;
  }

  const tone =
    status === 'positive'
      ? 'text-emerald-600'
      : status === 'negative'
        ? 'text-rose-600'
        : 'text-muted-foreground';

  const abs =
    absoluteChange === undefined || absoluteChange === null
      ? null
      : `${absoluteChange > 0 ? '+' : absoluteChange < 0 ? '−' : ''}${formatMoney(Math.abs(absoluteChange), currency).replace(/^\$/, '$')}`;

  const pct =
    percentageChange === null || percentageChange === undefined
      ? previousValue === 0 && absoluteChange
        ? 'n/a'
        : null
      : `${percentageChange > 0 ? '+' : ''}${formatPct(percentageChange)}`;

  return (
    <div className={cn('text-xs font-medium flex items-center gap-2', tone, className)}>
      {abs ? <span>{abs}</span> : null}
      {pct ? <span>({pct})</span> : null}
      {previousValue !== undefined && previousValue !== null ? (
        <span className="text-muted-foreground font-normal">vs {formatMoney(previousValue, currency)}</span>
      ) : null}
    </div>
  );
}

export default ComparisonBadge;
