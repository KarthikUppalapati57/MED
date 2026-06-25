export async function getTenantDataRoute({ organizationId, brandId = null, locationId = null } = {}) {
  return {
    organization_id: organizationId || null,
    brand_id: brandId || null,
    location_id: locationId || null,
    schema_name: 'public',
    status: 'shared_public',
    read_mode: 'public',
    write_mode: 'public',
    read_source: 'public',
    write_target: 'public',
  };
}

export async function getTenantRuntime(organizationId = null) {
  return {
    organization_id: organizationId,
    schema_name: 'public',
    read_mode: 'public',
    write_mode: 'public',
    tenancy_model: 'shared_public',
  };
}

export function getRouteReadSource() {
  return 'public';
}

export function getRouteWriteTarget() {
  return 'public';
}

export function isTenantSchemaRoute() {
  return false;
}
