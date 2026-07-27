import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), 'utf8');

const grid = read('src/modules/performance/components/shared/AnalyticsDataGrid.jsx');
const filterBar = read('src/modules/performance/components/shared/PerformanceFilterBar.jsx');
const widgetState = read('src/modules/performance/components/shared/WidgetState.jsx');
const exportMenu = read('src/modules/performance/components/shared/ExportMenu.jsx');
const hooks = [
  read('src/modules/performance/hooks/useCategoryPerformance.js'),
  read('src/modules/performance/hooks/usePriceMovers.js'),
  read('src/modules/performance/hooks/useInventoryUsage.js'),
].join('\n');

const shared = [grid, filterBar, widgetState, exportMenu].join('\n');

describe('Phase 12 Performance UX and accessibility QA', () => {
  it('keeps shared Performance controls labelled and keyboard accessible', () => {
    expect(grid).toContain('role="region"');
    expect(grid).toContain('aria-label="Analytics data grid"');
    expect(grid).toContain('aria-live="polite"');
    expect(grid).toContain('onKeyDown');
    expect(grid).toContain("event.key === 'Enter' || event.key === ' '");
    expect(grid).toContain('aria-label="Go to previous table page"');
    expect(grid).toContain('aria-label="Go to next table page"');

    expect(filterBar).toContain('role="search"');
    expect(filterBar).toContain('aria-label="Performance report filters"');
    expect(filterBar).toContain('aria-labelledby={locationId}');
    expect(filterBar).toContain('aria-labelledby={categoryId}');
    expect(filterBar).toContain('aria-labelledby={vendorId}');
    expect(filterBar).toContain('aria-pressed={autoComparison}');
    expect(filterBar).toContain('aria-label="Clear Performance filters"');
  });

  it('supports mobile and high-zoom layouts without fixed desktop-only controls', () => {
    expect(grid).toContain('flex-col');
    expect(grid).toContain('sm:flex-row');
    expect(grid).toContain('w-full sm:max-w-xs');
    expect(filterBar).toContain('grid grid-cols-1');
    expect(filterBar).toContain('sm:grid-cols-2');
    expect(filterBar).toContain('xl:grid-cols-8');
    expect(filterBar).toContain('min-w-0');
  });

  it('announces loading, empty, error, export, and freshness states accessibly', () => {
    expect(widgetState).toContain('role="status"');
    expect(widgetState).toContain("role={state === WIDGET_STATES.ERROR ? 'alert' : 'status'}");
    expect(widgetState).toContain("aria-live={state === WIDGET_STATES.ERROR ? 'assertive' : 'polite'}");
    expect(widgetState).toContain('Retry loading this Performance panel');
    expect(exportMenu).toContain('aria-label={disabled ? `${label} unavailable` : label}');
    expect(exportMenu).toContain('aria-live="polite"');
  });

  it('does not keep stale previous-location report data during context switches', () => {
    expect(hooks).not.toContain('placeholderData');
    expect(hooks).not.toContain('keepPreviousData');
    expect(hooks).toContain('filters?.locationIds');
  });

  it('removes mojibake from touched shared Performance components', () => {
    expect(shared).not.toContain('â');
    expect(shared).not.toContain('Ã');
  });
});