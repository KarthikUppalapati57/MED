import { supabase } from '@/lib/supabaseClient';

export async function getTenantCutoverStatus(organizationId) {
  const { data, error } = await supabase.rpc('get_tenant_cutover_status', {
    p_organization_id: organizationId,
  });

  if (error) throw error;
  return data;
}

export async function setTenantReadMode({ organizationId, readMode, force = false }) {
  const { data, error } = await supabase.rpc('set_tenant_read_mode', {
    p_organization_id: organizationId,
    p_read_mode: readMode,
    p_force: force,
  });

  if (error) throw error;
  return data;
}

export function isTenantReadyForReads(status) {
  return status?.ready_for_tenant_schema_reads === true;
}

export function getTenantCutoverBlockers(status) {
  return Array.isArray(status?.blockers) ? status.blockers : [];
}
export async function getTenantWriteCutoverStatus(organizationId) {
  const { data, error } = await supabase.rpc('get_tenant_write_cutover_status', {
    p_organization_id: organizationId,
  });

  if (error) throw error;
  return data;
}

export async function setTenantWriteMode({ organizationId, writeMode, readMode = null, force = false }) {
  const { data, error } = await supabase.rpc('set_tenant_write_mode', {
    p_organization_id: organizationId,
    p_write_mode: writeMode,
    p_read_mode: readMode,
    p_force: force,
  });

  if (error) throw error;
  return data;
}

export function isTenantReadyForWrites(status) {
  return status?.ready_for_tenant_schema_writes === true;
}

export function getTenantWriteCutoverBlockers(status) {
  return Array.isArray(status?.blockers) ? status.blockers : [];
}
