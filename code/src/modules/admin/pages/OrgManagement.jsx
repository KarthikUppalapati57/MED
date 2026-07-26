import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { api } from '@/lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Building2, Store, MapPin, Plus, Trash2, Pencil,
  Loader2, ShieldAlert, KeyRound, Smartphone
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MFAEnrollment } from '@/components/auth/MFAEnrollment';
import ApprovalPolicySettings from '@/modules/invoices/components/ApprovalPolicySettings';
import CustomRolesTab from '@/modules/admin/components/CustomRolesTab';
import { useConfirmation } from '@/hooks/useConfirmation';

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function OrgManagement() {
  const { user, userProfile, mfaLevel, mfaFactors, unenrollMFA } = useAuth();
  const { confirm } = useConfirmation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const pathParts = location.pathname.split('/').filter(Boolean);
  const currentSubPath = pathParts.length > 1 ? pathParts[1] : '';

  const activeTab = currentSubPath || 'hierarchy';

  const setActiveTab = (tab) => {
    navigate(`/OrgManagement/${tab}${location.search}`);
  };
  const [showEnrolling, setShowEnrolling] = useState(false);

  // Add Brand state
  const [addBrandDialog, setAddBrandDialog] = useState(null); // org id
  const [newBrandName, setNewBrandName] = useState('');
  const [savingBrand, setSavingBrand] = useState(false);

  // Add Location state
  const [addLocationDialog, setAddLocationDialog] = useState(null); // {orgId, brandId}
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationAddress, setNewLocationAddress] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);

  // Add Location Group state
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [savingGroup, setSavingGroup] = useState(false);

  // Edit states
  const [editBrand, setEditBrand] = useState(null);
  const [editBrandName, setEditBrandName] = useState('');
  const [editLocation, setEditLocation] = useState(null);
  const [editLocationName, setEditLocationName] = useState('');
  const [editLocationAddress, setEditLocationAddress] = useState('');
  const [saving, setSaving] = useState(false);

  // Org profile details tab state
  const [profileDrafts, setProfileDrafts] = useState({});
  const [savingProfile, setSavingProfile] = useState(null); // org id currently saving

  // Fetch organizations the user can access
  const { data: orgs = [], isLoading: isLoadingOrgs } = useAuthQuery({
    queryKey: ['my-organizations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, slug, subscription_status, plan_id, created_at, stripe_customer_id, address, city, state, zip_code, country, tax_id, primary_contact_name, primary_contact_email, primary_contact_phone')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch all brands the user can access
  const { data: brands = [], isLoading: isLoadingBrands } = useAuthQuery({
    queryKey: ['my-brands'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brands')
        .select('brand_id, name, organization_id, created_at')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch all locations the user can access
  const { data: locations = [], isLoading: isLoadingLocations } = useAuthQuery({
    queryKey: ['my-locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select('id, name, brand_id, organization_id, address, is_commissary, created_at')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: locationGroups = [] } = useAuthQuery({
    queryKey: ['location-groups'],
    queryFn: () => api.entities.LocationGroup.list('-created_at'),
  });

  // Fetch user profiles in the org for staff counts
  const { data: profiles = [] } = useAuthQuery({
    queryKey: ['org-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, organization_id, brand_id, location_id, role, full_name, email');
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch per-org document storage stats (file count / total bytes)
  const { data: docStats = [] } = useAuthQuery({
    queryKey: ['org-document-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_org_document_stats');
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const isLoading = isLoadingOrgs || isLoadingBrands || isLoadingLocations;

  // -- Realtime subscription for org management --
  useEffect(() => {
    const channel = supabase.channel('org-mgmt-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organizations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['my-organizations'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brands' }, () => {
        queryClient.invalidateQueries({ queryKey: ['my-brands'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['my-locations'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        queryClient.invalidateQueries({ queryKey: ['org-profiles'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const handleAddBrand = async () => {
    if (!newBrandName.trim() || !addBrandDialog) return;
    setSavingBrand(true);
    try {
      const { error } = await supabase.from('brands').insert({
        name: newBrandName.trim(),
        organization_id: addBrandDialog,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['my-brands'] });
      const { toast } = await import('sonner');
      toast.success(`Brand "${newBrandName}" created!`);
      setAddBrandDialog(null);
      setNewBrandName('');
    } catch (e) {
      const { toast } = await import('sonner');
      toast.error(e.message || 'Failed to create brand');
    }
    setSavingBrand(false);
  };

  const handleAddLocation = async () => {
    if (!newLocationName.trim() || !addLocationDialog) return;
    setSavingLocation(true);
    try {
      const { error } = await supabase.from('locations').insert({
        name: newLocationName.trim(),
        address: newLocationAddress.trim(),
        brand_id: addLocationDialog.brandId,
        organization_id: addLocationDialog.orgId,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['my-locations'] });
      const { toast } = await import('sonner');
      toast.success(`Location "${newLocationName}" created!`);
      setAddLocationDialog(null);
      setNewLocationName('');
      setNewLocationAddress('');
    } catch (e) {
      const { toast } = await import('sonner');
      toast.error(e.message || 'Failed to create location');
    }
    setSavingLocation(false);
  };

  const handleAddGroup = async () => {
    if (!newGroupName.trim()) return;
    const organizationId = userProfile?.organization_id || orgs[0]?.id;
    if (!organizationId) {
      toast.error('No organization found for this group.');
      return;
    }

    setSavingGroup(true);
    try {
      await api.entities.LocationGroup.create({
        organization_id: organizationId,
        name: newGroupName.trim(),
        description: newGroupDescription.trim() || null,
      });
      queryClient.invalidateQueries({ queryKey: ['location-groups'] });
      toast.success(`Location group "${newGroupName.trim()}" created.`);
      setGroupDialogOpen(false);
      setNewGroupName('');
      setNewGroupDescription('');
    } catch (e) {
      toast.error(e.message || 'Failed to create location group');
    } finally {
      setSavingGroup(false);
    }
  };

  const handleDeleteBrand = async (brand) => {
    const proceed = await confirm({
      title: `Delete brand ${brand.name}?`,
      description: 'All locations under this brand will also be deleted. This action cannot be undone.',
      confirmText: 'Delete Brand',
      cancelText: 'Keep Brand',
      variant: 'destructive',
      severity: 'critical',
    });
    if (!proceed) return;
    
    await queryClient.cancelQueries({ queryKey: ['my-brands'] });
    await queryClient.cancelQueries({ queryKey: ['my-locations'] });
    const prevBrands = queryClient.getQueryData(['my-brands']);
    const prevLocations = queryClient.getQueryData(['my-locations']);
    
    queryClient.setQueryData(['my-brands'], old => old ? old.filter(b => b.brand_id !== brand.brand_id) : []);
    queryClient.setQueryData(['my-locations'], old => old ? old.filter(l => l.brand_id !== brand.brand_id) : []);

    try {
      // Delete locations first
      await supabase.from('locations').delete().eq('brand_id', brand.brand_id);
      const { error } = await supabase.from('brands').delete().eq('brand_id', brand.brand_id);
      if (error) throw error;
      
      const { toast } = await import('sonner');
      toast.success(`Brand "${brand.name}" deleted`);
      queryClient.invalidateQueries({ queryKey: ['my-brands'] });
      queryClient.invalidateQueries({ queryKey: ['my-locations'] });
    } catch (e) {
      if (prevBrands) queryClient.setQueryData(['my-brands'], prevBrands);
      if (prevLocations) queryClient.setQueryData(['my-locations'], prevLocations);
      const { toast } = await import('sonner');
      toast.error(e.message || 'Failed to delete brand');
    }
  };

  const handleDeleteLocation = async (location) => {
    const proceed = await confirm({
      title: `Delete location ${location.name}?`,
      description: 'This location will be deleted. This action cannot be undone.',
      confirmText: 'Delete Location',
      cancelText: 'Keep Location',
      variant: 'destructive',
      severity: 'critical',
    });
    if (!proceed) return;
    
    await queryClient.cancelQueries({ queryKey: ['my-locations'] });
    const prevLocations = queryClient.getQueryData(['my-locations']);
    queryClient.setQueryData(['my-locations'], old => old ? old.filter(l => l.id !== location.id) : []);

    try {
      const { error } = await supabase.from('locations').delete().eq('id', location.id);
      if (error) throw error;
      
      const { toast } = await import('sonner');
      toast.success(`Location "${location.name}" deleted`);
      queryClient.invalidateQueries({ queryKey: ['my-locations'] });
    } catch (e) {
      if (prevLocations) queryClient.setQueryData(['my-locations'], prevLocations);
      const { toast } = await import('sonner');
      toast.error(e.message || 'Failed to delete location');
    }
  };

  const PROFILE_FIELDS = ['address', 'city', 'state', 'zip_code', 'country', 'tax_id', 'primary_contact_name', 'primary_contact_email', 'primary_contact_phone'];

  const getProfileDraft = (org) => profileDrafts[org.id] || Object.fromEntries(PROFILE_FIELDS.map(f => [f, org[f] || '']));

  const setProfileField = (orgId, field, value) => {
    setProfileDrafts(prev => ({
      ...prev,
      [orgId]: { ...(prev[orgId] || Object.fromEntries(PROFILE_FIELDS.map(f => [f, '']))), [field]: value },
    }));
  };

  const handleSaveProfile = async (org) => {
    const draft = getProfileDraft(org);
    setSavingProfile(org.id);
    try {
      const { error } = await supabase.from('organizations').update(draft).eq('id', org.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['my-organizations'] });
      const { toast } = await import('sonner');
      toast.success('Organization profile updated');
    } catch (e) {
      const { toast } = await import('sonner');
      toast.error(e.message || 'Failed to update organization profile');
    }
    setSavingProfile(null);
  };

  const handleSaveEditBrand = async () => {
    if (!editBrandName.trim() || !editBrand) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('brands').update({ name: editBrandName.trim() }).eq('brand_id', editBrand.brand_id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['my-brands'] });
      const { toast } = await import('sonner');
      toast.success('Brand updated');
      setEditBrand(null);
    } catch (e) {
      const { toast } = await import('sonner');
      toast.error(e.message || 'Failed to update brand');
    }
    setSaving(false);
  };

  const handleSaveEditLocation = async () => {
    if (!editLocationName.trim() || !editLocation) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('locations').update({
        name: editLocationName.trim(),
        address: editLocationAddress.trim(),
      }).eq('id', editLocation.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['my-locations'] });
      const { toast } = await import('sonner');
      toast.success('Location updated');
      setEditLocation(null);
    } catch (e) {
      const { toast } = await import('sonner');
      toast.error(e.message || 'Failed to update location');
    }
    setSaving(false);
  };

  const canManage = ['org_manager', 'tenant_super_admin', 'platform_admin'].includes(userProfile?.role);

  // Precomputed Brand/Location/Staff lookup Maps for O(1) retrieval during hierarchy rendering
  const orgBrandsMap = React.useMemo(() => {
    const map = new Map();
    brands.forEach(b => {
      const orgId = b.organization_id;
      if (orgId) {
        if (!map.has(orgId)) {
          map.set(orgId, []);
        }
        map.get(orgId).push(b);
      }
    });
    return map;
  }, [brands]);

  const brandLocationsMap = React.useMemo(() => {
    const map = new Map();
    locations.forEach(l => {
      const brandId = l.brand_id;
      if (brandId) {
        if (!map.has(brandId)) {
          map.set(brandId, []);
        }
        map.get(brandId).push(l);
      }
    });
    return map;
  }, [locations]);

  const staffByOrgMap = React.useMemo(() => {
    const map = new Map();
    profiles.forEach(p => {
      const orgId = p.organization_id;
      if (orgId) {
        map.set(orgId, (map.get(orgId) || 0) + 1);
      }
    });
    return map;
  }, [profiles]);

  const staffByBrandMap = React.useMemo(() => {
    const map = new Map();
    profiles.forEach(p => {
      const brandId = p.brand_id;
      if (brandId) {
        map.set(brandId, (map.get(brandId) || 0) + 1);
      }
    });
    return map;
  }, [profiles]);

  const staffByLocationMap = React.useMemo(() => {
    const map = new Map();
    profiles.forEach(p => {
      const locationId = p.location_id;
      if (locationId) {
        map.set(locationId, (map.get(locationId) || 0) + 1);
      }
    });
    return map;
  }, [profiles]);

  const docStatsByOrgMap = React.useMemo(() => {
    const map = new Map();
    docStats.forEach(s => map.set(s.organization_id, s));
    return map;
  }, [docStats]);

  const getOrgBrands = React.useCallback((orgId) => orgBrandsMap.get(orgId) || [], [orgBrandsMap]);
  const getBrandLocations = React.useCallback((brandId) => brandLocationsMap.get(brandId) || [], [brandLocationsMap]);
  const getOrgStaffCount = React.useCallback((orgId) => staffByOrgMap.get(orgId) || 0, [staffByOrgMap]);
  const getOrgDocStats = React.useCallback((orgId) => docStatsByOrgMap.get(orgId) || { file_count: 0, total_bytes: 0 }, [docStatsByOrgMap]);
  const getBrandStaffCount = React.useCallback((brandId) => staffByBrandMap.get(brandId) || 0, [staffByBrandMap]);
  const getLocationStaffCount = React.useCallback((locationId) => staffByLocationMap.get(locationId) || 0, [staffByLocationMap]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Organization Management</h1>
            <p className="text-sm text-muted-foreground">Manage your brands and locations hierarchy</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="hierarchy">Hierarchy</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="groups">Location Groups</TabsTrigger>
          <TabsTrigger value="roles">Custom Roles</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="approvals">Approvals</TabsTrigger>
        </TabsList>

        <TabsContent value="hierarchy" className="space-y-8 mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : orgs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Building2 className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">No organizations yet</p>
                <p className="text-xs text-muted-foreground mt-1">Complete onboarding to create your first organization</p>
              </CardContent>
            </Card>
          ) : (
            orgs.map(org => {
              const orgBrands = getOrgBrands(org.id);
              const staffCount = getOrgStaffCount(org.id);
              const docStats = getOrgDocStats(org.id);

              return (
                <div key={org.id} className="space-y-4">
                  {/* Organization header */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 bg-resend-blue/5 rounded-xl flex items-center justify-center shrink-0">
                        <Building2 className="w-5 h-5 text-resend-blue" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-base font-black text-foreground truncate">{org.name}</p>
                          <Badge className="bg-resend-green/10 text-resend-green border-none text-[9px]">{org.status || 'active'}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {orgBrands.length} brand{orgBrands.length !== 1 ? 's' : ''} / {staffCount} staff / {docStats.file_count} file{docStats.file_count !== 1 ? 's' : ''} ({formatBytes(docStats.total_bytes)}) / Created {org.created_at ? new Date(org.created_at).toLocaleDateString() : '-'}
                        </p>
                      </div>
                    </div>
                    {canManage && (
                      <Button
                        size="sm" variant="outline"
                        className="h-8 text-xs shrink-0"
                        onClick={() => { setAddBrandDialog(org.id); setNewBrandName(''); }}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Brand
                      </Button>
                    )}
                  </div>

                  {orgBrands.length === 0 ? (
                    <div className="text-center py-16 bg-card rounded-2xl border border-dashed border-border">
                      <div className="w-14 h-14 bg-secondary/50 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Store className="w-7 h-7 text-muted-foreground/50" />
                      </div>
                      <p className="text-sm font-bold text-foreground">No Brands Yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Add your first brand to start building out locations.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      {orgBrands.map(brand => {
                        const brandLocations = getBrandLocations(brand.brand_id);
                        const brandStaff = getBrandStaffCount(brand.brand_id);

                        return (
                          <Card key={brand.brand_id} className="border-border shadow-sm overflow-hidden flex flex-col bg-card">
                            <div className="p-5 border-b border-border/50 bg-secondary/20 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 bg-card shadow-sm border border-border rounded-xl flex items-center justify-center shrink-0">
                                  <Store className="w-5 h-5 text-foreground/80" />
                                </div>
                                <div className="min-w-0">
                                  <h3 className="font-black text-foreground truncate">{brand.name}</h3>
                                  <p className="text-[10px] text-muted-foreground font-medium">{brandLocations.length} Locations &middot; {brandStaff} Staff</p>
                                </div>
                              </div>
                              {canManage && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2 text-violet-600 hover:bg-violet-50"
                                    onClick={() => { setAddLocationDialog({ orgId: org.id, brandId: brand.brand_id }); setNewLocationName(''); setNewLocationAddress(''); }}>
                                    <Plus className="w-3 h-3 mr-1" /> Location
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-resend-blue hover:bg-resend-blue/5"
                                    onClick={() => { setEditBrand(brand); setEditBrandName(brand.name); }}>
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-resend-red hover:bg-resend-red/5"
                                    onClick={() => handleDeleteBrand(brand)}>
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                            <div className="flex-1 p-0">
                              {brandLocations.length === 0 ? (
                                <p className="text-xs text-center py-6 text-muted-foreground italic">No locations under this brand</p>
                              ) : (
                                <div className="divide-y divide-slate-100">
                                  {brandLocations.map(loc => {
                                    const locStaff = getLocationStaffCount(loc.id);
                                    return (
                                      <div key={loc.id} className="p-4 px-5 flex items-center justify-between gap-2 hover:bg-secondary/50 transition-colors group">
                                        <div className="flex items-center gap-3 min-w-0">
                                          <MapPin className="w-4 h-4 text-muted-foreground/50 group-hover:text-amber-500 transition-colors shrink-0" />
                                          <div className="min-w-0">
                                            <p className="text-sm font-bold text-foreground/80 truncate">{loc.name}</p>
                                            <p className="text-[10px] text-muted-foreground truncate">{loc.address || 'No address'}</p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                          <Badge variant="secondary" className="bg-secondary text-muted-foreground font-bold border-none text-[10px]">
                                            {locStaff} Staff
                                          </Badge>
                                          {canManage && (
                                            <div className="flex items-center gap-1">
                                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-resend-blue hover:bg-resend-blue/5"
                                                onClick={() => { setEditLocation(loc); setEditLocationName(loc.name); setEditLocationAddress(loc.address || ''); }}>
                                                <Pencil className="w-3 h-3" />
                                              </Button>
                                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-resend-red hover:bg-resend-red/5"
                                                onClick={() => handleDeleteLocation(loc)}>
                                                <Trash2 className="w-3 h-3" />
                                              </Button>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="profile" className="space-y-6 mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : orgs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Building2 className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">No organizations yet</p>
              </CardContent>
            </Card>
          ) : (
            orgs.map(org => {
              const draft = getProfileDraft(org);
              return (
                <Card key={org.id} className="border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">{org.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">Address</Label>
                        <Input disabled={!canManage} value={draft.address} onChange={e => setProfileField(org.id, 'address', e.target.value)} placeholder="123 Main St" />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">City</Label>
                        <Input disabled={!canManage} value={draft.city} onChange={e => setProfileField(org.id, 'city', e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">State</Label>
                        <Input disabled={!canManage} value={draft.state} onChange={e => setProfileField(org.id, 'state', e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Zip Code</Label>
                        <Input disabled={!canManage} value={draft.zip_code} onChange={e => setProfileField(org.id, 'zip_code', e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Country</Label>
                        <Input disabled={!canManage} value={draft.country} onChange={e => setProfileField(org.id, 'country', e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Tax ID</Label>
                        <Input disabled={!canManage} value={draft.tax_id} onChange={e => setProfileField(org.id, 'tax_id', e.target.value)} placeholder="12-3456789" />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Contact Name</Label>
                        <Input disabled={!canManage} value={draft.primary_contact_name} onChange={e => setProfileField(org.id, 'primary_contact_name', e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Contact Email</Label>
                        <Input disabled={!canManage} type="email" value={draft.primary_contact_email} onChange={e => setProfileField(org.id, 'primary_contact_email', e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Contact Phone</Label>
                        <Input disabled={!canManage} value={draft.primary_contact_phone} onChange={e => setProfileField(org.id, 'primary_contact_phone', e.target.value)} />
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex justify-end">
                        <Button size="sm" onClick={() => handleSaveProfile(org)} disabled={savingProfile === org.id}>
                          {savingProfile === org.id ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                          Save
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="groups" className="space-y-6 mt-6">
          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Location Groups</CardTitle>
              <Button size="sm" onClick={() => setGroupDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> Create Group
              </Button>
            </CardHeader>
            <CardContent>
              {locationGroups.length === 0 ? (
                <div className="text-center py-8">
                  <Store className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No location groups configured.</p>
                  <p className="text-sm text-muted-foreground mt-1">Group locations by region or concept for easier reporting.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {locationGroups.map(group => (
                    <div key={group.id} className="p-4 border rounded-lg bg-secondary/30">
                      <h4 className="font-semibold text-foreground">{group.name}</h4>
                      <p className="text-sm text-muted-foreground">{group.description || 'No description provided'}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-6">
          <Card className="border-border">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row gap-8">
                <div className="flex-1 space-y-6">
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                      <KeyRound className="w-5 h-5 text-primary" />
                      Two-Factor Authentication
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Add an extra layer of security to your account by requiring a code from Microsoft Authenticator or a similar app.
                    </p>
                  </div>

                  {mfaFactors.length > 0 ? (
                    <div className="space-y-4">
                      {mfaFactors.map(factor => (
                        <div key={factor.id} className="flex items-center justify-between p-4 bg-primary/5/50 rounded-xl border border-teal-100">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                              <Smartphone className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-foreground uppercase">{factor.friendly_name || 'Authenticator App'}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] h-4">Verified</Badge>
                                <span className="text-[10px] text-muted-foreground italic">Added {new Date(factor.created_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-resend-red hover:text-resend-red hover:bg-resend-red/5 text-xs"
                            onClick={async () => {
                              const proceed = await confirm({
                                title: 'Disable MFA?',
                                description: 'This will make your account less secure. You can enroll a new factor later from security settings.',
                                confirmText: 'Disable MFA',
                                cancelText: 'Keep MFA Enabled',
                                variant: 'warning',
                                severity: 'high',
                              });
                              if (proceed) unenrollMFA(factor.id);
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 border-2 border-dashed border-border rounded-2xl text-center space-y-4">
                      <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center mx-auto text-muted-foreground">
                        <ShieldAlert className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-foreground font-medium">Protect your account</p>
                        <p className="text-xs text-muted-foreground max-w-[240px] mx-auto">
                          You haven't set up Multi-Factor Authentication yet. We highly recommend enabling it.
                        </p>
                      </div>
                      <Button className="bg-primary hover:bg-primary text-primary-foreground" onClick={() => setShowEnrolling(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Enable MFA
                      </Button>
                    </div>
                  )}

                  {showEnrolling && (
                    <Card className="border-teal-100 shadow-md bg-card">
                      <CardContent className="p-0">
                        <MFAEnrollment 
                          onComplete={() => setShowEnrolling(false)} 
                          onCancel={() => setShowEnrolling(false)} 
                        />
                      </CardContent>
                    </Card>
                  )}
                </div>

                <div className="w-full md:w-72 bg-secondary/80 rounded-2xl p-6 space-y-4 self-start">
                  <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">How it works</h4>
                  <ul className="space-y-4">
                    <li className="flex gap-3">
                      <div className="w-5 h-5 bg-card shadow-sm rounded-md flex items-center justify-center shrink-0 text-[10px] font-bold text-primary border border-border">1</div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">Download <b>Microsoft Authenticator</b> or Google Authenticator from your app store.</p>
                    </li>
                    <li className="flex gap-3">
                      <div className="w-5 h-5 bg-card shadow-sm rounded-md flex items-center justify-center shrink-0 text-[10px] font-bold text-primary border border-border">2</div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">Scan the secure QR code that will be generated for your account.</p>
                    </li>
                    <li className="flex gap-3">
                      <div className="w-5 h-5 bg-card shadow-sm rounded-md flex items-center justify-center shrink-0 text-[10px] font-bold text-primary border border-border">3</div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">Confirm your setup with the first 6-digit code shown in your app.</p>
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approvals" className="mt-6">
          <ApprovalPolicySettings />
        </TabsContent>

        <TabsContent value="roles" className="mt-6">
          <CustomRolesTab />
        </TabsContent>
      </Tabs>

      {/* Add Brand Dialog */}
      <Dialog open={!!addBrandDialog} onOpenChange={() => setAddBrandDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Brand</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-semibold text-foreground">Brand Name</Label>
              <Input placeholder="e.g. Acme Burgers" value={newBrandName} onChange={e => setNewBrandName(e.target.value)} className="mt-1" />
            </div>
            <p className="text-xs text-muted-foreground">A brand represents a restaurant concept within your organization. You can add multiple locations under each brand.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddBrandDialog(null)}>Cancel</Button>
            <Button onClick={handleAddBrand} disabled={savingBrand || !newBrandName.trim()} className="bg-violet-600 hover:bg-violet-700">
              {savingBrand ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Add Brand
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Location Group Dialog */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Location Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-semibold text-foreground">Group Name</Label>
              <Input
                placeholder="e.g. North Region"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold text-foreground">Description</Label>
              <Input
                placeholder="Optional reporting or operating notes"
                value={newGroupDescription}
                onChange={e => setNewGroupDescription(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddGroup} disabled={savingGroup || !newGroupName.trim()}>
              {savingGroup ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Create Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Location Dialog */}
      <Dialog open={!!addLocationDialog} onOpenChange={() => setAddLocationDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Location</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-semibold text-foreground">Location Name</Label>
              <Input placeholder="e.g. Downtown Branch" value={newLocationName} onChange={e => setNewLocationName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-sm font-semibold text-foreground">Address</Label>
              <Input placeholder="123 Street, City, State, ZIP" value={newLocationAddress} onChange={e => setNewLocationAddress(e.target.value)} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddLocationDialog(null)}>Cancel</Button>
            <Button onClick={handleAddLocation} disabled={savingLocation || !newLocationName.trim()} className="bg-emerald-600 hover:bg-emerald-700">
              {savingLocation ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <MapPin className="w-4 h-4 mr-2" />}
              Add Location
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Brand Dialog */}
      <Dialog open={!!editBrand} onOpenChange={() => setEditBrand(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Brand</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-semibold text-foreground">Brand Name</Label>
              <Input value={editBrandName} onChange={e => setEditBrandName(e.target.value)} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBrand(null)}>Cancel</Button>
            <Button onClick={handleSaveEditBrand} disabled={saving || !editBrandName.trim()} className="bg-resend-blue hover:bg-blue-700">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Location Dialog */}
      <Dialog open={!!editLocation} onOpenChange={() => setEditLocation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Location</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-semibold text-foreground">Location Name</Label>
              <Input value={editLocationName} onChange={e => setEditLocationName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-sm font-semibold text-foreground">Address</Label>
              <Input value={editLocationAddress} onChange={e => setEditLocationAddress(e.target.value)} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditLocation(null)}>Cancel</Button>
            <Button onClick={handleSaveEditLocation} disabled={saving || !editLocationName.trim()} className="bg-resend-blue hover:bg-blue-700">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

