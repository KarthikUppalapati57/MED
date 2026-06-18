import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from 'sonner';
import { Shield, Plus, Edit, Trash2, AlertCircle } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";

const PERMISSION_MODULES = [
  { id: 'can_view_invoices', label: 'View Invoices', description: 'Can see invoices and bill payments.' },
  { id: 'can_edit_invoices', label: 'Edit/Approve Invoices', description: 'Can modify and approve invoices for payment.' },
  { id: 'can_view_inventory', label: 'View Inventory', description: 'Can view stock counts and inventory movements.' },
  { id: 'can_manage_inventory', label: 'Manage Inventory', description: 'Can perform counts, waste logs, and transfers.' },
  { id: 'can_schedule_labor', label: 'Schedule Labor', description: 'Can create and publish employee shift schedules.' },
  { id: 'can_view_reports', label: 'View Analytics', description: 'Can access the dashboard, P&L, and AvT costing reports.' },
  { id: 'can_manage_org', label: 'Manage Organization', description: 'Can manage users, locations, and organization settings.' }
];

export default function CustomRolesTab() {
  const { organization, role: authRole } = useAuth();
  const queryClient = useQueryClient();
  const [selectedRole, setSelectedRole] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Form State
  const [roleName, setRoleName] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [permissions, setPermissions] = useState({});

  const { data: roles, isLoading } = useQuery({
    queryKey: ['roles', organization?.id],
    queryFn: async () => {
      // Fetch both system roles and org's custom roles
      const response = await api.client.from('roles').select('*').order('is_system', { ascending: false }).order('name');
      return response.data || [];
    },
    enabled: !!organization?.id
  });

  const saveRoleMutation = useMutation({
    mutationFn: async (roleData) => {
      if (roleData.id) {
        return api.client.from('roles').update({
          name: roleData.name,
          description: roleData.description,
          default_page_permissions: roleData.permissions
        }).eq('id', roleData.id);
      } else {
        return api.client.from('roles').insert({
          name: roleData.name,
          description: roleData.description,
          default_page_permissions: roleData.permissions,
          organization_id: organization.id,
          is_system: false
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success(selectedRole ? 'Role updated successfully' : 'Role created successfully');
      setIsDialogOpen(false);
    },
    onError: (err) => {
      toast.error('Failed to save role: ' + err.message);
    }
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId) => {
      return api.client.from('roles').delete().eq('id', roleId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Role deleted successfully');
    },
    onError: (err) => {
      toast.error('Failed to delete role: ' + err.message);
    }
  });

  const handleOpenDialog = (role = null) => {
    if (role && role.is_system) {
      toast.error("System roles cannot be edited.");
      return;
    }
    setSelectedRole(role);
    setRoleName(role ? role.name : '');
    setRoleDesc(role ? (role.description || '') : '');
    setPermissions(role ? (role.default_page_permissions || {}) : {});
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!roleName.trim()) {
      toast.error("Role name is required");
      return;
    }
    saveRoleMutation.mutate({
      id: selectedRole?.id,
      name: roleName.trim(),
      description: roleDesc.trim(),
      permissions
    });
  };

  const togglePermission = (permId) => {
    setPermissions(prev => ({
      ...prev,
      [permId]: !prev[permId]
    }));
  };

  if (isLoading) return <Skeleton className="h-[400px] w-full rounded-xl" />;

  return (
    <div className="space-y-6">
      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-border/50">
          <div>
            <CardTitle className="text-xl flex items-center gap-2">
              <Shield className="h-5 w-5 text-indigo-500" />
              Roles & Permissions
            </CardTitle>
            <CardDescription className="mt-1">
              Manage system roles and configure custom granular roles for your organization.
            </CardDescription>
          </div>
          <Button onClick={() => handleOpenDialog()} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            <Plus className="h-4 w-4 mr-2" /> Create Custom Role
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border/50">
            {roles?.map(role => (
              <div key={role.id} className="p-4 sm:p-6 hover:bg-muted/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-foreground capitalize">{role.name.replace('_', ' ')}</h4>
                    {role.is_system ? (
                      <Badge variant="secondary" className="bg-slate-500/10 text-slate-500">System Default</Badge>
                    ) : (
                      <Badge className="bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20">Custom Role</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {role.description || (role.is_system ? 'Standard platform role with preset permissions.' : 'Custom configured role.')}
                  </p>
                </div>
                
                <div className="flex items-center gap-2 shrink-0">
                  {!role.is_system && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => handleOpenDialog(role)}>
                        <Edit className="h-4 w-4 mr-2" /> Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" 
                        onClick={() => {
                          if (window.confirm(`Delete the "${role.name}" role? Users assigned to this role will lose their access.`)) {
                            deleteRoleMutation.mutate(role.id);
                          }
                        }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {role.is_system && (
                    <Button variant="ghost" size="sm" disabled className="opacity-50">
                      <AlertCircle className="h-4 w-4 mr-2" /> Read Only
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Role Editor Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedRole ? 'Edit Custom Role' : 'Create Custom Role'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Role Name</Label>
                <Input 
                  placeholder="e.g. Prep Cook" 
                  value={roleName} 
                  onChange={e => setRoleName(e.target.value)} 
                />
              </div>
              <div className="space-y-2">
                <Label>Description (Optional)</Label>
                <Input 
                  placeholder="Brief description of this role" 
                  value={roleDesc} 
                  onChange={e => setRoleDesc(e.target.value)} 
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-foreground border-b border-border/50 pb-2 mb-4">Module Permissions</h4>
                <div className="space-y-4">
                  {PERMISSION_MODULES.map(module => (
                    <div key={module.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card/50 hover:bg-muted/50 transition-colors">
                      <div className="space-y-0.5">
                        <Label className="text-base cursor-pointer" htmlFor={`perm-${module.id}`}>{module.label}</Label>
                        <p className="text-sm text-muted-foreground">{module.description}</p>
                      </div>
                      <Switch 
                        id={`perm-${module.id}`}
                        checked={!!permissions[module.id]}
                        onCheckedChange={() => togglePermission(module.id)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveRoleMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {saveRoleMutation.isPending ? 'Saving...' : 'Save Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
