import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migrationPath = path.resolve(root, 'supabase/migrations/20260727080000_location_timezone_performance_reports.sql');
const rollbackPath = path.resolve(root, 'supabase/rollback/20260727080000_location_timezone_performance_reports_rollback.sql');
const apiClientPath = path.resolve(root, 'src/lib/apiClient.js');
const hookPaths = [
  'src/modules/performance/hooks/useCategoryPerformance.js',
  'src/modules/performance/hooks/usePriceMovers.js',
  'src/modules/performance/hooks/useInventoryUsage.js',
].map((p) => path.resolve(root, p));

describe('Phase 8 location timezone contract', () => {
  it('derives report timezone from the authorized location on the server', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS timezone text');
    expect(sql).toContain('resolve_performance_location_timezone');
    expect(sql).toContain('FROM pg_timezone_names WHERE name = v_timezone');
    expect(sql).toContain("RETURN 'UTC'");
    expect(sql).toContain('assert_performance_location_access');
    expect(sql).toContain('v_timezone := public.resolve_performance_location_timezone(p_organization_id, p_location_id)');
    expect(sql).toContain("'timezoneSource', 'locations.timezone'");
    expect(sql).toContain("'timezoneFallback', CASE WHEN v_timezone = 'UTC' THEN 'UTC when missing or invalid' ELSE NULL END");
  });

  it('does not let browser timezone drive secured report RPC calls', () => {
    const apiClient = fs.readFileSync(apiClientPath, 'utf8');
    const reportRpcSection = apiClient.slice(
      apiClient.indexOf('getCategoryPerformanceReport'),
      apiClient.indexOf('getPnlSummary')
    );

    expect(reportRpcSection).not.toContain('p_timezone');
    expect(reportRpcSection).not.toContain('timezone = null');

    for (const hookPath of hookPaths) {
      const source = fs.readFileSync(hookPath, 'utf8');
      expect(source).not.toContain('Intl.DateTimeFormat().resolvedOptions().timeZone');
      expect(source).not.toContain('timezone,');
    }
  });

  it('keeps a rollback that restores pass-through behavior and drops the resolver', () => {
    const rollback = fs.readFileSync(rollbackPath, 'utf8');
    expect(rollback).toContain('DROP FUNCTION IF EXISTS public.resolve_performance_location_timezone(uuid, uuid)');
    expect(rollback).toContain('p_timezone');
    expect(rollback).not.toContain('v_timezone := public.resolve_performance_location_timezone');
  });
});
