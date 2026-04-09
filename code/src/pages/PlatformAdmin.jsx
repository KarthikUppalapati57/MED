import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Shield, Users, Search, Download, CheckCircle2, X, Loader2, Package, Trash2, Mail, ChevronDown, ChevronRight, Building2, Store, MapPin, Plus, Pencil, Copy } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ALL_MODULE_KEYS, MODULE_DEFINITIONS } from "@/lib/moduleConfig";
import { toast } from "sonner";

export default function PlatformAdmin() {
  const { user, role: userRole } = useAuth();
  const queryClient = useQueryClient();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedModules, setSelectedModules] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [processingRequests, setProcessingRequests] = useState(new Set());
  const [selectedRequests, setSelectedRequests] = useState(new Set());
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState("access");
  
  // Platform Admin Invite State
  const [showPlatformInviteModal, setShowPlatformInviteModal] = useState(false);
  const [platformInviteEmail, setPlatformInviteEmail] = useState("");
  const [platformInviting, setPlatformInviting] = useState(false);
  
  const [editingOrgModules, setEditingOrgModules] = useState(null);
  const [expandedOrgs, setExpandedOrgs] = useState(new Set());
  const [expandedBrands, setExpandedBrands] = useState(new Set());
  const [addBrandOrgId, setAddBrandOrgId] = useState(null);
  const [newBrandName, setNewBrandName] = useState('');
  const [addLocationTarget, setAddLocationTarget] = useState(null);
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationAddress, setNewLocationAddress] = useState('');
  const [savingEntity, setSavingEntity] = useState(false);
  const [generatedInviteLink, setGeneratedInviteLink] = useState("");
  const [isInviteLinkDialogOpen, setIsInviteLinkDialogOpen] = useState(false);
  const [isApprovingId, setIsApprovingId] = useState(null);
  const authChecked = !!user;

  // ── Platform Admins Query ──────────────────────────────────
  const { data: platformAdmins = [], isLoading: isLoadingAdmins } = useQuery({
    queryKey: ['platform-admins'],
    queryFn: async () => {
      // Try memberships-based query first (CRE-style)
      try {
        const { data, error } = await supabase
          .from("memberships")
          .select("id, user_id, role, profiles(id, email, full_name)")
          .eq("role", "super_admin");
        if (!error && data) {
          return (data || []).map(m => ({
            membership_id: m.id,
            user_id: m.user_id,
            email: m.profiles?.email || "—",
            full_name: m.profiles?.full_name || "—",
            role: "super_admin"
          }));
        }
      } catch { /* fall through */ }
      
      // Fallback: query profiles table (MEVS-style)
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, role")
        .in("role", ["platform_admin", "admin"]);
      if (error) throw error;
      return (data || []).map(p => ({
        membership_id: p.id,
        user_id: p.id,
        email: p.email || "—",
        full_name: p.full_name || "—",
        role: p.role
      }));
    },
    enabled: authChecked,
  });

  // ── Invite Platform Admin ──────────────────────────────────
  const handleInvitePlatformAdmin = async () => {
    if (!platformInviteEmail) return;
    setPlatformInviting(true);
    try {
      // Try Edge Function first
      const { data: result, error: fnError } = await supabase.functions.invoke('invite-user', {
        body: { email: platformInviteEmail, role: "super_admin", onboarding_type: "invited" }
      });

      if (fnError) {
        // Fallback: Direct invitation insert (MEVS legacy)
        const { data: userCurrent } = await supabase.auth.getUser();
        const { error: insertErr } = await supabase
          .from("invitations")
          .insert([{
            email: platformInviteEmail,
            role: "platform_admin",
            access_level: "platform",
            invited_by: userCurrent?.user?.id,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          }]);
        if (insertErr) throw insertErr;
      }
      
      const { toast } = await import("sonner");
      toast.success("Platform admin invited successfully!");
      setShowPlatformInviteModal(false);
      setPlatformInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ['platform-admins'] });
    } catch(e) {
      console.error('Invite error:', e);
      const { toast } = await import("sonner");
      toast.error(e.message || "Failed to invite platform admin");
    }
    setPlatformInviting(false);
  };

  // ── Invite Client ──────────────────────────────────────────
  const handleInviteClient = async () => {
    if (!inviteEmail) return;
    setInviting(true);
    try {
      // Try Edge Function first
      const { data: result, error: fnError } = await supabase.functions.invoke('invite-client', {
        body: { 
          email: inviteEmail, 
          role: "org_admin", 
          onboarding_type: "owner"
        }
      });
      
      if (fnError) {
        // Fallback: Direct invitation insert
        const { data: userCurrent } = await supabase.auth.getUser();
        const { error: insertErr } = await supabase
          .from("invitations")
          .insert([{
            email: inviteEmail,
            role: "owner",
            invited_by: userCurrent?.user?.id,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          }]);
        if (insertErr) throw insertErr;
      }
      setInviteSuccess(true);
    } catch(e) { 
      console.error('Invite error:', e);
      const { toast } = await import("sonner");
      toast.error(e.message || "Failed to send invitation");
    }
    setInviting(false);
  };

  // ── Access Requests ────────────────────────────────────────
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['access-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('access_requests')
        .select('*')
        .neq('request_type', 'demo')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked && (userRole === 'admin' || userRole === 'platform_admin'),
    refetchOnWindowFocus: false,
  });

  // ── Contact Requests ───────────────────────────────────────
  const { data: contactRequests = [], isLoading: isLoadingContact } = useQuery({
    queryKey: ['contact-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked && (userRole === 'admin' || userRole === 'platform_admin'),
    refetchOnWindowFocus: false,
  });

  // ── Demo Requests ──────────────────────────────────────────
  const { data: demoRequests = [], isLoading: isLoadingDemo } = useQuery({
    queryKey: ['demo-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('demo_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked && (userRole === 'admin' || userRole === 'platform_admin'),
    refetchOnWindowFocus: false,
  });

  // ── Organizations ──────────────────────────────────────────
  const { data: orgs = [] } = useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      // Try memberships join first (CRE-style)
      try {
        const { data, error } = await supabase
          .from('organizations')
          .select(`*, memberships(role, profiles(email))`)
          .order('created_at', { ascending: false });
        
        if (!error && data) {
          return data.map(org => ({
            ...org,
            admin_email: org.memberships?.find(m => m.role === 'org_admin')?.profiles?.email || 
                         org.memberships?.[0]?.profiles?.email || 
                         org.primary_contact_email || '—'
          }));
        }
      } catch { /* fall through */ }

      // Fallback: simple select with owner join
      try {
        const { data, error } = await supabase
          .from('organizations')
          .select('*, owner:owner_id(email)')
          .order('created_at', { ascending: false });
        if (!error && data) {
          return data.map(org => ({ ...org, admin_email: org.owner?.email || '—' }));
        }
      } catch { /* fall through */ }

      // Final fallback: no joins
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(o => ({ ...o, admin_email: '—' }));
    },
    enabled: authChecked && (userRole === 'admin' || userRole === 'platform_admin'),
  });

  // ── Brands & Locations for tree view ───────────────────────
  const { data: allBrands = [] } = useQuery({
    queryKey: ['all-brands'],
    queryFn: async () => {
      const { data, error } = await supabase.from('brands').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked && (userRole === 'admin' || userRole === 'platform_admin'),
  });

  const { data: allLocations = [] } = useQuery({
    queryKey: ['all-locations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('locations').select('*').order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked && (userRole === 'admin' || userRole === 'platform_admin'),
  });

  const getOrgBrands = (orgId) => allBrands.filter(b => b.organization_id === orgId);
  const getBrandLocations = (brandId) => allLocations.filter(l => l.brand_id === brandId);

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

  const handleAddBrandInAdmin = async () => {
    if (!newBrandName.trim() || !addBrandOrgId) return;
    setSavingEntity(true);
    try {
      const { error } = await supabase.from('brands').insert({ name: newBrandName.trim(), organization_id: addBrandOrgId });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['all-brands'] });
      const { toast } = await import('sonner');
      toast.success(`Brand "${newBrandName}" created!`);
      setAddBrandOrgId(null);
      setNewBrandName('');
    } catch (e) {
      const { toast } = await import('sonner');
      toast.error(e.message || 'Failed to create brand');
    }
    setSavingEntity(false);
  };

  const handleAddLocationInAdmin = async () => {
    if (!newLocationName.trim() || !addLocationTarget) return;
    setSavingEntity(true);
    try {
      const { error } = await supabase.from('locations').insert({
        name: newLocationName.trim(),
        address: newLocationAddress.trim(),
        brand_id: addLocationTarget.brandId,
        organization_id: addLocationTarget.orgId,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['all-locations'] });
      const { toast } = await import('sonner');
      toast.success(`Location "${newLocationName}" created!`);
      setAddLocationTarget(null);
      setNewLocationName('');
      setNewLocationAddress('');
    } catch (e) {
      const { toast } = await import('sonner');
      toast.error(e.message || 'Failed to create location');
    }
    setSavingEntity(false);
  };

  const handleApproveDemo = async (req) => {
    setIsApprovingId(req.id);
    try {
      const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // 1. Create invitation
      const { error: inviteError } = await supabase
        .from('invitations')
        .insert([{
          email: req.email,
          token,
          role: 'owner',
          invited_by: user?.id,
          expires_at: expiresAt.toISOString()
        }]);

      if (inviteError) throw inviteError;

      // 2. Update demo request status
      const { error: updateError } = await supabase
        .from('demo_requests')
        .update({ status: 'approved' })
        .eq('id', req.id);

      if (updateError) throw updateError;

      const link = `${window.location.origin}/signup/${token}`;
      setGeneratedInviteLink(link);
      setIsInviteLinkDialogOpen(true);
      queryClient.invalidateQueries({ queryKey: ['demo-requests'] });
      const { toast } = await import('sonner');
      toast.success('Demo request approved and invitation link generated');
    } catch (err) {
      const { toast } = await import('sonner');
      toast.error(err.message || 'Failed to approve demo request');
    } finally {
      setIsApprovingId(null);
    }
  };

  // ── Mutations ──────────────────────────────────────────────
  const updateRequest = useMutation({
    mutationFn: async ({ id, approved }) => {
      // Try Edge Function first
      try {
        const { data: result, error: fnError } = await supabase.functions.invoke('approve-request-v2', {
          body: { id, approved }
        });
        if (!fnError) return result;
      } catch { /* fall through to direct DB update */ }

      // Fallback: direct DB update
      const { error } = await supabase
        .from('access_requests')
        .update({ status: approved ? 'approved' : 'rejected', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(error.message);
      return true;
    },
    onMutate: ({ id }) => {
      setProcessingRequests(prev => new Set(prev).add(id));
    },
    onSettled: (data, error, { id }) => {
      setProcessingRequests(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (error) {
        console.error('Mutation error:', error);
        import('sonner').then(({ toast }) => {
          toast.error(error.message || 'Action failed');
        });
      }
      queryClient.invalidateQueries({ queryKey: ['access-requests'] });
    },
  });

  const revokeRequest = useMutation({
    mutationFn: async ({ id, email }) => {
      const { error: reqError } = await supabase
        .from('access_requests')
        .update({ status: 'pending_approval', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (reqError) throw reqError;

      if (email) {
        await supabase
          .from('profiles')
          .update({ status: 'pending_approval' })
          .eq('email', email);
      }
      return { id };
    },
    onMutate: ({ id }) => {
      setProcessingRequests(prev => new Set(prev).add(id));
    },
    onSettled: (data, error, { id }) => {
      setProcessingRequests(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (error) {
        import('sonner').then(({ toast }) => toast.error(error.message || 'Revoke failed'));
      } else {
        import('sonner').then(({ toast }) => toast.success('Access revoked. User must be re-approved.'));
      }
      queryClient.invalidateQueries({ queryKey: ['access-requests'] });
    },
  });

  const deleteRequest = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('access_requests').delete().eq('id', id);
      if (error) throw new Error('Deletion failed');
      return id;
    },
    onMutate: (id) => {
      setProcessingRequests(prev => new Set(prev).add(id));
    },
    onSettled: (data, error, id) => {
      setProcessingRequests(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (error) {
        import('sonner').then(({ toast }) => toast.error(error.message || 'Failed to delete request'));
      } else {
        import('sonner').then(({ toast }) => toast.success('Request deleted permanently'));
      }
      queryClient.invalidateQueries({ queryKey: ['access-requests'] });
    },
  });

  // ── Bulk / Select Helpers ──────────────────────────────────
  const handleBulkDelete = () => {
    if (selectedRequests.size === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedRequests.size} requests?`)) {
      setProcessingRequests(prev => new Set([...prev, ...selectedRequests]));
      Promise.all(Array.from(selectedRequests).map(id =>
        supabase.from('access_requests').delete().eq('id', id)
      ))
        .then(() => {
          import('sonner').then(({ toast }) => toast.success(`Deleted ${selectedRequests.size} requests`));
          setSelectedRequests(new Set());
          queryClient.invalidateQueries({ queryKey: ['access-requests'] });
        })
        .catch(() => {
          import('sonner').then(({ toast }) => toast.error('Failed to delete some requests'));
        })
        .finally(() => {
          setProcessingRequests(prev => {
            const next = new Set(prev);
            selectedRequests.forEach(id => next.delete(id));
            return next;
          });
        });
    }
  };

  const toggleSelectAllList = (checked, list) => {
    if (checked) {
      const next = new Set(selectedRequests);
      list.forEach(r => next.add(r.id));
      setSelectedRequests(next);
    } else {
      const next = new Set(selectedRequests);
      list.forEach(r => next.delete(r.id));
      setSelectedRequests(next);
    }
  };

  const toggleSelect = (id, checked) => {
    setSelectedRequests(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  // ── Computed ───────────────────────────────────────────────
  const accessReqs   = (requests || []).filter(r => r.request_type !== 'demo');
  const contactReqs  = (contactRequests || []);

  const pendingAccessCount = accessReqs.filter(r => r.status === 'pending_approval').length;
  const pendingContactCount = contactReqs.filter(r => r.status === 'pending_approval').length;
  const pendingOrgCount = (orgs || []).filter(o => ['under_review', 'pending_approval', 'onboarding'].includes(o.status)).length;
  const pendingCount = pendingAccessCount + pendingContactCount + pendingOrgCount;

  // ── Guards ─────────────────────────────────────────────────
  if (!authChecked) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!user || (userRole !== 'admin' && userRole !== 'platform_admin')) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center px-4">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mb-4">
          <Shield className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h2>
        <p className="text-slate-500 max-w-md">The Platform Admin Console is restricted to platform administrators only. If you believe this is an error, contact your system administrator.</p>
      </div>
    );
  }

  // ── Request Table Renderer ─────────────────────────────────
  const renderRequestTable = (list, title, countPending, type) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="text-xs text-slate-400">{type === 'demo' ? `${list.length} total` : `${countPending} pending`}</p>
        </div>
        <div className="flex gap-2">
          {selectedRequests.size > 0 && (
            <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
              <Trash2 className="w-4 h-4 mr-1" />
              Delete Selected ({selectedRequests.size})
            </Button>
          )}
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><Input placeholder="Search..." className="pl-9 w-48 h-8" /></div>
          <Button variant="outline" size="sm"><Download className="w-4 h-4 mr-1" />Export</Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-10">
                <Checkbox 
                  checked={list.length > 0 && list.every(r => selectedRequests.has(r.id))}
                  onCheckedChange={(c) => toggleSelectAllList(c, list)}
                />
              </TableHead>
              <TableHead className="text-[11px]">APPLICANT</TableHead>
              <TableHead className="text-[11px]">COMPANY</TableHead>
              <TableHead className="text-[11px]">PHONE</TableHead>
              <TableHead className="text-[11px]">TYPE</TableHead>
              <TableHead className="text-[11px]">SUBMITTED</TableHead>
              <TableHead className="text-[11px]">STATUS</TableHead>
              <TableHead className="text-[11px]">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : list.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-400">No requests</TableCell></TableRow>
            ) : (
              list.map(r => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Checkbox 
                      checked={selectedRequests.has(r.id)}
                      onCheckedChange={(c) => toggleSelect(r.id, c)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold">{(r.full_name || r.email || '?').substring(0, 2).toUpperCase()}</div>
                      <div><p className="text-sm font-medium">{r.full_name || 'Unknown'}</p><p className="text-xs text-slate-400">{r.email}</p></div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{r.company_name || '—'}</TableCell>
                  <TableCell className="text-sm text-slate-500">{r.phone || '—'}</TableCell>
                  <TableCell>
                    {r.request_type === 'demo'
                      ? <Badge className="bg-violet-100 text-violet-700 text-[10px] border-none font-bold">🎥 DEMO</Badge>
                      : r.request_type === 'contact' 
                        ? <Badge className="bg-indigo-100 text-indigo-700 text-[10px] border-none font-bold">✉️ CONTACT</Badge>
                        : <Badge className="bg-emerald-100 text-emerald-700 text-[10px] border-none font-bold italic">⚡ ACCESS</Badge>
                    }
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">
                    {r.created_at ? new Date(r.created_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
                    }) : '—'}
                  </TableCell>
                  <TableCell>
                    {type !== 'demo' && (
                      <Badge className={r.status === 'pending_approval' ? 'bg-amber-100 text-amber-700' : r.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                        {r.status?.toUpperCase()}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {(r.request_type === 'contact' || r.request_type === 'demo') ? (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline" className="text-xs h-7 text-blue-600 border-blue-200 hover:bg-blue-50">
                              <Mail className="w-3 h-3 mr-1" />Details
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg">
                            <DialogHeader>
                              <DialogTitle className="flex items-center gap-2">
                                {r.request_type === 'demo' ? '🎥' : '✉️'} {r.full_name || r.email}
                              </DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-2">
                              <div className="grid grid-cols-2 gap-4">
                                <div><Label className="text-xs text-slate-500">Email</Label><p className="font-medium text-sm">{r.email}</p></div>
                                <div><Label className="text-xs text-slate-500">Company</Label><p className="font-medium text-sm">{r.company_name || '—'}</p></div>
                                {r.phone && <div><Label className="text-xs text-slate-500">Phone</Label><p className="font-medium text-sm">{r.phone}</p></div>}
                                {r.plan && <div><Label className="text-xs text-slate-500">Plan</Label><p className="font-medium text-sm capitalize">{r.plan}</p></div>}
                              </div>
                              {r.message && (
                                <div>
                                  <Label className="text-xs text-slate-500 mb-1 block">Message</Label>
                                  <p className="bg-slate-50 p-3 rounded-md text-sm border border-slate-100 whitespace-pre-wrap">{r.message}</p>
                                </div>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                      ) : (
                        <>
                          {r.status !== 'approved' && (
                            <Button 
                              size="sm" 
                              className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white border-none"
                              disabled={processingRequests.has(r.id)}
                              onClick={(e) => { e.stopPropagation(); updateRequest.mutate({ id: r.id, approved: true }); }}>
                              {processingRequests.has(r.id) ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                              Approve
                            </Button>
                          )}
                          {r.status !== 'rejected' && r.status !== 'approved' && (
                            <Button 
                              size="sm" variant="outline"
                              className="text-xs h-7 text-red-600 border-red-200 hover:bg-red-50"
                              disabled={processingRequests.has(r.id)}
                              onClick={(e) => { e.stopPropagation(); updateRequest.mutate({ id: r.id, approved: false }); }}>
                              {processingRequests.has(r.id) ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <X className="w-3 h-3 mr-1" />}
                              Reject
                            </Button>
                          )}
                          {r.status === 'approved' && (
                            <Button 
                              size="sm" variant="outline"
                              className="text-xs h-7 text-amber-600 border-amber-200 hover:bg-amber-50"
                              disabled={processingRequests.has(r.id)}
                              onClick={(e) => { e.stopPropagation(); revokeRequest.mutate({ id: r.id, email: r.email }); }}>
                              {processingRequests.has(r.id) ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Shield className="w-3 h-3 mr-1" />}
                              Revoke
                            </Button>
                          )}
                        </>
                      )}
                      <Button 
                        size="sm" variant="ghost"
                        className="text-xs h-7 px-2 text-slate-400 hover:text-red-600 hover:bg-red-50 ml-1"
                        disabled={processingRequests.has(r.id)}
                        onClick={() => {
                          if (window.confirm("Are you sure you want to permanently delete this request?")) {
                            deleteRequest.mutate(r.id);
                          }
                        }}>
                        {processingRequests.has(r.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  // ── Main Render ────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center"><Shield className="w-5 h-5 text-amber-600" /></div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">Platform Admin Console</h1>
              {pendingCount > 0 && <Badge className="bg-amber-100 text-amber-700">{pendingCount} pending approval</Badge>}
            </div>
            <p className="text-sm text-slate-500">Platform-wide management · MEVS Platform · All organizations</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => { setShowInviteModal(true); setInviteEmail(""); setInviteSuccess(false); }}><Users className="w-4 h-4 mr-2" />Invite Client</Button>
          <Button variant="outline">Settings</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-[10px] font-semibold text-slate-500 uppercase">Total Organizations</p><p className="text-2xl font-bold">{(orgs || []).length}</p><p className="text-[10px] text-emerald-500">Registered orgs</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[10px] font-semibold text-slate-500 uppercase">Demo Requests</p><p className="text-2xl font-bold">{(demoRequests || []).length}</p><p className="text-[10px] text-violet-500">{(demoRequests || []).filter(r => r.demo_viewed).length} viewed</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[10px] font-semibold text-slate-500 uppercase">Platform Admins</p><p className="text-2xl font-bold">{(platformAdmins || []).length}</p><p className="text-[10px] text-blue-500">Active administrators</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[10px] font-semibold text-slate-500 uppercase">Pending Approvals</p><p className="text-2xl font-bold">{pendingCount}</p><p className="text-[10px] text-slate-400">{pendingOrgCount > 0 ? `${pendingOrgCount} org${pendingOrgCount > 1 ? 's' : ''} awaiting activation` : 'Access and contact requests'}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="access" onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="access">Access Requests {pendingAccessCount > 0 && <Badge className="ml-1.5 bg-amber-500 text-white text-[10px] px-1.5">{pendingAccessCount}</Badge>}</TabsTrigger>
          <TabsTrigger value="demo">Demo Requests</TabsTrigger>
          <TabsTrigger value="contact">Contact Us {pendingContactCount > 0 && <Badge className="ml-1.5 bg-blue-500 text-white text-[10px] px-1.5">{pendingContactCount}</Badge>}</TabsTrigger>
          <TabsTrigger value="users">User Management</TabsTrigger>
          <TabsTrigger value="orgs">Organizations {pendingOrgCount > 0 && <Badge className="ml-1.5 bg-amber-500 text-white text-[10px] px-1.5">{pendingOrgCount}</Badge>}</TabsTrigger>
        </TabsList>

        <TabsContent value="access" className="mt-4">
          {renderRequestTable(accessReqs, "Access Requests", pendingAccessCount, "access")}
        </TabsContent>

        <TabsContent value="demo" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Demo Requests</CardTitle>
                <p className="text-xs text-slate-400">{demoRequests.length} total · {demoRequests.filter(r => r.demo_viewed).length} viewed</p>
              </div>
              <div className="flex gap-2">
                <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><Input placeholder="Search..." className="pl-9 w-48 h-8" /></div>
                <Button variant="outline" size="sm"><Download className="w-4 h-4 mr-1" />Export</Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="text-[11px]">APPLICANT</TableHead>
                    <TableHead className="text-[11px]">COMPANY</TableHead>
                    <TableHead className="text-[11px]">PHONE</TableHead>
                    <TableHead className="text-[11px]">PLAN</TableHead>
                    <TableHead className="text-[11px]">DEMO VIEWED</TableHead>
                    <TableHead className="text-[11px]">SUBMITTED</TableHead>
                    <TableHead className="text-[11px]">ACTIONS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingDemo ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : demoRequests.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-400">No demo requests yet</TableCell></TableRow>
                  ) : demoRequests.map(r => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-700">{r.full_name?.substring(0, 2).toUpperCase()}</div>
                          <div><p className="text-sm font-medium">{r.full_name}</p><p className="text-xs text-slate-400">{r.email}</p></div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{r.company_name || '—'}</TableCell>
                      <TableCell className="text-sm text-slate-500">{r.phone || '—'}</TableCell>
                      <TableCell className="text-sm">
                        {r.plan ? <Badge variant="outline" className="text-[10px] capitalize bg-violet-50 text-violet-700 border-violet-100">{r.plan}</Badge> : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge className={r.demo_viewed ? 'bg-emerald-100 text-emerald-700 border-none text-[10px]' : 'bg-slate-100 text-slate-500 border-none text-[10px]'}>
                          {r.demo_viewed ? '✓ Watched' : 'Not yet'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {r.created_at ? new Date(r.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                      </TableCell>
                      <TableCell className="flex gap-1 justify-end">
                        {r.status !== 'approved' && (
                          <Button
                            size="sm"
                            className="text-[10px] h-7 bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                            onClick={() => handleApproveDemo(r)}
                            disabled={isApprovingId === r.id}
                          >
                            {isApprovingId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                            Approve
                          </Button>
                        )}
                        <Button
                          size="sm" variant="ghost"
                          className="text-xs h-7 px-2 text-slate-400 hover:text-red-600 hover:bg-red-50"
                          onClick={async () => {
                            if (!window.confirm('Delete this demo request permanently?')) return;
                            const { error } = await supabase.from('demo_requests').delete().eq('id', r.id);
                            if (!error) {
                              queryClient.invalidateQueries({ queryKey: ['demo-requests'] });
                              toast.success('Demo request deleted');
                            }
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contact" className="mt-4">
          {isLoadingContact ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
            </div>
          ) : (
            renderRequestTable(contactReqs, "Contact Messages", pendingContactCount, "contact")
          )}
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base">Platform Administrators</CardTitle>
                <p className="text-xs text-slate-400">Manage users with full administrative access to the platform.</p>
              </div>
              <Button onClick={() => setShowPlatformInviteModal(true)} size="sm" className="bg-blue-600 hover:bg-blue-700 h-8 text-xs">
                <Shield className="w-3 h-3 mr-2" /> Invite Admin
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="text-[11px]">NAME</TableHead>
                    <TableHead className="text-[11px]">EMAIL</TableHead>
                    <TableHead className="text-[11px]">ROLE</TableHead>
                    <TableHead className="text-[11px]">ACTIONS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingAdmins ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" /></TableCell></TableRow>
                  ) : platformAdmins.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-sm text-slate-400">No platform admins found</TableCell></TableRow>
                  ) : platformAdmins.map(admin => (
                    <TableRow key={admin.membership_id}>
                      <TableCell className="font-medium text-sm">{admin.full_name}</TableCell>
                      <TableCell className="text-sm text-slate-500">{admin.email}</TableCell>
                      <TableCell>
                        <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 border-none text-[10px]">Platform Admin</Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50" disabled={admin.user_id === user?.id} onClick={async () => {
                          if (!window.confirm(`Remove ${admin.email} from platform admins?`)) return;
                          try {
                            // Try memberships table first
                            const { error } = await supabase.from("memberships").delete().eq("id", admin.membership_id);
                            if (error) {
                              // Fallback: update profiles
                              await supabase.from("profiles").update({ role: 'ground_staff' }).eq("id", admin.user_id);
                            }
                            queryClient.invalidateQueries({ queryKey: ['platform-admins'] });
                            const { toast } = await import("sonner");
                            toast.success("Admin removed");
                          } catch (e) { console.error(e); }
                        }}>
                          <X className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orgs" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Organizations — Hierarchy View</CardTitle>
                <p className="text-xs text-slate-400">Owner → Organizations → Brands → Locations. Click to expand.</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Badge variant="outline" className="text-[10px]">{(orgs || []).length} orgs</Badge>
                <Badge variant="outline" className="text-[10px]">{(allBrands || []).length} brands</Badge>
                <Badge variant="outline" className="text-[10px]">{(allLocations || []).length} locations</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {(orgs || []).length === 0 ? (
                <div className="text-center py-12 text-sm text-slate-400">No organizations</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {[...(orgs || [])].sort((a, b) => {
                    const pendingStatuses = ['under_review', 'pending_approval', 'onboarding'];
                    const aP = pendingStatuses.includes(a.status);
                    const bP = pendingStatuses.includes(b.status);
                    if (aP && !bP) return -1;
                    if (!aP && bP) return 1;
                    return 0;
                  }).map(org => {
                    const orgBrands = getOrgBrands(org.id);
                    const orgLocCount = allLocations.filter(l => l.organization_id === org.id).length;
                    const isExpanded = expandedOrgs.has(org.id);
                    const isPending = ['pending_approval', 'under_review', 'onboarding'].includes(org.status);

                    return (
                      <div key={org.id}>
                        {/* ORG ROW */}
                        <div className={`flex items-center gap-3 p-3 px-5 cursor-pointer hover:bg-slate-50 transition-colors ${isPending ? 'bg-amber-50/40' : ''}`} onClick={() => toggleOrg(org.id)}>
                          <div className="w-6 h-6 flex items-center justify-center shrink-0">
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-blue-500" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                          </div>
                          <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                            <Building2 className="w-4 h-4 text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900 truncate">{org.name}</p>
                              <Badge className={`text-[9px] uppercase border-none ${org.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{org.status || 'active'}</Badge>
                            </div>
                            <p className="text-[10px] text-slate-400">
                              {org.admin_email} · {orgBrands.length} brand{orgBrands.length !== 1 ? 's' : ''} · {orgLocCount} location{orgLocCount !== 1 ? 's' : ''} · {org.created_at ? new Date(org.created_at).toLocaleDateString() : '—'}
                            </p>
                          </div>
                          {/* Modules badges */}
                          <div className="hidden lg:flex flex-wrap gap-1 max-w-[200px] shrink-0">
                            {org.enabled_modules && org.enabled_modules.length > 0 ? (
                              org.enabled_modules.slice(0, 3).map(m => (
                                <Badge key={m} variant="outline" className="text-[8px] py-0">{MODULE_DEFINITIONS[m]?.label || m}</Badge>
                              ))
                            ) : (
                              <span className="text-[9px] text-slate-300 italic">No modules</span>
                            )}
                            {org.enabled_modules && org.enabled_modules.length > 3 && (
                              <Badge variant="outline" className="text-[8px] py-0">+{org.enabled_modules.length - 3}</Badge>
                            )}
                          </div>
                          {/* Actions */}
                          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                            {isPending && (
                              <Button variant="default" size="sm" className="h-7 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-700"
                                onClick={async () => {
                                  setProcessingRequests(prev => new Set(prev).add(`org_${org.id}`));
                                  try {
                                    const { data, error } = await supabase.functions.invoke('approve-organization', { body: { orgId: org.id } });
                                    if (error || data?.error) {
                                      const { error: updateErr } = await supabase.from('organizations').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', org.id);
                                      if (updateErr) throw updateErr;
                                    }
                                    queryClient.invalidateQueries({ queryKey: ['organizations'] });
                                    const { toast } = await import("sonner");
                                    toast.success("Organization approved!");
                                  } catch (e) {
                                    const { toast } = await import("sonner");
                                    toast.error(e.message || "Failed to approve");
                                  } finally {
                                    setProcessingRequests(prev => { const n = new Set(prev); n.delete(`org_${org.id}`); return n; });
                                  }
                                }}>
                                {processingRequests.has(`org_${org.id}`) ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                                Approve
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2"
                              onClick={() => { setAddBrandOrgId(org.id); setNewBrandName(''); }}>
                              <Plus className="w-3 h-3 mr-1" /> Brand
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2"
                              onClick={() => { setEditingOrgModules(org); setSelectedModules(org.enabled_modules || []); }}>
                              <Package className="w-3 h-3 mr-1" /> Modules
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                              disabled={processingRequests.has(`del_org_${org.id}`)}
                              onClick={async () => {
                                if (!window.confirm(`Delete "${org.name}" and all its data?`)) return;
                                setProcessingRequests(prev => new Set(prev).add(`del_org_${org.id}`));
                                try {
                                  // Delete the organization itself. The database has ON DELETE CASCADE configured
                                  // for all related tables (locations, brands, profiles, etc.)
                                  const { error } = await supabase.from('organizations').delete().eq('id', org.id);
                                  if (error) throw error;
                                  queryClient.invalidateQueries({ queryKey: ['organizations'] });
                                  queryClient.invalidateQueries({ queryKey: ['all-brands'] });
                                  queryClient.invalidateQueries({ queryKey: ['all-locations'] });
                                  const { toast } = await import("sonner");
                                  toast.success(`"${org.name}" deleted`);
                                } catch (err) {
                                  const { toast } = await import("sonner");
                                  toast.error(err.message || "Failed to delete");
                                } finally {
                                  setProcessingRequests(prev => { const n = new Set(prev); n.delete(`del_org_${org.id}`); return n; });
                                }
                              }}>
                              {processingRequests.has(`del_org_${org.id}`) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            </Button>
                          </div>
                        </div>

                        {/* BRANDS under this org */}
                        {isExpanded && (
                          <div className="bg-slate-50/60 border-t border-slate-100">
                            {orgBrands.length === 0 ? (
                              <div className="p-3 pl-16 text-xs text-slate-400 italic">No brands — click "+ Brand" to add one</div>
                            ) : orgBrands.map(brand => {
                              const brandLocs = getBrandLocations(brand.id);
                              const isBrandExp = expandedBrands.has(brand.id);
                              return (
                                <div key={brand.id}>
                                  <div className="flex items-center gap-2 py-2.5 px-5 pl-14 cursor-pointer hover:bg-slate-100/50 transition-colors border-t border-slate-100 first:border-t-0"
                                    onClick={() => toggleBrand(brand.id)}>
                                    <div className="w-5 h-5 flex items-center justify-center shrink-0">
                                      {isBrandExp ? <ChevronDown className="w-3.5 h-3.5 text-violet-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                                    </div>
                                    <div className="w-7 h-7 bg-violet-50 rounded-md flex items-center justify-center shrink-0">
                                      <Store className="w-3.5 h-3.5 text-violet-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium text-slate-800">{brand.name}</p>
                                      <p className="text-[10px] text-slate-400">{brandLocs.length} location{brandLocs.length !== 1 ? 's' : ''}</p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                      <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-violet-600 hover:bg-violet-50"
                                        onClick={() => { setAddLocationTarget({ orgId: org.id, brandId: brand.id }); setNewLocationName(''); setNewLocationAddress(''); }}>
                                        <Plus className="w-3 h-3 mr-1" /> Location
                                      </Button>
                                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                        onClick={async () => {
                                          if (!window.confirm(`Delete brand "${brand.name}" and its locations?`)) return;
                                          await supabase.from('locations').delete().eq('brand_id', brand.id);
                                          await supabase.from('brands').delete().eq('id', brand.id);
                                          queryClient.invalidateQueries({ queryKey: ['all-brands'] });
                                          queryClient.invalidateQueries({ queryKey: ['all-locations'] });
                                          const { toast } = await import("sonner");
                                          toast.success(`Brand "${brand.name}" deleted`);
                                        }}>
                                        <Trash2 className="w-2.5 h-2.5" />
                                      </Button>
                                    </div>
                                  </div>

                                  {/* LOCATIONS under this brand */}
                                  {isBrandExp && (
                                    <div className="bg-white/50">
                                      {brandLocs.length === 0 ? (
                                        <div className="p-2 pl-28 text-[10px] text-slate-400 italic">No locations</div>
                                      ) : brandLocs.map(loc => (
                                        <div key={loc.id} className="flex items-center gap-2 py-2 px-5 pl-24 border-t border-slate-50 hover:bg-emerald-50/30 transition-colors">
                                          <div className="w-6 h-6 bg-emerald-50 rounded flex items-center justify-center shrink-0">
                                            <MapPin className="w-3 h-3 text-emerald-600" />
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-medium text-slate-700">{loc.name}</p>
                                            <p className="text-[10px] text-slate-400 truncate">{loc.address || 'No address'}</p>
                                          </div>
                                          <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                                            onClick={async () => {
                                              if (!window.confirm(`Delete location "${loc.name}"?`)) return;
                                              await supabase.from('locations').delete().eq('id', loc.id);
                                              queryClient.invalidateQueries({ queryKey: ['all-locations'] });
                                              const { toast } = await import("sonner");
                                              toast.success(`Location "${loc.name}" deleted`);
                                            }}>
                                            <Trash2 className="w-2.5 h-2.5" />
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Module Configuration Dialog */}
      <Dialog open={!!editingOrgModules} onOpenChange={() => setEditingOrgModules(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configure Modules — {editingOrgModules?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <div className="flex justify-between items-center mb-3">
              <p className="text-xs text-slate-500">{selectedModules.length === 0 ? 'Unrestricted (all modules)' : `${selectedModules.length} modules enabled`}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="text-[10px] h-6" onClick={() => setSelectedModules([...ALL_MODULE_KEYS])}>Select All</Button>
                <Button variant="outline" size="sm" className="text-[10px] h-6" onClick={() => setSelectedModules([])}>Clear All</Button>
              </div>
            </div>
            {ALL_MODULE_KEYS.map(key => {
              const mod = MODULE_DEFINITIONS[key];
              const checked = selectedModules.includes(key);
              return (
                <div key={key} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(val) => {
                      if (val) setSelectedModules(prev => [...prev, key]);
                      else setSelectedModules(prev => prev.filter(m => m !== key));
                    }}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{mod?.label || key}</p>
                    <p className="text-[10px] text-slate-400">{mod?.pages?.join(', ') || ''}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingOrgModules(null)}>Cancel</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={async () => {
                const { error } = await supabase
                  .from('organizations')
                  .update({ enabled_modules: selectedModules })
                  .eq('id', editingOrgModules.id);
                if (!error) {
                  queryClient.invalidateQueries({ queryKey: ['organizations'] });
                  const { toast } = await import("sonner");
                  toast.success(`Modules updated for ${editingOrgModules.name}`);
                }
                setEditingOrgModules(null);
              }}
            >
              Save Modules
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Client Modal */}
      <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Client</DialogTitle>
          </DialogHeader>
          {inviteSuccess ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
              <p className="font-semibold text-slate-900">Invitation Sent!</p>
              <p className="text-sm text-slate-500 mt-1">An invitation email has been sent to <strong>{inviteEmail}</strong>.</p>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-sm font-semibold text-slate-700">Client Email Address</Label>
                <Input type="email" placeholder="client@company.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="mt-1" />
              </div>
              <p className="text-xs text-slate-400">The client will receive an invitation to sign in and complete onboarding.</p>
            </div>
          )}
          <DialogFooter>
            {inviteSuccess ? (
              <Button onClick={() => setShowInviteModal(false)}>Close</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setShowInviteModal(false)}>Cancel</Button>
                <Button onClick={handleInviteClient} disabled={inviting || !inviteEmail} className="bg-blue-600 hover:bg-blue-700">
                  {inviting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Send Invitation
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Platform Admin Modal */}
      <Dialog open={showPlatformInviteModal} onOpenChange={setShowPlatformInviteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Platform Administrator</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-semibold text-slate-700">Email Address</Label>
              <Input type="email" placeholder="admin@company.com" value={platformInviteEmail} onChange={e => setPlatformInviteEmail(e.target.value)} className="mt-1" />
            </div>
            <p className="text-xs text-amber-600 font-medium">
              Warning: This user will have unrestricted access to all organizations, users, and platform settings.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPlatformInviteModal(false)}>Cancel</Button>
            <Button onClick={handleInvitePlatformAdmin} disabled={platformInviting || !platformInviteEmail} className="bg-blue-600 hover:bg-blue-700">
              {platformInviting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Invite Admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isInviteLinkDialogOpen} onOpenChange={setIsInviteLinkDialogOpen}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Invitation Link Generated</DialogTitle>
            <DialogDescription>
              Copy the link below and send it to the user. This link will expire in 7 days.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center space-x-2 mt-4">
            <div className="grid flex-1 gap-2">
              <Label htmlFor="invite-link" className="sr-only">Link</Label>
              <Input
                id="invite-link"
                readOnly
                value={generatedInviteLink}
                className="font-mono text-[10px] bg-slate-50 text-slate-800 border-slate-200"
              />
            </div>
            <Button 
              size="sm" 
              className="px-3 bg-teal-600 hover:bg-teal-700 text-white"
              onClick={async () => {
                const link = generatedInviteLink;
                navigator.clipboard.writeText(link);
                toast.success('Link copied to clipboard');
              }}
            >
              <span className="sr-only">Copy</span>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter className="sm:justify-start pt-4 border-t mt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsInviteLinkDialogOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
