import React, { useState } from 'react';
import { useAuthQuery, useAuthQueries } from '@/hooks/useAuthQuery';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Building2, Search, Users, MapPin, Store, ChevronRight, CheckCircle2, Shield, Settings2, Loader2, CreditCard, Trash2, Upload, FileSpreadsheet, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ALL_MODULE_KEYS, MODULE_DEFINITIONS } from '@/lib/moduleConfig';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from "sonner";
import Papa from 'papaparse';
import posthog from '@/lib/posthog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function PlatformOrganizations() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  
  const [isUpdatingBilling, setIsUpdatingBilling] = useState(false);
  const [billingForm, setBillingForm] = useState({
    plan_id: 'none',
    subscription_status: 'unprovisioned',
    stripe_customer_id: '',
    stripe_subscription_id: '',
    enabled_modules: []
  });

  const [isDeletingOrg, setIsDeletingOrg] = useState(false);
  const [isHierarchyModalOpen, setIsHierarchyModalOpen] = useState(false);
  const [hierarchyTab, setHierarchyTab] = useState('manual');
  const [csvFile, setCsvFile] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [isModifyingHierarchy, setIsModifyingHierarchy] = useState(false);
  const [manualEntry, setManualEntry] = useState({
    type: 'brand', // 'brand' or 'location'
    brandName: '',
    locationName: '',
    locationAddress: '',
    selectedBrandId: ''
  });
  
  const results = useAuthQueries({
    queries: [
      {
        queryKey: ['platform_organizations_full'],
        queryFn: async () => {
          const { data, error } = await supabase.from('organizations').select('id, name, slug, subscription_status, plan_id, admin_email, created_at').order('name');
          if (error) throw error;
          return data;
        }
      },
      {
        queryKey: ['platform_brands_all'],
        queryFn: async () => {
          const { data, error } = await supabase.from('brands').select('brand_id, name, organization_id, created_at');
          if (error) throw error;
          return data;
        }
      },
      {
        queryKey: ['platform_locations_all'],
        queryFn: async () => {
          const { data, error } = await supabase.from('locations').select('id, name, brand_id, organization_id, address, created_at');
          if (error) throw error;
          return data;
        }
      },
      {
        queryKey: ['platform_users_all'],
        queryFn: async () => {
          const { data, error } = await supabase.from('users').select('id, full_name, email, role, organization_id, brand_id, location_id, created_at, status');
          if (error) throw error;
          return data;
        }
      },
      {
        queryKey: ['platform_plans'],
        queryFn: async () => {
          const { data, error } = await supabase.from('plans').select('id, name, price_monthly, max_users, max_locations').order('price_monthly');
          if (error) throw error;
          return data;
        }
      }
    ]
  });

  const isLoadingOrgs = results[0].isLoading;
  const orgs = results[0].data || [];
  const brands = results[1].data || [];
  const locations = results[2].data || [];
  const users = results[3].data || [];
  const plans = results[4].data || [];

  React.useEffect(() => {
    const channel = supabase.channel('platform-orgs-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organizations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['platform_organizations_full'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brands' }, () => {
        queryClient.invalidateQueries({ queryKey: ['platform_brands_all'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['platform_locations_all'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
        queryClient.invalidateQueries({ queryKey: ['platform_users_all'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plans' }, () => {
        queryClient.invalidateQueries({ queryKey: ['platform_plans'] });
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  React.useEffect(() => {
    const org = orgs.find(o => o.id === selectedOrgId);
    if (org) {
      setBillingForm({
        plan_id: org.plan_id || 'none',
        subscription_status: org.subscription_status || 'unprovisioned',
        stripe_customer_id: org.stripe_customer_id || '',
        stripe_subscription_id: org.stripe_subscription_id || '',
        enabled_modules: org.enabled_modules || []
      });
    }
  }, [selectedOrgId, orgs]);

  const handleUpdateBilling = async () => {
    if (!selectedOrgId) return;
    setIsUpdatingBilling(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          plan_id: billingForm.plan_id === 'none' ? null : billingForm.plan_id,
          subscription_status: billingForm.subscription_status,
          stripe_customer_id: billingForm.stripe_customer_id,
          stripe_subscription_id: billingForm.stripe_subscription_id,
          enabled_modules: billingForm.enabled_modules
        })
        .eq('id', selectedOrgId);
        
      if (error) throw error;
      posthog.capture('workspace_updated');
      toast.success("Billing & configuration updated");

      // Notify Org Owner
      const orgOwner = users.find(u => u.organization_id === selectedOrgId && u.role === 'org_owner');
      if (orgOwner) {
        await supabase.from('notifications').insert({
          organization_id: selectedOrgId,
          user_id: orgOwner.id,
          type: 'system',
          title: 'Organization Plan Updated',
          message: `Your organization's plan and modules have been updated by a Platform Administrator.`,
          is_read: false
        });
      }
      // Invalidate this page's query
      queryClient.invalidateQueries({ queryKey: ['platform_organizations_full'] });
      // Invalidate Platform Users query
      queryClient.invalidateQueries({ queryKey: ['platform-orgs-lookup'] });
      // Invalidate Platform Plans query
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to update billing");
    } finally {
      setIsUpdatingBilling(false);
    }
  };

  const handleDeleteOrganization = async () => {
    if (!selectedOrgId) return;
    setIsDeletingOrg(true);
    try {
      const { error } = await supabase.from('organizations').delete().eq('id', selectedOrgId);
      if (error) throw error;
      
      posthog.capture('workspace_deleted');
      toast.success("Organization successfully deleted");
      setSelectedOrgId(null);
      queryClient.invalidateQueries({ queryKey: ['platform_organizations_full'] });
      queryClient.invalidateQueries({ queryKey: ['platform_brands_all'] });
      queryClient.invalidateQueries({ queryKey: ['platform_locations_all'] });
      queryClient.invalidateQueries({ queryKey: ['platform_users_all'] });
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to delete organization");
    } finally {
      setIsDeletingOrg(false);
    }
  };

  const downloadTemplate = () => {
    if (!selectedOrg) return;
    const orgBrands = brands.filter(b => b.organization_id === selectedOrg.id);
    const orgLocations = locations.filter(l => orgBrands.some(b => b.brand_id === l.brand_id));
    
    let csvData = [];
    if (orgBrands.length === 0) {
      csvData.push([selectedOrg.name, "Example Brand", "Example Location", "123 Main St"]);
    } else {
      orgBrands.forEach(brand => {
        const brandLocs = orgLocations.filter(l => l.brand_id === brand.brand_id);
        if (brandLocs.length === 0) {
          csvData.push([selectedOrg.name, brand.name, "", ""]);
        } else {
          brandLocs.forEach(loc => {
            csvData.push([selectedOrg.name, brand.name, loc.name, loc.address || ""]);
          });
        }
      });
    }

    const csvContent = "data:text/csv;charset=utf-8,Organization Name,Brand Name,Location Name,Location Address\n" 
      + csvData.map(e => e.map(s => `"${s.replace(/"/g, '""')}"`).join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${selectedOrg.slug}_hierarchy_template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCsvUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setCsvFile(file);
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.data && results.data.length > 0) {
            setCsvData(results.data);
            toast.success(`Found ${results.data.length} records in CSV`);
          } else {
            toast.error('The CSV file appears to be empty or formatting is invalid.');
            setCsvFile(null);
          }
        },
        error: (err) => {
          console.error(err);
          toast.error('Failed to parse CSV file.');
          setCsvFile(null);
        }
      });
    }
  };

  const handleCsvSubmit = async () => {
    if (!csvData || csvData.length === 0 || !selectedOrgId) return;
    setIsModifyingHierarchy(true);
    
    try {
      const orgBrands = brands.filter(b => b.organization_id === selectedOrgId);
      const orgLocations = locations.filter(l => orgBrands.some(b => b.brand_id === l.brand_id));
      
      let newBrandsCount = 0;
      let newLocsCount = 0;

      // Group rows by Brand Name
      const brandsMap = {};
      csvData.forEach(row => {
        const bName = (row['Brand Name'] || '').trim();
        const lName = (row['Location Name'] || '').trim();
        const lAddr = (row['Location Address'] || '').trim();
        
        if (bName) {
          if (!brandsMap[bName]) brandsMap[bName] = [];
          if (lName) {
            brandsMap[bName].push({ name: lName, address: lAddr });
          }
        }
      });

      for (const [bName, locs] of Object.entries(brandsMap)) {
        let brandId;
        const existingBrand = orgBrands.find(b => b.name.toLowerCase() === bName.toLowerCase());
        
        if (existingBrand) {
          brandId = existingBrand.brand_id;
        } else {
          const { data: newBrand, error: brandErr } = await supabase
            .from('brands')
            .insert({ organization_id: selectedOrgId, name: bName })
            .select().single();
          if (brandErr) throw brandErr;
          brandId = newBrand.brand_id;
          newBrandsCount++;
        }

        const brandLocations = existingBrand ? orgLocations.filter(l => l.brand_id === brandId) : [];
        const locsToInsert = [];

        for (const loc of locs) {
          const exists = brandLocations.some(l => l.name.toLowerCase() === loc.name.toLowerCase());
          if (!exists) {
            locsToInsert.push({
              organization_id: selectedOrgId,
              brand_id: brandId,
              name: loc.name,
              address: loc.address || 'Address pending'
            });
          }
        }

        if (locsToInsert.length > 0) {
          const { error: locErr } = await supabase.from('locations').insert(locsToInsert);
          if (locErr) throw locErr;
          newLocsCount += locsToInsert.length;
        }
      }

      toast.success(`Successfully imported ${newBrandsCount} new brands and ${newLocsCount} new locations.`);
      setIsHierarchyModalOpen(false);
      setCsvFile(null);
      setCsvData([]);
      queryClient.invalidateQueries({ queryKey: ['platform_brands_all'] });
      queryClient.invalidateQueries({ queryKey: ['platform_locations_all'] });
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to import hierarchy');
    } finally {
      setIsModifyingHierarchy(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!selectedOrgId) return;
    setIsModifyingHierarchy(true);
    try {
      if (manualEntry.type === 'brand') {
        if (!manualEntry.brandName) throw new Error("Brand name is required");
        const { data: newBrand, error } = await supabase
          .from('brands')
          .insert({ organization_id: selectedOrgId, name: manualEntry.brandName })
          .select().single();
        if (error) throw error;
        
        if (manualEntry.locationName) {
          const { error: locErr } = await supabase.from('locations').insert({
            organization_id: selectedOrgId,
            brand_id: newBrand.brand_id,
            name: manualEntry.locationName,
            address: manualEntry.locationAddress || ''
          });
          if (locErr) throw locErr;
        }
        toast.success("Brand created successfully");
      } else {
        if (!manualEntry.selectedBrandId || !manualEntry.locationName) throw new Error("Brand and Location name are required");
        const { error } = await supabase.from('locations').insert({
          organization_id: selectedOrgId,
          brand_id: manualEntry.selectedBrandId,
          name: manualEntry.locationName,
          address: manualEntry.locationAddress || ''
        });
        if (error) throw error;
        toast.success("Location created successfully");
      }

      setManualEntry({ type: 'brand', brandName: '', locationName: '', locationAddress: '', selectedBrandId: '' });
      setIsHierarchyModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['platform_brands_all'] });
      queryClient.invalidateQueries({ queryKey: ['platform_locations_all'] });
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to modify hierarchy");
    } finally {
      setIsModifyingHierarchy(false);
    }
  };

  const filteredOrgs = orgs.filter(org => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    return org.name?.toLowerCase().includes(term) || org.admin_email?.toLowerCase().includes(term);
  });

  const selectedOrg = orgs.find(o => o.id === selectedOrgId) || null;
  const orgBrands = brands.filter(b => b.organization_id === selectedOrgId);
  const orgLocations = locations.filter(l => orgBrands.some(b => b.brand_id === l.brand_id));
  const orgUsers = users.filter(u => u.organization_id === selectedOrgId);
  
  const topLevelUsers = orgUsers.filter(u => !u.brand_id && !u.location_id);

  return (
    <div className="flex h-[calc(100vh-8rem)] w-full overflow-hidden bg-secondary/20 rounded-xl border border-border">
      
      {/* Left Sidebar: Master List */}
      <div className="w-80 flex-shrink-0 border-r border-border bg-card flex flex-col h-full z-10 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)]">
        <div className="p-4 border-b border-border/50 space-y-4">
          <div className="flex items-center gap-2 text-foreground">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <h2 className="font-black tracking-tight text-lg">Organizations</h2>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search organizations..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs bg-secondary/50 border-border focus-visible:ring-primary rounded-lg"
            />
          </div>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {isLoadingOrgs ? (
              Array(5).fill(0).map((_, i) => (
                <div key={i} className="h-16 bg-secondary animate-pulse rounded-lg m-2"></div>
              ))
            ) : filteredOrgs.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground italic">No organizations found.</div>
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
                      ? "bg-primary/10 border-primary/20 shadow-sm" 
                      : "hover:bg-secondary/50 hover:border-border"
                  )}
                >
                  <div className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    isActive ? "bg-emerald-500" : "bg-slate-300"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm font-bold truncate transition-colors",
                      isSelected ? "text-primary" : "text-foreground"
                    )}>{org.name}</p>
                    <p className="text-[10px] text-muted-foreground font-medium mt-0.5 truncate flex items-center gap-2">
                      <span>{bCount} Brands</span>
                      <span className="w-1 h-1 bg-slate-300 rounded-full" />
                      <span>{uCount} Users</span>
                    </p>
                  </div>
                  <ChevronRight className={cn(
                    "w-4 h-4 shrink-0 transition-all",
                    isSelected ? "text-primary translate-x-1" : "text-muted-foreground/50 opacity-0 group-hover:opacity-100"
                  )} />
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Right Content: Detail View */}
      <div className="flex-1 bg-secondary/10 flex flex-col h-full overflow-hidden relative">
        {selectedOrg ? (
          <ScrollArea className="flex-1">
            <div className="p-8 w-full max-w-[2400px] mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-300">
              
              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-3xl font-black text-foreground tracking-tight">{selectedOrg.name}</h1>
                    <Badge variant="outline" className={cn(
                      "font-bold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded-full border",
                      selectedOrg.status === 'archived' ? 'bg-secondary text-muted-foreground border-border' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    )}>
                      {selectedOrg.status || 'Active'}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground font-medium mt-3">
                    <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-muted-foreground" /> Admin: {selectedOrg.admin_email}</div>
                    <div className="flex items-center gap-2"><Settings2 className="w-4 h-4 text-muted-foreground" /> Plan ID: {selectedOrg.plan_id || 'Free'}</div>
                  </div>
                </div>
                <div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors font-bold shadow-sm">
                        <Trash2 className="w-4 h-4 mr-2" /> Delete Organization
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete the <strong>{selectedOrg.name}</strong> organization, along with all of its brands, locations, settings, and remove user access to it.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteOrganization} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          {isDeletingOrg ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete Organization"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="border-0 shadow-sm bg-card/50 backdrop-blur-sm">
                  <CardContent className="p-6 flex items-center gap-4">
                    <div className="w-12 h-12 bg-violet-50 rounded-2xl flex items-center justify-center shrink-0 border border-violet-100">
                      <Store className="w-5 h-5 text-violet-600" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Brands</p>
                      <p className="text-2xl font-black text-foreground">{orgBrands.length}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-sm bg-card/50 backdrop-blur-sm">
                  <CardContent className="p-6 flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center shrink-0 border border-amber-100">
                      <MapPin className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Locations</p>
                      <p className="text-2xl font-black text-foreground">{orgLocations.length}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-sm bg-card/50 backdrop-blur-sm">
                  <CardContent className="p-6 flex items-center gap-4">
                    <div className="w-12 h-12 bg-sky-50 rounded-2xl flex items-center justify-center shrink-0 border border-sky-100">
                      <Users className="w-5 h-5 text-sky-600" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Users</p>
                      <p className="text-2xl font-black text-foreground">{orgUsers.length}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Main Tabs */}
              <Tabs defaultValue="hierarchy" className="w-full">
                <TabsList className="bg-card border shadow-sm p-1 rounded-xl h-auto mb-6">
                  <TabsTrigger value="hierarchy" className="rounded-lg text-xs font-bold px-6 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">Brand & Location Hierarchy</TabsTrigger>
                  <TabsTrigger value="directory" className="rounded-lg text-xs font-bold px-6 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">User Directory</TabsTrigger>
                  <TabsTrigger value="billing" className="rounded-lg text-xs font-bold px-6 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">Billing & Plan</TabsTrigger>
                  <TabsTrigger value="settings" className="rounded-lg text-xs font-bold px-6 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">Configuration</TabsTrigger>
                </TabsList>

                <TabsContent value="hierarchy" className="space-y-6 mt-0">
                  <div className="flex justify-end mb-2">
                    <Button onClick={() => setIsHierarchyModalOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-sm h-8 px-3 text-xs">
                      <Plus className="w-3.5 h-3.5 mr-1.5" /> Modify Hierarchy
                    </Button>
                  </div>
                  {orgBrands.length === 0 ? (
                    <div className="text-center py-20 bg-card rounded-2xl border border-dashed border-border">
                      <div className="w-16 h-16 bg-secondary/50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Store className="w-8 h-8 text-muted-foreground/50" />
                      </div>
                      <p className="font-bold text-foreground">No Brands Yet</p>
                      <p className="text-xs text-muted-foreground mt-1">This organization hasn't created any brands or locations.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      {orgBrands.map(brand => {
                        const bLocs = orgLocations.filter(l => l.brand_id === brand.brand_id);
                        const bUsers = orgUsers.filter(u => u.brand_id === brand.brand_id);
                        return (
                          <Card key={brand.brand_id} className="border-border shadow-sm overflow-hidden flex flex-col bg-card">
                            <div className="p-5 border-b border-border/50 bg-secondary/20 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-card shadow-sm border border-border rounded-xl flex items-center justify-center">
                                  <Store className="w-5 h-5 text-foreground/80" />
                                </div>
                                <div>
                                  <h3 className="font-black text-foreground">{brand.name}</h3>
                                  <p className="text-[10px] text-muted-foreground font-medium">{bLocs.length} Locations &middot; {bUsers.length} Users</p>
                                </div>
                              </div>
                            </div>
                            <div className="flex-1 p-0">
                              {bLocs.length === 0 ? (
                                <p className="text-xs text-center py-6 text-muted-foreground italic">No locations under this brand</p>
                              ) : (
                                <div className="divide-y divide-slate-100">
                                  {bLocs.map(loc => {
                                    const lUsers = orgUsers.filter(u => u.location_id === loc.id);
                                    return (
                                      <div key={loc.id} className="p-4 px-5 flex items-center justify-between hover:bg-secondary/50 transition-colors group">
                                        <div className="flex items-center gap-3">
                                          <MapPin className="w-4 h-4 text-muted-foreground/50 group-hover:text-amber-500 transition-colors" />
                                          <div>
                                            <p className="text-sm font-bold text-foreground/80">{loc.name}</p>
                                            <p className="text-[10px] text-muted-foreground">{loc.address || 'No address'}</p>
                                          </div>
                                        </div>
                                        <Badge variant="secondary" className="bg-secondary text-muted-foreground font-bold border-none text-[10px]">
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
                  <Card className="border-0 shadow-sm overflow-hidden bg-card">
                    <Table>
                      <TableHeader className="bg-secondary/50">
                        <TableRow className="border-b border-border/50">
                          <TableHead className="font-bold text-xs text-muted-foreground h-10">User</TableHead>
                          <TableHead className="font-bold text-xs text-muted-foreground h-10">Role</TableHead>
                          <TableHead className="font-bold text-xs text-muted-foreground h-10">Assignment Level</TableHead>
                          <TableHead className="font-bold text-xs text-muted-foreground h-10">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orgUsers.length === 0 ? (
                           <TableRow>
                             <TableCell colSpan={4} className="h-24 text-center text-xs text-muted-foreground italic">No users found.</TableCell>
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
                            levelContext = orgBrands.find(b => b.brand_id === user.brand_id)?.name || 'Unknown';
                            levelIcon = Store;
                          }

                          const Icon = levelIcon;

                          return (
                            <TableRow key={user.id} className="border-b border-slate-50 hover:bg-secondary/20">
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center font-bold text-muted-foreground text-xs">
                                    {user.full_name?.charAt(0) || user.email.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="text-xs font-bold text-foreground">{user.full_name || 'Pending Invite'}</p>
                                    <p className="text-[10px] text-muted-foreground">{user.email}</p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-[10px] font-bold uppercase text-muted-foreground bg-card">
                                  {user.role.replace('_', ' ')}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
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
                   <Card className="border-0 shadow-sm bg-card">
                     <CardHeader>
                       <CardTitle className="text-base flex items-center gap-2"><Settings2 className="w-4 h-4 text-muted-foreground" /> Platform Configuration</CardTitle>
                     </CardHeader>
                     <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                          <div className="p-4 rounded-xl border border-border/50 bg-secondary/50 xl:col-span-2">
                             <p className="text-sm font-bold text-foreground mb-1">Organization Modules</p>
                             <p className="text-xs text-muted-foreground mb-6">Manage which modules are enabled for this organization.</p>
                             
                             <div className="space-y-6">
                               <div>
                                 <h4 className="text-xs font-bold text-foreground/80 mb-3 uppercase tracking-wider flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Currently Enabled</h4>
                                 {ALL_MODULE_KEYS.filter(m => billingForm.enabled_modules.includes(m)).length === 0 ? (
                                   <div className="p-6 border border-dashed border-border rounded-xl text-center bg-card/50">
                                     <p className="text-xs text-muted-foreground font-medium">No modules are currently enabled.</p>
                                   </div>
                                 ) : (
                                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                     {ALL_MODULE_KEYS.filter(m => billingForm.enabled_modules.includes(m)).map(moduleKey => {
                                       const def = MODULE_DEFINITIONS[moduleKey];
                                       return (
                                         <div key={moduleKey} className="flex items-center justify-between p-3 rounded-xl border border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-500/10">
                                            <div className="flex items-center gap-2.5">
                                               <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                                 <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                               </div>
                                               <span className="text-xs font-bold text-foreground">{def.label}</span>
                                            </div>
                                            <Button 
                                              variant="ghost" 
                                              size="sm" 
                                              className="h-7 px-2.5 text-[10px] font-bold text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors"
                                              onClick={() => {
                                                 setBillingForm(prev => ({
                                                    ...prev,
                                                    enabled_modules: prev.enabled_modules.filter(m => m !== moduleKey)
                                                 }));
                                              }}
                                            >
                                              Remove
                                            </Button>
                                         </div>
                                       )
                                     })}
                                   </div>
                                 )}
                               </div>

                               <div className="pt-2">
                                 <h4 className="text-xs font-bold text-foreground/80 mb-3 uppercase tracking-wider flex items-center gap-2"><div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" /> Available to Add</h4>
                                 {ALL_MODULE_KEYS.filter(m => !billingForm.enabled_modules.includes(m)).length === 0 ? (
                                   <div className="p-6 border border-dashed border-border rounded-xl text-center bg-card/50">
                                     <p className="text-xs text-muted-foreground font-medium">All available modules are enabled.</p>
                                   </div>
                                 ) : (
                                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                     {ALL_MODULE_KEYS.filter(m => !billingForm.enabled_modules.includes(m)).map(moduleKey => {
                                       const def = MODULE_DEFINITIONS[moduleKey];
                                       return (
                                         <div key={moduleKey} className="flex items-center justify-between p-3 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors group">
                                            <div className="flex items-center gap-2.5">
                                               <div className="w-6 h-6 rounded-full border border-border bg-secondary/50 flex items-center justify-center group-hover:bg-primary/5 group-hover:border-primary/20 transition-colors">
                                                 <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 group-hover:bg-primary/40 transition-colors" />
                                               </div>
                                               <span className="text-xs font-bold text-muted-foreground group-hover:text-foreground transition-colors">{def.label}</span>
                                            </div>
                                            <Button 
                                              variant="outline" 
                                              size="sm" 
                                              className="h-7 px-3 text-[10px] font-bold bg-secondary/50 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all"
                                              onClick={() => {
                                                 setBillingForm(prev => ({
                                                    ...prev,
                                                    enabled_modules: [...prev.enabled_modules, moduleKey]
                                                 }));
                                              }}
                                            >
                                              Add
                                            </Button>
                                         </div>
                                       )
                                     })}
                                   </div>
                                 )}
                               </div>
                             </div>
                          </div>
                          <div className="p-4 rounded-xl border border-border/50 bg-secondary/50 h-fit xl:col-span-1">
                             <p className="text-xs font-bold text-muted-foreground mb-1">Account Timestamps</p>
                             <p className="text-xs text-foreground/80 mt-2 flex justify-between items-center">
                               <span>Created:</span> 
                               <span className="font-mono bg-card px-2 py-1 rounded-md border border-border/50">{new Date(selectedOrg.created_at).toLocaleDateString()}</span>
                             </p>
                          </div>
                        </div>
                        <div className="pt-4 border-t border-border flex justify-end">
                          <Button 
                            onClick={handleUpdateBilling} 
                            disabled={isUpdatingBilling}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
                          >
                            {isUpdatingBilling && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Save Configuration
                          </Button>
                        </div>
                     </CardContent>
                   </Card>
                 </TabsContent>
                
                <TabsContent value="billing" className="mt-0">
                   <Card className="border-0 shadow-sm bg-card">
                     <CardHeader>
                       <CardTitle className="text-base flex items-center gap-2"><CreditCard className="w-4 h-4 text-muted-foreground" /> Billing & Plan Management</CardTitle>
                     </CardHeader>
                     <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div className="space-y-4">
                             <div>
                               <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">Subscription Plan</Label>
                               <Select value={billingForm.plan_id} onValueChange={(val) => {
                                 const selectedPlan = plans.find(p => p.id === val);
                                 setBillingForm(prev => ({ 
                                   ...prev, 
                                   plan_id: val,
                                   enabled_modules: selectedPlan && selectedPlan.features ? selectedPlan.features : prev.enabled_modules
                                 }));
                               }}>
                                 <SelectTrigger className="w-full bg-secondary/50 border-border">
                                   <SelectValue placeholder="Select a plan" />
                                 </SelectTrigger>
                                 <SelectContent>
                                   <SelectItem value="none">No Plan (Manual)</SelectItem>
                                   {plans.map(p => (
                                     <SelectItem key={p.id} value={p.id}>{p.name} (${p.price_monthly}/mo)</SelectItem>
                                   ))}
                                 </SelectContent>
                               </Select>
                             </div>
                             <div>
                               <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">Subscription Status</Label>
                               <Select value={billingForm.subscription_status} onValueChange={(val) => setBillingForm(prev => ({ ...prev, subscription_status: val }))}>
                                 <SelectTrigger className="w-full bg-secondary/50 border-border">
                                   <SelectValue placeholder="Select status" />
                                 </SelectTrigger>
                                 <SelectContent>
                                   <SelectItem value="unprovisioned">Unprovisioned</SelectItem>
                                   <SelectItem value="trialing">Trialing</SelectItem>
                                   <SelectItem value="active">Active</SelectItem>
                                   <SelectItem value="past_due">Past Due</SelectItem>
                                   <SelectItem value="canceled">Canceled</SelectItem>
                                 </SelectContent>
                               </Select>
                             </div>
                           </div>
                           <div className="space-y-4">
                             <div>
                               <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">Stripe Customer ID</Label>
                               <Input 
                                 value={billingForm.stripe_customer_id}
                                 onChange={(e) => setBillingForm(prev => ({ ...prev, stripe_customer_id: e.target.value }))}
                                 placeholder="cus_..."
                                 className="bg-secondary/50 border-border font-mono text-xs"
                               />
                             </div>
                             <div>
                               <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">Stripe Subscription ID</Label>
                               <Input 
                                 value={billingForm.stripe_subscription_id}
                                 onChange={(e) => setBillingForm(prev => ({ ...prev, stripe_subscription_id: e.target.value }))}
                                 placeholder="sub_..."
                                 className="bg-secondary/50 border-border font-mono text-xs"
                               />
                             </div>
                           </div>
                           <div className="md:col-span-2 pt-4 border-t border-border mt-4">
                             <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-4">Enabled Modules (Overrides Plan Default)</Label>
                             <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                               {ALL_MODULE_KEYS.map(key => {
                                 const mod = MODULE_DEFINITIONS[key];
                                 if (!mod) return null;
                                 const isChecked = billingForm.enabled_modules?.includes(key);
                                 return (
                                   <div key={key} className="flex items-start space-x-3 bg-secondary/20 p-3 rounded-lg border border-border/50">
                                     <Checkbox 
                                       id={`module-${key}`} 
                                       checked={isChecked}
                                       onCheckedChange={(checked) => {
                                         setBillingForm(prev => {
                                           const current = [...(prev.enabled_modules || [])];
                                           if (checked) {
                                             if (!current.includes(key)) current.push(key);
                                           } else {
                                             const idx = current.indexOf(key);
                                             if (idx > -1) current.splice(idx, 1);
                                           }
                                           return { ...prev, enabled_modules: current };
                                         });
                                       }}
                                     />
                                     <div className="grid gap-1.5 leading-none">
                                       <label
                                         htmlFor={`module-${key}`}
                                         className="text-sm font-bold leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer text-foreground"
                                       >
                                         {mod.label}
                                       </label>
                                     </div>
                                   </div>
                                 )
                               })}
                             </div>
                           </div>
                        </div>
                        <div className="pt-4 border-t border-border flex justify-end">
                          <Button 
                            onClick={handleUpdateBilling} 
                            disabled={isUpdatingBilling}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
                          >
                            {isUpdatingBilling && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Save Billing Settings
                          </Button>
                        </div>
                     </CardContent>
                   </Card>
                </TabsContent>
              </Tabs>
            </div>
          </ScrollArea>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-secondary/20">
            <div className="w-24 h-24 bg-card shadow-sm rounded-[2rem] flex items-center justify-center mb-6 border border-border/50 rotate-12 transition-transform duration-500 hover:rotate-0">
              <Building2 className="w-10 h-10 text-muted-foreground/50" />
            </div>
            <h2 className="text-xl font-black text-foreground tracking-tight">Select an Organization</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm">
              Click an organization from the sidebar to view its complete brand, location, and user hierarchy.
            </p>
          </div>
        )}
      </div>

      <Dialog open={isHierarchyModalOpen} onOpenChange={setIsHierarchyModalOpen}>
        <DialogContent className="max-w-2xl bg-card border-border shadow-2xl">
          <DialogHeader>
            <DialogTitle>Modify Organization Hierarchy</DialogTitle>
            <DialogDescription>
              Add new brands or locations to this organization using manual entry or bulk CSV import.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={hierarchyTab} onValueChange={setHierarchyTab} className="w-full mt-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manual">Manual Entry</TabsTrigger>
              <TabsTrigger value="csv">Bulk Import (CSV)</TabsTrigger>
            </TabsList>
            
            <TabsContent value="manual" className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <Button 
                  variant={manualEntry.type === 'brand' ? 'default' : 'outline'}
                  onClick={() => setManualEntry(prev => ({ ...prev, type: 'brand' }))}
                  className="w-full"
                >
                  Add New Brand
                </Button>
                <Button 
                  variant={manualEntry.type === 'location' ? 'default' : 'outline'}
                  onClick={() => setManualEntry(prev => ({ ...prev, type: 'location' }))}
                  className="w-full"
                >
                  Add New Location
                </Button>
              </div>

              {manualEntry.type === 'brand' ? (
                <div className="space-y-4">
                  <div>
                    <Label>Brand Name</Label>
                    <Input 
                      value={manualEntry.brandName}
                      onChange={e => setManualEntry(prev => ({ ...prev, brandName: e.target.value }))}
                      placeholder="e.g. Acme Burgers"
                    />
                  </div>
                  <div className="pt-2 border-t border-border">
                    <Label className="text-muted-foreground mb-2 block">Initial Location (Optional)</Label>
                    <Input 
                      value={manualEntry.locationName}
                      onChange={e => setManualEntry(prev => ({ ...prev, locationName: e.target.value }))}
                      placeholder="Location Name (e.g. Downtown)"
                      className="mb-2"
                    />
                    <Input 
                      value={manualEntry.locationAddress}
                      onChange={e => setManualEntry(prev => ({ ...prev, locationAddress: e.target.value }))}
                      placeholder="Location Address"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label>Select Brand</Label>
                    <Select value={manualEntry.selectedBrandId} onValueChange={val => setManualEntry(prev => ({ ...prev, selectedBrandId: val }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a brand" />
                      </SelectTrigger>
                      <SelectContent>
                        {orgBrands.map(b => (
                          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Location Name</Label>
                    <Input 
                      value={manualEntry.locationName}
                      onChange={e => setManualEntry(prev => ({ ...prev, locationName: e.target.value }))}
                      placeholder="e.g. Airport Branch"
                    />
                  </div>
                  <div>
                    <Label>Location Address</Label>
                    <Input 
                      value={manualEntry.locationAddress}
                      onChange={e => setManualEntry(prev => ({ ...prev, locationAddress: e.target.value }))}
                      placeholder="Full Address"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-4">
                <Button onClick={handleManualSubmit} disabled={isModifyingHierarchy}>
                  {isModifyingHierarchy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "Save Changes"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="csv" className="space-y-4 pt-4">
              <div className="p-4 bg-indigo-50 text-indigo-400 text-sm rounded-lg border border-indigo-100 dark:bg-indigo-500/10 dark:border-indigo-500/20">
                <p className="font-semibold mb-1">How this works:</p>
                <p className="text-xs mb-3 text-indigo-500/80 dark:text-indigo-300">Download the current hierarchy template, append new rows for the brands and locations you want to add, and upload it back. Existing exact matches will be skipped to prevent duplicates.</p>
                <Button variant="outline" size="sm" onClick={downloadTemplate} className="w-full border-indigo-200 hover:bg-indigo-100 text-indigo-600 dark:border-indigo-500/30 dark:hover:bg-indigo-500/20 dark:text-indigo-400">
                  <FileSpreadsheet className="w-4 h-4 mr-2" /> Download Current Hierarchy Template
                </Button>
              </div>

              <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-8 hover:border-primary hover:bg-secondary/50 transition-colors">
                <input 
                  type="file" 
                  id="csv-upload-hierarchy" 
                  accept=".csv" 
                  className="hidden" 
                  onChange={handleCsvUpload} 
                />
                <label htmlFor="csv-upload-hierarchy" className="cursor-pointer flex flex-col items-center gap-4">
                  <div className="w-12 h-12 bg-card shadow-sm rounded-full flex items-center justify-center text-primary">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div className="text-center">
                    <span className="text-primary font-semibold hover:underline">Click to browse</span> or drag and drop
                    <p className="text-xs text-muted-foreground mt-1">.CSV files only</p>
                  </div>
                </label>
              </div>

              {csvFile && (
                <div className="p-3 bg-card border rounded-lg flex items-center justify-between shadow-sm">
                  <span className="text-sm font-medium text-foreground truncate">{csvFile.name}</span>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full dark:bg-emerald-500/10 dark:text-emerald-400">{csvData.length} Rows Parsed</span>
                </div>
              )}

              <div className="flex justify-end pt-4 border-t border-border mt-4">
                <Button onClick={handleCsvSubmit} disabled={isModifyingHierarchy || !csvFile || csvData.length === 0} className="w-full sm:w-auto">
                  {isModifyingHierarchy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "Import Hierarchy"}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
