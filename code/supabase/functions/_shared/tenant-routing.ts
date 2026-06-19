export type TenantRouteRequest = {
  organizationId?: string | null;
  brandId?: string | null;
  locationId?: string | null;
};

export type TenantDataRoute = {
  organization_id: string | null;
  schema_name: string | null;
  status: string;
  read_mode: 'public' | 'dual' | 'tenant_schema';
  write_mode: 'public' | 'dual' | 'tenant_schema';
  read_source: string;
  write_target: string;
  brand_id?: string | null;
  location_id?: string | null;
};

export async function getTenantDataRoute(supabase: any, request: TenantRouteRequest = {}): Promise<TenantDataRoute> {
  const { data, error } = await supabase.rpc('get_tenant_data_route', {
    p_organization_id: request.organizationId || null,
    p_brand_id: request.brandId || null,
    p_location_id: request.locationId || null,
  });

  if (error) throw error;
  return data as TenantDataRoute;
}

export async function resolveTenantSchema(serviceRoleSupabase: any, organizationId: string): Promise<string> {
  const { data, error } = await serviceRoleSupabase.rpc('resolve_tenant_schema', {
    p_organization_id: organizationId,
  });

  if (error) throw error;
  return data as string;
}

export function getRouteReadSource(route: TenantDataRoute | null | undefined): string {
  return route?.read_source || 'public';
}

export function getRouteWriteTarget(route: TenantDataRoute | null | undefined): string {
  return route?.write_target || 'public';
}

export function shouldReadTenantSchema(route: TenantDataRoute | null | undefined): boolean {
  return route?.read_mode === 'tenant_schema';
}

export function shouldWriteTenantSchema(route: TenantDataRoute | null | undefined): boolean {
  return route?.write_mode === 'tenant_schema';
}