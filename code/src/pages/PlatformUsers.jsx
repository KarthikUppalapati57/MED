import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthQuery, useAuthQueries } from '@/hooks/useAuthQuery';
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from "@/components/ui/button";
import { Users, Search, Loader2, ShieldAlert, Trash2, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PlatformUsers() {
  const navigate = useNavigate();
  const { user, role: userRole } = useAuth();
  const authChecked = !!user;
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (!authChecked || userRole !== 'platform_admin') return;

    const channel = supabase.channel('platform-users-dir-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        queryClient.invalidateQueries({ queryKey: ['platform-all-users'] });
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [authChecked, userRole, queryClient]);

  const handleDelete = async (userId) => {
    if (!window.confirm("Are you sure you want to permanently delete this user? This action cannot be undone.")) return;
    
    setDeletingId(userId);
    try {
      const { error } = await supabase.rpc('admin_delete_user', { target_user_id: userId });
      if (error) throw error;
      toast.success("User deleted successfully");
      queryClient.invalidateQueries({ queryKey: ['platform-all-users'] });
    } catch (err) {
      console.error("Delete user error:", err);
      toast.error(err.message || "Failed to delete user");
    } finally {
      setDeletingId(null);
    }
  };

  const results = useAuthQueries({
    queries: [
      {
        queryKey: ['platform-all-users'],
        queryFn: async () => {
          const { data, error } = await supabase
            .from("profiles")
            .select("id, email, full_name, role, created_at, updated_at, organization_id, brand_id, location_id");
          if (error) throw error;
          return data || [];
        },
        enabled: authChecked && userRole === 'platform_admin',
      },
      {
        queryKey: ['platform-orgs-lookup'],
        queryFn: async () => {
          const { data, error } = await supabase.from("organizations").select("id, name, subscription_status");
          if (error) throw error;
          return data || [];
        },
        enabled: authChecked && userRole === 'platform_admin',
      },
      {
        queryKey: ['platform-brands-lookup'],
        queryFn: async () => {
          const { data, error } = await supabase.from("brands").select("brand_id, name");
          if (error) throw error;
          return data || [];
        },
        enabled: authChecked && userRole === 'platform_admin',
      },
      {
        queryKey: ['platform-locations-lookup'],
        queryFn: async () => {
          const { data, error } = await supabase.from("locations").select("id, name");
          if (error) throw error;
          return data || [];
        },
        enabled: authChecked && userRole === 'platform_admin',
      }
    ]
  });

  const isLoadingProfiles = results[0].isLoading;
  const profiles = results[0].data || [];
  const orgs = results[1].data || [];
  const brands = results[2].data || [];
  const locations = results[3].data || [];

  const orgMap = useMemo(() => {
    return orgs.reduce((acc, org) => {
      acc[org.id] = { name: org.name, status: org.subscription_status };
      return acc;
    }, {});
  }, [orgs]);

  const brandMap = useMemo(() => {
    return brands.reduce((acc, b) => {
      acc[b.brand_id] = b.name;
      return acc;
    }, {});
  }, [brands]);

  const locationMap = useMemo(() => {
    return locations.reduce((acc, l) => {
      acc[l.id] = l.name;
      return acc;
    }, {});
  }, [locations]);

  const filteredUsers = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return profiles.filter((p) => {
      if (!term) return true;
      const matchSearch =
        p.full_name?.toLowerCase().includes(term) ||
        p.email?.toLowerCase().includes(term) ||
        orgMap[p.organization_id]?.name?.toLowerCase().includes(term);
      return matchSearch;
    });
  }, [profiles, searchQuery, orgMap]);

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
          <ShieldAlert className="w-8 h-8 text-resend-red" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Access Denied</h2>
        <p className="text-muted-foreground max-w-md">Platform Users Management is restricted to platform administrators only.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand/10 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-brand" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Platform Users</h1>
            <p className="text-sm text-muted-foreground">View all users across the entire platform</p>
          </div>
        </div>
        <Button onClick={() => navigate('/PlatformAdmin?tab=invite')} className="bg-brand hover:bg-brand/90 text-primary-foreground">
          <UserPlus className="w-4 h-4 mr-2" />
          Invite Client
        </Button>
      </div>

      {/* Users Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-base">All Registered Users</CardTitle>
            <p className="text-xs text-muted-foreground">Comprehensive list of all platform users</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              className="pl-9 w-64 h-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary">
                <TableHead className="text-[11px] font-bold">NAME</TableHead>
                <TableHead className="text-[11px] font-bold">EMAIL</TableHead>
                <TableHead className="text-[11px] font-bold">ROLE</TableHead>
                <TableHead className="text-[11px] font-bold">ORGANIZATION</TableHead>
                <TableHead className="text-[11px] font-bold">BRAND / LOCATION</TableHead>
                <TableHead className="text-[11px] font-bold">JOINED</TableHead>
                <TableHead className="text-[11px] font-bold text-right">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingProfiles ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">No users found</TableCell></TableRow>
              ) : filteredUsers.map(u => (
                <TableRow key={u.id} className="hover:bg-secondary/50 transition-colors">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {u.full_name?.substring(0, 2).toUpperCase() || '??'}
                      </div>
                      <span className="font-semibold text-sm">{u.full_name || '—'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.email || '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn(
                      "text-[10px] capitalize font-bold",
                      u.role === 'platform_admin' ? "bg-purple-500/10 text-purple-500 border-purple-200" :
                      u.role === 'org_owner' ? "bg-rose-500/10 text-rose-500 border-rose-200" : "bg-card text-muted-foreground"
                    )}>
                      {u.role?.replace('_', ' ') || 'User'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-medium text-foreground">
                    {u.organization_id ? (
                      <div className="flex flex-col">
                        <span>{orgMap[u.organization_id]?.name || <span className="text-muted-foreground text-xs italic">Loading...</span>}</span>
                        {orgMap[u.organization_id]?.status && (
                          <span className={cn(
                            "text-[10px] uppercase font-bold tracking-wider mt-0.5",
                            orgMap[u.organization_id].status === 'active' ? "text-resend-green" :
                            orgMap[u.organization_id].status === 'trialing' ? "text-resend-yellow" : "text-resend-red"
                          )}>
                            {orgMap[u.organization_id].status}
                          </span>
                        )}
                      </div>
                    ) : <span className="text-muted-foreground text-xs italic">—</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.brand_id && <Badge variant="outline" className="mr-1 bg-secondary text-[10px]">{brandMap[u.brand_id] || 'Loading Brand'}</Badge>}
                    {u.location_id && <Badge variant="outline" className="bg-secondary text-[10px]">{locationMap[u.location_id] || 'Loading Location'}</Badge>}
                    {!u.brand_id && !u.location_id && '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(u.id)}
                      disabled={deletingId === u.id || u.id === user.id}
                      className="text-resend-red hover:bg-resend-red/10 hover:text-resend-red transition-colors"
                      title={u.id === user.id ? "Cannot delete yourself" : "Delete user"}
                    >
                      {deletingId === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
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
}
