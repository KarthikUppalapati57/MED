import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Shield, Users, Search, Loader2, X, Copy, Mail, UserPlus, UserCheck, Clock } from "lucide-react";
import { toast } from "sonner";

export default function PlatformUserManagement() {
  const { user, role: userRole } = useAuth();
  const queryClient = useQueryClient();
  const authChecked = !!user;

  // Platform Admin Invite State
  const [showPlatformInviteModal, setShowPlatformInviteModal] = useState(false);
  const [platformInviteEmail, setPlatformInviteEmail] = useState("");
  const [platformInviting, setPlatformInviting] = useState(false);
  const [generatedInviteLink, setGeneratedInviteLink] = useState("");
  const [isInviteLinkDialogOpen, setIsInviteLinkDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Confirmation State
  const [confirmDeleteAdmin, setConfirmDeleteAdmin] = useState(null);

  // -- Realtime subscription for platform users --
  useEffect(() => {
    const channel = supabase.channel('platform-users-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        queryClient.invalidateQueries({ queryKey: ['platform-admins'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invitations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['platform-admin-invites'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // â”€â”€ Platform Admins Query â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const { data: platformAdmins = [], isLoading: isLoadingAdmins, error: adminQueryError } = useAuthQuery({
    queryKey: ['platform-admins'],
    queryFn: async () => {
      console.log("[DEBUG PUM] platform-admins queryFn started");
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, email, full_name, role, created_at, updated_at")
          .eq("role", "platform_admin");
        console.log("[DEBUG PUM] platform-admins queryFn fetched:", { data, error });
        if (error) {
          console.error("[DEBUG PUM] DB error in platform-admins:", error);
          throw error;
        }
        return (data || []).map(p => ({
          membership_id: p.id,
          user_id: p.id,
          email: p.email || "â€”",
          full_name: p.full_name || "â€”",
          role: p.role,
          created_at: p.created_at,
          last_sign_in_at: p.updated_at,
        }));
      } catch (err) {
        console.error("[DEBUG PUM] queryFn exception:", err);
        throw err;
      }
    },
    enabled: authChecked,
  });

  useEffect(() => {
    if (adminQueryError) {
      console.error("[DEBUG PUM] platform-admins query error state:", adminQueryError);
    }
  }, [adminQueryError]);

  // ── Pending Invitations Query ─────────────────────────
  const { data: pendingInvitesRaw = [], isLoading: isLoadingInvites } = useAuthQuery({
    queryKey: ['platform-admin-invites'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("*")
        .eq("role", "platform_admin")
        .is("accepted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked,
  });

  const pendingInvites = React.useMemo(() => {
    return pendingInvitesRaw.filter(invite => 
      !platformAdmins.some(admin => admin.email?.toLowerCase() === invite.email?.toLowerCase())
    );
  }, [pendingInvitesRaw, platformAdmins]);

  // ── Invite Platform Admin ──────────────────────────────────────────
  const handleInvitePlatformAdmin = async () => {
    if (!platformInviteEmail) return;
    setPlatformInviting(true);
    try {
      const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const { data: userCurrent } = await supabase.auth.getUser();
      const { error: insertErr } = await supabase
        .from("invitations")
        .insert([{
          email: platformInviteEmail,
          token,
          role: "platform_admin",
          access_level: "platform",
          invited_by: userCurrent?.user?.id,
          expires_at: expiresAt.toISOString(),
        }]);

      if (insertErr) throw insertErr;

      const link = `${window.location.origin}/signup/${token}`;
      setGeneratedInviteLink(link);
      setShowPlatformInviteModal(false);
      setIsInviteLinkDialogOpen(true);
      setPlatformInviteEmail("");
      queryClient.invalidateQueries({ queryKey: ['platform-admins'] });
      queryClient.invalidateQueries({ queryKey: ['platform-admin-invites'] });
      toast.success("Platform admin invitation generated!");
    } catch (e) {
      console.error('Invite error:', e);
      toast.error(e.message || "Failed to invite platform admin");
    }
    setPlatformInviting(false);
  };

  const handleRemoveAdmin = async (adminId) => {
    setConfirmDeleteAdmin(null);
    const toastId = toast.loading("Removing admin access...");
    
    await queryClient.cancelQueries({ queryKey: ['platform-admins'] });
    const previousAdmins = queryClient.getQueryData(['platform-admins']);
    queryClient.setQueryData(['platform-admins'], old => 
      old ? old.filter(a => a.user_id !== adminId) : []
    );

    try {
      const { error } = await supabase.rpc('admin_delete_user', { target_user_id: adminId });
      if (error) throw error;
      
      toast.success("Admin removed", { id: toastId });
      queryClient.invalidateQueries({ queryKey: ['platform-admins'] });
    } catch (e) { 
      if (previousAdmins) queryClient.setQueryData(['platform-admins'], previousAdmins);
      console.error(e); 
      toast.error("Failed to remove admin", { id: toastId }); 
    }
  };

  // Filter admins by search
  const filteredAdmins = React.useMemo(() => {
    if (!searchQuery) return platformAdmins;
    const term = searchQuery.toLowerCase();
    return platformAdmins.filter(admin => {
      return (
        admin.full_name?.toLowerCase().includes(term) ||
        admin.email?.toLowerCase().includes(term)
      );
    });
  }, [platformAdmins, searchQuery]);

  // â”€â”€ Guards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (!authChecked) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || userRole !== 'platform_admin') {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center px-4">
        <div className="w-16 h-16 bg-resend-red/10 rounded-2xl flex items-center justify-center mb-4">
          <Shield className="w-8 h-8 text-resend-red" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Access Denied</h2>
        <p className="text-muted-foreground max-w-md">Platform User Management is restricted to platform administrators only.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Platform User Management</h1>
            <p className="text-sm text-muted-foreground">Manage platform administrators and their access</p>
          </div>
        </div>
        <Button onClick={() => setShowPlatformInviteModal(true)} className="bg-resend-blue hover:bg-blue-700">
          <UserPlus className="w-4 h-4 mr-2" /> Invite Admin
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">Total Admins</p>
                <p className="text-2xl font-bold mt-1">{platformAdmins.length}</p>
                <p className="text-[10px] text-resend-blue mt-0.5">Active administrators</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-resend-blue/10 flex items-center justify-center">
                <UserCheck className="h-5 w-5 text-resend-blue" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">Pending Invites</p>
                <p className="text-2xl font-bold mt-1">{pendingInvites.length}</p>
                <p className="text-[10px] text-resend-yellow mt-0.5">Awaiting signup</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-resend-yellow/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-resend-yellow" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">Platform Role</p>
                <p className="text-2xl font-bold mt-1">Admin</p>
                <p className="text-[10px] text-indigo-400 mt-0.5">Full platform access</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-indigo-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Platform Administrators Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-base">Platform Administrators</CardTitle>
            <p className="text-xs text-muted-foreground">Users with full administrative access to the platform.</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search admins..."
              className="pl-9 w-56 h-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary">
                <TableHead className="text-[11px]">NAME</TableHead>
                <TableHead className="text-[11px]">EMAIL</TableHead>
                <TableHead className="text-[11px]">ROLE</TableHead>
                <TableHead className="text-[11px]">JOINED</TableHead>
                <TableHead className="text-[11px]">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingAdmins ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              ) : filteredAdmins.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">No platform admins found</TableCell></TableRow>
              ) : filteredAdmins.map(admin => (
                <TableRow key={admin.membership_id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-xs font-bold text-indigo-400">
                        {admin.full_name?.substring(0, 2).toUpperCase() || '??'}
                      </div>
                      <span className="font-medium text-sm">{admin.full_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{admin.email}</TableCell>
                  <TableCell>
                    <Badge className="bg-purple-500/50/10 text-purple-400 hover:bg-purple-500/50/10 border-none text-[10px]">Platform Admin</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {admin.created_at ? new Date(admin.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'â€”'}
                  </TableCell>
                  <TableCell>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-7 w-7 p-0 text-resend-red hover:text-resend-red hover:bg-resend-red/5" 
                      disabled={admin.user_id === user?.id} 
                      onClick={() => setConfirmDeleteAdmin(admin)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {pendingInvites.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4 text-resend-yellow" />
              Pending Admin Invitations
            </CardTitle>
            <p className="text-xs text-muted-foreground">{pendingInvites.length} invitation{pendingInvites.length !== 1 ? 's' : ''} awaiting acceptance</p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary">
                  <TableHead className="text-[11px]">EMAIL</TableHead>
                  <TableHead className="text-[11px]">INVITED</TableHead>
                  <TableHead className="text-[11px]">EXPIRES</TableHead>
                  <TableHead className="text-[11px]">STATUS</TableHead>
                  <TableHead className="text-[11px]">ACTIONS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingInvites ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-6"><Loader2 className="w-4 h-4 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : pendingInvites.map(invite => {
                  const isExpired = new Date(invite.expires_at) < new Date();
                  return (
                    <TableRow key={invite.id}>
                      <TableCell className="text-sm font-medium">{invite.email}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {invite.created_at ? new Date(invite.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'â€”'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {invite.expires_at ? new Date(invite.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'â€”'}
                      </TableCell>
                      <TableCell>
                        <Badge className={isExpired ? 'bg-resend-red/10 text-resend-red text-[10px]' : 'bg-resend-yellow/10 text-resend-yellow text-[10px]'}>
                          {isExpired ? 'Expired' : 'Pending'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-7 px-2 text-resend-red hover:text-resend-red hover:bg-resend-red/5"
                          onClick={async () => {
                            if (!window.confirm(`Delete invitation for ${invite.email}?`)) return;
                            
                            await queryClient.cancelQueries({ queryKey: ['platform-admin-invites'] });
                            const prev = queryClient.getQueryData(['platform-admin-invites']);
                            queryClient.setQueryData(['platform-admin-invites'], old => old ? old.filter(i => i.id !== invite.id) : []);

                            try {
                              await supabase.from('invitations').delete().eq('id', invite.id);
                              toast.success('Invitation deleted');
                              queryClient.invalidateQueries({ queryKey: ['platform-admin-invites'] });
                            } catch (e) {
                              if (prev) queryClient.setQueryData(['platform-admin-invites'], prev);
                              toast.error('Failed to delete invitation');
                            }
                          }}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Invite Platform Admin Modal */}
      <Dialog open={showPlatformInviteModal} onOpenChange={setShowPlatformInviteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Platform Administrator</DialogTitle>
            <DialogDescription>Grant platform-wide admin access to a new user.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-semibold text-foreground">Email Address</Label>
              <Input type="email" placeholder="admin@company.com" value={platformInviteEmail} onChange={e => setPlatformInviteEmail(e.target.value)} className="mt-1" />
            </div>
            <p className="text-xs text-resend-yellow font-medium">
              Warning: This user will have unrestricted access to all organizations, users, and platform settings.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPlatformInviteModal(false)}>Cancel</Button>
            <Button onClick={handleInvitePlatformAdmin} disabled={platformInviting || !platformInviteEmail} className="bg-resend-blue hover:bg-blue-700">
              {platformInviting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Invite Admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generated Invite Link Dialog */}
      <Dialog open={isInviteLinkDialogOpen} onOpenChange={setIsInviteLinkDialogOpen}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle>Invitation Link Generated</DialogTitle>
            <DialogDescription>
              Copy the link below and send it to the user. This link will expire in 7 days.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center space-x-2 mt-4">
            <div className="grid flex-1 gap-2">
              <Label htmlFor="invite-link-pum" className="sr-only">Link</Label>
              <Input
                id="invite-link-pum"
                readOnly
                value={generatedInviteLink}
                className="font-mono text-[10px] bg-secondary text-foreground border-border"
              />
            </div>
            <Button
              size="sm"
              className="px-3 bg-primary hover:bg-primary text-white"
              onClick={() => {
                navigator.clipboard.writeText(generatedInviteLink);
                toast.success('Link copied to clipboard');
              }}
            >
              <span className="sr-only">Copy</span>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter className="sm:justify-start pt-4 border-t mt-4">
            <Button type="button" variant="secondary" onClick={() => setIsInviteLinkDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!confirmDeleteAdmin} onOpenChange={() => setConfirmDeleteAdmin(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Admin Access</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove admin access for {confirmDeleteAdmin?.full_name || confirmDeleteAdmin?.email}? 
              This will revoke their access to the Platform Admin Console.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDeleteAdmin(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleRemoveAdmin(confirmDeleteAdmin?.user_id)}>Remove Access</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

