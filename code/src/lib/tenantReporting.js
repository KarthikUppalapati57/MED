import { supabase } from '@/lib/supabaseClient';

export async function refreshTenantReportingSnapshot(organizationId) {
  const { data, error } = await supabase.rpc('refresh_tenant_reporting_snapshot', {
    p_organization_id: organizationId,
  });

  if (error) throw error;
  return data;
}

export async function refreshAllTenantReportingSnapshots(limit = 25) {
  const { data, error } = await supabase.rpc('refresh_all_tenant_reporting_snapshots', {
    p_limit: limit,
  });

  if (error) throw error;
  return data;
}

export async function getTenantReportingSnapshots(organizationId = null) {
  const { data, error } = await supabase.rpc('get_tenant_reporting_snapshots', {
    p_organization_id: organizationId,
  });

  if (error) throw error;
  return data ?? [];
}

export async function getTenantPilotCutovers(organizationId = null) {
  const { data, error } = await supabase.rpc('get_tenant_pilot_cutovers', {
    p_organization_id: organizationId,
  });

  if (error) throw error;
  return data ?? [];
}

export async function selectTenantPilotCutover({ organizationId, notes = null }) {
  const { data, error } = await supabase.rpc('select_tenant_pilot_cutover', {
    p_organization_id: organizationId,
    p_notes: notes,
  });

  if (error) throw error;
  return data;
}

export async function prepareTenantPilotCutover(organizationId) {
  const { data, error } = await supabase.rpc('prepare_tenant_pilot_cutover', {
    p_organization_id: organizationId,
  });

  if (error) throw error;
  return data;
}

export async function applyTenantPilotReadCutover(organizationId, confirmation) {
  const { data, error } = await supabase.rpc('apply_tenant_pilot_read_cutover', {
    p_organization_id: organizationId,
    p_confirmation: confirmation,
  });

  if (error) throw error;
  return data;
}

export async function applyTenantPilotWriteCutover(organizationId, confirmation) {
  const { data, error } = await supabase.rpc('apply_tenant_pilot_write_cutover', {
    p_organization_id: organizationId,
    p_confirmation: confirmation,
  });

  if (error) throw error;
  return data;
}

export function hasTenantMigrationBlockers(snapshot) {
  return Number(snapshot?.blocker_count ?? 0) > 0;
}

export function getTenantMigrationModeLabel(snapshot) {
  if (!snapshot) return 'Unknown';
  return `${snapshot.read_mode} reads / ${snapshot.write_mode} writes`;
}