import { supabase } from '@/lib/supabaseClient';

const RETIRED_MESSAGE = 'Schema-per-tenant migration controls are retired. MEVS now uses shared public multi-tenant tables.';

export async function refreshTenantReportingSnapshot() {
  return { success: true, retired: true, message: RETIRED_MESSAGE, refreshed_count: 0 };
}

export async function refreshAllTenantReportingSnapshots() {
  return { success: true, retired: true, message: RETIRED_MESSAGE, refreshed_count: 0 };
}

export async function getTenantReportingSnapshots(organizationId = null) {
  let query = supabase
    .from('tenant_registry')
    .select('organization_id, schema_name, status, read_mode, write_mode, metadata, created_at, updated_at')
    .order('updated_at', { ascending: false });

  if (organizationId) query = query.eq('organization_id', organizationId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    ...row,
    organization_name: row.metadata?.organization_name || row.metadata?.name || row.organization_id,
    retired_schema_name_present: Boolean(row.schema_name),
    public_row_count: 0,
    blocker_count: row.read_mode === 'public' && row.write_mode === 'public' ? 0 : 1,
    blockers: row.read_mode === 'public' && row.write_mode === 'public'
      ? []
      : [{ reason: 'Legacy tenant schema mode retained in registry; must be forced back to public during shutdown.' }],
  }));
}

export async function getTenantPilotCutovers() {
  return [];
}

export async function selectTenantPilotCutover() { throw new Error(RETIRED_MESSAGE); }
export async function prepareTenantPilotCutover() { throw new Error(RETIRED_MESSAGE); }
export async function applyTenantPilotReadCutover() { throw new Error(RETIRED_MESSAGE); }
export async function applyTenantPilotWriteCutover() { throw new Error(RETIRED_MESSAGE); }
export async function completeTenantPilotCutover() { throw new Error(RETIRED_MESSAGE); }
export async function abortTenantPilotCutover() { throw new Error(RETIRED_MESSAGE); }

export function hasTenantMigrationBlockers(snapshot) {
  return Number(snapshot?.blocker_count ?? 0) > 0;
}

export function getTenantMigrationModeLabel(snapshot) {
  if (!snapshot) return 'Unknown';
  return snapshot.read_mode + ' reads / ' + snapshot.write_mode + ' writes';
}
