import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
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
  Check
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

export default function PlatformAdmin() {
  const [search, setSearch] = useState('');
  const [isNewOrgOpen, setIsNewOrgOpen] = useState(false);
  const [newOrg, setNewOrg] = useState({ name: '', slug: '' });
  const [inviteOrgOpen, setInviteOrgOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);

  // New states for actions
  const [editOrgOpen, setEditOrgOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({ name: '', slug: '' });
  
  const [billingOrgOpen, setBillingOrgOpen] = useState(false);
  const [billingFormData, setBillingFormData] = useState({ subscription_status: 'trialing', subscription_plan: 'free' });
  
  const [suspendAlertOpen, setSuspendAlertOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: orgs = [], isLoading } = useQuery({
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
    onError: (error) => {
      toast.error(error.message);
    }
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

  const handleInvite = async () => {
    if (!inviteEmail || !selectedOrg) {
      toast.error('Email is required');
      return;
    }
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

  const copyInviteLink = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Link copied to clipboard');
  };

  const filteredOrgs = orgs.filter(o => 
    o.name.toLowerCase().includes(search.toLowerCase()) || 
    o.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Platform Management</h1>
          <p className="text-slate-500">Manage customer organizations and system health.</p>
        </div>
        <Button onClick={() => setIsNewOrgOpen(true)} className="bg-teal-600 hover:bg-teal-700">
          <Plus className="h-4 w-4 mr-2" />
          New Organization
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Building2 className="h-5 w-5 text-blue-600" />
            </div>
            <span className="text-sm font-medium text-slate-500">Total Organizations</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{orgs.length}</div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-50 rounded-lg">
              <CreditCard className="h-5 w-5 text-green-600" />
            </div>
            <span className="text-sm font-medium text-slate-500">Active Subscriptions</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {orgs.filter(o => o.subscription_status === 'active').length}
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-50 rounded-lg">
              <Shield className="h-5 w-5 text-purple-600" />
            </div>
            <span className="text-sm font-medium text-slate-500">System Status</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-2xl font-bold text-slate-900">Healthy</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search organizations..." 
              className="pl-9 bg-white"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Organization</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Pricing Plan</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Created</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-slate-500">Loading organizations...</td>
                </tr>
              ) : filteredOrgs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-slate-500">No organizations found</td>
                </tr>
              ) : (
                filteredOrgs.map(org => (
                  <tr key={org.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-teal-50 flex items-center justify-center text-teal-700 font-bold">
                          {org.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-slate-900">{org.name}</div>
                          <div className="text-xs text-slate-500">slug: {org.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge className={cn(
                        "capitalize shadow-none",
                        org.subscription_status === 'active' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-amber-50 text-amber-700 border-amber-100'
                      )}>
                        {org.subscription_status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-3.5 w-3.5" />
                        {org.subscription_plan}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {new Date(org.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-teal-600">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="cursor-pointer" onClick={() => {
                              setSelectedOrg(org);
                              setEditFormData({ name: org.name, slug: org.slug });
                              setEditOrgOpen(true);
                            }}>
                              Edit Organization
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer" onClick={() => {
                              setSelectedOrg(org);
                              setInviteEmail('');
                              setInviteLink('');
                              setInviteOrgOpen(true);
                            }}>
                              <Share2 className="w-4 h-4 mr-2" /> Invite Admin
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer" onClick={() => {
                              setSelectedOrg(org);
                              setBillingFormData({ subscription_status: org.subscription_status, subscription_plan: org.subscription_plan });
                              setBillingOrgOpen(true);
                            }}>
                              Manage Billing
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer text-red-600" onClick={() => {
                              setSelectedOrg(org);
                              setSuspendAlertOpen(true);
                            }}>
                              Suspend Organization
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={isNewOrgOpen} onOpenChange={setIsNewOrgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Organization</DialogTitle>
            <DialogDescription>Add a new customer to the platform.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Organization Name</label>
              <Input 
                placeholder="e.g. Acme Restaurants" 
                value={newOrg.name}
                onChange={e => {
                  const name = e.target.value;
                  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
                  setNewOrg({ name, slug });
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Slug (used in URLs)</label>
              <Input 
                placeholder="acme-restaurants" 
                value={newOrg.slug}
                onChange={e => setNewOrg({ ...newOrg, slug: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsNewOrgOpen(false)}>Cancel</Button>
            <Button 
              disabled={!newOrg.name || !newOrg.slug || createOrg.isPending}
              onClick={() => createOrg.mutate(newOrg)}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {createOrg.isPending ? 'Creating...' : 'Create Organization'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={inviteOrgOpen} onOpenChange={setInviteOrgOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Organization Admin</DialogTitle>
            <DialogDescription>
              Invite an admin (owner) to manage <strong>{selectedOrg?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Admin Email Address</label>
              <Input 
                placeholder="admin@customer.com"
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
              />
            </div>
            
            {inviteLink && (
              <div className="pt-4 border-t space-y-3">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Invitation Link</label>
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
                    onClick={copyInviteLink}
                  >
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-slate-600" />}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviteOrgOpen(false)}>Close</Button>
            <Button 
              disabled={!inviteEmail || inviting}
              onClick={handleInvite}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {inviting ? 'Generating...' : (inviteLink ? 'Generate New Link' : 'Create Invitation')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit Dialog */}
      <Dialog open={editOrgOpen} onOpenChange={setEditOrgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Organization</DialogTitle>
            <DialogDescription>Update the details and slug for {selectedOrg?.name}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Organization Name</label>
              <Input 
                value={editFormData.name}
                onChange={e => setEditFormData({ ...editFormData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Slug</label>
              <Input 
                value={editFormData.slug}
                onChange={e => setEditFormData({ ...editFormData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-') })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOrgOpen(false)}>Cancel</Button>
            <Button 
              disabled={!editFormData.name || !editFormData.slug || updateOrg.isPending}
              onClick={() => updateOrg.mutate(editFormData)}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {updateOrg.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Billing Dialog */}
      <Dialog open={billingOrgOpen} onOpenChange={setBillingOrgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Billing</DialogTitle>
            <DialogDescription>Manually override the billing status and plan for {selectedOrg?.name}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Subscription Status</label>
              <Select 
                value={billingFormData.subscription_status} 
                onValueChange={(val) => setBillingFormData({ ...billingFormData, subscription_status: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trialing">Trialing</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="past_due">Past Due</SelectItem>
                  <SelectItem value="canceled">Canceled</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Subscription Plan</label>
              <Select 
                value={billingFormData.subscription_plan} 
                onValueChange={(val) => setBillingFormData({ ...billingFormData, subscription_plan: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBillingOrgOpen(false)}>Cancel</Button>
            <Button 
              disabled={updateBilling.isPending}
              onClick={() => updateBilling.mutate(billingFormData)}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {updateBilling.isPending ? 'Saving...' : 'Save Billing'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend Alert */}
      <AlertDialog open={suspendAlertOpen} onOpenChange={setSuspendAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will suspend the organization <strong>{selectedOrg?.name}</strong>. Their users will immediately lose access to the platform and their operations will be paused.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => suspendOrg.mutate()}
            >
              {suspendOrg.isPending ? 'Suspending...' : 'Suspend Organization'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
