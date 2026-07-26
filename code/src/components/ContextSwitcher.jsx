import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { supabase } from '@/lib/supabaseClient';
import { Building2, Store, MapPin, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
 * Not rendered for Platform Admin -- Layout.jsx excludes it for that role
 * (platform admin gets platform-only nav + a separate PlatformDashboard instead).
 */
export default function ContextSwitcher() {
  const { organization, brand, location, switchContext, userProfile, accessTree } = useAuth();
  const { isTenantSuperAdmin, isOrgManager, isBranchManager } = usePermissions();
  const [pendingOrg, setPendingOrg] = useState(null);
  const [pendingBrand, setPendingBrand] = useState(null);
  const [pendingLocation, setPendingLocation] = useState(null);

  const canSwitch = isTenantSuperAdmin || isOrgManager || isBranchManager;

  const { data: adminAllOrgs = [] } = useAuthQuery({
    queryKey: ['ctx-all-orgs', 'tenant'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, slug, enabled_modules')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: isTenantSuperAdmin,
  });

  const availableOrgs = isTenantSuperAdmin
    ? adminAllOrgs
    : (accessTree || []).map(node => node.organization).filter(Boolean);

  const displayOrg = pendingOrg || organization;
  const displayBrand = pendingOrg ? pendingBrand : (pendingBrand || brand);
  const displayLocation = (pendingOrg || pendingBrand) ? pendingLocation : (pendingLocation || location);
  const activeOrgId = displayOrg?.id || userProfile?.organization_id || null;
  const activeBrandId = displayBrand?.brand_id || displayBrand?.id || null;

  useEffect(() => {
    if (pendingOrg && organization?.id === pendingOrg.id) setPendingOrg(null);
  }, [organization?.id, pendingOrg]);

  useEffect(() => {
    const committedBrandId = brand?.brand_id || brand?.id || null;
    const pendingBrandId = pendingBrand?.brand_id || pendingBrand?.id || null;
    if (pendingBrandId && committedBrandId === pendingBrandId) setPendingBrand(null);
  }, [brand?.brand_id, brand?.id, pendingBrand]);

  useEffect(() => {
    if (pendingLocation && location?.id === pendingLocation.id) setPendingLocation(null);
  }, [location?.id, pendingLocation]);

  const accessNodeForOrg = useMemo(() => {
    if (!activeOrgId) return null;
    return (accessTree || []).find(node => node.organization?.id === activeOrgId) || null;
  }, [accessTree, activeOrgId]);

  const accessTreeBrands = useMemo(() => {
    return (accessNodeForOrg?.brands || [])
      .map((entry) => {
        const source = entry?.brand || entry;
        if (!source) return null;
        const locations = (entry?.locations || source.locations || [])
          .map((locEntry) => locEntry?.location || locEntry)
          .filter(Boolean);
        return { ...source, brand_id: source.brand_id || source.id, locations };
      })
      .filter(Boolean);
  }, [accessNodeForOrg]);

  const { data: fetchedOrgBrands = [] } = useAuthQuery({
    queryKey: ['ctx-brands', activeOrgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brands')
        .select('brand_id, name, organization_id')
        .eq('organization_id', activeOrgId)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!canSwitch && !!activeOrgId && accessTreeBrands.length === 0,
  });

  const orgBrands = accessTreeBrands.length > 0 ? accessTreeBrands : fetchedOrgBrands;
  const accessTreeLocations = displayBrand?.locations || [];

  const { data: fetchedBrandLocations = [] } = useAuthQuery({
    queryKey: ['ctx-locations', activeOrgId, activeBrandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select('id, name, brand_id, organization_id, address')
        .eq('brand_id', activeBrandId)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!canSwitch && !!activeBrandId && accessTreeLocations.length === 0,
  });

  const brandLocations = accessTreeLocations.length > 0 ? accessTreeLocations : fetchedBrandLocations;

  const commitOrganization = (org) => {
    setPendingOrg(org);
    setPendingBrand(null);
    setPendingLocation(null);
    switchContext('organization', org).finally(() => {
      setPendingOrg((current) => current?.id === org.id ? null : current);
    });
  };

  const commitBrand = (nextBrand) => {
    setPendingBrand(nextBrand);
    setPendingLocation(null);
    switchContext('brand', nextBrand).finally(() => {
      const nextBrandId = nextBrand?.brand_id || nextBrand?.id || null;
      setPendingBrand((current) => {
        const currentId = current?.brand_id || current?.id || null;
        return currentId === nextBrandId ? null : current;
      });
    });
  };

  const commitLocation = (nextLocation) => {
    setPendingLocation(nextLocation);
    switchContext('location', nextLocation).finally(() => {
      setPendingLocation((current) => current?.id === nextLocation.id ? null : current);
    });
  };

  if (!canSwitch) {
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
      {(isTenantSuperAdmin || availableOrgs.length > 0) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-2 text-xs font-medium max-w-[200px]">
              <Building2 className="h-3.5 w-3.5 text-resend-blue shrink-0" />
              <span className="truncate">{displayOrg?.name || 'All Organizations'}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 max-h-80 overflow-y-auto">
            <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">Select Organization</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {availableOrgs.map(org => (
              <DropdownMenuItem
                key={org.id}
                onClick={() => commitOrganization(org)}
                className={cn('gap-2 text-sm', displayOrg?.id === org.id && 'bg-resend-blue/5 text-resend-blue')}
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

      {orgBrands.length > 0 && (
        <>
          <span className="text-muted-foreground text-xs">&gt;</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-2 text-xs font-medium max-w-[180px]">
                <Store className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                <span className="truncate">{displayBrand?.name || 'Select Brand'}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 max-h-72 overflow-y-auto">
              <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">Select Brand</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {orgBrands.map(b => (
                <DropdownMenuItem
                  key={b.brand_id}
                  onClick={() => commitBrand(b)}
                  className={cn('gap-2 text-sm', (displayBrand?.brand_id || displayBrand?.id) === b.brand_id && 'bg-purple-500/5 text-purple-400')}
                >
                  <Store className="h-3.5 w-3.5" />
                  {b.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      {brandLocations.length > 0 && (
        <>
          <span className="text-muted-foreground text-xs">&gt;</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-2 text-xs font-medium max-w-[180px]">
                <MapPin className="h-3.5 w-3.5 text-resend-green shrink-0" />
                <span className="truncate">{displayLocation?.name || 'Select Location'}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 max-h-72 overflow-y-auto">
              <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">Select Location</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {brandLocations.map(loc => (
                <DropdownMenuItem
                  key={loc.id}
                  onClick={() => commitLocation(loc)}
                  className={cn('gap-2 text-sm', displayLocation?.id === loc.id && 'bg-resend-green/5 text-resend-green')}
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
    </div>
  );
}
