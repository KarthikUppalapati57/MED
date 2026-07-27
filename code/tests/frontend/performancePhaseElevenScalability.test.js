import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), 'utf8');

const migration = read('supabase/migrations/20260727110000_performance_scalability_bounds.sql');
const overview = read('src/modules/performance/components/PhaseOneOverview.jsx');
const apiClient = read('src/lib/apiClient.js');

describe('Phase 11 Performance scalability bounds', () => {
  it('adds bounded server-side overview aggregation instead of bulk browser reads', () => {
    expect(migration).toContain('get_location_performance_overview_rollup');
    expect(apiClient).toContain('getPerformanceOverviewRollup');
    expect(apiClient).toContain('get_location_performance_overview_rollup');
    expect(overview).toContain('phase1_overview_rollup');
    expect(overview).toContain('overviewRollup.payments');

    const overviewQuerySection = overview.slice(
      overview.indexOf('const results = useAuthQueries'),
      overview.indexOf('const analytics = useMemo')
    );
    expect(overviewQuerySection).not.toContain('.limit(5000)');
    expect(overviewQuerySection).not.toContain('api.entities.Product.list');
    expect(overviewQuerySection).not.toContain('api.entities.Inventory.list');
    expect(overviewQuerySection).not.toContain('api.entities.Recipe.list');
    expect(overviewQuerySection).not.toContain(".from('invoices')");
    expect(overviewQuerySection).not.toContain(".from('payments')");
  });

  it('documents query bounds, metadata, and supporting indexes in SQL', () => {
    expect(migration).toContain('assert_performance_report_bounds');
    expect(migration).toContain('Performance report range exceeds % days');
    expect(migration).toContain('limit_performance_jsonb_array');
    expect(migration).toContain('with_performance_limit_metadata');
    expect(migration).toContain("'maxInteractiveRangeDays', 548");
    expect(migration).toContain("'queryDurationMs'");
    expect(migration).toContain('idx_perf_invoices_org_loc_date_active');
    expect(migration).toContain('idx_perf_line_items_org_product_invoice');
    expect(migration).toContain('idx_perf_inventory_movements_org_loc_date');
    expect(migration).toContain('idx_perf_count_sessions_org_loc_completed');
  });
});
