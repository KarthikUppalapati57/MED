export type TenantRouteRequest = {
  organizationId?: string | null;
  brandId?: string | null;
  locationId?: string | null;
};

export type TenantDataRoute = {
  organization_id: string | null;
  schema_name: 'public';
  status: 'shared_public';
  read_mode: 'public';
  write_mode: 'public';
  read_source: 'public';
  write_target: 'public';
  brand_id?: string | null;
  location_id?: string | null;
};

export async function getTenantDataRoute(_supabase: any, request: TenantRouteRequest = {}): Promise<TenantDataRoute> {
  return {
    organization_id: request.organizationId || null,
    brand_id: request.brandId || null,
    location_id: request.locationId || null,
    schema_name: 'public',
    status: 'shared_public',
    read_mode: 'public',
    write_mode: 'public',
    read_source: 'public',
    write_target: 'public',
  };
}

export async function resolveTenantSchema(_serviceRoleSupabase: any, _organizationId: string): Promise<string> {
  return 'public';
}

export function getRouteReadSource(): string {
  return 'public';
}

export function getRouteWriteTarget(): string {
  return 'public';
}

export function shouldReadTenantSchema(): boolean {
  return false;
}

export function shouldWriteTenantSchema(): boolean {
  return false;
}
