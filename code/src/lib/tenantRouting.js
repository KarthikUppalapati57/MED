import { supabase } from '@/lib/supabaseClient';

export async function getTenantDataRoute({ organizationId, brandId = null, locationId = null } = {}) {
  const { data, error } = await supabase.rpc('get_tenant_data_route', {
    p_organization_id: organizationId || null,
    p_brand_id: brandId || null,
    p_location_id: locationId || null,
  });

  if (error) throw error;
  return data;
}

export async function getTenantRuntime(organizationId = null) {
  const { data, error } = await supabase.rpc('get_tenant_runtime', {
    p_organization_id: organizationId,
  });

  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data || null;
}

export function getRouteReadSource(route) {
  return route?.read_source || 'public';
}

export function getRouteWriteTarget(route) {
  return route?.write_target || 'public';
}

export function isTenantSchemaRoute(route) {
  return route?.read_mode === 'tenant_schema' || route?.write_mode === 'tenant_schema';
}