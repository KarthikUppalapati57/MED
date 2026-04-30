import React, { useState, useMemo } from 'react';
import { useAuth } from '@/components/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogDescription
} from "@/components/ui/dialog";
import { 
  Shield, Users, Search, Download, CheckCircle2, X, Loader2, Package, Trash2, Mail, 
  ChevronDown, ChevronRight, Building2, Store, MapPin, Plus, Copy, DollarSign, 
  FileText, TrendingUp, Activity, ShieldAlert, Video, UserPlus, Sparkles, 
  Receipt, History, UserCog, CreditCard, RefreshCw, Fingerprint 
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ALL_MODULE_KEYS, MODULE_DEFINITIONS } from "@/lib/moduleConfig";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import InventoryAudit from '@/components/accounting/InventoryAudit';

const TABS = [
  { id: 'access', label: 'Access Request', icon: ShieldAlert },
  { id: 'demo', label: 'Demo Requests', icon: Video },
  { id: 'contact', label: 'Contact Us', icon: Mail },
  { id: 'invite', label: 'Invite Clients', icon: UserPlus },
  { id: 'orgs', label: 'Organisation', icon: Building2 },
  { id: 'plans', label: 'Plans', icon: Sparkles },
  { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
  { id: 'accounting', label: 'Accounting', icon: Receipt },
  { id: 'logs', label: 'Logs', icon: History },
];

const ACCESS_LEVELS = [
  { id: 'read', label: 'Read', color: 'sky' },
  { id: 'write', label: 'Write', color: 'emerald' },
  { id: 'update', label: 'Update', color: 'amber' }
];

export default function PlatformAdmin() {
  const { user, role: userRole } = useAuth();
  const queryClient = useQueryClient();

  // Tab State
  const [activeTab, setActiveTab] = useState("access");

  // Selection/Processing State
  const [processingRequests, setProcessingRequests] = useState(new Set());
  const [selectedRequests, setSelectedRequests] = useState(new Set());
  
  // Organization Hierarchy State
  const [expandedOrgs, setExpandedOrgs] = useState(new Set());
  const [expandedBrands, setExpandedBrands] = useState(new Set());
  const [showArchivedOrgs, setShowArchivedOrgs] = useState(false);
  
  // Modal States
  const [editingOrgModules, setEditingOrgModules] = useState(null);
  const [selectedModules, setSelectedModules] = useState([]);
  const [addBrandOrgId, setAddBrandOrgId] = useState(null);
  const [newBrandName, setNewBrandName] = useState('');
  const [addLocationTarget, setAddLocationTarget] = useState(null);
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationAddress, setNewLocationAddress] = useState('');
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [planForm, setPlanForm] = useState({ id: '', name: '', description: '', price_monthly: 0, features: [], is_active: true });
  
  // Invite State
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteSelectedModules, setInviteSelectedModules] = useState([...ALL_MODULE_KEYS]);
  const [inviteAccessLevels, setInviteAccessLevels] = useState({
    read: true,
    write: false,
    update: false
  });
  const [isInviteLinkDialogOpen, setIsInviteLinkDialogOpen] = useState(false);
  const [generatedInviteLink, setGeneratedInviteLink] = useState("");

  // Audit Logs State
  const [logModuleFilter, setLogModuleFilter] = useState('All');

  const [accountingSubTab, setAccountingSubTab] = useState('revenue');

  const authChecked = !!user;

  // ── Real-Time Subscriptions ────────────────────────────────
  React.useEffect(() => {
    if (!authChecked || (userRole !== 'admin' && userRole !== 'platform_admin')) return;

    const channel = supabase
      .channel('platform-admin-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'demo_requests' }, () => {
        queryClient.invalidateQueries({ queryKey: ['demo-requests'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_requests' }, () => {
        queryClient.invalidateQueries({ queryKey: ['contact-requests'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'access_requests' }, () => {
        queryClient.invalidateQueries({ queryKey: ['access-requests'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organizations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['organizations'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invitations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['pending-client-invites'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authChecked, userRole, queryClient]);

  // ── Queries ────────────────────────────────────────────────
  const { data: requests = [], isLoading: isLoadingAccess } = useAuthQuery({
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
  });

  const { data: demoRequests = [], isLoading: isLoadingDemo } = useAuthQuery({
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
  });

  const { data: contactRequests = [], isLoading: isLoadingContact } = useAuthQuery({
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
  });

  const { data: orgs = [], isLoading: isLoadingOrgs } = useAuthQuery({
    queryKey: ['organizations', showArchivedOrgs],
    queryFn: async () => {
      let q = supabase.from('organizations').select('*');
      if (!showArchivedOrgs) q = q.is('deleted_at', null);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked && (userRole === 'admin' || userRole === 'platform_admin'),
  });

  const { data: allBrands = [] } = useAuthQuery({
    queryKey: ['all-brands'],
    queryFn: async () => {
      const { data, error } = await supabase.from('brands').select('*').is('deleted_at', null);
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked && (userRole === 'admin' || userRole === 'platform_admin'),
  });

  const { data: allLocations = [] } = useAuthQuery({
    queryKey: ['all-locations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('locations').select('*').is('deleted_at', null);
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked && (userRole === 'admin' || userRole === 'platform_admin'),
  });

  const { data: plans = [] } = useAuthQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('*').order('price_monthly', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked && (userRole === 'admin' || userRole === 'platform_admin'),
  });

  const { data: auditLogs = [], isLoading: isLoadingLogs } = useAuthQuery({
    queryKey: ['platform-audit-logs', logModuleFilter],
    queryFn: async () => {
      let q = supabase.from('audit_logs').select('*, profiles(email)');
      if (logModuleFilter !== 'All') q = q.eq('table_name', logModuleFilter);
      const { data, error } = await q.order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked && (userRole === 'admin' || userRole === 'platform_admin'),
  });

  const { data: pendingClientInvites = [] } = useAuthQuery({
    queryKey: ['pending-client-invites'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .eq('role', 'owner')
        .is('accepted_at', null)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked && (userRole === 'admin' || userRole === 'platform_admin'),
  });

  // ── Mutators & Handlers ─────────────────────────────────────
  const handleInviteClient = async () => {
    if (!inviteEmail) { toast.error("Email is required"); return; }
    if (inviteSelectedModules.length === 0) { toast.error("Select at least one module"); return; }
    
    setInviting(true);
    try {
      const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const { error: insertErr } = await supabase
        .from("invitations")
        .insert([{
          email: inviteEmail,
          token,
          role: "owner",
          invited_by: user?.id,
          expires_at: expiresAt.toISOString(),
          metadata: { 
            modules: inviteSelectedModules,
            access: inviteAccessLevels 
          }
        }]);

      if (insertErr) throw insertErr;

      const link = `${window.location.origin}/signup/${token}`;
      setGeneratedInviteLink(link);
      setIsInviteLinkDialogOpen(true);
      setInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ['pending-client-invites'] });
      toast.success("Onboarding link generated!");
    } catch (e) {
      console.error('Invite error:', e);
      toast.error(e.message || "Failed to generate invitation");
    }
    setInviting(false);
  };

  const handleDeleteInvite = async (id) => {
    if (!window.confirm("Revoke this invitation?")) return;
    try {
      const { error } = await supabase.from('invitations').delete().eq('id', id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['pending-client-invites'] });
      toast.success("Invitation revoked");
    } catch (err) {
      toast.error("Failed to delete");
    }
  };

  const toggleOrg = (id) => {
    setExpandedOrgs(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleBrand = (id) => {
    setExpandedBrands(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const getOrgBrands = (orgId) => allBrands.filter(b => b.organization_id === orgId);
  const getBrandLocations = (brandId) => allLocations.filter(l => l.brand_id === brandId);

  // ── Computed Stats ─────────────────────────────────────────
  const accessReqs = requests.filter(r => r.request_type !== 'demo');
  const contactReqs = contactRequests;
  const pendingAccessCount = accessReqs.filter(r => r.status === 'pending_approval' || r.status === 'under_review').length;
  const pendingContactCount = contactReqs.filter(r => r.status === 'pending_approval').length;
  const pendingOrgCount = orgs.filter(o => o.status === 'pending_approval' || o.status === 'under_review' || o.status === 'onboarding').length;
  const pendingCount = pendingAccessCount + pendingContactCount + pendingOrgCount;

  // ── Tab Renderers ──────────────────────────────────────────
  const renderRequestTable = (data, title, pCount, type) => (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="text-xs text-slate-400">{data.length} total · {pCount} pending</p>
        </div>
        <div className="flex gap-2">
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><Input placeholder="Search..." className="pl-9 w-48 h-8 rounded-xl border-slate-100" /></div>
          <Button variant="outline" size="sm" className="rounded-xl border-slate-100"><Download className="w-4 h-4 mr-1" />Export</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/50">
              <TableHead className="text-[11px] font-bold">APPLICANT</TableHead>
              <TableHead className="text-[11px] font-bold">COMPANY</TableHead>
              <TableHead className="text-[11px] font-bold">PLAN/TYPE</TableHead>
              <TableHead className="text-[11px] font-bold">STATUS</TableHead>
              <TableHead className="text-[11px] font-bold">SUBMITTED</TableHead>
              <TableHead className="text-[11px] font-bold">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-slate-400">No requests found</TableCell></TableRow>
            ) : data.map(r => (
              <TableRow key={r.id} className="hover:bg-slate-50/50 transition-colors">
                <TableCell>
                  <p className="text-sm font-semibold text-slate-900">{r.full_name || r.name}</p>
                  <p className="text-[10px] text-slate-500">{r.email}</p>
                </TableCell>
                <TableCell className="text-sm text-slate-600">{r.company_name || '—'}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px] capitalize bg-white">{r.plan || r.request_type || '—'}</Badge>
                </TableCell>
                <TableCell>
                  <Badge className={cn(
                    "text-[10px] font-bold border-none",
                    r.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 
                    r.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                  )}>
                    {r.status || 'pending'}
                  </Badge>
                </TableCell>
                <TableCell className="text-[10px] text-slate-500">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-emerald-600"><CheckCircle2 className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"><X className="w-4 h-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const renderInviteTab = () => (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm overflow-hidden">
        <div className="bg-slate-900 px-6 py-8 text-white relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10">
                <UserPlus className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Invite New Client</h2>
                <p className="text-slate-400 text-sm">Generate secure onboarding links for Organization Owners</p>
              </div>
            </div>
          </div>
          <div className="absolute -right-12 -top-12 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl" />
          <div className="absolute -left-12 -bottom-12 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl" />
        </div>
        <CardContent className="p-6 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-sm font-bold text-slate-700">Client Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    placeholder="owner@new-organization.com" 
                    className="pl-10 h-12 rounded-xl border-slate-200"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-bold text-slate-700">Granular Access Permissions</Label>
                <div className="grid grid-cols-3 gap-3">
                  {ACCESS_LEVELS.map(level => (
                    <button
                      key={level.id}
                      onClick={() => setInviteAccessLevels(prev => ({ ...prev, [level.id]: !prev[level.id] }))}
                      className={cn(
                        "flex flex-col items-center p-4 rounded-2xl border transition-all",
                        inviteAccessLevels[level.id] 
                          ? `bg-${level.color}-50 border-${level.color}-600 ring-2 ring-${level.color}-100` 
                          : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center mb-2",
                        inviteAccessLevels[level.id] 
                          ? `bg-${level.color}-600 text-white` 
                          : "bg-slate-100"
                      )}>
                        <Fingerprint className="w-5 h-5" />
                      </div>
                      <span className={cn("text-xs font-bold", inviteAccessLevels[level.id] ? "text-slate-900" : "text-slate-500")}>
                        {level.label}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 italic">Determines if the client can read, create (write), or modify (update) records.</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-bold text-slate-700">Enable Platform Modules</Label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-[10px] text-teal-600 font-bold"
                  onClick={() => setInviteSelectedModules(prev => prev.length === ALL_MODULE_KEYS.length ? [] : [...ALL_MODULE_KEYS])}
                >
                  {inviteSelectedModules.length === ALL_MODULE_KEYS.length ? "Clear All" : "Select All"}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {ALL_MODULE_KEYS.map(key => {
                  const mod = MODULE_DEFINITIONS[key];
                  const isSelected = inviteSelectedModules.includes(key);
                  return (
                    <button
                      key={key}
                      onClick={() => setInviteSelectedModules(prev => 
                        isSelected ? prev.filter(k => k !== key) : [...prev, key]
                      )}
                      className={cn(
                        "flex items-center gap-2 p-3 rounded-xl border text-left transition-all",
                        isSelected 
                          ? "bg-slate-50 border-slate-900 shadow-sm" 
                          : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                      )}
                    >
                      <Checkbox checked={isSelected} className="pointer-events-none" />
                      <span className="text-xs font-medium">{mod.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100 flex justify-end">
            <Button 
              className="bg-slate-900 hover:bg-slate-800 text-white h-12 px-8 rounded-xl shadow-lg"
              disabled={inviting || !inviteEmail || inviteSelectedModules.length === 0}
              onClick={handleInviteClient}
            >
              {inviting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Generate Onboarding Link
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Pending Client Invitations</CardTitle>
          <p className="text-xs text-slate-400">Recently generated links that haven't been accepted yet</p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead className="text-[11px] font-bold">CLIENT EMAIL</TableHead>
                <TableHead className="text-[11px] font-bold">MODULES</TableHead>
                <TableHead className="text-[11px] font-bold">ACCESS</TableHead>
                <TableHead className="text-[11px] font-bold">CREATED</TableHead>
                <TableHead className="text-[11px] font-bold">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingClientInvites.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-12 text-slate-400">No pending invitations</TableCell></TableRow>
              ) : pendingClientInvites.map(invite => (
                <TableRow key={invite.id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell className="font-semibold text-sm text-slate-900">{invite.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {invite.metadata?.modules?.map(m => (
                        <Badge key={m} variant="secondary" className="text-[9px] px-1.5 py-0 bg-slate-100 text-slate-600">
                          {MODULE_DEFINITIONS[m]?.label || m}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {Object.entries(invite.metadata?.access || {}).filter(([_, v]) => v).map(([k]) => (
                        <Badge key={k} className="bg-blue-50 text-blue-700 text-[9px] uppercase font-bold border-none">{k}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-[10px] text-slate-500">{new Date(invite.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
                      onClick={() => handleDeleteInvite(invite.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="p-6 space-y-8 min-h-screen bg-slate-50/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-slate-200">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Platform Admin Console</h1>
              {pendingCount > 0 && (
                <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-none font-bold px-3 py-1">
                  {pendingCount} Action Required
                </Badge>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-1">Global infrastructure & organization governance · v2.1.0</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button 
            className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-10 px-6 shadow-sm"
            onClick={() => setActiveTab('invite')}
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Quick Invite
          </Button>
          <Button variant="outline" className="rounded-xl border-slate-200 h-10 px-6">
            System Status
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Organizations', value: orgs.length, sub: 'Registered tenants', icon: Building2, color: 'blue' },
          { label: 'Demo Requests', value: demoRequests.length, sub: `${demoRequests.filter(r => r.demo_viewed).length} viewed`, icon: Video, color: 'violet' },
          { label: 'Pending Approvals', value: pendingCount, sub: 'Immediate action', icon: ShieldAlert, color: 'amber' },
          { label: 'Platform MRR', value: `$${(plans.length ? 12450 : 0).toLocaleString()}`, sub: 'Estimated monthly', icon: DollarSign, color: 'emerald' },
        ].map(stat => (
          <Card key={stat.label} className="border-0 shadow-sm hover:shadow-md transition-shadow overflow-hidden group">
            <CardContent className="p-6 relative">
              <div className="flex items-center justify-between relative z-10">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{stat.label}</p>
                  <p className="text-3xl font-bold text-slate-900 mt-2">{stat.value}</p>
                  <p className={cn("text-[10px] font-medium mt-1", `text-${stat.color}-500`)}>{stat.sub}</p>
                </div>
                <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110", `bg-${stat.color}-50 text-${stat.color}-600`)}>
                  <stat.icon className="h-6 w-6" />
                </div>
              </div>
              <div className={cn("absolute -right-4 -bottom-4 w-24 h-24 rounded-full blur-2xl opacity-10", `bg-${stat.color}-400`)} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="bg-white p-1 rounded-2xl border border-slate-200 inline-flex shadow-sm mb-8">
          {TABS.map(tab => {
            let badge = 0;
            if (tab.id === 'access') badge = pendingAccessCount;
            if (tab.id === 'contact') badge = pendingContactCount;
            if (tab.id === 'orgs') badge = pendingOrgCount;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap",
                  activeTab === tab.id 
                    ? "bg-slate-900 text-white shadow-lg shadow-slate-200" 
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <tab.icon className={cn("w-4 h-4", activeTab === tab.id ? "text-white" : "text-slate-400")} />
                {tab.label}
                {badge > 0 && (
                  <span className={cn(
                    "ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-black",
                    activeTab === tab.id ? "bg-white text-slate-900" : "bg-amber-500 text-white"
                  )}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="space-y-6">
          <TabsContent value="access" className="mt-0 outline-none focus-visible:ring-0">
            {renderRequestTable(accessReqs, "Access Requests", pendingAccessCount, "access")}
          </TabsContent>

          <TabsContent value="demo" className="mt-0 outline-none">
            <Card className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-4">
                <div>
                  <CardTitle className="text-base">Demo Inquiries</CardTitle>
                  <p className="text-xs text-slate-400">Prospective clients interested in system walkthroughs</p>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="text-[11px] font-bold">APPLICANT</TableHead>
                      <TableHead className="text-[11px] font-bold">COMPANY</TableHead>
                      <TableHead className="text-[11px] font-bold">STATUS</TableHead>
                      <TableHead className="text-[11px] font-bold">SUBMITTED</TableHead>
                      <TableHead className="text-[11px] font-bold">ACTIONS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {demoRequests.map(r => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <p className="font-bold text-sm">{r.full_name}</p>
                          <p className="text-[10px] text-slate-500">{r.email}</p>
                        </TableCell>
                        <TableCell className="text-sm">{r.company_name}</TableCell>
                        <TableCell>
                          <Badge variant={r.demo_viewed ? "secondary" : "default"} className="text-[9px]">
                            {r.demo_viewed ? "Viewed" : "New"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                           <Button size="sm" variant="ghost" className="h-8 w-8 p-0"><History className="w-4 h-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contact" className="mt-0 outline-none">
            {renderRequestTable(contactReqs, "General Inquiries", pendingContactCount, "contact")}
          </TabsContent>

          <TabsContent value="invite" className="mt-0 outline-none">
            {renderInviteTab()}
          </TabsContent>

          <TabsContent value="orgs" className="mt-0 outline-none">
             <Card className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-6">
                <div>
                  <CardTitle className="text-base">Organization Hierarchy</CardTitle>
                  <p className="text-xs text-slate-400">Global tenant distribution and structural breakdown</p>
                </div>
                <div className="flex items-center gap-4">
                   <div className="flex items-center space-x-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                    <Checkbox id="showArchived" checked={showArchivedOrgs} onCheckedChange={setShowArchivedOrgs} />
                    <Label htmlFor="showArchived" className="text-[10px] font-bold text-slate-500 cursor-pointer">Show Archived</Label>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-slate-100">
                   {orgs.map(org => {
                     const brands = getOrgBrands(org.id);
                     const isExp = expandedOrgs.has(org.id);
                     return (
                       <div key={org.id} className="group">
                         <div 
                          className={cn(
                            "flex items-center gap-4 p-4 px-6 cursor-pointer hover:bg-slate-50/80 transition-all",
                            isExp && "bg-slate-50/50 shadow-inner"
                          )}
                          onClick={() => toggleOrg(org.id)}
                         >
                            <div className="w-6 h-6 flex items-center justify-center shrink-0 transition-transform">
                              {isExp ? <ChevronDown className="w-4 h-4 text-slate-900" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                            </div>
                            <div className="w-10 h-10 bg-white rounded-xl border border-slate-200 flex items-center justify-center shadow-sm">
                              <Building2 className="w-5 h-5 text-slate-600" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-slate-900">{org.name}</p>
                                <Badge className="bg-emerald-50 text-emerald-700 text-[9px] font-bold border-none">{org.status || 'Active'}</Badge>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-0.5 font-medium">{org.admin_email} · {brands.length} Brands</p>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button size="sm" variant="ghost" className="h-8 px-3 text-[10px] font-bold rounded-lg" onClick={(e) => { e.stopPropagation(); setEditingOrgModules(org); setSelectedModules(org.enabled_modules || []); }}>
                                <Package className="w-3.5 h-3.5 mr-2" /> Modules
                              </Button>
                              <Button size="sm" variant="ghost" className="h-8 px-3 text-[10px] font-bold rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                         </div>
                         {isExp && (
                           <div className="bg-white/50 px-12 pb-2">
                             {brands.length === 0 ? (
                               <p className="p-4 text-[10px] text-slate-400 italic">No brands registered under this organization.</p>
                             ) : brands.map(brand => (
                               <div key={brand.id} className="py-3 border-l-2 border-slate-100 pl-6 flex items-center justify-between">
                                 <div className="flex items-center gap-3">
                                   <div className="w-8 h-8 bg-violet-50 rounded-lg flex items-center justify-center"><Store className="w-4 h-4 text-violet-600" /></div>
                                   <div>
                                      <p className="text-xs font-bold text-slate-800">{brand.name}</p>
                                      <p className="text-[9px] text-slate-400">{getBrandLocations(brand.id).length} Locations</p>
                                   </div>
                                 </div>
                                 <Button size="sm" variant="ghost" className="h-7 text-[10px] font-bold">+ Location</Button>
                               </div>
                             ))}
                           </div>
                         )}
                       </div>
                     )
                   })}
                </div>
              </CardContent>
             </Card>
          </TabsContent>

          <TabsContent value="plans" className="mt-0 outline-none">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {plans.map(plan => (
                 <Card key={plan.id} className="border-0 shadow-sm relative group overflow-hidden">
                   <CardHeader className="pb-2">
                     <div className="flex justify-between items-start">
                        <Badge className="bg-blue-50 text-blue-700 text-[10px] font-bold mb-2">{plan.is_active ? 'Production' : 'Draft'}</Badge>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"><Plus className="w-4 h-4" /></Button>
                     </div>
                     <CardTitle className="text-xl font-black text-slate-900">{plan.name}</CardTitle>
                     <p className="text-4xl font-black text-slate-900 mt-2">${plan.price_monthly}<span className="text-sm text-slate-400 font-normal">/mo</span></p>
                   </CardHeader>
                   <CardContent>
                      <p className="text-xs text-slate-500 mb-6">{plan.description || 'Global service level agreement'}</p>
                      <div className="space-y-2">
                        {(Array.isArray(plan.features) ? plan.features : []).map(f => (
                          <div key={f} className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full bg-emerald-50 flex items-center justify-center"><CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /></div>
                            <span className="text-[11px] font-medium text-slate-600">{MODULE_DEFINITIONS[f]?.label || f}</span>
                          </div>
                        ))}
                      </div>
                      <Button variant="outline" className="w-full mt-8 rounded-xl border-slate-200 font-bold text-xs h-10">Configure Plan</Button>
                   </CardContent>
                   <div className="absolute -right-6 -top-6 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl" />
                 </Card>
               ))}
               <button 
                onClick={() => setShowPlanDialog(true)}
                className="border-2 border-dashed border-slate-200 rounded-3xl p-8 flex flex-col items-center justify-center text-slate-400 hover:border-slate-300 hover:bg-slate-50 transition-all"
               >
                 <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mb-4"><Plus className="w-6 h-6" /></div>
                 <p className="font-bold">Create New Plan</p>
                 <p className="text-[10px] mt-1">Standardize service tiers</p>
               </button>
             </div>
          </TabsContent>

          <TabsContent value="subscriptions" className="mt-0 outline-none">
             <Card className="border-0 shadow-sm">
                <CardHeader>
                   <CardTitle className="text-base">Active Subscriptions</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/50">
                        <TableHead className="text-[11px] font-bold">ORGANIZATION</TableHead>
                        <TableHead className="text-[11px] font-bold">CURRENT PLAN</TableHead>
                        <TableHead className="text-[11px] font-bold">STATUS</TableHead>
                        <TableHead className="text-[11px] font-bold">NEXT BILLING</TableHead>
                        <TableHead className="text-[11px] font-bold">ACTIONS</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orgs.map(org => {
                        const plan = plans.find(p => p.id === org.plan_id);
                        return (
                          <TableRow key={org.id}>
                            <TableCell className="font-bold text-sm">{org.name}</TableCell>
                            <TableCell className="text-sm text-slate-600 font-medium">{plan?.name || 'Standard'}</TableCell>
                            <TableCell><Badge className="bg-green-50 text-green-700 text-[10px] font-bold border-none">{org.subscription_status || 'active'}</Badge></TableCell>
                            <TableCell className="text-xs text-slate-500">May 15, 2026</TableCell>
                            <TableCell>
                               <Button variant="ghost" size="sm" className="h-8 w-8 p-0"><RefreshCw className="w-4 h-4" /></Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
             </Card>
          </TabsContent>

          <TabsContent value="accounting" className="mt-0 outline-none">
             <div className="space-y-6">
               <div className="flex gap-4 border-b border-slate-100 pb-4">
                 <button 
                  onClick={() => setAccountingSubTab('revenue')}
                  className={cn(
                    "text-xs font-bold px-4 py-2 rounded-lg transition-all",
                    accountingSubTab === 'revenue' ? "bg-slate-900 text-white shadow-sm" : "text-slate-400 hover:text-slate-600"
                  )}
                 >
                   Revenue Overview
                 </button>
                 <button 
                  onClick={() => setAccountingSubTab('audit')}
                  className={cn(
                    "text-xs font-bold px-4 py-2 rounded-lg transition-all",
                    accountingSubTab === 'audit' ? "bg-slate-900 text-white shadow-sm" : "text-slate-400 hover:text-slate-600"
                  )}
                 >
                   Inventory Auditing
                 </button>
               </div>

               {accountingSubTab === 'revenue' ? (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                   <Card className="border-0 shadow-sm">
                     <CardHeader><CardTitle className="text-base">Revenue Breakdown</CardTitle></CardHeader>
                     <CardContent>
                        <div className="space-y-6">
                          {plans.map(plan => {
                            const count = orgs.filter(o => o.plan_id === plan.id).length;
                            return (
                              <div key={plan.id} className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                   <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center font-bold text-slate-400">{plan.name[0]}</div>
                                   <div>
                                      <p className="font-bold text-sm">{plan.name}</p>
                                      <p className="text-[10px] text-slate-400">{count} Organizations</p>
                                   </div>
                                </div>
                                <p className="font-black text-slate-900">${(count * plan.price_monthly).toLocaleString()}</p>
                              </div>
                            )
                          })}
                        </div>
                     </CardContent>
                   </Card>
                   <Card className="border-0 shadow-sm">
                     <CardHeader><CardTitle className="text-base">Platform Invoicing</CardTitle></CardHeader>
                     <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center mb-4"><Receipt className="w-8 h-8 text-slate-300" /></div>
                        <p className="font-bold text-slate-900">No pending invoices</p>
                        <p className="text-xs text-slate-400 mt-1">All organization payments are up to date.</p>
                     </CardContent>
                   </Card>
                 </div>
               ) : (
                 <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <InventoryAudit />
                 </div>
               )}
             </div>
          </TabsContent>

          <TabsContent value="logs" className="mt-0 outline-none">
             <Card className="border-0 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-6">
                <div>
                  <CardTitle className="text-base">Platform Activity Ledger</CardTitle>
                  <p className="text-xs text-slate-400">Immutable audit trail of administrative actions</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-bold rounded-lg px-3 py-1">Filter: {logModuleFilter}</Badge>
                  <Button variant="outline" size="sm" className="rounded-xl"><Download className="w-3.5 h-3.5" /></Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                 <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/50">
                        <TableHead className="text-[11px] font-bold">TIMESTAMP</TableHead>
                        <TableHead className="text-[11px] font-bold">ADMIN</TableHead>
                        <TableHead className="text-[11px] font-bold">ACTION</TableHead>
                        <TableHead className="text-[11px] font-bold">TARGET</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLogs.map(log => (
                        <TableRow key={log.id}>
                          <TableCell className="text-[10px] text-slate-500 font-medium font-mono">{new Date(log.created_at).toLocaleString()}</TableCell>
                          <TableCell className="text-xs font-bold">{log.profiles?.email || 'System'}</TableCell>
                          <TableCell><Badge variant="secondary" className="text-[9px] uppercase font-bold">{log.action}</Badge></TableCell>
                          <TableCell className="text-[10px] text-slate-400 font-mono">{log.table_name}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                 </Table>
              </CardContent>
             </Card>
          </TabsContent>
        </div>
      </Tabs>

      {/* Dialogs */}
      <Dialog open={!!editingOrgModules} onOpenChange={() => setEditingOrgModules(null)}>
        <DialogContent className="max-w-lg rounded-3xl border-none shadow-2xl p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">Configure Modules</DialogTitle>
            <DialogDescription>Modify access for {editingOrgModules?.name}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-6">
            {ALL_MODULE_KEYS.map(key => {
               const mod = MODULE_DEFINITIONS[key];
               const checked = selectedModules.includes(key);
               return (
                 <div 
                  key={key} 
                  onClick={() => setSelectedModules(prev => checked ? prev.filter(k => k !== key) : [...prev, key])}
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-all",
                    checked ? "bg-slate-900 border-slate-900 text-white shadow-lg" : "bg-white border-slate-100 hover:border-slate-200"
                  )}
                 >
                    <Checkbox checked={checked} className={cn("border-slate-300", checked && "border-white bg-white text-slate-900")} />
                    <span className="text-xs font-bold">{mod?.label || key}</span>
                 </div>
               )
            })}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingOrgModules(null)}>Cancel</Button>
            <Button className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl px-8" onClick={async () => {
              await supabase.from('organizations').update({ enabled_modules: selectedModules }).eq('id', editingOrgModules.id);
              queryClient.invalidateQueries({ queryKey: ['organizations'] });
              toast.success("Modules updated");
              setEditingOrgModules(null);
            }}>Save Configuration</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isInviteLinkDialogOpen} onOpenChange={setIsInviteLinkDialogOpen}>
        <DialogContent className="rounded-3xl border-none shadow-2xl p-10 text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          </div>
          <DialogTitle className="text-3xl font-black mb-2">Link Generated!</DialogTitle>
          <p className="text-slate-500 mb-8">Share this onboarding link with the client to begin their registration.</p>
          <div className="relative mb-8">
            <Input readOnly value={generatedInviteLink} className="bg-slate-50 h-12 pr-12 rounded-xl border-slate-100 font-mono text-xs" />
            <Button variant="ghost" size="sm" className="absolute right-1 top-1 h-10 w-10 p-0 hover:bg-white" onClick={() => { navigator.clipboard.writeText(generatedInviteLink); toast.success("Copied to clipboard"); }}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <Button className="w-full bg-slate-900 h-12 rounded-xl font-bold" onClick={() => setIsInviteLinkDialogOpen(false)}>Done</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
