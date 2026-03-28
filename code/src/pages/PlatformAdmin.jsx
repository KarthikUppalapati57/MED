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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Shield, Users, Search, Download, CheckCircle2, X, Loader2, Package, Trash2, Mail, Copy, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ALL_MODULE_KEYS, MODULE_DEFINITIONS } from "@/lib/moduleConfig";

export default function SuperAdmin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedModules, setSelectedModules] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [processingRequests, setProcessingRequests] = useState(new Set());
  const [selectedRequests, setSelectedRequests] = useState(new Set());
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("access");
  
  // Platform Admin Invite State
  const [showPlatformInviteModal, setShowPlatformInviteModal] = useState(false);
  const [platformInviteEmail, setPlatformInviteEmail] = useState("");
  const [platformInviting, setPlatformInviting] = useState(false);
  const [platformCopiedLink, setPlatformCopiedLink] = useState('');
  
  const [editingOrgModules, setEditingOrgModules] = useState(null);
  const authChecked = !!user || true;

  const { data: platformAdmins = [], isLoading: isLoadingAdmins } = useQuery({
    queryKey: ['platform-admins'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, role")
        .eq("role", "platform_admin");
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked,
  });

  const copyInviteLink = async (link, setCopyState) => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopyState(true);
    setTimeout(() => setCopyState(false), 2000);
    import("sonner").then(({ toast }) => toast.success('Link copied to clipboard'));
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
        
        const { toast } = await import("sonner");
        toast.success("Platform admin invited successfully!");
        queryClient.invalidateQueries({ queryKey: ['platform-admins'] });
      }
    } catch(e) {
      console.error('Invite error:', e);
      const { toast } = await import("sonner");
      toast.error(e.message || "Failed to invite platform admin");
    }
    setPlatformInviting(false);
  };

  const handleInviteClient = async () => {
    if (!inviteEmail) return;
    setInviting(true);
    try {
      const { data: userCurrent } = await supabase.auth.getUser();
      const { data: invite, error } = await supabase
        .from('invitations')
        .insert([{
          email: inviteEmail,
          role: 'owner',
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
        
        const { toast } = await import("sonner");
        toast.success("Invitation generated and copied to clipboard!");
        setInviteSuccess(true);
      }
    } catch(e) { 
      console.error('Invite error:', e);
      const { toast } = await import("sonner");
      toast.error(e.message || "Failed to send invitation");
    }
    setInviting(false);
  };

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
    enabled: authChecked && (user?.role === 'admin' || user?.role === 'platform_admin'),
    refetchOnWindowFocus: false,
  });

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
    enabled: authChecked && (user?.role === 'admin' || user?.role === 'platform_admin'),
    refetchOnWindowFocus: false,
  });

  // Fetch demo requests from the dedicated table — completely independent
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
    enabled: authChecked && (user?.role === 'admin' || user?.role === 'platform_admin'),
    refetchOnWindowFocus: false,
  });

  const { data: orgs = [] } = useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('*, profiles!owner_id(email)')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data.map(org => ({
        ...org,
        // Helper to get the primary admin email
        admin_email: org.profiles?.email || "—"
      }));
    },
    enabled: authChecked && (user?.role === 'admin' || user?.role === 'platform_admin'),
  });

  // Simulate edge function logic safely via DB
  const updateRequest = useMutation({
    mutationFn: async ({ id, approved }) => {
      const updateData = {
         status: approved ? 'approved' : 'rejected',
         updated_at: new Date().toISOString()
      };
      const { error } = await supabase.from('access_requests').update(updateData).eq('id', id);
      if (error) throw new Error(error.message);
      
      if (approved) {
        import("sonner").then(({ toast }) => toast.info("Request approved! In MEVS, user accounts must be linked manually via invitations instead of auto-provisioning for security."));
      }
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
          const msg = error.message || 'Action failed';
          toast.error(msg);
        });
      }
      queryClient.invalidateQueries({ queryKey: ['access-requests'] });
    },
  });

  // Revoke action: sets approved user back to pending_approval
  const revokeRequest = useMutation({
    mutationFn: async ({ id, email }) => {
      // Update access_request status
      const { error: reqError } = await supabase
        .from('access_requests')
        .update({ status: 'pending_approval', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (reqError) throw reqError;
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

  const handleBulkDelete = () => {
    if (selectedRequests.size === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedRequests.size} requests?`)) {
      setProcessingRequests(prev => new Set([...prev, ...selectedRequests]));
      Promise.all(Array.from(selectedRequests).map(id => supabase.from('access_requests').delete().eq('id', id)))
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

  const accessReqs   = requests.filter(r => r.request_type !== 'demo');
  const contactReqs  = contactRequests;

  const pendingAccessCount = accessReqs.filter(r => r.status === 'pending_approval').length;
  const pendingContactCount = contactReqs.filter(r => r.status === 'pending_approval').length;
  const pendingOrgCount = orgs.filter(o => ['under_review', 'pending_approval', 'onboarding'].includes(o.status)).length;
  const pendingCount = pendingAccessCount + pendingContactCount + pendingOrgCount;

  if (!authChecked) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!user || (user.role !== "admin" && user.role !== "platform_admin")) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center px-4">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mb-4">
          <Shield className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h2>
        <p className="text-slate-500 max-w-md">The SuperAdmin Console is restricted to platform administrators only. If you believe this is an error, contact your system administrator.</p>
      </div>
    );
  }

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
              <TableHead className="text-[11px]">PORTFOLIOS</TableHead>
              <TableHead className="text-[11px]">PLAN</TableHead>
              <TableHead className="text-[11px]">BILLING</TableHead>
              <TableHead className="text-[11px]">TYPE</TableHead>
              <TableHead className="text-[11px]">SUBMITTED</TableHead>
              <TableHead className="text-[11px]">STATUS</TableHead>
              <TableHead className="text-[11px]">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : list.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center py-8 text-slate-400">No requests</TableCell></TableRow>
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
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold">{(r.full_name || r.email || "?").substring(0, 2).toUpperCase()}</div>
                      <div><p className="text-sm font-medium">{r.full_name || "Unknown"}</p><p className="text-xs text-slate-400">{r.email}</p></div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{r.company_name || "—"}</TableCell>
                  <TableCell className="text-sm text-slate-500">{r.phone || '—'}</TableCell>
                  <TableCell className="text-sm">{r.portfolios || r.properties_count || '—'}</TableCell>
                  <TableCell className="text-sm">
                    {r.plan ? <Badge variant="outline" className="text-[10px] capitalize bg-blue-50 text-blue-700 border-blue-100">{r.plan}</Badge> : '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.billing_cycle ? <Badge variant="outline" className="text-[10px] capitalize bg-slate-50 text-slate-700 border-slate-200">{r.billing_cycle}</Badge> : '—'}
                  </TableCell>
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
                      {/* Demo & Contact — View Details only */}
                      {(r.request_type === 'contact' || r.request_type === 'demo') ? (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline" className="text-xs h-7 text-blue-600 border-blue-200 hover:bg-blue-50">
                              <Mail className="w-3 h-3 mr-1" />
                              Details
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg">
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                              {r.request_type === 'demo' ? '🎥' : (r.message ? '✉️' : '⚡')} {r.full_name || r.email}
                            </DialogTitle>
                          </DialogHeader>
                            <div className="space-y-4 py-2">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label className="text-xs text-slate-500">Email</Label>
                                  <p className="font-medium text-sm">{r.email}</p>
                                </div>
                                <div>
                                  <Label className="text-xs text-slate-500">Company</Label>
                                  <p className="font-medium text-sm">{r.company_name || '—'}</p>
                                </div>
                                {r.phone && (
                                  <div>
                                    <Label className="text-xs text-slate-500">Phone</Label>
                                    <p className="font-medium text-sm">{r.phone}</p>
                                  </div>
                                )}
                                {r.department && (
                                  <div>
                                    <Label className="text-xs text-slate-500">Department</Label>
                                    <p className="font-medium text-sm capitalize">{r.department}</p>
                                  </div>
                                )}
                                {r.plan && (
                                  <div>
                                    <Label className="text-xs text-slate-500">Plan</Label>
                                    <p className="font-medium text-sm capitalize">{r.plan}</p>
                                  </div>
                                )}
                                {r.request_type === 'demo' && (
                                  <div>
                                    <Label className="text-xs text-slate-500">Demo Viewed</Label>
                                    <p className={`font-semibold text-sm ${r.demo_viewed ? 'text-emerald-600' : 'text-slate-500'}`}>
                                      {r.demo_viewed ? '✓ Watched' : 'Not yet'}
                                    </p>
                                  </div>
                                )}
                                <div>
                                  <Label className="text-xs text-slate-500">Submitted</Label>
                                  <p className="font-medium text-sm">
                                    {r.created_at ? new Date(r.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                                  </p>
                                </div>
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
                        /* Access requests — keep Approve / Reject / Revoke */
                        <>
                          {r.status !== 'approved' && (
                            <Button 
                              size="sm" 
                              className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white border-none"
                              disabled={processingRequests.has(r.id)}
                              onClick={(e) => {
                                e.stopPropagation();
                                updateRequest.mutate({ id: r.id, approved: true });
                              }}>
                              {processingRequests.has(r.id) ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                              Approve
                            </Button>
                          )}
                          {r.status !== 'rejected' && r.status !== 'approved' && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="text-xs h-7 text-red-600 border-red-200 hover:bg-red-50"
                              disabled={processingRequests.has(r.id)}
                              onClick={(e) => {
                                e.stopPropagation();
                                updateRequest.mutate({ id: r.id, approved: false });
                              }}>
                              {processingRequests.has(r.id) ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <X className="w-3 h-3 mr-1" />}
                              Reject
                            </Button>
                          )}
                          {r.status === 'approved' && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="text-xs h-7 text-amber-600 border-amber-200 hover:bg-amber-50"
                              disabled={processingRequests.has(r.id)}
                              onClick={(e) => {
                                e.stopPropagation();
                                revokeRequest.mutate({ id: r.id, email: r.email });
                              }}>
                              {processingRequests.has(r.id) ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Shield className="w-3 h-3 mr-1" />}
                              Revoke
                            </Button>
                          )}
                        </>
                      )}
                      <Button 
                        size="sm" 
                        variant="ghost"
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center"><Shield className="w-5 h-5 text-amber-600" /></div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">SuperAdmin Console</h1>
              {pendingCount > 0 && <Badge className="bg-amber-100 text-amber-700">{pendingCount} pending approval</Badge>}
            </div>
            <p className="text-sm text-slate-500">Platform-wide management · CRE Admin Version · MEVS Deployment</p>
          </div>
        </div>
        <div className="flex gap-2">
          {/* Main Invitation entrypoint (similar to New Organization but purely via email) */}
          <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700"><Users className="w-4 h-4 mr-2" />Invite Client</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Invite Client / Tenant Admin</DialogTitle>
                <DialogDescription>
                  Generate a secure platform invitation token for a new tenant administrator.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Administrator Email Address</label>
                  <Input 
                    placeholder="admin@customer.com"
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                  />
                </div>
                
                {inviteLink && (
                  <div className="pt-4 border-t space-y-3">
                    <label className="text-xs font-semibold uppercase tracking-wider text-green-600">Secure Invitation Link</label>
                    <div className="flex gap-0">
                      <Input 
                        value={inviteLink} 
                        readOnly 
                        className="text-sm bg-slate-50 h-10 rounded-r-none border-r-0 focus:ring-0 focus-visible:ring-0" 
                      />
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-10 px-4 rounded-l-none border-slate-200 bg-slate-50 hover:bg-slate-100"
                        onClick={() => copyInviteLink(inviteLink, setCopied)}
                      >
                        {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-slate-600" />}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => { setShowInviteModal(false); setInviteLink(""); }}>Close</Button>
                <Button 
                  disabled={!inviteEmail || inviting}
                  onClick={handleInviteClient}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {inviting ? 'Generating...' : (inviteLink ? 'Regenerate Link' : 'Generate Secure Link')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-[10px] font-semibold text-slate-500 uppercase">Total Organizations</p><p className="text-2xl font-bold">{orgs.length}</p><p className="text-[10px] text-blue-500">Live deployments</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[10px] font-semibold text-slate-500 uppercase">Demo Requests</p><p className="text-2xl font-bold">{demoRequests.length}</p><p className="text-[10px] text-violet-500">{demoRequests.filter(r => r.demo_viewed).length} viewed</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-[10px] font-semibold text-slate-500 uppercase">MRR (Demo)</p><p className="text-2xl font-bold">$124,800</p><p className="text-[10px] text-emerald-500">+8.2% MoM</p></CardContent></Card>
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
          {/* Demo requests come from the dedicated demo_requests table */}
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
                    <TableHead className="text-[11px]">STATUS</TableHead>
                    <TableHead className="text-[11px]">ACTIONS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingDemo ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : demoRequests.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-400">No demo requests yet</TableCell></TableRow>
                  ) : demoRequests.map(r => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-700">{(r.full_name || r.email || "?").substring(0, 2).toUpperCase()}</div>
                          <div><p className="text-sm font-medium">{r.full_name || "Unknown"}</p><p className="text-xs text-slate-400">{r.email}</p></div>
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
                      <TableCell>
                        <Badge className="bg-emerald-50 text-emerald-700 border-none text-[10px] uppercase">{r.status || 'new'}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline" className="text-xs h-7 text-blue-600 border-blue-200 hover:bg-blue-50">
                                <Mail className="w-3 h-3 mr-1" />Details
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-lg">
                              <DialogHeader><DialogTitle className="flex items-center gap-2">🎥 {r.full_name || r.email}</DialogTitle></DialogHeader>
                              <div className="space-y-4 py-2">
                                <div className="grid grid-cols-2 gap-4">
                                  <div><Label className="text-xs text-slate-500">Email</Label><p className="font-medium text-sm">{r.email}</p></div>
                                  <div><Label className="text-xs text-slate-500">Company</Label><p className="font-medium text-sm">{r.company_name || '—'}</p></div>
                                  {r.phone && <div><Label className="text-xs text-slate-500">Phone</Label><p className="font-medium text-sm">{r.phone}</p></div>}
                                  {r.plan && <div><Label className="text-xs text-slate-500">Plan Interest</Label><p className="font-medium text-sm capitalize">{r.plan}</p></div>}
                                  <div><Label className="text-xs text-slate-500">Demo Viewed</Label><p className={`font-semibold text-sm ${r.demo_viewed ? 'text-emerald-600' : 'text-slate-500'}`}>{r.demo_viewed ? '✓ Watched' : 'Not yet'}</p></div>
                                  <div><Label className="text-xs text-slate-500">Submitted</Label><p className="font-medium text-sm">{r.created_at ? new Date(r.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</p></div>
                                </div>
                                {r.notes && <div><Label className="text-xs text-slate-500 mb-1 block">Notes</Label><p className="bg-slate-50 p-3 rounded-md text-sm border border-slate-100 whitespace-pre-wrap">{r.notes}</p></div>}
                              </div>
                            </DialogContent>
                          </Dialog>
                          <Button
                            size="sm" variant="ghost"
                            className="text-xs h-7 px-2 text-slate-400 hover:text-red-600 hover:bg-red-50"
                            onClick={async () => {
                              if (!window.confirm('Delete this demo request permanently?')) return;
                              const { error } = await supabase.from('demo_requests').delete().eq('id', r.id);
                              if (!error) {
                                queryClient.invalidateQueries({ queryKey: ['demo-requests'] });
                                import('sonner').then(({ toast }) => toast.success('Demo request deleted'));
                              }
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
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
              <Dialog open={showPlatformInviteModal} onOpenChange={setShowPlatformInviteModal}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 h-8 text-xs">
                    <Shield className="w-3 h-3 mr-2" /> Invite Admin
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite Platform Admin</DialogTitle>
                  </DialogHeader>
                  <div className="py-4 space-y-4">
                    <div className="space-y-2">
                       <Label>Admin Email</Label>
                       <Input value={platformInviteEmail} onChange={e => setPlatformInviteEmail(e.target.value)} />
                    </div>
                    {platformCopiedLink && (
                       <div className="space-y-2">
                         <Label className="text-green-600">Generated Token Link</Label>
                         <Input value={platformCopiedLink} readOnly />
                       </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setShowPlatformInviteModal(false)}>Close</Button>
                    <Button onClick={handleInvitePlatformAdmin} disabled={platformInviting || !platformInviteEmail}>Generate Token</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
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
                    <TableRow key={admin.id}>
                      <TableCell className="font-medium text-sm">{admin.full_name || "Unknown"}</TableCell>
                      <TableCell className="text-sm text-slate-500">{admin.email}</TableCell>
                      <TableCell>
                        <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 border-none text-[10px]">Super Admin</Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50" disabled={admin.id === user?.id} onClick={async () => {
                          if (!window.confirm(`Demote ${admin.email} from platform admin?`)) return;
                          try {
                            await supabase.rpc('admin_update_user_role', {
                              target_user_id: admin.id,
                              new_role: 'admin',
                              new_access_level: 'organization'
                            });
                            queryClient.invalidateQueries({ queryKey: ['platform-admins'] });
                            const { toast } = await import("sonner");
                            toast.success("Admin demoted successfully");
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
            <CardHeader>
              <CardTitle className="text-base">Organizations & Module Access</CardTitle>
              <p className="text-xs text-slate-400">Configure which modules each organization can access. Empty = all modules (admin/legacy).</p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="text-[11px]">ORGANIZATION & ADMIN</TableHead>
                    <TableHead className="text-[11px]">PLAN & AMOUNT</TableHead>
                    <TableHead className="text-[11px]">STATUS</TableHead>
                    <TableHead className="text-[11px]">SUBMITTED</TableHead>
                    <TableHead className="text-[11px]">ENABLED MODULES</TableHead>
                    <TableHead className="text-[11px]">ACTIONS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgs.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-sm text-slate-400">No organizations</TableCell></TableRow>
                  ) : [...orgs].sort((a, b) => {
                    const pendingStatuses = ['under_review', 'pending_approval', 'onboarding'];
                    const aIsPending = pendingStatuses.includes(a.status || a.subscription_status);
                    const bIsPending = pendingStatuses.includes(b.status || b.subscription_status);
                    if (aIsPending && !bIsPending) return -1;
                    if (!aIsPending && bIsPending) return 1;
                    return 0;
                  }).map(org => {
                    const isPending = ['under_review', 'pending_approval', 'onboarding'].includes(org.subscription_status || org.status);
                    const enabledCount = org.enabled_modules?.length || 0;
                    const totalCount = ALL_MODULE_KEYS.length;

                    return (
                      <TableRow key={org.id} className={isPending ? 'bg-amber-50/30' : ''}>
                        <TableCell>
                          <div className="font-medium text-sm flex items-center gap-2">
                            {org.name}
                            {isPending && <Badge variant="outline" className="text-[9px] h-4 bg-amber-100 text-amber-700 border-amber-200 uppercase">Attention</Badge>}
                          </div>
                          <div className="text-xs text-slate-500">{org.admin_email}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm capitalize">{org.subscription_plan || 'Pro'}</div>
                          <div className="text-xs text-slate-500">{org.billing_amount || '—'} {org.billing_cycle || ''}</div>
                        </TableCell>
                        <TableCell>
                          <Badge className={isPending ? 'bg-amber-100 text-amber-700 uppercase' : 'bg-emerald-100 text-emerald-700 uppercase'}>
                            {org.subscription_status || org.status || 'Active'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">
                          {new Date(org.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 px-2 text-xs text-slate-600 border border-slate-200 hover:bg-slate-50 font-medium"
                          >
                            <Package className="w-3.5 h-3.5 mr-1" />
                            {enabledCount === 0 ? 'All Enabled' : `${enabledCount} Modules`}
                          </Button>
                        </TableCell>
                        <TableCell>
                           {/* Add suspension or deletion placeholders here if needed */}
                           <Badge variant="outline">Managed</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
