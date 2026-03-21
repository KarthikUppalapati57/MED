import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { format } from 'date-fns';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Users,
  Mail,
  Shield,
  Copy,
  Check,
  MoreVertical,
  Send,
  Link2
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import emailjs from 'emailjs-com';
import { cn } from "@/lib/utils";
import { useAuth } from '@/lib/AuthContext';

const roleColors = {
  admin: 'bg-red-100 text-red-700',
  owner: 'bg-purple-100 text-purple-700',
  manager: 'bg-blue-100 text-blue-700',
  ground_staff: 'bg-slate-100 text-slate-700',
};

const rolePermissions = {
  ground_staff: {
    can_upload: true,
    can_view: true,
    can_edit: false,
    can_delete: false,
    can_super_delete: false,
    can_approve: false,
    can_pay: false
  },
  manager: {
    can_upload: true,
    can_view: true,
    can_edit: true,
    can_delete: true,
    can_super_delete: false,
    can_approve: true,
    can_pay: false
  },
  owner: {
    can_upload: true,
    can_view: true,
    can_edit: true,
    can_delete: true,
    can_super_delete: false,
    can_approve: true,
    can_pay: true
  },
  admin: {
    can_upload: true,
    can_view: true,
    can_edit: true,
    can_delete: true,
    can_super_delete: true,
    can_approve: true,
    can_pay: true
  }
};

