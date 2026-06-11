import React from 'react';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { supabase } from '@/lib/supabaseClient';
import { Building2, Store, MapPin, ChevronDown, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * ContextSwitcher Cascading org/brand/location selector for the Layout header.
 *
 * Behavior per role:
 *   Platform Admin -> Dropdown of ALL organizations -> brands -> locations
 *   Org Owner      -> Dropdown of their org's brands -> locations
 *   Branch Manager -> Dropdown of their assigned branches -> locations
 *   Ground Level   -> Static text showing assigned location (no dropdown)
 */
export default function ContextSwitcher() {
  const { organization, brand, location, switchContext, userProfile, accessTree } = useAuth();
  const { isPlatformAdmin, isOrgOwner, isBranchManager, isLocationManager } = usePermissions();

  // Platform Admin: fetch ALL orgs
  const { data: adminAllOrgs = [] } = useAuthQuery({
    queryKey: ['ctx-all-orgs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, slug, enabled_modules')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: isPlatformAdmin,
  });

  const availableOrgs = isPlatformAdmin 
    ? adminAllOrgs 
    : (accessTree || []).map(node => node.organization).filter(Boolean);

  // Brands: fetch for the active org
  const activeOrgId = organization?.id || userProfile?.organization_id;
  const { data: orgBrands = [] } = useAuthQuery({
    queryKey: ['ctx-brands', activeOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brands')
        .select('id, name, organization_id')
        .eq('organization_id', activeOrgId)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!(isPlatformAdmin || isOrgOwner || isBranchManager || isLocationManager) && !!activeOrgId,
  });

  // Locations: fetch for the active brand (or all locations in org for org_owner)
  const activeBrandId = brand?.id || userProfile?.brand_id;
  const { data: brandLocations = [] } = useAuthQuery({
    queryKey: ['ctx-locations', activeOrgId, activeBrandId],
    queryFn: async () => {
      let query = supabase
        .from('locations')
        .select('id, name, brand_id, organization_id, address')
        .order('name');

      if (activeBrandId) {
        query = query.eq('brand_id', activeBrandId);
      } else if (activeOrgId) {
        query = query.eq('organization_id', activeOrgId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!(isPlatformAdmin || isOrgOwner || isBranchManager || isLocationManager) && !!(activeOrgId || activeBrandId),
  });

  // Ground staff: no switcher, just show assigned location name
  if (!isPlatformAdmin && !isOrgOwner && !isBranchManager && !isLocationManager) {
    if (location?.name) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4 text-resend-green" />
          <span className="font-medium">{location.name}</span>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Organization Selector */}
      {(isPlatformAdmin || availableOrgs.length > 0) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-2 text-xs font-medium max-w-[200px]">
              <Building2 className="h-3.5 w-3.5 text-resend-blue shrink-0" />
              <span className="truncate">{organization?.name || 'All Organizations'}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 max-h-80 overflow-y-auto">
            <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">Select Organization</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {isPlatformAdmin && (
              <>
                <DropdownMenuItem
                  onClick={() => switchContext('organization', null)}
                  className={cn("gap-2 text-sm", !organization && "bg-resend-blue/5 text-resend-blue")}
                >
                  <Globe className="h-3.5 w-3.5" />
                  All Organizations
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {availableOrgs.map(org => (
              <DropdownMenuItem
                key={org.id}
                onClick={() => switchContext('organization', org)}
                className={cn("gap-2 text-sm", organization?.id === org.id && "bg-resend-blue/5 text-resend-blue")}
              >
                <Building2 className="h-3.5 w-3.5" />
                {org.name}
              </DropdownMenuItem>
            ))}
            {availableOrgs.length === 0 && (
              <div className="p-2 text-center text-xs text-muted-foreground">No organizations</div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Brand Selector */}
      {(isPlatformAdmin ? !!organization : true) && orgBrands.length > 0 && (
        <>
          <span className="text-muted-foreground text-xs">›</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-2 text-xs font-medium max-w-[180px]">
                <Store className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                <span className="truncate">{brand?.name || 'Select Brand'}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 max-h-72 overflow-y-auto">
              <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">Select Brand</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {orgBrands.map(b => (
                <DropdownMenuItem
                  key={b.id}
                  onClick={() => switchContext('brand', b)}
                  className={cn("gap-2 text-sm", brand?.id === b.id && "bg-purple-500/5 text-purple-400")}
                >
                  <Store className="h-3.5 w-3.5" />
                  {b.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      {/* Location Selector */}
      {(isPlatformAdmin ? !!organization : true) && brandLocations.length > 0 && (
        <>
          <span className="text-muted-foreground text-xs">›</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-2 text-xs font-medium max-w-[180px]">
                <MapPin className="h-3.5 w-3.5 text-resend-green shrink-0" />
                <span className="truncate">{location?.name || 'Select Location'}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 max-h-72 overflow-y-auto">
              <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">Select Location</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {brandLocations.map(loc => (
                <DropdownMenuItem
                  key={loc.id}
                  onClick={() => switchContext('location', loc)}
                  className={cn("gap-2 text-sm", location?.id === loc.id && "bg-resend-green/5 text-resend-green")}
                >
                  <MapPin className="h-3.5 w-3.5" />
                  <div>
                    <span>{loc.name}</span>
                    {loc.address && <span className="block text-[10px] text-muted-foreground truncate max-w-[160px]">{loc.address}</span>}
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      {/* Viewing-as badge for platform admin impersonation */}
      {isPlatformAdmin && organization && (
        <Badge className="ml-1 bg-resend-blue/5 text-resend-blue border border-resend-blue/20 text-[10px] font-medium">
          Viewing: {organization.name}
        </Badge>
      )}
    </div>
  );
}
