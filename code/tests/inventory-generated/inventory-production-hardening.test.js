import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const migrationPath = path.join(repoRoot, 'supabase/migrations/20260723000008_inventory_module_production_hardening.sql');
const apiClientPath = path.join(repoRoot, 'src/lib/apiClient.js');
const inventoryPagePath = path.join(repoRoot, 'src/modules/inventory/pages/Inventory.jsx');
const avtCostingPath = path.join(repoRoot, 'src/modules/inventory/pages/AvTCosting.jsx');
const commissaryPath = path.join(repoRoot, 'src/modules/commissary/pages/Commissary.jsx');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

describe('inventory production hardening artifacts', () => {
  it('defines the missing inventory RPCs called by the frontend', () => {
    const sql = read(migrationPath);

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.log_inventory_waste');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.delete_inventory_waste');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.adjust_inventory');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_dashboard_metrics');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.fulfill_intercompany_transfer');
  });

  it('revokes anon execute from state-changing inventory RPCs', () => {
    const sql = read(migrationPath);

    [
      'complete_count_session',
      'receive_purchase_order',
      'complete_inventory_transfer',
      'execute_internal_transfer',
      'approve_daily_pos_usage',
      'execute_inventory_depletion',
      'log_inventory_waste',
      'delete_inventory_waste',
      'adjust_inventory',
      'fulfill_intercompany_transfer',
    ].forEach((fnName) => {
      expect(sql).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fnName}\\(`));
    });
  });

  it('guards quantity mutation RPCs with profile-backed access checks', () => {
    const sql = read(migrationPath);

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.assert_inventory_rpc_access');
    expect(sql).toContain('FROM public.profiles');
    expect(sql).not.toContain("auth.jwt() ->> 'organization_id'");
    expect(sql).not.toContain("auth.jwt()->>'organization_id'");
  });

  it('prevents duplicate POS approval depletion', () => {
    const sql = read(migrationPath);

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.inventory_pos_usage_approvals');
    expect(sql).toContain('UNIQUE (organization_id, location_id, usage_date)');
    expect(sql).toContain('already_approved');
  });

  it('removes legacy broad RLS policy names and repairs child location scoping', () => {
    const sql = read(migrationPath);

    expect(sql).toContain('DROP POLICY IF EXISTS inventory_select_org ON public.inventory');
    expect(sql).toContain('DROP POLICY IF EXISTS "Tenant_Isolation_wastage_logs" ON public.wastage_logs');
    expect(sql).toContain('ALTER TABLE public.purchase_order_items FORCE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE public.receiving_items FORCE ROW LEVEL SECURITY');
    expect(sql).toContain('public.tenant_scope_visible(r.organization_id, NULL, r.location_id, NULL)');
  });

  it('wires frontend flows to production RPCs instead of partial local writes', () => {
    const apiClient = read(apiClientPath);
    const inventoryPage = read(inventoryPagePath);
    const commissaryPage = read(commissaryPath);

    expect(apiClient).toContain('adjustInventory');
    expect(apiClient).toContain('fulfillIntercompanyTransfer');
    expect(inventoryPage).toContain('logAdjustment: true');
    expect(inventoryPage).toContain('Mobile Count');
    expect(inventoryPage).toContain('api.products.listCountUnits');
    expect(inventoryPage).toContain('conversion_rates');
    expect(inventoryPage).not.toContain('const conversionRates = {');
    expect(inventoryPage).not.toContain("'case_to_ea': 24");
    expect(commissaryPage).toContain('api.metrics.fulfillIntercompanyTransfer');
    expect(commissaryPage).not.toContain('GL Offset entries automatically recorded');
  });

  it('does not render hardcoded AvT demo metrics as production data', () => {
    const avtCosting = read(avtCostingPath);

    expect(avtCosting).not.toContain('const trendData = [');
    expect(avtCosting).not.toContain('+12.5% from last week');
    expect(avtCosting).not.toContain('-1.2% from last week');
    expect(avtCosting).not.toContain('<div className="text-4xl font-black text-amber-500">3</div>');
    expect(avtCosting).toContain('varianceChartData');
    expect(avtCosting).toContain('No AvT variance data found');
  });
});
