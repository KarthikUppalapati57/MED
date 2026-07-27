import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  testDir,
  '../../supabase/migrations/20260727000003_enrich_location_inventory_usage_evidence.sql'
);
const migrationSql = fs.readFileSync(migrationPath, 'utf8');

describe('Performance Inventory Usage evidence migration', () => {
  it('changes only the secured single-location report wrapper', () => {
    expect(migrationSql).toContain(
      'CREATE OR REPLACE FUNCTION public.get_location_inventory_usage_report'
    );
    expect(migrationSql).not.toContain(
      'CREATE OR REPLACE FUNCTION public.get_inventory_usage_report'
    );
    expect(migrationSql).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(migrationSql).not.toMatch(/\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/i);
  });

  it('requires exact organization and location inventory evidence', () => {
    expect(migrationSql).toContain('inv.organization_id = p_organization_id');
    expect(migrationSql).toContain('inv.location_id = p_location_id');
    expect(migrationSql).toContain('inv.deleted_at IS NULL');
    expect(migrationSql).toContain('assert_performance_location_access');
  });

  it('returns on-hand, reorder, cost, value, and provenance fields', () => {
    for (const field of [
      'currentOnHandQuantity',
      'reorderPoint',
      'unitCost',
      'unitCostSource',
      'usageValue',
      'currentInventoryValue',
      'currentInventoryValueSource',
    ]) {
      expect(migrationSql).toContain(`'${field}'`);
    }
  });

  it('keeps authenticated access on the secured wrapper only', () => {
    expect(migrationSql).toContain('FROM PUBLIC, anon');
    expect(migrationSql).toContain('TO authenticated, service_role');
  });
});
