import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import {
  Building2,
  Users,
  Plus,
  Search,
  ExternalLink,
  MoreVertical,
  ChevronRight,
  Shield,
  CreditCard,
  AlertCircle,
  Share2,
  Mail,
  Copy,
  Check,
  Globe,
  Loader2,
  CheckCircle2,
  X,
  Trash2,
  Activity,
  UserCheck
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from 'sonner';
import { cn } from "@/lib/utils";
import { format } from 'date-fns';

export default function PlatformAdmin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("orgs");

  // App state
  const [search, setSearch] = useState('');
  
  // Dialogs
  const [isNewOrgOpen, setIsNewOrgOpen] = useState(false);
  const [newOrg, setNewOrg] = useState({ name: '', slug: '' });
  
  const [inviteOrgOpen, setInviteOrgOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);

  const [editOrgOpen, setEditOrgOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({ name: '', slug: '' });
  
  const [billingOrgOpen, setBillingOrgOpen] = useState(false);
  const [billingFormData, setBillingFormData] = useState({ subscription_status: 'trialing', subscription_plan: 'free' });
  const [suspendAlertOpen, setSuspendAlertOpen] = useState(false);

  // Platform Admins Auth State
  const [showPlatformInviteModal, setShowPlatformInviteModal] = useState(false);
  const [platformInviteEmail, setPlatformInviteEmail] = useState("");
  const [platformInviting, setPlatformInviting] = useState(false);
  const [platformCopiedLink, setPlatformCopiedLink] = useState(null);

  // Queries
  const { data: orgs = [], isLoading: isLoadingOrgs } = useQuery({
    queryKey: ['platform_orgs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const { data: platformAdmins = [], isLoading: isLoadingAdmins } = useQuery({
    queryKey: ['platform_admins'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "platform_admin")
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const { data: auditLogs = [], isLoading: isLoadingLogs } = useQuery({
    queryKey: ['platform_audit_logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*, profiles:user_id(full_name, email)")
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    }
  });

  // Mutations
  const createOrg = useMutation({
    mutationFn: async (org) => {
      const { data, error } = await supabase
        .from('organizations')
        .insert([org])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform_orgs'] });
      setIsNewOrgOpen(false);
      setNewOrg({ name: '', slug: '' });
      toast.success('Organization created successfully');
    },
    onError: (error) => toast.error(error.message)
  });

  const updateOrg = useMutation({
    mutationFn: async (data) => {
      const { error } = await supabase
        .from('organizations')
        .update({ name: data.name, slug: data.slug })
        .eq('id', selectedOrg.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform_orgs'] });
      setEditOrgOpen(false);
      toast.success('Organization updated');
    },
    onError: (error) => toast.error(error.message)
  });

  const updateBilling = useMutation({
    mutationFn: async (data) => {
      const { error } = await supabase
        .from('organizations')
        .update({ subscription_status: data.subscription_status, subscription_plan: data.subscription_plan })
        .eq('id', selectedOrg.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform_orgs'] });
      setBillingOrgOpen(false);
      toast.success('Billing details updated');
    },
    onError: (error) => toast.error(error.message)
  });

  const suspendOrg = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('organizations')
        .update({ subscription_status: 'suspended' })
        .eq('id', selectedOrg.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform_orgs'] });
      setSuspendAlertOpen(false);
      toast.error('Organization suspended');
    },
    onError: (error) => toast.error(error.message)
  });

  const handleInviteOrgOwner = async () => {
    if (!inviteEmail || !selectedOrg) return;
    setInviting(true);
    try {
      const { data: userCurrent } = await supabase.auth.getUser();
      const { data: invite, error } = await supabase
        .from('invitations')
        .insert([{
          email: inviteEmail,
          role: 'owner',
          organization_id: selectedOrg.id,
          invited_by: userCurrent?.user?.id,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        }])
        .select()
        .single();
        
      if (error) throw error;

      if (invite?.token) {
        const fullInviteLink = `${window.location.origin}/signup/${invite.token}`;
        setInviteLink(fullInviteLink);
        
        await navigator.clipboard.writeText(fullInviteLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        
        toast.success('Link generated and copied to clipboard');
      }
    } catch (error) {
      toast.error('Failed to create invitation: ' + error.message);
    } finally {
      setInviting(false);
    }
  };

  const handleInvitePlatformAdmin = async () => {
    if (!platformInviteEmail) return;
    setPlatformInviting(true);
    try {
      const { data: userCurrent } = await supabase.auth.getUser();
      const { data: invite, error } = await supabase
        .from('invitations')
        .insert([{
          email: platformInviteEmail,
          role: 'platform_admin',
          access_level: 'platform',
          invited_by: userCurrent?.user?.id,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        }])
        .select()
        .single();
        
      if (error) throw error;

      if (invite?.token) {
        const link = `${window.location.origin}/signup/${invite.token}`;
        setPlatformCopiedLink(link);
        await navigator.clipboard.writeText(link);
        toast.success("Platform admin invited successfully!");
      }
    } catch(e) {
      toast.error(e.message || "Failed to invite platform admin");
    } finally {
      setPlatformInviting(false);
    }
  };

  const handleDemotePlatformAdmin = async (adminId) => {
    if (!window.confirm("Are you sure you want to demote this Platform Admin? They will lose global access immediately.")) return;
    try {
      // In MEVS, we just drop their role to admin and limit their access level. 
      // Ensure they don't lock themselves out, handle carefully.
      const { error } = await supabase.rpc('admin_update_user_role', {
        target_user_id: adminId,
        new_role: 'admin',
        new_access_level: 'organization'
      });
      if (error) throw error;
      toast.success("Admin demoted successfully");
      queryClient.invalidateQueries({ queryKey: ['platform_admins'] });
    } catch (e) {
      toast.error(e.message || "Demotion failed");
    }
  }

  const copyInviteLink = async (link, setCopyState) => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopyState(true);
    setTimeout(() => setCopyState(false), 2000);
    toast.success('Link copied to clipboard');
  };

  const filteredOrgs = orgs.filter(o => 
    o.name.toLowerCase().includes(search.toLowerCase()) || 
    o.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-teal-100 rounded-2xl flex items-center justify-center shadow-inner">
            <Globe className="w-6 h-6 text-teal-700" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">SuperAdmin Console</h1>
            <p className="text-sm font-medium text-slate-500">Global tenant overview & system administration</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setIsNewOrgOpen(true)} className="bg-teal-600 hover:bg-teal-700 text-white shadow-lg shadow-teal-500/20 px-6 h-11 rounded-xl transition-all">
            <Plus className="h-4 w-4 mr-2" />
            New Organization
          </Button>
        </div>
      </div>

      {/* Advanced Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm rounded-2xl bg-white overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Venues</p>
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                <Building2 className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-black text-slate-900">{orgs.length}</p>
              <p className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">All Tenants</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-0 shadow-sm rounded-2xl bg-white overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Active Subs</p>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-black text-slate-900">
                {orgs.filter(o => o.subscription_status === 'active').length}
              </p>
              <p className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Paying</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm rounded-2xl bg-white overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">System Status</p>
              <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                <Shield className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse mt-2" />
              <p className="text-2xl font-black text-slate-900">Operational</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm rounded-2xl bg-white overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Platform Admins</p>
              <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-black text-slate-900">{platformAdmins.length}</p>
              <p className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Super Users</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6 h-12 bg-white border border-slate-200 shadow-sm rounded-xl p-1 gap-1">
          <TabsTrigger value="orgs" className="rounded-lg font-bold data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700">Organizations</TabsTrigger>
          <TabsTrigger value="admins" className="rounded-lg font-bold data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700">Platform Admins</TabsTrigger>
          <TabsTrigger value="activity" className="rounded-lg font-bold data-[state=active]:bg-slate-100 data-[state=active]:text-slate-800">System Activity {auditLogs.length > 0 && <Badge className="ml-2 bg-slate-200 hover:bg-slate-200 text-slate-600 rounded-md font-bold text-[10px] px-1">{auditLogs.length}</Badge>}</TabsTrigger>
        </TabsList>

        <TabsContent value="orgs">
          <Card className="border-0 shadow-xl shadow-slate-200/50 rounded-[24px] overflow-hidden bg-white">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder="Filter by name or slug..." 
                  className="pl-9 bg-white border-slate-200 rounded-xl shadow-sm h-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow className="border-0">
                    <TableHead className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Organization Identity</TableHead>
                    <TableHead className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</TableHead>
                    <TableHead className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Pricing Plan</TableHead>
                    <TableHead className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Creation Date</TableHead>
                    <TableHead className="px-6 py-4 text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingOrgs ? (
                    <TableRow><TableCell colSpan={5} className="py-12 text-center text-slate-400 font-bold"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Syncing tenants...</TableCell></TableRow>
                  ) : filteredOrgs.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="py-12 text-center text-slate-400 font-bold">No matching organizations found</TableCell></TableRow>
                  ) : (
                    filteredOrgs.map(org => (
                      <TableRow key={org.id} className="hover:bg-slate-50/50 transition-colors border-slate-50 group">
                        <TableCell className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-teal-50 to-teal-100 border border-teal-200 shadow-sm flex items-center justify-center text-teal-800 font-black text-lg">
                              {org.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 leading-tight">{org.name}</div>
                              <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                                <span className="bg-slate-100 rounded px-1">{org.slug}</span>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <Badge className={cn(
                            "capitalize shadow-sm font-bold border",
                            org.subscription_status === 'active' 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                              : org.subscription_status === 'suspended'
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                          )}>
                            {org.subscription_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase">
                            <CreditCard className="h-4 w-4 text-slate-400" />
                            {org.subscription_plan}
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-4 text-xs font-bold text-slate-500">
                          {format(new Date(org.created_at), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 group-hover:text-slate-600">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 rounded-2xl shadow-xl font-medium">
                              <DropdownMenuItem className="cursor-pointer" onClick={() => {
                                setSelectedOrg(org);
                                setEditFormData({ name: org.name, slug: org.slug });
                                setEditOrgOpen(true);
                              }}>
                                Edit Profile
                              </DropdownMenuItem>
                              <DropdownMenuItem className="cursor-pointer" onClick={() => {
                                setSelectedOrg(org);
                                setInviteEmail('');
                                setInviteLink('');
                                setInviteOrgOpen(true);
                              }}>
                                <Share2 className="w-4 h-4 mr-2 text-teal-600" /> Invite Owner
                              </DropdownMenuItem>
                              <DropdownMenuItem className="cursor-pointer" onClick={() => {
                                setSelectedOrg(org);
                                setBillingFormData({ subscription_status: org.subscription_status, subscription_plan: org.subscription_plan });
                                setBillingOrgOpen(true);
                              }}>
                                Modify Subscription
                              </DropdownMenuItem>
                              <DropdownMenuItem className="cursor-pointer text-red-600 hover:bg-red-50" onClick={() => {
                                setSelectedOrg(org);
                                setSuspendAlertOpen(true);
                              }}>
                                Suspend Tenant
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="admins">
          <Card className="border-0 shadow-xl shadow-slate-200/50 rounded-[24px] overflow-hidden bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-slate-100 bg-slate-50/50">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">Platform Administrators</CardTitle>
                <p className="text-xs font-medium text-slate-500">Users with full access to all organizations and settings.</p>
              </div>
              <Button onClick={() => setShowPlatformInviteModal(true)} size="sm" className="bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold border border-amber-300 shadow-sm rounded-xl px-4 h-9">
                <Shield className="w-3.5 h-3.5 mr-2" /> Invite Administrator
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow className="border-0">
                    <TableHead className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Admin Name</TableHead>
                    <TableHead className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Email</TableHead>
                    <TableHead className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Access Level</TableHead>
                    <TableHead className="px-6 py-4 text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingAdmins ? (
                    <TableRow><TableCell colSpan={4} className="py-12 text-center text-slate-400 font-bold"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /></TableCell></TableRow>
                  ) : platformAdmins.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="py-12 text-center text-sm font-bold text-slate-400">No platform admins found</TableCell></TableRow>
                  ) : platformAdmins.map(admin => (
                    <TableRow key={admin.id} className="hover:bg-slate-50/50 transition-colors border-slate-50">
                      <TableCell className="px-6 py-4 font-bold text-slate-900">{admin.full_name || 'Verification Pending'}</TableCell>
                      <TableCell className="px-6 py-4 text-xs font-semibold text-slate-500">{admin.email}</TableCell>
                      <TableCell className="px-6 py-4">
                        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-none px-2 shadow-sm uppercase font-black text-[10px]">Super Admin</Badge>
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 rounded-lg text-xs font-bold text-slate-400 hover:text-red-600 hover:bg-red-50" 
                          disabled={admin.id === user?.id} 
                          onClick={() => handleDemotePlatformAdmin(admin.id)}
                        >
                          Demote
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card className="border-0 shadow-xl shadow-slate-200/50 rounded-[24px] overflow-hidden bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-slate-100 bg-slate-50/50">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">Recent System Activity</CardTitle>
                <p className="text-xs font-medium text-slate-500">Security and action audit logs across the entire platform.</p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow className="border-0">
                    <TableHead className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Time</TableHead>
                    <TableHead className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">User</TableHead>
                    <TableHead className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Action</TableHead>
                    <TableHead className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Target</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingLogs ? (
                    <TableRow><TableCell colSpan={4} className="py-12 text-center text-slate-400 font-bold"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : auditLogs.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="py-12 text-center text-sm font-bold text-slate-400">No activity recorded</TableCell></TableRow>
                  ) : auditLogs.map(log => (
                    <TableRow key={log.id} className="hover:bg-slate-50/50 transition-colors border-slate-50">
                      <TableCell className="px-6 py-4 text-[11px] font-bold text-slate-500">
                        {format(new Date(log.created_at), 'MMM d, h:mm a')}
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <div className="font-bold text-sm text-slate-900">{log.profiles?.full_name || 'System User'}</div>
                        <div className="text-[10px] text-slate-500">{log.profiles?.email}</div>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <Badge variant="outline" className="text-[10px] font-black uppercase text-slate-600 bg-slate-100 border-none shadow-sm">{log.action}</Badge>
                      </TableCell>
                      <TableCell className="px-6 py-4 text-xs font-semibold text-slate-600 font-mono bg-slate-50/50 truncate max-w-[200px]" title={log.table_name}>
                        {log.table_name} <span className="text-slate-400 text-[10px]">({log.record_id?.substring(0,8)}...)</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Shared Dialogs */}
      <Dialog open={isNewOrgOpen} onOpenChange={setIsNewOrgOpen}>
        <DialogContent className="rounded-[32px] p-8">
          <DialogHeader className="space-y-3 pb-4">
            <DialogTitle className="text-2xl font-black text-slate-900">Create Tenant</DialogTitle>
            <DialogDescription className="font-medium text-slate-500">Register a new organization workspace to the platform.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider pl-1">Organization Name</label>
              <Input 
                placeholder="e.g. Acme Restaurants" 
                value={newOrg.name}
                className="h-12 rounded-2xl border-slate-200 focus:ring-teal-500/10 focus:border-teal-500 font-medium"
                onChange={e => {
                  const name = e.target.value;
                  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
                  setNewOrg({ name, slug });
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider pl-1">URL Identifier (Slug)</label>
              <Input 
                placeholder="acme-restaurants" 
                className="h-12 rounded-2xl border-slate-200 focus:ring-teal-500/10 focus:border-teal-500 font-medium"
                value={newOrg.slug}
                onChange={e => setNewOrg({ ...newOrg, slug: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button variant="ghost" onClick={() => setIsNewOrgOpen(false)} className="rounded-xl font-bold">Cancel</Button>
            <Button 
              disabled={!newOrg.name || !newOrg.slug || createOrg.isPending}
              onClick={() => createOrg.mutate(newOrg)}
              className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold px-6 shadow-md"
            >
              {createOrg.isPending ? 'Deploying...' : 'Create Tenant'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOrgOpen} onOpenChange={setInviteOrgOpen}>
        <DialogContent className="rounded-[32px] p-8">
          <DialogHeader className="space-y-3 pb-2">
            <DialogTitle className="text-xl font-black text-slate-900">Invite Organization Owner</DialogTitle>
            <DialogDescription className="font-medium text-slate-500">
              Generate an invite link for an administrator at <strong>{selectedOrg?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider pl-1">Owner Email Address</label>
              <Input 
                placeholder="admin@customer.com"
                type="email"
                value={inviteEmail}
                className="h-12 rounded-2xl font-medium"
                onChange={e => setInviteEmail(e.target.value)}
              />
            </div>
            
            {inviteLink && (
              <div className="pt-4 space-y-3">
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 animate-in zoom-in-95">
                  <p className="text-xs font-bold text-emerald-900 mb-2">Invitation Link Generated!</p>
                  <div className="flex gap-2">
                    <Input value={inviteLink} readOnly className="text-xs font-medium bg-white h-10 border-emerald-200 focus-visible:ring-emerald-500" />
                    <Button 
                      className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                      onClick={() => copyInviteLink(inviteLink, setCopied)}
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviteOrgOpen(false)} className="rounded-xl font-bold">Close</Button>
            <Button 
              disabled={!inviteEmail || inviting}
              onClick={handleInviteOrgOwner}
              className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold shadow-md"
            >
              {inviting ? 'Generating...' : (inviteLink ? 'Regenerate Link' : 'Generate Secure Link')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit Dialog */}
      <Dialog open={editOrgOpen} onOpenChange={setEditOrgOpen}>
        <DialogContent className="rounded-[32px] p-8">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-xl font-black text-slate-900">Edit Organization Profile</DialogTitle>
            <DialogDescription className="font-medium text-slate-500">Update the name and URL slug for {selectedOrg?.name}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider pl-1">Organization Name</label>
              <Input 
                value={editFormData.name}
                className="h-12 rounded-2xl font-medium"
                onChange={e => setEditFormData({ ...editFormData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider pl-1">Slug</label>
              <Input 
                value={editFormData.slug}
                className="h-12 rounded-2xl font-medium text-slate-500"
                onChange={e => setEditFormData({ ...editFormData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-') })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl font-bold" onClick={() => setEditOrgOpen(false)}>Cancel</Button>
            <Button 
              disabled={!editFormData.name || !editFormData.slug || updateOrg.isPending}
              onClick={() => updateOrg.mutate(editFormData)}
              className="bg-teal-600 hover:bg-teal-700 rounded-xl font-bold shadow-md"
            >
              {updateOrg.isPending ? 'Saving...' : 'Commit Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Billing Dialog */}
      <Dialog open={billingOrgOpen} onOpenChange={setBillingOrgOpen}>
        <DialogContent className="rounded-[32px] p-8">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-xl font-black text-slate-900">Subscription Control</DialogTitle>
            <DialogDescription className="font-medium text-slate-500">Force an override on the billing status for {selectedOrg?.name}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider pl-1">Internal Status</label>
              <Select value={billingFormData.subscription_status} onValueChange={(val) => setBillingFormData({ ...billingFormData, subscription_status: val })}>
                <SelectTrigger className="h-12 rounded-2xl font-medium capitalize">
                  <SelectValue placeholder="Select Status" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  <SelectItem value="trialing">Trialing</SelectItem>
                  <SelectItem value="active" className="text-emerald-700 font-bold">Active</SelectItem>
                  <SelectItem value="past_due" className="text-amber-700 font-bold">Past Due</SelectItem>
                  <SelectItem value="canceled">Canceled</SelectItem>
                  <SelectItem value="suspended" className="text-red-700 font-bold">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider pl-1">Pricing Tier</label>
              <Select value={billingFormData.subscription_plan} onValueChange={(val) => setBillingFormData({ ...billingFormData, subscription_plan: val })}>
                <SelectTrigger className="h-12 rounded-2xl font-medium capitalize">
                  <SelectValue placeholder="Select Plan" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  <SelectItem value="free">Free / Sandbox</SelectItem>
                  <SelectItem value="pro">Pro Edition</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl font-bold" onClick={() => setBillingOrgOpen(false)}>Cancel</Button>
            <Button 
              disabled={updateBilling.isPending}
              onClick={() => updateBilling.mutate(billingFormData)}
              className="bg-teal-600 hover:bg-teal-700 rounded-xl font-bold shadow-md"
            >
              {updateBilling.isPending ? 'Syncing...' : 'Update Billing'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Platform Admin Invite Dialog */}
      <Dialog open={showPlatformInviteModal} onOpenChange={setShowPlatformInviteModal}>
        <DialogContent className="rounded-[32px] p-8 border-amber-200/50 shadow-2xl shadow-amber-500/10">
          <DialogHeader className="space-y-3 pb-2">
            <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center mb-2 shadow-inner border border-amber-200">
              <Shield className="w-6 h-6 text-amber-600" />
            </div>
            <DialogTitle className="text-xl font-black text-slate-900">Grant Super Admin Rights</DialogTitle>
            <DialogDescription className="font-medium text-slate-500">
              <span className="text-amber-600 font-bold flex items-center mb-1"><AlertCircle className="w-3.5 h-3.5 mr-1" /> EXTREME CAUTION</span>
              You are generating an invite for a platform-level administrator. This user will have unrestricted access to all tenant data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider pl-1">Admin Email Address</label>
              <Input 
                placeholder="architect@platform.com"
                type="email"
                value={platformInviteEmail}
                className="h-12 rounded-2xl font-medium focus-visible:ring-amber-500 border-slate-200"
                onChange={e => setPlatformInviteEmail(e.target.value)}
              />
            </div>
            
            {platformCopiedLink && (
              <div className="pt-4 space-y-3 fade-in">
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 shadow-inner">
                  <p className="text-xs font-bold text-amber-900 mb-2">Immutable Link Generated</p>
                  <div className="flex gap-2">
                    <Input value={platformCopiedLink} readOnly className="text-xs font-medium bg-white h-10 border-amber-200 focus-visible:ring-amber-500" />
                    <Button 
                      className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
                      onClick={() => copyInviteLink(platformCopiedLink, setCopied)}
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowPlatformInviteModal(false)} className="rounded-xl font-bold">Abort</Button>
            <Button 
              disabled={!platformInviteEmail || platformInviting}
              onClick={handleInvitePlatformAdmin}
              className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-xl shadow-slate-200"
            >
              {platformInviting ? 'Authorizing...' : (platformCopiedLink ? 'Mint New Token' : 'Authorize & Generate Link')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend Alert */}
      <AlertDialog open={suspendAlertOpen} onOpenChange={setSuspendAlertOpen}>
        <AlertDialogContent className="rounded-[32px] p-8">
          <AlertDialogHeader className="space-y-3">
            <AlertDialogTitle className="text-2xl font-black text-slate-900">Halt Organization Access?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm font-medium text-slate-500 leading-relaxed">
              This will suspend the tenant <strong>{selectedOrg?.name}</strong>. Their users will immediately encounter permission errors and their backend operations will be paused.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel className="rounded-xl font-bold">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-red-600 hover:bg-red-700 text-white shadow-xl shadow-red-500/20 rounded-xl font-bold"
              onClick={() => suspendOrg.mutate()}
            >
              {suspendOrg.isPending ? 'Halting...' : 'Halt Tenant Access'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
