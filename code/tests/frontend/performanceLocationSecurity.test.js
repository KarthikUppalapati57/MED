import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');

const migration = source(
  'supabase/migrations/20260727000001_strict_location_performance_security.sql'
);
const hierarchyAlignmentMigration = source(
  'supabase/migrations/20260727000002_align_performance_with_active_hierarchy.sql'
);
const finalRpcGrantMigration = source(
  'supabase/migrations/20260727030000_resecure_performance_base_report_rpcs.sql'
);
const apiClient = source('src/lib/apiClient.js');
const performancePage = source('src/modules/performance/pages/Performance.jsx');
const budgetPage = source(
  'src/modules/performance/tabs/BudgetSetup/BudgetSetupPage.jsx'
);

describe('strict location Performance security', () => {
  it('requires an authenticated manager and the exact active hierarchy location', () => {
    expect(migration).toContain('Authentication required');
    expect(migration).toContain('Performance requires one selected location');
    expect(migration).toContain('public.is_manager_or_above()');
    expect(migration).toContain('v_auth_location IS DISTINCT FROM p_location_id');
    expect(migration).toContain('v_auth_brand IS DISTINCT FROM v_location_brand');
    expect(hierarchyAlignmentMigration).toContain('public.is_manager_or_above()');
    expect(hierarchyAlignmentMigration).toContain(
      'Performance location is outside the active hierarchy context'
    );
    expect(migration).not.toMatch(
      /v_role\s+NOT\s+IN\s*\([^)]*'ground_staff'/s
    );
  });

  it('removes authenticated access to the unvalidated report RPCs', () => {
    for (const rpc of [
      'get_category_performance_report',
      'get_category_performance_drilldown',
      'get_price_movers_report',
      'get_price_movers_drilldown',
      'get_inventory_usage_report',
      'get_inventory_usage_drilldown',
    ]) {
      expect(migration).toContain(`REVOKE EXECUTE ON FUNCTION public.${rpc}`);
      expect(finalRpcGrantMigration).toContain(
        `REVOKE EXECUTE ON FUNCTION public.${rpc}`
      );
    }
    expect(finalRpcGrantMigration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_(?:category_performance|price_movers|inventory_usage)_(?:report|drilldown)[\s\S]*?TO authenticated/
    );
  });

  it('routes frontend reports through location-validating wrappers', () => {
    for (const rpc of [
      'get_location_category_performance_report',
      'get_location_category_performance_drilldown',
      'get_location_price_movers_report',
      'get_location_price_movers_drilldown',
      'get_location_inventory_usage_report',
      'get_location_inventory_usage_drilldown',
    ]) {
      expect(apiClient).toContain(`supabase.rpc('${rpc}'`);
    }
    expect(apiClient).toContain(
      "throw new Error('Performance requires one selected location.')"
    );
  });

  it('restricts the page to manager roles and a selected global location', () => {
    expect(performancePage).toContain('PERFORMANCE_ROLES');
    expect(performancePage).toContain("'location_manager'");
    expect(performancePage).toContain("'brand_manager'");
    expect(performancePage).not.toMatch(
      /PERFORMANCE_ROLES[\s\S]*?'ground_staff'/
    );
    expect(performancePage).toContain('if (!location?.id)');
    expect(performancePage).toContain('Performance reporting always requires one active location');
  });

  it('uses secured location budget RPCs and exposes no org-wide budget option', () => {
    expect(budgetPage).toContain(
      "supabase.rpc('upsert_location_performance_budget'"
    );
    expect(budgetPage).toContain(
      "supabase.rpc('delete_location_performance_budget'"
    );
    expect(budgetPage).not.toContain('Organization-wide');
    expect(migration).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON public.budget_targets FROM authenticated'
    );
  });
});
