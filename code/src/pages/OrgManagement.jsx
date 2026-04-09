import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Building2, Store, MapPin, Plus, Trash2, Pencil, ChevronDown, ChevronRight,
  Loader2
} from 'lucide-react';

export default function OrgManagement() {
  const { user, userProfile } = useAuth();
  const queryClient = useQueryClient();
  const [expandedOrgs, setExpandedOrgs] = useState(new Set());
  const [expandedBrands, setExpandedBrands] = useState(new Set());

  // Add Brand state
  const [addBrandDialog, setAddBrandDialog] = useState(null); // org id
  const [newBrandName, setNewBrandName] = useState('');
  const [savingBrand, setSavingBrand] = useState(false);

  // Add Location state
  const [addLocationDialog, setAddLocationDialog] = useState(null); // {orgId, brandId}
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationAddress, setNewLocationAddress] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);

  // Edit states
  const [editBrand, setEditBrand] = useState(null);
  const [editBrandName, setEditBrandName] = useState('');
  const [editLocation, setEditLocation] = useState(null);
  const [editLocationName, setEditLocationName] = useState('');
  const [editLocationAddress, setEditLocationAddress] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch organizations the user can access
  const { data: orgs = [], isLoading: isLoadingOrgs } = useQuery({
    queryKey: ['my-organizations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch all brands the user can access
  const { data: brands = [], isLoading: isLoadingBrands } = useQuery({
    queryKey: ['my-brands'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brands')
        .select('*')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch all locations the user can access
  const { data: locations = [], isLoading: isLoadingLocations } = useQuery({
    queryKey: ['my-locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch user profiles in the org for staff counts
  const { data: profiles = [] } = useQuery({
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

  const isLoading = isLoadingOrgs || isLoadingBrands || isLoadingLocations;

  const toggleOrg = (orgId) => {
    setExpandedOrgs(prev => {
      const next = new Set(prev);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return next;
    });
  };

  const toggleBrand = (brandId) => {
    setExpandedBrands(prev => {
      const next = new Set(prev);
      if (next.has(brandId)) next.delete(brandId);
      else next.add(brandId);
      return next;
    });
  };

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

  const handleDeleteBrand = async (brand) => {
    if (!window.confirm(`Delete brand "${brand.name}" and all its locations? This cannot be undone.`)) return;
    try {
      // Delete locations first
      await supabase.from('locations').delete().eq('brand_id', brand.id);
      const { error } = await supabase.from('brands').delete().eq('id', brand.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['my-brands'] });
      queryClient.invalidateQueries({ queryKey: ['my-locations'] });
      const { toast } = await import('sonner');
      toast.success(`Brand "${brand.name}" deleted`);
    } catch (e) {
      const { toast } = await import('sonner');
      toast.error(e.message || 'Failed to delete brand');
    }
  };

  const handleDeleteLocation = async (location) => {
    if (!window.confirm(`Delete location "${location.name}"? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('locations').delete().eq('id', location.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['my-locations'] });
      const { toast } = await import('sonner');
      toast.success(`Location "${location.name}" deleted`);
    } catch (e) {
      const { toast } = await import('sonner');
      toast.error(e.message || 'Failed to delete location');
    }
  };

  const handleSaveEditBrand = async () => {
    if (!editBrandName.trim() || !editBrand) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('brands').update({ name: editBrandName.trim() }).eq('id', editBrand.id);
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

  const canManage = ['owner', 'admin', 'platform_admin'].includes(userProfile?.role);

  const getOrgBrands = (orgId) => brands.filter(b => b.organization_id === orgId);
  const getBrandLocations = (brandId) => locations.filter(l => l.brand_id === brandId);
  const getOrgStaffCount = (orgId) => profiles.filter(p => p.organization_id === orgId).length;
  const getBrandStaffCount = (brandId) => profiles.filter(p => p.brand_id === brandId).length;
  const getLocationStaffCount = (locationId) => profiles.filter(p => p.location_id === locationId).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
            <Building2 className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Organization Management</h1>
            <p className="text-sm text-slate-500">Manage your brands and locations hierarchy</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{orgs.length}</p>
              <p className="text-xs text-slate-500">Organizations</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-50 rounded-lg flex items-center justify-center">
              <Store className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{brands.length}</p>
              <p className="text-xs text-slate-500">Brands</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
              <MapPin className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{locations.length}</p>
              <p className="text-xs text-slate-500">Locations</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hierarchy Tree */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
        </div>
      ) : orgs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500">No organizations yet</p>
            <p className="text-xs text-slate-400 mt-1">Complete onboarding to create your first organization</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {orgs.map(org => {
            const orgBrands = getOrgBrands(org.id);
            const isExpanded = expandedOrgs.has(org.id);
            const staffCount = getOrgStaffCount(org.id);

            return (
              <Card key={org.id} className="overflow-hidden border-slate-200 shadow-sm">
                {/* Organization Row */}
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => toggleOrg(org.id)}
                >
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-blue-600" /> : <ChevronRight className="w-4 h-4 text-blue-600" />}
                  </div>
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 truncate">{org.name}</p>
                      <Badge className="bg-emerald-100 text-emerald-700 border-none text-[9px]">{org.status || 'active'}</Badge>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {orgBrands.length} brand{orgBrands.length !== 1 ? 's' : ''} · {staffCount} staff · Created {org.created_at ? new Date(org.created_at).toLocaleDateString() : '—'}
                    </p>
                  </div>
                  {canManage && (
                    <Button
                      size="sm" variant="outline"
                      className="h-7 text-xs shrink-0"
                      onClick={e => { e.stopPropagation(); setAddBrandDialog(org.id); setNewBrandName(''); }}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Brand
                    </Button>
                  )}
                </div>

                {/* Expanded: Brands list */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/50">
                    {orgBrands.length === 0 ? (
                      <div className="p-4 pl-20 text-xs text-slate-400 italic">No brands yet — add your first brand</div>
                    ) : (
                      orgBrands.map(brand => {
                        const brandLocations = getBrandLocations(brand.id);
                        const isBrandExpanded = expandedBrands.has(brand.id);
                        const brandStaff = getBrandStaffCount(brand.id);

                        return (
                          <div key={brand.id}>
                            {/* Brand Row */}
                            <div
                              className="flex items-center gap-3 py-3 px-4 pl-12 cursor-pointer hover:bg-slate-100/50 transition-colors border-t border-slate-100 first:border-t-0"
                              onClick={() => toggleBrand(brand.id)}
                            >
                              <div className="w-6 h-6 flex items-center justify-center shrink-0">
                                {isBrandExpanded ? <ChevronDown className="w-3.5 h-3.5 text-violet-500" /> : <ChevronRight className="w-3.5 h-3.5 text-violet-500" />}
                              </div>
                              <div className="w-8 h-8 bg-violet-50 rounded-lg flex items-center justify-center shrink-0">
                                <Store className="w-4 h-4 text-violet-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-800 truncate">{brand.name}</p>
                                <p className="text-[10px] text-slate-400">
                                  {brandLocations.length} location{brandLocations.length !== 1 ? 's' : ''} · {brandStaff} staff
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                {canManage && (
                                  <>
                                    <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-violet-600 hover:bg-violet-50"
                                      onClick={() => { setAddLocationDialog({ orgId: org.id, brandId: brand.id }); setNewLocationName(''); setNewLocationAddress(''); }}>
                                      <Plus className="w-3 h-3 mr-1" /> Location
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                      onClick={() => { setEditBrand(brand); setEditBrandName(brand.name); }}>
                                      <Pencil className="w-3 h-3" />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                      onClick={() => handleDeleteBrand(brand)}>
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Expanded: Locations list */}
                            {isBrandExpanded && (
                              <div className="bg-white/50">
                                {brandLocations.length === 0 ? (
                                  <div className="p-3 pl-28 text-[10px] text-slate-400 italic">No locations yet</div>
                                ) : (
                                  brandLocations.map(loc => {
                                    const locStaff = getLocationStaffCount(loc.id);
                                    return (
                                      <div key={loc.id} className="flex items-center gap-3 py-2.5 px-4 pl-24 border-t border-slate-50 hover:bg-emerald-50/30 transition-colors">
                                        <div className="w-7 h-7 bg-emerald-50 rounded-md flex items-center justify-center shrink-0">
                                          <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs font-medium text-slate-700 truncate">{loc.name}</p>
                                          <p className="text-[10px] text-slate-400 truncate">{loc.address || 'No address'} · {locStaff} staff</p>
                                        </div>
                                        {canManage && (
                                          <div className="flex items-center gap-1 shrink-0">
                                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                              onClick={() => { setEditLocation(loc); setEditLocationName(loc.name); setEditLocationAddress(loc.address || ''); }}>
                                              <Pencil className="w-2.5 h-2.5" />
                                            </Button>
                                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                              onClick={() => handleDeleteLocation(loc)}>
                                              <Trash2 className="w-2.5 h-2.5" />
                                            </Button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Brand Dialog */}
      <Dialog open={!!addBrandDialog} onOpenChange={() => setAddBrandDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Brand</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-semibold text-slate-700">Brand Name</Label>
              <Input placeholder="e.g. Acme Burgers" value={newBrandName} onChange={e => setNewBrandName(e.target.value)} className="mt-1" />
            </div>
            <p className="text-xs text-slate-400">A brand represents a restaurant concept within your organization. You can add multiple locations under each brand.</p>
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

      {/* Add Location Dialog */}
      <Dialog open={!!addLocationDialog} onOpenChange={() => setAddLocationDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Location</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-semibold text-slate-700">Location Name</Label>
              <Input placeholder="e.g. Downtown Branch" value={newLocationName} onChange={e => setNewLocationName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-sm font-semibold text-slate-700">Address</Label>
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
              <Label className="text-sm font-semibold text-slate-700">Brand Name</Label>
              <Input value={editBrandName} onChange={e => setEditBrandName(e.target.value)} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBrand(null)}>Cancel</Button>
            <Button onClick={handleSaveEditBrand} disabled={saving || !editBrandName.trim()} className="bg-blue-600 hover:bg-blue-700">
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
              <Label className="text-sm font-semibold text-slate-700">Location Name</Label>
              <Input value={editLocationName} onChange={e => setEditLocationName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-sm font-semibold text-slate-700">Address</Label>
              <Input value={editLocationAddress} onChange={e => setEditLocationAddress(e.target.value)} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditLocation(null)}>Cancel</Button>
            <Button onClick={handleSaveEditLocation} disabled={saving || !editLocationName.trim()} className="bg-blue-600 hover:bg-blue-700">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
