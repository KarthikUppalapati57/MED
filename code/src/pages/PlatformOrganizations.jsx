import React, { useState } from 'react';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Building2, Search, Users, MapPin, Store, ChevronRight, CheckCircle2, Shield, Settings2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PlatformOrganizations() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  
  const { data: orgs = [], isLoading: isLoadingOrgs } = useAuthQuery({
    queryKey: ['platform_organizations_full'],
    queryFn: async () => {
      const { data, error } = await supabase.from('organizations').select('*').order('name');
      if (error) throw error;
      return data;
    },
    enabled: true
  });

  const { data: brands = [] } = useAuthQuery({
    queryKey: ['platform_brands_all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('brands').select('*');
      if (error) throw error;
      return data;
    },
    enabled: !!orgs.length
  });

  const { data: locations = [] } = useAuthQuery({
    queryKey: ['platform_locations_all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('locations').select('*');
      if (error) throw error;
      return data;
    },
    enabled: !!brands.length
  });

  const { data: users = [] } = useAuthQuery({
    queryKey: ['platform_users_all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('users').select('id, full_name, email, role, organization_id, brand_id, location_id, created_at, status');
      if (error) throw error;
      return data;
    },
    enabled: !!orgs.length
  });

  const filteredOrgs = orgs.filter(org => 
    org.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    org.admin_email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedOrg = orgs.find(o => o.id === selectedOrgId) || null;
  const orgBrands = brands.filter(b => b.organization_id === selectedOrgId);
  const orgLocations = locations.filter(l => orgBrands.some(b => b.id === l.brand_id));
  const orgUsers = users.filter(u => u.organization_id === selectedOrgId);
  
  const topLevelUsers = orgUsers.filter(u => !u.brand_id && !u.location_id);

  return (
    <div className="flex h-[calc(100vh-8rem)] w-full overflow-hidden bg-slate-50/50 rounded-xl border border-slate-200">
      
      {/* Left Sidebar: Master List */}
      <div className="w-80 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col h-full z-10 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)]">
        <div className="p-4 border-b border-slate-100 space-y-4">
          <div className="flex items-center gap-2 text-slate-800">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-indigo-600" />
            </div>
            <h2 className="font-black tracking-tight text-lg">Organizations</h2>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Search organizations..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs bg-slate-50 border-slate-200 focus-visible:ring-indigo-500 rounded-lg"
            />
          </div>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {isLoadingOrgs ? (
              Array(5).fill(0).map((_, i) => (
                <div key={i} className="h-16 bg-slate-100 animate-pulse rounded-lg m-2"></div>
              ))
            ) : filteredOrgs.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500 italic">No organizations found.</div>
            ) : filteredOrgs.map(org => {
              const bCount = brands.filter(b => b.organization_id === org.id).length;
              const uCount = users.filter(u => u.organization_id === org.id).length;
              const isActive = org.status !== 'archived' && org.status !== 'suspended';
              const isSelected = selectedOrgId === org.id;

              return (
                <button 
                  key={org.id}
                  onClick={() => setSelectedOrgId(org.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-xl transition-all flex items-center gap-3 border border-transparent",
                    isSelected 
                      ? "bg-indigo-50 border-indigo-100 shadow-sm" 
                      : "hover:bg-slate-50 hover:border-slate-200"
                  )}
                >
                  <div className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    isActive ? "bg-emerald-500" : "bg-slate-300"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm font-bold truncate transition-colors",
                      isSelected ? "text-indigo-900" : "text-slate-800"
                    )}>{org.name}</p>
                    <p className="text-[10px] text-slate-500 font-medium mt-0.5 truncate flex items-center gap-2">
                      <span>{bCount} Brands</span>
                      <span className="w-1 h-1 bg-slate-300 rounded-full" />
                      <span>{uCount} Users</span>
                    </p>
                  </div>
                  <ChevronRight className={cn(
                    "w-4 h-4 shrink-0 transition-all",
                    isSelected ? "text-indigo-500 translate-x-1" : "text-slate-300 opacity-0 group-hover:opacity-100"
                  )} />
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Right Content: Detail View */}
      <div className="flex-1 bg-slate-50/30 flex flex-col h-full overflow-hidden relative">
        {selectedOrg ? (
          <ScrollArea className="flex-1">
            <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-300">
              
              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">{selectedOrg.name}</h1>
                    <Badge variant="outline" className={cn(
                      "font-bold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded-full border",
                      selectedOrg.status === 'archived' ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    )}>
                      {selectedOrg.status || 'Active'}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500 font-medium">
                    <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-slate-400" /> Admin: {selectedOrg.admin_email}</div>
                    <div className="flex items-center gap-2"><Settings2 className="w-4 h-4 text-slate-400" /> Plan ID: {selectedOrg.plan_id || 'Free'}</div>
                  </div>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="border-0 shadow-sm bg-white/50 backdrop-blur-sm">
                  <CardContent className="p-6 flex items-center gap-4">
                    <div className="w-12 h-12 bg-violet-50 rounded-2xl flex items-center justify-center shrink-0 border border-violet-100">
                      <Store className="w-5 h-5 text-violet-600" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Brands</p>
                      <p className="text-2xl font-black text-slate-900">{orgBrands.length}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-sm bg-white/50 backdrop-blur-sm">
                  <CardContent className="p-6 flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center shrink-0 border border-amber-100">
                      <MapPin className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Locations</p>
                      <p className="text-2xl font-black text-slate-900">{orgLocations.length}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-sm bg-white/50 backdrop-blur-sm">
                  <CardContent className="p-6 flex items-center gap-4">
                    <div className="w-12 h-12 bg-sky-50 rounded-2xl flex items-center justify-center shrink-0 border border-sky-100">
                      <Users className="w-5 h-5 text-sky-600" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Users</p>
                      <p className="text-2xl font-black text-slate-900">{orgUsers.length}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Main Tabs */}
              <Tabs defaultValue="hierarchy" className="w-full">
                <TabsList className="bg-white border shadow-sm p-1 rounded-xl h-auto mb-6">
                  <TabsTrigger value="hierarchy" className="rounded-lg text-xs font-bold px-6 py-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white transition-all">Brand & Location Hierarchy</TabsTrigger>
                  <TabsTrigger value="directory" className="rounded-lg text-xs font-bold px-6 py-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white transition-all">User Directory</TabsTrigger>
                  <TabsTrigger value="settings" className="rounded-lg text-xs font-bold px-6 py-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white transition-all">Configuration</TabsTrigger>
                </TabsList>

                <TabsContent value="hierarchy" className="space-y-6 mt-0">
                  {orgBrands.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Store className="w-8 h-8 text-slate-300" />
                      </div>
                      <p className="font-bold text-slate-800">No Brands Yet</p>
                      <p className="text-xs text-slate-500 mt-1">This organization hasn't created any brands or locations.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      {orgBrands.map(brand => {
                        const bLocs = orgLocations.filter(l => l.brand_id === brand.id);
                        const bUsers = orgUsers.filter(u => u.brand_id === brand.id);
                        return (
                          <Card key={brand.id} className="border-slate-200 shadow-sm overflow-hidden flex flex-col bg-white">
                            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white shadow-sm border border-slate-200 rounded-xl flex items-center justify-center">
                                  <Store className="w-5 h-5 text-slate-700" />
                                </div>
                                <div>
                                  <h3 className="font-black text-slate-900">{brand.name}</h3>
                                  <p className="text-[10px] text-slate-500 font-medium">{bLocs.length} Locations &middot; {bUsers.length} Users</p>
                                </div>
                              </div>
                            </div>
                            <div className="flex-1 p-0">
                              {bLocs.length === 0 ? (
                                <p className="text-xs text-center py-6 text-slate-400 italic">No locations under this brand</p>
                              ) : (
                                <div className="divide-y divide-slate-100">
                                  {bLocs.map(loc => {
                                    const lUsers = orgUsers.filter(u => u.location_id === loc.id);
                                    return (
                                      <div key={loc.id} className="p-4 px-5 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                                        <div className="flex items-center gap-3">
                                          <MapPin className="w-4 h-4 text-slate-300 group-hover:text-amber-500 transition-colors" />
                                          <div>
                                            <p className="text-sm font-bold text-slate-700">{loc.name}</p>
                                            <p className="text-[10px] text-slate-400">{loc.address || 'No address'}</p>
                                          </div>
                                        </div>
                                        <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-bold border-none text-[10px]">
                                          {lUsers.length} Staff
                                        </Badge>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          </Card>
                        )
                      })}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="directory" className="mt-0">
                  <Card className="border-0 shadow-sm overflow-hidden bg-white">
                    <Table>
                      <TableHeader className="bg-slate-50/80">
                        <TableRow className="border-b border-slate-100">
                          <TableHead className="font-bold text-xs text-slate-500 h-10">User</TableHead>
                          <TableHead className="font-bold text-xs text-slate-500 h-10">Role</TableHead>
                          <TableHead className="font-bold text-xs text-slate-500 h-10">Assignment Level</TableHead>
                          <TableHead className="font-bold text-xs text-slate-500 h-10">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orgUsers.length === 0 ? (
                           <TableRow>
                             <TableCell colSpan={4} className="h-24 text-center text-xs text-slate-500 italic">No users found.</TableCell>
                           </TableRow>
                        ) : orgUsers.map(user => {
                          let level = 'Organization';
                          let levelContext = selectedOrg.name;
                          let levelIcon = Building2;
                          
                          if (user.location_id) {
                            level = 'Location';
                            levelContext = orgLocations.find(l => l.id === user.location_id)?.name || 'Unknown';
                            levelIcon = MapPin;
                          } else if (user.brand_id) {
                            level = 'Brand';
                            levelContext = orgBrands.find(b => b.id === user.brand_id)?.name || 'Unknown';
                            levelIcon = Store;
                          }

                          const Icon = levelIcon;

                          return (
                            <TableRow key={user.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-xs">
                                    {user.full_name?.charAt(0) || user.email.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="text-xs font-bold text-slate-800">{user.full_name || 'Pending Invite'}</p>
                                    <p className="text-[10px] text-slate-500">{user.email}</p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-[10px] font-bold uppercase text-slate-600 bg-white">
                                  {user.role.replace('_', ' ')}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                  <Icon className="w-3.5 h-3.5 text-slate-400" />
                                  <span className="font-medium">{levelContext}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge className={cn(
                                  "text-[10px] font-bold uppercase tracking-wider border-none",
                                  user.status === 'active' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                                )}>
                                  {user.status || 'Active'}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </Card>
                </TabsContent>

                <TabsContent value="settings" className="mt-0">
                   <Card className="border-0 shadow-sm bg-white">
                     <CardHeader>
                       <CardTitle className="text-base flex items-center gap-2"><Settings2 className="w-4 h-4 text-slate-400" /> Platform Configuration</CardTitle>
                     </CardHeader>
                     <CardContent className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 rounded-xl border border-slate-100 bg-slate-50">
                             <p className="text-xs font-bold text-slate-500 mb-1">Enabled Modules</p>
                             <div className="flex flex-wrap gap-2 mt-2">
                               {selectedOrg.enabled_modules?.map(m => (
                                 <Badge key={m} variant="secondary" className="bg-white border border-slate-200 text-slate-700 text-[10px] font-bold">{m}</Badge>
                               )) || <span className="text-xs text-slate-400 italic">No modules enabled</span>}
                             </div>
                          </div>
                          <div className="p-4 rounded-xl border border-slate-100 bg-slate-50">
                             <p className="text-xs font-bold text-slate-500 mb-1">Account Timestamps</p>
                             <p className="text-xs text-slate-700 mt-2">Created: {new Date(selectedOrg.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                     </CardContent>
                   </Card>
                </TabsContent>
              </Tabs>
            </div>
          </ScrollArea>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50/50">
            <div className="w-24 h-24 bg-white shadow-sm rounded-[2rem] flex items-center justify-center mb-6 border border-slate-100 rotate-12 transition-transform duration-500 hover:rotate-0">
              <Building2 className="w-10 h-10 text-slate-300" />
            </div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">Select an Organization</h2>
            <p className="text-sm text-slate-500 mt-2 max-w-sm">
              Click an organization from the sidebar to view its complete brand, location, and user hierarchy.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
