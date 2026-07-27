import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), 'utf8');

const runbook = read('docs/modules/performance/phase13-controlled-release.md');

const requiredMigrations = [
  '20260727060000_correct_performance_budget_scope.sql',
  '20260727070000_expose_price_mover_impact_evidence.sql',
  '20260727080000_location_timezone_performance_reports.sql',
  '20260727110000_performance_scalability_bounds.sql',
];

const requiredRollbacks = [
  '20260727060000_correct_performance_budget_scope_rollback.sql',
  '20260727070000_expose_price_mover_impact_evidence_rollback.sql',
  '20260727080000_location_timezone_performance_reports_rollback.sql',
  '20260727110000_performance_scalability_bounds_rollback.sql',
];

describe('Phase 13 Performance controlled release runbook', () => {
  it('documents the owner approval gate before applying migrations', () => {
    expect(runbook).toContain('No migration should be applied merely because it exists locally.');
    expect(runbook).toContain('Obtain explicit migration approval from the project owner.');
    expect(runbook).toContain('supabase db push --linked');
    expect(runbook).toContain('Do not run this command until the owner explicitly approves that exact target.');
  });

  it('lists the Performance migration diff and rollback files', () => {
    for (const migration of requiredMigrations) {
      expect(runbook).toContain(migration);
      expect(fs.existsSync(path.resolve(root, 'supabase/migrations', migration))).toBe(true);
    }

    for (const rollback of requiredRollbacks) {
      expect(runbook).toContain(rollback);
      expect(fs.existsSync(path.resolve(root, 'supabase/rollback', rollback))).toBe(true);
    }
  });

  it('requires staging database tests, role matrix, SQL reconciliation, and grant verification', () => {
    expect(runbook).toContain('supabase db lint --linked');
    expect(runbook).toContain('supabase test db --linked');
    expect(runbook).toContain('performance_active_hierarchy_security_acceptance.sql');
    expect(runbook).toContain('performance_phase10_integration_acceptance.sql');
    expect(runbook).toContain('Security Role Matrix');
    expect(runbook).toContain('UI And SQL Reconciliation');
    expect(runbook).toContain('routine_privileges');
    expect(runbook).toContain('anon');
    expect(runbook).toContain('PUBLIC');
  });

  it('keeps production smoke tests, monitoring, and rollback window in the release checklist', () => {
    expect(runbook).toContain('npm run check:release-gate:ui:report');
    expect(runbook).toContain('Location switch');
    expect(runbook).toContain('Expired session');
    expect(runbook).toContain('Monitoring And Rollback Window');
    expect(runbook).toContain('query latency');
    expect(runbook).toContain('supabase/rollback/');
  });
});
