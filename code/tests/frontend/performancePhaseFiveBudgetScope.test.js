import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');

const migration = source(
  'supabase/migrations/20260727060000_correct_performance_budget_scope.sql'
);
const rollback = source(
  'supabase/rollback/20260727060000_correct_performance_budget_scope_rollback.sql'
);
const budgetSetupPage = source(
  'src/modules/performance/tabs/BudgetSetup/BudgetSetupPage.jsx'
);

describe('Phase 5 Performance budget scope migration', () => {
  it('protects logical budget uniqueness across nullable brand and location scope', () => {
    expect(migration).toContain('budget_targets_logical_scope_unique_idx');
    expect(migration).toContain("COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid)");
    expect(migration).toContain("COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid)");
    expect(migration).toContain('period_start');
    expect(migration).toContain('period_end');
    expect(migration).toContain('btrim(category)');
  });

  it('fails before indexing when duplicate logical budget rows already exist', () => {
    expect(migration).toContain('Duplicate logical budget_targets rows exist');
    expect(migration).toContain('HAVING count(*) > 1');
    expect(migration).toContain("USING ERRCODE = '23505'");
  });

  it('uses exact location, brand, period, and category budgets in the secured report wrapper', () => {
    expect(migration).toContain('bt.location_id = p_location_id');
    expect(migration).toContain('bt.brand_id IS NOT DISTINCT FROM v_location_brand_id');
    expect(migration).toContain('bt.period_start = p_date_from');
    expect(migration).toContain('bt.period_end = p_date_to');
    expect(migration).toContain("exact_budgets.category = btrim(source_rows.row_data->>'category')");
    expect(migration).toContain("'{metadata,budgetPeriodRule}'");
    expect(migration).toContain('exact_period_match');
  });

  it('tightens Budget Setup reads to the exact active scope before client filtering', () => {
    expect(budgetSetupPage).toContain(".eq('period_start', periodStart)");
    expect(budgetSetupPage).toContain(".eq('period_end', periodEnd)");
    expect(budgetSetupPage).toContain(".eq('location_id', scopeLocationId)");
    expect(budgetSetupPage).toContain(".eq('brand_id', activeBrandId)");
    expect(budgetSetupPage).not.toMatch(
      /from\('budget_targets'\)[\s\S]{0,120}\.eq\('organization_id', organization\?\.id\);/
    );
  });

  it('includes a manual rollback for the index and wrapper', () => {
    expect(rollback).toContain('DROP INDEX IF EXISTS public.budget_targets_logical_scope_unique_idx');
    expect(rollback).toContain('CREATE OR REPLACE FUNCTION public.get_location_category_performance_report');
  });
});