export default function UserManagement() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('ground_staff');
  const [inviting, setInviting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const queryClient = useQueryClient();
  const { user: currentUser, role: userRole, userProfile } = useAuth();
  const [editForm, setEditForm] = useState({
    role: 'ground_staff',
    department: '',
    location: '',
    status: 'active',
    permissions: rolePermissions.ground_staff
  });

  const { data: users = [], isLoading, isError, error: queryError, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      console.log('UserManagement: Fetching users...');
      try {
        const data = await api.entities.User.list('-created_at');
        console.log('UserManagement: Users fetched successfully:', data?.length);
        return data;
      } catch (err) {
        console.error('UserManagement: Error fetching users:', err);
        throw err;
      }
    },
    retry: 1,
    staleTime: 30000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.User.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User updated');
      setEditDialogOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.User.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User removed');
    },
  });

  const [lastGeneratedInvite, setLastGeneratedInvite] = useState(null);

  const handleInvite = async () => {
    if (!inviteEmail) {
      toast.error('Email is required');
      return;
    }

    setInviting(true);
    try {
      const isOrgLevel = ['admin', 'owner'].includes(inviteRole);

      const invite = await api.entities.Invitation.create({
        email: inviteEmail,
        role: inviteRole,
        invited_by: currentUser?.id,
        organization_id: userProfile?.organization_id || currentUser?.user_metadata?.organization_id,
        brand_id: isOrgLevel ? null : (userProfile?.brand_id || currentUser?.user_metadata?.brand_id),
        location_id: isOrgLevel ? null : (userProfile?.location_id || currentUser?.user_metadata?.location_id),
        access_level: isOrgLevel ? 'organization' : 'location',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });

      if (invite?.token) {
        const fullInviteLink = `${window.location.origin}/signup/${invite.token}`;
        setLastGeneratedInvite(fullInviteLink);
        
        await navigator.clipboard.writeText(fullInviteLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        
        toast.success('Link copied to clipboard');
      }
    } catch (error) {
      console.error('Invitation error:', error);
      toast.error('Failed to create invitation: ' + error.message);
    } finally {
      setInviting(false);
    }
  };

  const sendDirectEmail = async () => {
    if (!lastGeneratedInvite) {
      toast.error('Please generate an invitation link first');
      return;
    }

    const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
    const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
    const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

    if (!serviceId || !templateId || !publicKey) {
      toast.error('Email service not configured. Please check .env file.');
      return;
    }

    setSendingEmail(true);
    try {
      const templateParams = {
        to_email: inviteEmail,
        to_name: inviteEmail.split('@')[0],
        role: inviteRole.replace('_', ' '),
        invite_link: lastGeneratedInvite,
        app_name: 'EdgeOps'
      };

      await emailjs.send(serviceId, templateId, templateParams, publicKey);
      toast.success(`Invitation sent directly to ${inviteEmail}!`);
    } catch (error) {
      console.error('EmailJS error:', error);
      toast.error('Failed to send email: ' + (error.text || error.message));
    } finally {
      setSendingEmail(false);
    }
  };

  const copyInviteLink = async () => {
    if (!lastGeneratedInvite) {
      toast.info("Click 'Send Invitation' first to generate a unique link.");
      return;
    }
    await navigator.clipboard.writeText(lastGeneratedInvite);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Link copied to clipboard');
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setEditForm({
      role: user.role || 'ground_staff',
      department: user.department || '',
      location: user.location || '',
      status: user.status || 'active',
      permissions: user.permissions || rolePermissions[user.role || 'ground_staff']
    });
    setEditDialogOpen(true);
  };

  const handleRoleChange = (role) => {
    setEditForm({
      ...editForm,
      role,
      permissions: rolePermissions[role]
    });
  };

  const handleSaveEdit = () => {
    if (editingUser) {
      const isOrgLevel = ['admin', 'owner'].includes(editForm.role);
      const updateData = {
        ...editForm,
      };
      
      if (isOrgLevel) {
        updateData.brand_id = null;
        updateData.location_id = null;
        updateData.access_level = 'organization';
      } else {
        updateData.access_level = 'location';
      }

      updateMutation.mutate({
        id: editingUser.id,
        data: updateData
      });
    }
  };

  const canManageUser = (user) => {
    if (!currentUser) return false;
    const currentRole = userRole;
    const targetUserRole = user.role || 'ground_staff';
    
    // Admin can manage everyone
    if (currentRole === 'admin') return true;
    // Owner can manage manager and below
    if (currentRole === 'owner' && ['manager', 'ground_staff'].includes(targetUserRole)) return true;
    // Manager can only manage ground staff
    if (currentRole === 'manager' && targetUserRole === 'ground_staff') return true;
    
    return false;
  };

  const canSuperDelete = userRole === 'admin';

  const filteredUsers = users.filter(u => {
    const matchesSearch = !search || 
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-slate-500 mt-1">Manage team access and permissions</p>
        </div>
        <Button onClick={() => setInviteDialogOpen(true)} className="bg-teal-600 hover:bg-teal-700">
          <Plus className="h-4 w-4 mr-2" />
          Invite User
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Total Users</p>
            <p className="text-2xl font-bold text-slate-900">{users.length}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Admins</p>
            <p className="text-2xl font-bold text-red-600">
              {users.filter(u => u.role === 'admin').length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Managers</p>
            <p className="text-2xl font-bold text-blue-600">
              {users.filter(u => u.role === 'manager').length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Active</p>
            <p className="text-2xl font-bold text-green-600">
              {users.filter(u => u.status !== 'inactive').length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="ground_staff">Ground Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-8 h-8 border-4 border-slate-200 border-t-teal-600 rounded-full animate-spin"></div>
                        <p className="text-sm text-slate-500">Fetching users...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : isError ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <p className="text-sm text-red-500 font-medium">Failed to load users</p>
                        <p className="text-xs text-slate-400 mb-2">{queryError?.message}</p>
                        <Button variant="outline" size="sm" onClick={() => refetch()}>
                          Retry Fetch
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-teal-100 flex items-center justify-center">
                            <span className="font-semibold text-teal-600">
                              {user.full_name?.charAt(0) || user.email?.charAt(0) || '?'}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium">{user.full_name || 'Unknown'}</p>
                            <p className="text-sm text-slate-500">{user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={roleColors[user.role || 'ground_staff']}>
                          <Shield className="h-3 w-3 mr-1" />
                          {user.role?.replace('_', ' ') || 'Ground Staff'}
                        </Badge>
                      </TableCell>
                      <TableCell>{user.department || '-'}</TableCell>
                      <TableCell>
                        <Badge className={user.status === 'inactive' ? 'bg-slate-100 text-slate-700' : 'bg-green-100 text-green-700'}>
                          {user.status || 'active'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-500">
                        {user.last_login ? format(new Date(user.last_login), 'MMM d, yyyy') : 'Never'}
                      </TableCell>
                      <TableCell>
                        {canManageUser(user) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(user)}>
                                <Edit2 className="h-4 w-4 mr-2" /> Edit
                              </DropdownMenuItem>
                              {canSuperDelete && (
                                <DropdownMenuItem 
                                  onClick={() => deleteMutation.mutate(user.id)}
                                  className="text-red-600"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Invite User</DialogTitle>
            <DialogDescription>
              Send an invitation email or share an invite link
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ground_staff">Ground Staff</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  {(userRole === 'owner' || userRole === 'admin') && <SelectItem value="owner">Owner</SelectItem>}
                  {userRole === 'admin' && <SelectItem value="admin">Admin</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            <div className="pt-6 border-t space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Invitation Link</Label>
              <div className="flex gap-0 group">
                <Input 
                  value={lastGeneratedInvite || (window.location.origin + '/signup/')} 
                  readOnly 
                  className="text-xs bg-slate-50 h-10 rounded-r-none border-r-0 focus:ring-0 focus-visible:ring-0" 
                />
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-10 px-4 rounded-l-none border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
                  onClick={copyInviteLink}
                >
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-slate-600" />}
                </Button>
              </div>
              <p className="text-[10px] text-slate-400 italic font-medium">
                {lastGeneratedInvite ? "Specific tokenized link generated." : "Base link (token will appear after generation)."}
              </p>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between border-t pt-4 mt-4 gap-3">
            <Button 
              variant="outline" 
              onClick={sendDirectEmail} 
              disabled={sendingEmail || !lastGeneratedInvite}
              className="w-full sm:w-auto h-10 px-4 border-teal-200 text-teal-700 hover:bg-teal-50"
            >
              <Mail className="h-4 w-4 mr-2" />
              {sendingEmail ? 'Sending...' : 'Send Direct Email'}
            </Button>
            
            <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
              <Button variant="ghost" onClick={() => setInviteDialogOpen(false)} className="w-full sm:w-auto h-10 text-slate-500 px-4">
                Close
              </Button>
              <Button 
                onClick={handleInvite} 
                disabled={inviting}
                className="w-full sm:w-auto h-10 bg-teal-600 hover:bg-teal-700 text-white px-6"
              >
                <Plus className="h-4 w-4 mr-2" />
                {inviting ? 'Generating...' : 'Generate New Link'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <div className="h-10 w-10 rounded-full bg-teal-100 flex items-center justify-center">
                <span className="font-semibold text-teal-600">
                  {editingUser?.full_name?.charAt(0) || '?'}
                </span>
              </div>
              <div>
                <p className="font-medium">{editingUser?.full_name}</p>
                <p className="text-sm text-slate-500">{editingUser?.email}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={handleRoleChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ground_staff">Ground Staff</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                  {canSuperDelete && <SelectItem value="admin">Admin</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Department</Label>
                <Input
                  value={editForm.department}
                  onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  value={editForm.location}
                  onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select 
                value={editForm.status} 
                onValueChange={(v) => setEditForm({ ...editForm, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="pt-4 border-t space-y-3">
              <Label>Permissions</Label>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(editForm.permissions || {}).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                    <span className="text-sm capitalize">{key.replace('can_', '').replace('_', ' ')}</span>
                    <Switch
                      checked={value}
                      onCheckedChange={(v) => setEditForm({
                        ...editForm,
                        permissions: { ...editForm.permissions, [key]: v }
                      })}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} className="bg-teal-600 hover:bg-teal-700">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}