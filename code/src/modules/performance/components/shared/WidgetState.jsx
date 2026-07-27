import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const WIDGET_STATES = Object.freeze({
  LOADING: 'loading',
  READY: 'ready',
  EMPTY: 'empty',
  UNAVAILABLE: 'unavailable',
  PARTIAL: 'partial',
  ERROR: 'error',
});

export function resolveWidgetState({
  loading = false,
  error = false,
  unavailable = false,
  partial = false,
  hasData = false,
} = {}) {
  if (loading) return WIDGET_STATES.LOADING;
  if (error) return WIDGET_STATES.ERROR;
  if (unavailable) return WIDGET_STATES.UNAVAILABLE;
  if (partial) return WIDGET_STATES.PARTIAL;
  if (!hasData) return WIDGET_STATES.EMPTY;
  return WIDGET_STATES.READY;
}

export function hasMeaningfulChartData(data, valueKeys = []) {
  if (!Array.isArray(data) || data.length === 0) return false;
  if (!valueKeys.length) return data.some((point) => point != null);
  return data.some((point) =>
    valueKeys.some((key) => {
      const value = typeof key === 'function' ? key(point) : point?.[key];
      return value !== null && value !== undefined && Number.isFinite(Number(value));
    })
  );
}

const DEFAULT_MESSAGES = {
  empty: 'No meaningful data was found for the selected filters.',
  unavailable: 'This value cannot be calculated from the available data.',
  partial: 'Only part of the required data is available.',
  error: 'This data could not be loaded.',
};

export function WidgetStatePanel({
  state,
  message,
  onRetry,
  className,
  children,
}) {
  if (state === WIDGET_STATES.READY) return children;
  if (state === WIDGET_STATES.LOADING) {
    return (
      <div className={cn('min-h-[220px] flex items-center justify-center text-sm text-muted-foreground animate-pulse', className)}>
        Loading…
      </div>
    );
  }
  return (
    <div
      data-widget-state={state}
      className={cn(
        'min-h-[220px] flex flex-col items-center justify-center text-center gap-3 px-4 text-sm',
        state === WIDGET_STATES.ERROR ? 'text-destructive' : 'text-muted-foreground',
        className
      )}
    >
      <p className="max-w-md">{message || DEFAULT_MESSAGES[state]}</p>
      {state === WIDGET_STATES.ERROR && onRetry ? (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>Retry</Button>
      ) : null}
    </div>
  );
}

export function ChartGuard({
  data,
  valueKeys,
  state,
  emptyMessage,
  unavailableMessage,
  partialMessage,
  errorMessage,
  onRetry,
  children,
}) {
  const resolved = state || resolveWidgetState({
    hasData: hasMeaningfulChartData(data, valueKeys),
  });
  const message =
    resolved === WIDGET_STATES.EMPTY ? emptyMessage
      : resolved === WIDGET_STATES.UNAVAILABLE ? unavailableMessage
        : resolved === WIDGET_STATES.PARTIAL ? partialMessage
          : resolved === WIDGET_STATES.ERROR ? errorMessage
            : undefined;
  return (
    <WidgetStatePanel state={resolved} message={message} onRetry={onRetry}>
      {children}
    </WidgetStatePanel>
  );
}

export default WidgetStatePanel;
