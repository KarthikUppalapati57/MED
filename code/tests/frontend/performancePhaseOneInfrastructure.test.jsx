import React from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePerformanceFilters } from '@/modules/performance/hooks/usePerformanceFilters';
import {
  ChartGuard,
  WidgetStatePanel,
  WIDGET_STATES,
  resolveWidgetState,
} from '@/modules/performance/components/shared/WidgetState';
import { PerformanceFilterBar } from '@/modules/performance/components/shared/PerformanceFilterBar';
import {
  formatCount,
  formatMoney,
  formatPct,
} from '@/modules/performance/services/performanceAnalytics';
import { isPerformanceDemoEnabled } from '@/modules/performance/services/performanceDemoMode';

describe('shared Performance filter state', () => {
  it('synchronizes caller-owned dates and location defaults', () => {
    const { result, rerender } = renderHook(
      ({ dateFrom, dateTo, locationIds }) =>
        usePerformanceFilters({ dateFrom, dateTo, locationIds }),
      {
        initialProps: {
          dateFrom: '2026-07-01',
          dateTo: '2026-07-31',
          locationIds: ['location-a'],
        },
      }
    );

    rerender({
      dateFrom: '2026-08-01',
      dateTo: '2026-08-31',
      locationIds: ['location-b'],
    });

    expect(result.current.dateFrom).toBe('2026-08-01');
    expect(result.current.dateTo).toBe('2026-08-31');
    expect(result.current.locationIds).toEqual(['location-b']);
  });

  it('resets to page-owned defaults instead of global current-month values', () => {
    const defaults = {
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
      locationIds: ['location-a'],
    };
    const { result } = renderHook(() => usePerformanceFilters(defaults));

    act(() => {
      result.current.updateDateRange('2026-06-01', '2026-06-30');
      result.current.setLocationIds(['location-b']);
      result.current.setCategoryIds(['Produce']);
      result.current.setVendorIds(['vendor-a']);
    });
    act(() => result.current.clearFilters());

    expect(result.current.dateFrom).toBe(defaults.dateFrom);
    expect(result.current.dateTo).toBe(defaults.dateTo);
    expect(result.current.locationIds).toEqual(defaults.locationIds);
    expect(result.current.categoryIds).toEqual([]);
    expect(result.current.vendorIds).toEqual([]);
    expect(result.current.autoComparison).toBe(true);
  });
});

describe('Performance formatting', () => {
  it('preserves unavailable values and formats confirmed zeroes', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
    expect(formatPct(null)).toBe('—');
    expect(formatPct(undefined)).toBe('—');
    expect(formatCount(null)).toBe('—');
    expect(formatMoney(0)).toBe('$0');
    expect(formatPct(0)).toBe('0.0%');
    expect(formatCount(0)).toBe('0');
    expect(formatMoney(1234.5)).toBe('$1,235');
  });
});

describe('shared widget states and chart guards', () => {
  it('distinguishes empty, unavailable, partial, error, and ready', () => {
    expect(resolveWidgetState({ hasData: false })).toBe(WIDGET_STATES.EMPTY);
    expect(resolveWidgetState({ unavailable: true })).toBe(WIDGET_STATES.UNAVAILABLE);
    expect(resolveWidgetState({ partial: true, hasData: true })).toBe(WIDGET_STATES.PARTIAL);
    expect(resolveWidgetState({ error: true })).toBe(WIDGET_STATES.ERROR);
    expect(resolveWidgetState({ hasData: true })).toBe(WIDGET_STATES.READY);
  });

  it.each([
    [WIDGET_STATES.EMPTY, 'No rows'],
    [WIDGET_STATES.UNAVAILABLE, 'Not calculable'],
    [WIDGET_STATES.PARTIAL, 'Partial coverage'],
    [WIDGET_STATES.ERROR, 'Request failed'],
  ])('renders the %s state explicitly', (state, message) => {
    render(<WidgetStatePanel state={state} message={message} />);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByText(message).closest('[data-widget-state]')).toHaveAttribute('data-widget-state', state);
  });

  it('does not mount chart children without meaningful points', () => {
    const { rerender } = render(
      <ChartGuard data={[]} valueKeys={['value']} emptyMessage="No chart points">
        <div data-testid="chart">chart</div>
      </ChartGuard>
    );
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
    expect(screen.getByText('No chart points')).toBeInTheDocument();

    rerender(
      <ChartGuard data={[{ value: 0 }]} valueKeys={['value']}>
        <div data-testid="chart">chart</div>
      </ChartGuard>
    );
    expect(screen.getByTestId('chart')).toBeInTheDocument();
  });
});

describe('supported Performance controls', () => {
  it('hides Inventory comparison and vendor controls', () => {
    render(
      <PerformanceFilterBar
        dateFrom="2026-07-01"
        dateTo="2026-07-31"
        showComparison={false}
        showVendor={false}
      />
    );
    expect(screen.queryByText('Compare from')).not.toBeInTheDocument();
    expect(screen.queryByText('Compare to')).not.toBeInTheDocument();
    expect(screen.queryByText('Vendor')).not.toBeInTheDocument();
    expect(screen.getByText('Date from')).toBeInTheDocument();
  });
});

describe('Performance demo safety', () => {
  it('requires explicit development-only opt-in', () => {
    expect(isPerformanceDemoEnabled({
      MODE: 'development',
      VITE_PERFORMANCE_DEMO: 'true',
      VITE_ALLOW_PERFORMANCE_DEMO: 'true',
    })).toBe(true);
    expect(isPerformanceDemoEnabled({
      MODE: 'development',
      VITE_PERFORMANCE_DEMO: 'true',
    })).toBe(false);
    expect(isPerformanceDemoEnabled({
      MODE: 'production',
      PROD: true,
      VITE_PERFORMANCE_DEMO: 'true',
      VITE_ALLOW_PERFORMANCE_DEMO: 'true',
    })).toBe(false);
  });
});
