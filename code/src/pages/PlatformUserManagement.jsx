import React, { useState } from "react";
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

  // ── Platform Admins Query ──────────────────────────────────
  const { data: platformAdmins = [], isLoading: isLoadingAdmins } = useAuthQuery({
    queryKey: ['platform-admins'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, role, created_at, last_sign_in_at")
        .in("role", ["platform_admin", "admin"])
        .is("deleted_at", null);
      if (error) throw error;
      return (data || []).map(p => ({
        membership_id: p.id,
        user_id: p.id,
        email: p.email || "—",
        full_name: p.full_name || "—",
        role: p.role,
        created_at: p.created_at,
        last_sign_in_at: p.last_sign_in_at,
      }));
    },
    enabled: authChecked,
  });

  // ── Pending Invitations Query ──────────────────────────────
  const { data: pendingInvites = [], isLoading: isLoadingInvites } = useAuthQuery({
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

  // ── Invite Platform Admin ──────────────────────────────────
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

  // Filter admins by search
  const filteredAdmins = platformAdmins.filter(admin => {
    if (!searchQuery) return true;
    const term = searchQuery.toLowerCase();
    return (
      admin.full_name?.toLowerCase().includes(term) ||
      admin.email?.toLowerCase().includes(term)
    );
  });

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
        <p className="text-slate-500 max-w-md">Platform User Management is restricted to platform administrators only.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Platform User Management</h1>
            <p className="text-sm text-slate-500">Manage platform administrators and their access</p>
          </div>
        </div>
        <Button onClick={() => setShowPlatformInviteModal(true)} className="bg-blue-600 hover:bg-blue-700">
          <UserPlus className="w-4 h-4 mr-2" /> Invite Admin
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase">Total Admins</p>
                <p className="text-2xl font-bold mt-1">{platformAdmins.length}</p>
                <p className="text-[10px] text-blue-500 mt-0.5">Active administrators</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <UserCheck className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase">Pending Invites</p>
                <p className="text-2xl font-bold mt-1">{pendingInvites.length}</p>
                <p className="text-[10px] text-amber-500 mt-0.5">Awaiting signup</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase">Platform Role</p>
                <p className="text-2xl font-bold mt-1">Admin</p>
                <p className="text-[10px] text-indigo-500 mt-0.5">Full platform access</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                <Shield className="h-5 w-5 text-indigo-600" />
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
            <p className="text-xs text-slate-400">Users with full administrative access to the platform.</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
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
              <TableRow className="bg-slate-50">
                <TableHead className="text-[11px]">NAME</TableHead>
                <TableHead className="text-[11px]">EMAIL</TableHead>
                <TableHead className="text-[11px]">ROLE</TableHead>
                <TableHead className="text-[11px]">JOINED</TableHead>
                <TableHead className="text-[11px]">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingAdmins ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" /></TableCell></TableRow>
              ) : filteredAdmins.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-sm text-slate-400">No platform admins found</TableCell></TableRow>
              ) : filteredAdmins.map(admin => (
                <TableRow key={admin.membership_id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">
                        {admin.full_name?.substring(0, 2).toUpperCase() || '??'}
                      </div>
                      <span className="font-medium text-sm">{admin.full_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">{admin.email}</TableCell>
                  <TableCell>
                    <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 border-none text-[10px]">Platform Admin</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-slate-400">
                    {admin.created_at ? new Date(admin.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50" disabled={admin.user_id === user?.id} onClick={async () => {
                      if (!window.confirm(`Remove ${admin.email} from platform admins?`)) return;
                      try {
                        const { error } = await supabase.from("profiles").update({ status: 'archived', deleted_at: new Date().toISOString() }).eq("id", admin.user_id);
                        if (error) throw error;
                        queryClient.invalidateQueries({ queryKey: ['platform-admins'] });
                        toast.success("Admin removed");
                      } catch (e) { console.error(e); toast.error("Failed to remove admin"); }
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

      {/* Pending Invitations */}
      {pendingInvites.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4 text-amber-500" />
              Pending Admin Invitations
            </CardTitle>
            <p className="text-xs text-slate-400">{pendingInvites.length} invitation{pendingInvites.length !== 1 ? 's' : ''} awaiting acceptance</p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-[11px]">EMAIL</TableHead>
                  <TableHead className="text-[11px]">INVITED</TableHead>
                  <TableHead className="text-[11px]">EXPIRES</TableHead>
                  <TableHead className="text-[11px]">STATUS</TableHead>
                  <TableHead className="text-[11px]">ACTIONS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingInvites ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-6"><Loader2 className="w-4 h-4 animate-spin mx-auto text-slate-400" /></TableCell></TableRow>
                ) : pendingInvites.map(invite => {
                  const isExpired = new Date(invite.expires_at) < new Date();
                  return (
                    <TableRow key={invite.id}>
                      <TableCell className="text-sm font-medium">{invite.email}</TableCell>
                      <TableCell className="text-xs text-slate-400">
                        {invite.created_at ? new Date(invite.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">
                        {invite.expires_at ? new Date(invite.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge className={isExpired ? 'bg-red-100 text-red-700 text-[10px]' : 'bg-amber-100 text-amber-700 text-[10px]'}>
                          {isExpired ? 'Expired' : 'Pending'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={async () => {
                            if (!window.confirm(`Delete invitation for ${invite.email}?`)) return;
                            await supabase.from('invitations').delete().eq('id', invite.id);
                            queryClient.invalidateQueries({ queryKey: ['platform-admin-invites'] });
                            toast.success('Invitation deleted');
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

      {/* Generated Invite Link Dialog */}
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
              <Label htmlFor="invite-link-pum" className="sr-only">Link</Label>
              <Input
                id="invite-link-pum"
                readOnly
                value={generatedInviteLink}
                className="font-mono text-[10px] bg-slate-50 text-slate-800 border-slate-200"
              />
            </div>
            <Button
              size="sm"
              className="px-3 bg-teal-600 hover:bg-teal-700 text-white"
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
    </div>
  );
}
