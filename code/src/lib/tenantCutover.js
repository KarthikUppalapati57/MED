const RETIRED_MESSAGE = 'Schema-per-tenant cutover controls are retired. MEVS now uses shared public multi-tenant tables.';

export async function getTenantCutoverStatus(organizationId) {
  return {
    organization_id: organizationId,
    read_mode: 'public',
    write_mode: 'public',
    blockers: [{ reason: RETIRED_MESSAGE }],
    retired: true,
  };
}

export async function setTenantReadMode() { throw new Error(RETIRED_MESSAGE); }
export function isTenantReadyForReads() { return false; }
export function getTenantCutoverBlockers(status) { return Array.isArray(status?.blockers) ? status.blockers : []; }

export async function getTenantWriteCutoverStatus(organizationId) {
  return {
    organization_id: organizationId,
    read_mode: 'public',
    write_mode: 'public',
    blockers: [{ reason: RETIRED_MESSAGE }],
    retired: true,
  };
}

export async function setTenantWriteMode() { throw new Error(RETIRED_MESSAGE); }
export function isTenantReadyForWrites() { return false; }
export function getTenantWriteCutoverBlockers(status) { return Array.isArray(status?.blockers) ? status.blockers : []; }
