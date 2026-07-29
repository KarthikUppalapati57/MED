import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { logAudit } from '@/lib/audit';
import { MODULE_PERMISSION_OPTIONS, PERMISSION_ACTIONS, defaultPermissionMatrix, enabledModulesFromPermissions, normalizePermissionMatrix } from '@/lib/accessPermissions';
import { sendInvitationEmail } from '@/lib/emailService';
import posthog from '@/lib/posthog';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Search, Edit2, Trash2, Users, Mail, Shield, MoreVertical,
  CheckCircle2, X, Loader2, Building2, Globe, FileText, ShieldCheck,
  UserCheck, UserX, PlusCircle, Clock, Upload, AlertCircle, Key, Store, MapPin
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirmation } from '@/hooks/useConfirmation';
import { buildSignupUrl } from '@/lib/appUrl';

// Restops Roles 
const Restops_ROLES = {
  tenant_super_admin: { label: "Tenant Super Admin", color: "indigo", description: "Full access across all tenant organizations", icon: ShieldCheck },
  org_manager:        { label: "Organization Manager", color: "rose",   description: "Full access to organization, users, and accounting", icon: ShieldCheck },
  branch_manager:   { label: "Branch Manager",     color: "purple", description: "Manages multiple locations and local team members", icon: Building2 },
  location_manager: { label: "Location Manager",   color: "blue",   description: "Manages daily operations, inventory, and approvals", icon: UserCheck },
  ground_staff:     { label: "Ground Staff",       color: "teal",   description: "Can upload invoices and perform inventory counts",     icon: Users },
  platform_admin:   { label: "Platform Admin",     color: "amber",  description: "Global architectural management (Super User)",        icon: Globe },
};

const ROLE_COLOR_CLASSES = {
  rose:   { badge: "bg-rose-100 text-rose-700 border-rose-200",       dot: "bg-rose-500" },
  purple: { badge: "bg-purple-500/50/10 text-purple-400 border-purple-200", dot: "bg-purple-500/50" },
  blue:   { badge: "bg-resend-blue/10 text-resend-blue border-resend-blue/20",       dot: "bg-resend-blue/50" },
  teal:   { badge: "bg-primary/10 text-primary border-primary/20",       dot: "bg-primary" },
  amber:  { badge: "bg-resend-yellow/10 text-resend-yellow border-resend-yellow/20",   dot: "bg-resend-yellow/50" },
  indigo: { badge: "bg-indigo-500/10 text-indigo-500 border-indigo-200", dot: "bg-indigo-500" },
  slate:  { badge: "bg-secondary text-muted-foreground border-border",    dot: "bg-slate-400" },
};


const STATUS_CONFIG = {
  active:   { label: "Active",   badgeClass: "bg-resend-green/10 text-resend-green", icon: CheckCircle2 },
  invited:  { label: "Invited",  badgeClass: "bg-resend-yellow/10 text-resend-yellow",     icon: Mail },
  inactive: { label: "Inactive", badgeClass: "bg-resend-red/10 text-resend-red",         icon: UserX },
  archived: { label: "Archived", badgeClass: "bg-secondary text-foreground",     icon: UserX },
  no_access:{ label: "No Access",badgeClass: "bg-secondary text-muted-foreground",     icon: AlertCircle },
};

// Utilities 
const avatarColorCache = new Map();
function avatarColor(email = "") {
  if (avatarColorCache.has(email)) return avatarColorCache.get(email);
  const colors = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#14b8a6"];
  let h = 0;
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) % colors.length;
  const res = colors[h];
  avatarColorCache.set(email, res);
  return res;
}

function formatLastActive(dateStr) {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}


// RoleBadges 
function RoleBadges({ member, maxVisible = 2 }) {
  const role = member.role || member.capabilities?.role || 'ground_staff';
  const roleDef = Restops_ROLES[role] || { label: role.replace('_', ' '), color: 'teal', icon: Users };
  const colors = ROLE_COLOR_CLASSES[roleDef.color] || ROLE_COLOR_CLASSES.slate;
  const Icon = roleDef.icon;
  return (
    <Badge className={cn("px-2 py-0.5 text-[10px] font-bold border gap-1", colors.badge)}>
      <Icon className="w-3 h-3" />
      {roleDef.label}
    </Badge>
  );
}


// MemberRow - single member, rendered inside a brand/location hierarchy group
function MemberRow({ member, canEditRow, onSelect, activeOrgId }) {
  const queryClient = useQueryClient();
  const status = member.status || 'active';
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.active;
  const StatusIcon = statusCfg.icon;

  return (
    <div
      className={cn("group flex items-center gap-4 px-5 py-3 transition-colors", canEditRow && "cursor-pointer hover:bg-secondary/50")}
      onClick={() => canEditRow && onSelect(member)}
    >
      <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm"
        style={{ backgroundColor: avatarColor(member.profiles?.email || member.email || '') }}>
        {(member.profiles?.full_name || member.full_name || member.profiles?.email || member.email || '?').charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-foreground text-sm leading-tight truncate">
          {member.profiles?.full_name || member.full_name || 'Verification Pending'}
        </p>
        <p className="text-xs text-muted-foreground truncate">{member.profiles?.email || member.email}</p>
      </div>
      <RoleBadges member={member} />
      <span className={cn("hidden sm:inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold shrink-0", statusCfg.badgeClass)}>
        <StatusIcon className="w-3 h-3" />{statusCfg.label}
      </span>
      <span className="hidden md:inline text-xs text-muted-foreground w-20 shrink-0 text-right">
        {formatLastActive(member.profiles?.updated_at || member.updated_at)}
      </span>
      <div onClick={e => e.stopPropagation()} className="shrink-0">
        {canEditRow && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="group-hover:bg-card rounded-xl">
                <MoreVertical className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-2xl border-border shadow-xl p-2 w-48">
              <DropdownMenuItem onClick={() => onSelect(member)} className="rounded-xl px-3 py-2 cursor-pointer font-bold text-xs text-foreground">
                <Edit2 className="h-4 w-4 mr-3 text-primary" /> Edit Member
              </DropdownMenuItem>
              {member.token && (
                <>
                  <DropdownMenuItem
                    className="rounded-xl px-3 py-2 cursor-pointer font-bold text-xs text-resend-blue hover:bg-resend-blue/5"
                    onClick={() => {
                      const link = buildSignupUrl(member.token);
                      navigator.clipboard.writeText(link);
                      toast.success("Invite link copied to clipboard!");
                    }}
                  >
                    <FileText className="h-4 w-4 mr-3" /> Copy Invite Link
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="rounded-xl px-3 py-2 cursor-pointer font-bold text-xs text-primary hover:bg-primary/5"
                    onClick={async () => {
                      toast.loading("Resending invite...", { id: 'resend-invite' });
                      const { error } = await supabase.functions.invoke('invite-user', {
                        body: {
                          email: member.email || member.profiles?.email,
                          full_name: member.full_name || member.profiles?.full_name,
                          role: member.role || member.profiles?.role,
                          organization_id: activeOrgId,
                          resend: true
                        }
                      });
                      if (error) {
                        toast.error(`Failed to resend: ${error.message}`, { id: 'resend-invite' });
                      } else {
                        toast.success("Invite resent successfully!", { id: 'resend-invite' });
                      }
                    }}
                  >
                    <Mail className="h-4 w-4 mr-3" /> Resend Invite
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem className="rounded-xl px-3 py-2 cursor-pointer font-bold text-xs text-resend-red hover:bg-resend-red/5"
                onClick={async () => {
                  const proceed = await confirm({
                    title: `Delete ${member.profiles?.email || member.email}?`,
                    description: 'This team member will lose access. This action cannot be undone.',
                    confirmText: 'Delete Member',
                    cancelText: 'Keep Member',
                    variant: 'destructive',
                    severity: 'critical',
                  });
                  if (!proceed) return;
                  const userId = member.user_id || member.id;

                  // Optimistic update
                  await queryClient.cancelQueries({ queryKey: ['team-members'] });
                  const previousMembers = queryClient.getQueryData(['team-members']);
                  queryClient.setQueryData(['team-members'], (old) =>
                    old ? old.filter(m => (m.user_id || m.id) !== userId) : []
                  );

                  try {
                    const { error } = await supabase.rpc('org_remove_member', { target_user_id: userId });
                    if (error) throw error;
                    posthog.capture('team_member_removed');
                    toast.success('User removed from organization');
                    queryClient.invalidateQueries({ queryKey: ['team-members'] });
                  } catch (e) {
                    if (previousMembers) queryClient.setQueryData(['team-members'], previousMembers);
                    toast.error(e.message || 'Failed to remove user');
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-3" /> Remove User
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

// UserDetailDrawer
function UserDetailDrawer({ member, orgId, onClose }) {
  const queryClient = useQueryClient();
  const { confirm } = useConfirmation();
  const [activeTab, setActiveTab] = useState("role");
  const [form, setForm] = useState({
    role: member.role || member.capabilities?.role || 'ground_staff',
    department: member.department || '',
    location: member.location || '',
    status: member.status || 'active',
    invoice_approval_limit: member.profiles?.invoice_approval_limit || 0,
    has_unlimited_approval: member.profiles?.has_unlimited_approval || false,
    access_permissions: normalizePermissionMatrix(member.profiles?.access_permissions || member.access_permissions, member.role || member.capabilities?.role || 'ground_staff'),
  });
  const [saving, setSaving] = useState(false);

  const { data: dbRoles } = useQuery({
    queryKey: ['dbRoles', orgId],
    queryFn: async () => {
      const res = await supabase.from('roles').select('*');
      return res.data || [];
    },
    enabled: !!orgId
  });

  const handleSave = async () => {
    const memberLabel = member.profiles?.email || member.email || 'this user';
    const roleLabel = Restops_ROLES[form.role]?.label || form.role;
    const statusLabel = STATUS_CONFIG[form.status]?.label || form.status;
    const proceed = await confirm({
      title: 'Save these updates?',
      description: `This will change ${memberLabel}'s role to ${roleLabel} and status to ${statusLabel}.`,
      confirmText: 'Save Changes',
      cancelText: 'Cancel',
      variant: 'warning',
    });
    if (!proceed) return;

    setSaving(true);

    try {
      // Use secure RPC to update role and account status
      const userId = member.user_id || member.profiles?.id || member.id;
      const { error } = await supabase.rpc('admin_update_user_role', {
        target_user_id: userId,
        new_role: form.role,
        new_status: form.status,
        new_department: form.department,
        new_location: form.location,
        new_access_permissions: form.access_permissions
      });
      if (error) throw error;

      // Update invoice approval limit
      const { error: limitError } = await supabase.rpc('update_user_approval_limit', {
        target_user_id: userId,
        new_limit: Number(form.invoice_approval_limit) || 0,
        p_unlimited: form.has_unlimited_approval,
      });
      if (limitError) throw limitError;

      // Update user_roles mapping if we selected a role
      const selectedDbRole = dbRoles?.find(r => r.name === form.role);
      if (selectedDbRole && orgId) {
        await supabase.from('user_roles').upsert({
          user_id: userId,
          role_id: selectedDbRole.id,
          organization_id: orgId
        }, { onConflict: 'user_id, role_id' });
      }

      // Audit
      try {
        await logAudit({
          action: 'update_user_role',
          entityType: 'User',
          entityId: member.user_id || member.id,
          organization_id: orgId,
          brand_id: member.brand_id || member.profiles?.brand_id || null,
          location_id: member.location_id || member.profiles?.location_id || null,
          details: { role: form.role, status: form.status, access_permissions: form.access_permissions },
        });
      } catch { /* audit is non-critical */ }

      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User updated successfully');
      onClose();
    } catch (err) {
      toast.error('Failed to update: ' + (err.message || 'Unknown error'));
    }
    setSaving(false);
  };

  const roleDef = Restops_ROLES[form.role] || Restops_ROLES.ground_staff;
  const statusDef = STATUS_CONFIG[form.status] || STATUS_CONFIG.active;
  const RoleIcon = roleDef.icon;
  const StatusIcon = statusDef.icon;

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-50 animate-in fade-in" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-card shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-secondary/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-card rounded-xl shadow-sm border border-border">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg font-bold text-foreground">Edit Team Member</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl hover:bg-secondary">
            <X className="w-5 h-5 text-muted-foreground" />
          </Button>
        </div>

        {/* Profile Card */}
        <div className="px-6 py-6 border-b border-border">
          <div className="flex items-start gap-4 p-4 rounded-2xl bg-primary/5/30 border border-teal-100">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-lg ring-4 ring-white"
              style={{ backgroundColor: avatarColor(member.profiles?.email || member.email || '') }}>
              {(member.profiles?.full_name || member.full_name || member.profiles?.email || member.email || '?').charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-foreground truncate">{member.profiles?.full_name || member.full_name || 'Anonymous User'}</h3>
              <p className="text-sm text-muted-foreground truncate mb-2">{member.profiles?.email || member.email}</p>
              <div className="flex flex-wrap gap-2">
                <Badge className={cn("px-2.5 py-0.5 border flex items-center gap-1.5", ROLE_COLOR_CLASSES[roleDef.color].badge)}>
                  <RoleIcon className="w-3 h-3" />
                  {roleDef.label}
                </Badge>
                <Badge className={cn("px-2.5 py-0.5 border flex items-center gap-1.5", statusDef.badgeClass)}>
                  <StatusIcon className="w-3 h-3" />
                  {statusDef.label}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Custom Tabs */}
        <div className="flex border-b border-border px-6 bg-card sticky top-0 z-10">
          {[
            { id: 'role', label: 'Role & Status', icon: ShieldCheck },
            { id: 'profile', label: 'Organization Info', icon: Building2 },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-4 text-sm font-semibold border-b-2 transition-all",
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-muted-foreground"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {activeTab === 'role' ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">System Role</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ...Object.entries(Restops_ROLES).filter(([r]) => r !== 'platform_admin').map(([r, def]) => ({ id: r, name: r, label: def.label, desc: def.description, icon: def.icon })),
                    ...(dbRoles?.filter(r => !r.is_system).map(r => ({ id: r.name, name: r.name, label: r.name.replace('_', ' '), desc: r.description || 'Custom Role', icon: Users })) || [])
                  ].map((r) => {
                    const isSelected = form.role === r.id;
                    const Icon = r.icon;
                    return (
                      <button
                        key={r.id}
                        onClick={() => setForm({ ...form, role: r.id })}
                        className={cn(
                          "flex flex-col items-start p-3 rounded-xl border text-left transition-all group",
                          isSelected 
                            ? "bg-primary/5 border-primary ring-4 ring-teal-50" 
                            : "bg-card border-border hover:border-border hover:bg-secondary"
                        )}
                      >
                        <div className={cn("p-1.5 rounded-lg mb-2 transition-colors", isSelected ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground group-hover:bg-card")}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className={cn("text-xs font-bold capitalize", isSelected ? "text-teal-900" : "text-foreground")}>{r.label}</span>
                        <span className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{r.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">Department</Label>
                  <Input 
                    placeholder="e.g. Kitchen, Admin" 
                    value={form.department}
                    onChange={e => setForm({...form, department: e.target.value})}
                    className="rounded-xl border-border focus:ring-ring/10 focus:border-primary"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">Primary Location</Label>
                  <Input 
                    placeholder="e.g. Main Branch" 
                    value={form.location}
                    onChange={e => setForm({...form, location: e.target.value})}
                    className="rounded-xl border-border focus:ring-ring/10 focus:border-primary"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">Invoice Approval Limit ($)</Label>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Unlimited</Label>
                    <Switch
                      checked={form.has_unlimited_approval}
                      onCheckedChange={(checked) => setForm({ ...form, has_unlimited_approval: checked })}
                    />
                  </div>
                </div>
                <Input
                  type="number"
                  placeholder="e.g. 500"
                  value={form.invoice_approval_limit}
                  onChange={e => setForm({...form, invoice_approval_limit: e.target.value})}
                  disabled={form.has_unlimited_approval}
                  className="rounded-xl border-border focus:ring-ring/10 focus:border-primary disabled:opacity-50"
                />
                <p className="text-[10px] text-muted-foreground">
                  {form.has_unlimited_approval
                    ? 'This user can approve invoices of any amount.'
                    : 'Invoices exceeding this amount will require higher-level approval.'}
                </p>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Access Permissions</Label>
                <PermissionMatrixEditor
                  value={form.access_permissions}
                  onChange={(nextPermissions) => setForm({ ...form, access_permissions: nextPermissions })}
                />
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold text-muted-foreground uppercase">Account Status</Label>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(STATUS_CONFIG).filter(([k]) => k !== 'no_access').map(([s, def]) => (
                    <button
                      key={s}
                      onClick={() => setForm({ ...form, status: s })}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border transition-all",
                        form.status === s 
                          ? "bg-secondary border-slate-900 shadow-sm" 
                          : "bg-card border-border text-muted-foreground grayscale opacity-60 hover:grayscale-0 hover:opacity-100"
                      )}
                    >
                      <div className={cn("p-1.5 rounded-lg", def.badgeClass)}>
                        <def.icon className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold">{def.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-6 border-t border-border bg-secondary mt-auto">
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-xl h-11 border-border" onClick={onClose} disabled={saving}>
              Discard Changes
            </Button>
            <Button 
              className="flex-1 rounded-xl h-11 bg-primary hover:bg-primary text-primary-foreground shadow-lg shadow-primary/10" 
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
              Save All Updates
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function PermissionMatrixEditor({ value, onChange, compact = false }) {
  const updatePermission = (moduleKey, actionKey, checked) => {
    const next = normalizePermissionMatrix(value);
    next[moduleKey] = { ...(next[moduleKey] || {}), [actionKey]: checked };
    onChange(next);
  };

  return (
    <div className="rounded-2xl border border-border overflow-hidden bg-card">
      <div className="grid grid-cols-[1fr_repeat(3,64px)] items-center bg-secondary/60 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <span>Module</span>
        {PERMISSION_ACTIONS.map(action => <span key={action.key} className="text-center">{action.label}</span>)}
      </div>
      <div className={compact ? 'max-h-56 overflow-y-auto divide-y divide-border' : 'divide-y divide-border'}>
        {MODULE_PERMISSION_OPTIONS.map(module => (
          <div key={module.key} className="grid grid-cols-[1fr_repeat(3,64px)] items-center px-3 py-2">
            <span className="text-sm font-semibold text-foreground">{module.label}</span>
            {PERMISSION_ACTIONS.map(action => (
              <div key={action.key} className="flex justify-center">
                <Switch
                  checked={Boolean(value?.[module.key]?.[action.key])}
                  onCheckedChange={(checked) => updatePermission(module.key, action.key, checked)}
                  aria-label={`${module.label} ${action.label}`}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
// InviteDialog 
function InviteDialog({ open, onClose, orgId }) {
  const queryClient = useQueryClient();
  const { user: currentUser, role: currentUserRole, userProfile } = useAuth();
  const { confirm } = useConfirmation();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('ground_staff');
  const [permissions, setPermissions] = useState(() => defaultPermissionMatrix('ground_staff'));
  const [sending, setSending] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [assignmentScope, setAssignmentScope] = useState(() => userProfile?.location_id ? 'location' : 'location');
  const [selectedBrandId, setSelectedBrandId] = useState(userProfile?.brand_id || '');
  const [selectedLocationId, setSelectedLocationId] = useState(userProfile?.location_id || '');

  const { data: dbRoles } = useQuery({
    queryKey: ['dbRoles', orgId],
    queryFn: async () => {
      const res = await supabase.from('roles').select('*');
      return res.data || [];
    },
    enabled: !!orgId
  });

  const { data: assignableBrands = [] } = useAuthQuery({
    queryKey: ['invite-assignable-brands', orgId || userProfile?.organization_id],
    queryFn: async () => {
      const targetOrg = orgId || userProfile?.organization_id;
      if (!targetOrg) return [];
      const { data, error } = await supabase
        .from('brands')
        .select('brand_id, name')
        .eq('organization_id', targetOrg)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!(orgId || userProfile?.organization_id),
  });

  const { data: assignableLocations = [] } = useAuthQuery({
    queryKey: ['invite-assignable-locations', orgId || userProfile?.organization_id],
    queryFn: async () => {
      const targetOrg = orgId || userProfile?.organization_id;
      if (!targetOrg) return [];
      const { data, error } = await supabase
        .from('locations')
        .select('id, name, brand_id')
        .eq('organization_id', targetOrg)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!(orgId || userProfile?.organization_id),
  });

  const canAssignOrganization = ['tenant_super_admin', 'org_manager', 'platform_admin'].includes(currentUserRole);
  const canAssignBrand = canAssignOrganization || currentUserRole === 'branch_manager';
  const canAssignLocation = canAssignBrand || currentUserRole === 'location_manager';
  const visibleBrands = currentUserRole === 'branch_manager' && userProfile?.brand_id
    ? assignableBrands.filter((brand) => brand.brand_id === userProfile.brand_id)
    : assignableBrands;
  const visibleLocations = currentUserRole === 'location_manager' && userProfile?.location_id
    ? assignableLocations.filter((location) => location.id === userProfile.location_id)
    : currentUserRole === 'branch_manager' && userProfile?.brand_id
      ? assignableLocations.filter((location) => location.brand_id === userProfile.brand_id)
      : assignmentScope === 'location' && selectedBrandId
        ? assignableLocations.filter((location) => location.brand_id === selectedBrandId)
        : assignableLocations;

  const resolvedAssignment = useMemo(() => {
    if (assignmentScope === 'location') {
      const location = assignableLocations.find((entry) => entry.id === selectedLocationId);
      return {
        brandId: location?.brand_id || selectedBrandId || null,
        locationId: selectedLocationId || null,
        label: location ? 'Location: ' + location.name : 'Location',
      };
    }
    if (assignmentScope === 'brand') {
      const brand = assignableBrands.find((entry) => entry.brand_id === selectedBrandId);
      return { brandId: selectedBrandId || null, locationId: null, label: brand ? 'Brand: ' + brand.name : 'Brand' };
    }
    return { brandId: null, locationId: null, label: 'Organization-wide' };
  }, [assignmentScope, assignableBrands, assignableLocations, selectedBrandId, selectedLocationId]);

  const handleSubmit = async () => {
    if (!email) { toast.error('Email is required'); return; }
    const targetOrganizationId = orgId || userProfile?.organization_id;
    if (!targetOrganizationId) { toast.error('Organization is required'); return; }
    if (assignmentScope === 'brand' && !resolvedAssignment.brandId) { toast.error('Select a brand for this invite'); return; }
    if (assignmentScope === 'location' && !resolvedAssignment.locationId) { toast.error('Select a location for this invite'); return; }
    if (role === 'branch_manager' && assignmentScope === 'organization') { toast.error('Branch Managers must be assigned to a brand'); return; }
    if (['location_manager', 'ground_staff'].includes(role) && assignmentScope !== 'location') { toast.error(`${Restops_ROLES[role]?.label || role} must be assigned to a location`); return; }
    const proceed = await confirm({
      title: `Invite ${email}?`,
      description: `This will send a real invitation email to ${email} with the ${Restops_ROLES[role]?.label || role} role for ${resolvedAssignment.label}.`,
      confirmText: 'Generate Link',
      cancelText: 'Cancel',
      variant: 'warning',
    });
    if (!proceed) return;
    setSending(true);
    try {
      // Try Edge Function first
      const { data: result, error: fnError } = await supabase.functions.invoke('invite-user', {
        body: {
          email,
          role,
          organization_id: targetOrganizationId,
          brand_id: resolvedAssignment.brandId,
          location_id: resolvedAssignment.locationId,
          onboarding_type: 'invited',
          permissions,
          modules: enabledModulesFromPermissions(permissions),
          metadata: { assignment_scope: assignmentScope, assignment_label: resolvedAssignment.label },
        }
      });

      let token = null;

      if (fnError) {
        // Fallback: Direct invitation insert
        const { data: insertData, error: insertErr } = await supabase
          .from("invitations")
          .insert([{
            email,
            role,
            invited_by: currentUser?.id,
            organization_id: targetOrganizationId,
            brand_id: resolvedAssignment.brandId,
            location_id: resolvedAssignment.locationId,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            metadata: { permissions, modules: enabledModulesFromPermissions(permissions), assignment_scope: assignmentScope, assignment_label: resolvedAssignment.label },
          }])
          .select('token')
          .single();
        if (insertErr) throw insertErr;
        token = insertData?.token;
      } else if (result?.invite?.token) {
        token = result.invite.token;
      } else if (result?.token) {
        token = result.token;
      }

      try {
        await logAudit({
          action: 'invite_user',
          entityType: 'User',
          entityId: email,
          organization_id: targetOrganizationId,
          brand_id: resolvedAssignment.brandId,
          location_id: resolvedAssignment.locationId,
          details: { role, org_id: targetOrganizationId, brand_id: resolvedAssignment.brandId, location_id: resolvedAssignment.locationId, assignment_scope: assignmentScope, permissions, modules: enabledModulesFromPermissions(permissions) },
        });
      } catch { /* audit non-critical */ }

      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });

      // Optimistic update so it shows immediately
      queryClient.setQueryData(['team-members', targetOrganizationId, userProfile?.brand_id, userProfile?.location_id, false], (old) => {
        if (!old) return old;
        return [...old, {
          id: 'inv_temp_' + Date.now(),
          membership_id: 'inv_temp_' + Date.now(),
          user_id: 'inv_temp_' + Date.now(),
          email,
          role,
          brand_id: resolvedAssignment.brandId,
          location_id: resolvedAssignment.locationId,
          status: 'invited',
          profiles: { email, full_name: 'Pending Invite' },
          created_at: new Date().toISOString()
        }];
      });

      if (token) {
        const link = buildSignupUrl(token);
        setGeneratedLink(link);

        // Send invitation email via EmailJS
        const orgName = userProfile?.organization?.name || 'Restops';
        const roleDef = Restops_ROLES[role];
        sendInvitationEmail({
          to_email: email,
          to_name: email.split('@')[0],
          role: roleDef?.label || role,
          org_name: orgName,
          invite_link: link,
        }).then(res => {
          if (res.success) {
            toast.success(`Invitation email sent to ${email}`);
          }
        }).catch(e => console.warn('Invitation email failed (non-fatal):', e));

        posthog.capture('team_member_invited', { role, method: 'link' });
        toast.success(`Invitation generated for ${email}`);
      } else {
        posthog.capture('team_member_invited', { role, method: 'email' });
        toast.success(`Invitation sent to ${email}`);
        setEmail(''); setRole('ground_staff'); setPermissions(defaultPermissionMatrix('ground_staff'));
        onClose();
      }
    } catch (err) {
      toast.error('Invitation failed: ' + (err.message || 'Unknown error'));
    }
    setSending(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md rounded-[32px] p-8 max-h-[85vh] overflow-y-auto">
        <DialogHeader className="space-y-3 pb-4">
          <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-2 shadow-inner">
            <Mail className="w-6 h-6 text-primary" />
          </div>
          <DialogTitle className="text-2xl font-black text-foreground tracking-tight">Expand Your Team</DialogTitle>
          <DialogDescription className="font-medium text-muted-foreground">
            {generatedLink ? "Share this secure link with the new team member." : "New members will receive an invite to secure their account."}
          </DialogDescription>
        </DialogHeader>

        {generatedLink ? (
          <div className="space-y-6 py-4">
            <div className="p-4 bg-primary/5 border border-teal-100 rounded-2xl">
              <p className="text-sm text-teal-800 font-medium mb-3">Copy this link and send it directly to <b>{email}</b> so they can complete their sign up.</p>
              <div className="flex items-center gap-2">
                <Input value={generatedLink} readOnly className="bg-card rounded-xl h-11 border-primary/20 text-muted-foreground" />
                <Button 
                  className="bg-primary hover:bg-primary text-primary-foreground rounded-xl h-11 px-4"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedLink);
                    toast.success("Link copied to clipboard!");
                  }}
                >
                  <FileText className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <Button 
              className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-2xl h-12"
              onClick={() => {
                setGeneratedLink(''); setEmail(''); setRole('ground_staff'); setPermissions(defaultPermissionMatrix('ground_staff'));
                onClose();
              }}
            >
              Done
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-5 py-2">
          {/* Step 0: Email */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider pl-1">Email Address</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@yourcompany.com"
              className="h-12 rounded-2xl border-border"
            />
          </div>

          {/* Step 1: Role */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider pl-1">Role</Label>
            <Select value={role} onValueChange={(nextRole) => {
                setRole(nextRole);
                setPermissions(defaultPermissionMatrix(nextRole));
                if (['tenant_super_admin', 'org_manager'].includes(nextRole) && canAssignOrganization) setAssignmentScope('organization');
                if (nextRole === 'branch_manager' && canAssignBrand) setAssignmentScope('brand');
                if (['location_manager', 'ground_staff'].includes(nextRole) && canAssignLocation) setAssignmentScope('location');
              }}>
              <SelectTrigger className="h-12 rounded-2xl border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-border">
                {[
                  ...Object.entries(Restops_ROLES).filter(([r]) => r !== 'platform_admin').map(([r, def]) => ({ id: r, name: r, label: def.label, icon: def.icon })),
                  ...(dbRoles?.filter(r => !r.is_system).map(r => ({ id: r.name, name: r.name, label: r.name, icon: Users })) || [])
                ].map((r) => (
                  <SelectItem key={r.id} value={r.id} className="rounded-xl font-bold py-2.5">
                    <div className="flex items-center gap-2">
                      <r.icon className="w-4 h-4 text-muted-foreground" />
                      <span className="capitalize">{r.label.replace('_', ' ')}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider pl-1">Member Scope</Label>
            <Select value={assignmentScope} onValueChange={(scope) => {
              setAssignmentScope(scope);
              if (scope === 'organization') {
                setSelectedBrandId('');
                setSelectedLocationId('');
              }
              if (scope === 'brand') setSelectedLocationId('');
            }}>
              <SelectTrigger className="h-12 rounded-2xl border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-border">
                {canAssignOrganization && <SelectItem value="organization">Organization-wide</SelectItem>}
                {canAssignBrand && <SelectItem value="brand">Brand-wide</SelectItem>}
                {canAssignLocation && <SelectItem value="location">Specific location</SelectItem>}
              </SelectContent>
            </Select>

            {(assignmentScope === 'brand' || assignmentScope === 'location') && (
              <Select value={selectedBrandId || undefined} onValueChange={(brandId) => {
                setSelectedBrandId(brandId);
                setSelectedLocationId('');
              }}>
                <SelectTrigger className="h-12 rounded-2xl border-border">
                  <div className="flex items-center gap-2">
                    <Store className="w-4 h-4 text-muted-foreground" />
                    <SelectValue placeholder="Select brand" />
                  </div>
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-border">
                  {visibleBrands.map((brand) => (
                    <SelectItem key={brand.brand_id} value={brand.brand_id}>{brand.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {assignmentScope === 'location' && (
              <Select value={selectedLocationId || undefined} onValueChange={(locationId) => {
                const location = assignableLocations.find((entry) => entry.id === locationId);
                setSelectedLocationId(locationId);
                if (location?.brand_id) setSelectedBrandId(location.brand_id);
              }}>
                <SelectTrigger className="h-12 rounded-2xl border-border">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <SelectValue placeholder="Select location" />
                  </div>
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-border">
                  {visibleLocations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider pl-1">Read, Write, Update Access</Label>
            <PermissionMatrixEditor value={permissions} onChange={setPermissions} compact />
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button variant="outline" className="flex-1 rounded-2xl h-12" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1 rounded-2xl h-12 bg-primary hover:bg-primary text-primary-foreground shadow-lg shadow-primary/10"
            onClick={handleSubmit}
            disabled={sending || !email}
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
            Generate Link
          </Button>
        </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// CSVUploadDialog 
function CSVUploadDialog({ open, onClose, orgId }) {
  const queryClient = useQueryClient();
  const { confirm } = useConfirmation();
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState([]);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { toast.error('CSV must have a header and at least one row'); return; }
      const header = lines[0].split(',').map(h => h.trim().toLowerCase());
      const rows = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim());
        const obj = {};
        header.forEach((h, i) => { obj[h] = vals[i] || ''; });
        return obj;
      });
      setParsed(rows);
    };
    reader.readAsText(f);
  };

  const handleUpload = async () => {
    if (parsed.length === 0) return;
    const proceed = await confirm({
      title: `Invite ${parsed.length} Users?`,
      description: `This will send real invitation emails and create invitation rows for all ${parsed.length} rows parsed from the CSV.`,
      confirmText: `Invite ${parsed.length} Users`,
      cancelText: 'Cancel',
      variant: 'warning',
    });
    if (!proceed) return;
    setUploading(true);
    let successCount = 0;
    for (const row of parsed) {
      try {
        const email = row.email;
        const role = row.role || 'ground_staff';
        if (!email) continue;

        const { error: fnError } = await supabase.functions.invoke('invite-user', {
          body: { email, role, organization_id: orgId, onboarding_type: 'invited', permissions: defaultPermissionMatrix(role), modules: enabledModulesFromPermissions(defaultPermissionMatrix(role)) }
        });
        if (fnError) {
          // Fallback
          await supabase.from("invitations").insert([{
            email, role, organization_id: orgId,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            metadata: { permissions: defaultPermissionMatrix(role), modules: enabledModulesFromPermissions(defaultPermissionMatrix(role)), assignment_scope: 'organization', assignment_label: 'Organization-wide' },
          }]);
        }
        posthog.capture('team_member_invited', { role, method: 'csv' });
        successCount++;
      } catch (err) {
        console.warn('CSV row invite failed:', err.message);
      }
    }
    toast.success(`${successCount} of ${parsed.length} invitations sent`);
    queryClient.invalidateQueries({ queryKey: ['team-members'] });
    queryClient.invalidateQueries({ queryKey: ['users'] });
    setFile(null); setParsed([]);
    setUploading(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg rounded-[24px] p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Upload className="w-5 h-5 text-primary" /> Bulk Invite via CSV
          </DialogTitle>
          <DialogDescription>
            Upload a CSV with columns: <code className="text-xs bg-secondary px-1 rounded">email, role</code>
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="border-2 border-dashed border-border rounded-2xl p-6 text-center hover:border-teal-300 transition-colors">
            <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" id="csv-upload" />
            <label htmlFor="csv-upload" className="cursor-pointer">
              <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium text-muted-foreground">{file ? file.name : 'Click to upload CSV file'}</p>
              <p className="text-xs text-muted-foreground mt-1">Supports .csv files</p>
            </label>
          </div>

          {parsed.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-muted-foreground">{parsed.length} users found:</p>
              <div className="max-h-40 overflow-y-auto border rounded-xl">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary">
                      <TableHead className="text-[10px]">EMAIL</TableHead>
                      <TableHead className="text-[10px]">ROLE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{row.email}</TableCell>
                        <TableCell className="text-xs">{Restops_ROLES[row.role]?.label || row.role || 'Ground Staff'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleUpload} disabled={uploading || parsed.length === 0} className="bg-primary hover:bg-primary text-primary-foreground">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Invite {parsed.length} Users
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Main UserManagement Component 
export default function UserManagement() {
  const { confirm } = useConfirmation();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showInvite, setShowInvite] = useState(false);
  const [showCSV, setShowCSV] = useState(false);
  const [drawerMember, setDrawerMember] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [activeTab, setActiveTab] = useState("members");
  const [customRoles, setCustomRoles] = useState([]);

  const queryClient = useQueryClient();
  const { user: currentUser, role: userRole, userProfile } = useAuth();
  const { isPlatformAdmin, isBranchManager, isLocationManager, roleLevel } = usePermissions();
  const activeOrgId = userProfile?.organization_id;
  const activeBrandId = userProfile?.brand_id;
  const activeLocationId = userProfile?.location_id;

  // -- Realtime subscription for user management --
  useEffect(() => {
    const channel = supabase.channel('usermgmt-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        queryClient.invalidateQueries({ queryKey: ['team-members'] });
        queryClient.invalidateQueries({ queryKey: ['users'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invitations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['team-members'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'roles' }, () => {
        queryClient.invalidateQueries({ queryKey: ['custom-roles'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

 // Fetch custom roles 
  useAuthQuery({
    queryKey: ['custom-roles', activeOrgId],
    queryFn: async () => {
      if (!activeOrgId) return [];
      const { data, error } = await supabase
        .from('roles')
        .select('id, name, color, description')
        .eq('organization_id', activeOrgId)
        .eq('is_system', false);
      if (error) throw error;
      setCustomRoles(data || []);
      return data;
    },
    enabled: !!activeOrgId,
  });

  // Fetch brands/locations for the org, to resolve hierarchy names on each member row
  const { data: orgBrands = [] } = useAuthQuery({
    queryKey: ['org-brands-for-users', activeOrgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('brands').select('brand_id, name').eq('organization_id', activeOrgId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeOrgId,
  });

  const { data: orgLocations = [] } = useAuthQuery({
    queryKey: ['org-locations-for-users', activeOrgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('locations').select('id, name, brand_id').eq('organization_id', activeOrgId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeOrgId,
  });

  // Merge Restops_ROLES and customRoles
  const ALL_ROLES = useMemo(() => {
    const merged = { ...Restops_ROLES };
    customRoles.forEach(r => {
      merged[r.name] = {
        label: r.name,
        color: r.color || 'slate',
        description: r.description || 'Custom organization role',
        icon: Key,
        isCustom: true,
      };
    });
    return merged;
  }, [customRoles]);

 // Fetch team members 
  const { data: members = [], isLoading } = useAuthQuery({
    queryKey: ['team-members', activeOrgId, activeBrandId, activeLocationId, showArchived],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, updated_at, location_id, brand_id, role, status, invoice_approval_limit, has_unlimited_approval, access_permissions')
        .eq('organization_id', activeOrgId);

      if (error) throw error;

      const finalUsers = (data || []).map(p => ({
        ...p,
        membership_id: p.id,
        user_id: p.id,
        profiles: p,
      }));

      // Merge pending invitations
      try {
        const { data: invs } = await supabase.from('invitations')
          .select('id, email, role, token, created_at, brand_id, location_id, metadata')
          .eq('organization_id', activeOrgId)
          .is('accepted_at', null);
          
        if (invs) {
          invs.forEach(inv => {
            const existing = finalUsers.find(u => u.profiles?.email === inv.email || u.email === inv.email);
            if (!existing) {
              finalUsers.push({
                id: 'inv_' + inv.id,
                membership_id: 'inv_' + inv.id,
                user_id: 'inv_' + inv.id,
                email: inv.email,
                role: inv.role,
                brand_id: inv.brand_id || null,
                location_id: inv.location_id || null,
                status: 'invited',
                token: inv.token,
                profiles: { email: inv.email, full_name: 'Pending Invite', access_permissions: inv.metadata?.permissions || inv.metadata?.access || {} },
                created_at: inv.created_at
              });
            }
          });
        }
      } catch (e) { /* ignore */ }

      return finalUsers;
    },
    enabled: !!activeOrgId,
    staleTime: 30000,
  });

  // Client-side filtering for scope if needed (since memberships query might not filter by brand_id/location_id at DB level if they reside in profiles)
  const scopedMembers = useMemo(() => {
    return members.filter(m => {
      if (isPlatformAdmin || !userRole || ['org_manager', 'tenant_super_admin'].includes(userRole)) return true;
      if (isBranchManager) return m.brand_id === activeBrandId || m.profiles?.brand_id === activeBrandId;
      if (isLocationManager) return m.location_id === activeLocationId || m.profiles?.location_id === activeLocationId;
      return false; // Ground staff shouldn't be here, but just in case
    });
  }, [members, isPlatformAdmin, userRole, isBranchManager, isLocationManager, activeBrandId, activeLocationId]);

 // Filtering 
  const filteredMembers = useMemo(() => {
    return scopedMembers.filter(m => {
      const name = (m.profiles?.full_name || m.full_name || '').toLowerCase();
      const email = (m.profiles?.email || m.email || '').toLowerCase();
      const matchSearch = !search || name.includes(search.toLowerCase()) || email.includes(search.toLowerCase());
      const memberRole = m.role || m.capabilities?.role || 'ground_staff';
      const matchRole = roleFilter === 'all' || memberRole === roleFilter;
      return matchSearch && matchRole;
    });
  }, [scopedMembers, search, roleFilter]);

  // Group filtered members into the org's brand/location hierarchy
  const membersByLocation = useMemo(() => {
    const map = new Map();
    filteredMembers.forEach(m => {
      const locId = m.location_id || m.profiles?.location_id;
      if (!locId) return;
      if (!map.has(locId)) map.set(locId, []);
      map.get(locId).push(m);
    });
    return map;
  }, [filteredMembers]);

  const membersByBrandOnly = useMemo(() => {
    const map = new Map();
    filteredMembers.forEach(m => {
      const locId = m.location_id || m.profiles?.location_id;
      const brandId = m.brand_id || m.profiles?.brand_id;
      if (locId || !brandId) return;
      if (!map.has(brandId)) map.set(brandId, []);
      map.get(brandId).push(m);
    });
    return map;
  }, [filteredMembers]);

  const orgWideMembers = useMemo(() => filteredMembers.filter(m => {
    const locId = m.location_id || m.profiles?.location_id;
    const brandId = m.brand_id || m.profiles?.brand_id;
    return !locId && !brandId;
  }), [filteredMembers]);

 // Stats
  const stats = useMemo(() => {
    const total = scopedMembers.length;
    const active = scopedMembers.filter(m => m.status === 'active').length;
    const invited = scopedMembers.filter(m => m.status === 'invited').length;
    const admins = scopedMembers.filter(m => ['org_manager', 'tenant_super_admin', 'platform_admin'].includes(m.role || m.capabilities?.role)).length;
    return { total, active, invited, admins };
  }, [scopedMembers]);

  const canEdit = React.useCallback((targetMember) => {
    if (isPlatformAdmin) return true;
    const targetRole = targetMember.role || targetMember.capabilities?.role || 'ground_staff';
    const myLevel = roleLevel?.[userRole] ?? 0;
    const targetLevel = roleLevel?.[targetRole] ?? 0;
    
    // Org Manager can edit anyone in their org except Platform Admin
    if (myLevel >= 3 && targetLevel < 4) return true;
    
    // Branch Manager can edit Location Managers and Ground Staff (in their branch)
    if (myLevel === 2 && targetLevel < 2) return true;
    
    // Location Manager can edit Ground Staff (in their location)
    if (myLevel === 1 && targetLevel < 1) return true;
    
    return false;
  }, [isPlatformAdmin, userRole, roleLevel]);

  return (
    <div className="w-full max-w-[2400px] mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Dynamic Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-card rounded-2xl shadow-sm border border-border">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Team Members</h1>
          </div>
          <p className="text-muted-foreground font-medium pl-14">Manage organization team members, roles, and account status.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-12 rounded-2xl" onClick={() => setShowCSV(true)}>
            <Upload className="h-4 w-4 mr-2" /> CSV Import
          </Button>
          <Button 
            onClick={() => setShowInvite(true)} 
            className="bg-primary hover:bg-primary text-primary-foreground shadow-lg shadow-primary/10 px-6 h-12 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <PlusCircle className="h-5 w-5 mr-2" />
            Add New Member
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {[
          { label: 'Total Members', value: stats.total, icon: Users, color: 'text-foreground', bg: 'bg-card' },
          { label: 'Active Accounts', value: stats.active, icon: UserCheck, color: 'text-resend-green', bg: 'bg-resend-green/5/30' },
          { label: 'Pending Invites', value: stats.invited, icon: Clock, color: 'text-resend-yellow', bg: 'bg-resend-yellow/5/50' },
          { label: 'Admin Roles', value: stats.admins, icon: ShieldCheck, color: 'text-rose-600', bg: 'bg-rose-50/20' },
        ].map((stat, i) => (
          <Card key={i} className={cn("border-0 shadow-sm rounded-[24px]", stat.bg)}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{stat.label}</p>
                  <p className={cn("text-3xl font-black", stat.color)}>{stat.value}</p>
                </div>
                <div className="p-3 bg-card rounded-2xl shadow-sm border border-border">
                  <stat.icon className={cn("w-6 h-6", stat.color)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-card shadow-sm rounded-xl p-1 border border-border">
          <TabsTrigger value="members" className="rounded-lg px-6 font-bold">Team Members</TabsTrigger>
          {(['org_manager', 'tenant_super_admin'].includes(userRole) || isPlatformAdmin) && (
            <TabsTrigger value="roles" className="rounded-lg px-6 font-bold">Role Builder</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="members" className="space-y-4 animate-in fade-in">
      {/* Table & Controls Section */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="flex-1 flex flex-col md:flex-row gap-4 w-full">
            <div className="relative flex-1 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <Input
                placeholder="Filter by name or email address..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-11 h-12 rounded-2xl border-border bg-card/50 backdrop-blur-sm focus:bg-card transition-all shadow-sm"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full md:w-56 h-12 rounded-2xl border-border bg-card shadow-sm">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-muted-foreground" />
                  <SelectValue placeholder="All Roles" />
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-border shadow-xl">
                <SelectItem value="all">All Roles</SelectItem>
                {Object.entries(Restops_ROLES).map(([r, def]) => (
                  <SelectItem key={r} value={r}>{def.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 px-2 shrink-0">
            <input 
              type="checkbox" 
              id="showArchived" 
              checked={showArchived} 
              onChange={e => setShowArchived(e.target.checked)} 
              className="rounded border-border text-primary focus:ring-ring cursor-pointer w-4 h-4" 
            />
            <label htmlFor="showArchived" className="text-sm font-semibold text-muted-foreground cursor-pointer">Show Past Users</label>
          </div>
        </div>

        {isLoading ? (
          <Card className="border-0 shadow-xl shadow-slate-200/50 rounded-[32px] bg-card">
            <div className="h-64 flex flex-col items-center justify-center gap-4">
              <div className="w-12 h-12 border-4 border-teal-50 border-t-teal-600 rounded-full animate-spin"></div>
              <p className="text-sm font-bold text-muted-foreground">Syncing user database...</p>
            </div>
          </Card>
        ) : filteredMembers.length === 0 ? (
          <Card className="border-0 shadow-xl shadow-slate-200/50 rounded-[32px] bg-card">
            <div className="h-64 flex flex-col items-center justify-center gap-3">
              <div className="p-4 bg-secondary rounded-full">
                <UserX className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-sm font-bold text-muted-foreground">No matching team members found.</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-6">
            {orgBrands.map(brand => {
              const brandLocations = orgLocations.filter(l => l.brand_id === brand.brand_id);
              const brandOnlyMembers = membersByBrandOnly.get(brand.brand_id) || [];
              const brandTotal = brandOnlyMembers.length + brandLocations.reduce((sum, l) => sum + (membersByLocation.get(l.id)?.length || 0), 0);
              if (brandTotal === 0) return null;

              return (
                <Card key={brand.brand_id} className="border-0 shadow-xl shadow-slate-200/50 rounded-[32px] overflow-hidden bg-card">
                  <div className="p-5 border-b border-border bg-secondary/30 flex items-center gap-3">
                    <div className="w-10 h-10 bg-card shadow-sm border border-border rounded-xl flex items-center justify-center shrink-0">
                      <Store className="w-5 h-5 text-foreground/80" />
                    </div>
                    <div>
                      <h3 className="font-black text-foreground">{brand.name}</h3>
                      <p className="text-[10px] text-muted-foreground font-medium">
                        {brandLocations.length} location{brandLocations.length !== 1 ? 's' : ''} &middot; {brandTotal} member{brandTotal !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="divide-y divide-border">
                    {brandOnlyMembers.length > 0 && (
                      <div className="py-2">
                        <p className="px-5 pt-2 pb-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Brand-wide</p>
                        <div className="divide-y divide-slate-50">
                          {brandOnlyMembers.map(m => (
                            <MemberRow key={m.membership_id || m.id} member={m} canEditRow={canEdit(m)} onSelect={setDrawerMember} activeOrgId={activeOrgId} />
                          ))}
                        </div>
                      </div>
                    )}
                    {brandLocations.filter(loc => (membersByLocation.get(loc.id)?.length || 0) > 0).map(loc => {
                      const locMembers = membersByLocation.get(loc.id) || [];
                      return (
                        <div key={loc.id} className="py-2">
                          <div className="flex items-center gap-2 px-5 pt-2 pb-1">
                            <MapPin className="w-3.5 h-3.5 text-muted-foreground/70" />
                            <span className="text-xs font-bold text-foreground/80">{loc.name}</span>
                            <Badge variant="secondary" className="bg-secondary text-muted-foreground font-bold border-none text-[10px]">
                              {locMembers.length} {locMembers.length === 1 ? 'Member' : 'Members'}
                            </Badge>
                          </div>
                          <div className="divide-y divide-slate-50">
                            {locMembers.map(m => (
                              <MemberRow key={m.membership_id || m.id} member={m} canEditRow={canEdit(m)} onSelect={setDrawerMember} activeOrgId={activeOrgId} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })}

            {orgWideMembers.length > 0 && (
              <Card className="border-0 shadow-xl shadow-slate-200/50 rounded-[32px] overflow-hidden bg-card">
                <div className="p-5 border-b border-border bg-secondary/30 flex items-center gap-3">
                  <div className="w-10 h-10 bg-card shadow-sm border border-border rounded-xl flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-foreground/80" />
                  </div>
                  <div>
                    <h3 className="font-black text-foreground">Organization-wide</h3>
                    <p className="text-[10px] text-muted-foreground font-medium">{orgWideMembers.length} member{orgWideMembers.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="divide-y divide-slate-50">
                  {orgWideMembers.map(m => (
                    <MemberRow key={m.membership_id || m.id} member={m} canEditRow={canEdit(m)} onSelect={setDrawerMember} activeOrgId={activeOrgId} />
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
        </TabsContent>

        <TabsContent value="roles" className="space-y-6 animate-in fade-in">
          <Card className="border-0 shadow-xl shadow-slate-200/50 rounded-[32px] overflow-hidden bg-card">
            <div className="p-8 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-foreground">Custom Roles</h3>
                <p className="text-sm text-muted-foreground mt-1">Create granular roles tailored to your organization's workflows.</p>
              </div>
              <Button
                className="bg-primary hover:bg-primary text-primary-foreground rounded-xl"
                onClick={() => toast.info('Custom role creation is available from Platform Admin role templates.')}
              >
                <PlusCircle className="w-4 h-4 mr-2" /> New Role
              </Button>
            </div>
            <div className="p-0">
              <Table>
                <TableHeader className="bg-secondary/50">
                  <TableRow className="h-12 border-border">
                    <TableHead className="pl-8 text-xs font-bold uppercase tracking-wider text-muted-foreground">Role Name</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Type</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground w-20 pr-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(ALL_ROLES).map(([rKey, def]) => (
                    <TableRow key={rKey} className="h-16 group hover:bg-secondary/30">
                      <TableCell className="pl-8">
                        <div className="flex items-center gap-3">
                          <div className={cn("p-2 rounded-xl border shadow-sm", ROLE_COLOR_CLASSES[def.color]?.badge)}>
                            <def.icon className="w-4 h-4" />
                          </div>
                          <span className="font-bold text-foreground">{def.label}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-md truncate">{def.description}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-medium text-xs">
                          {def.isCustom ? 'Custom Role' : 'System Role'}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-8">
                        {def.isCustom && (
                          <Button variant="ghost" size="icon" className="hover:text-resend-red hover:bg-red-50">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Drawer & Dialogs */}
      {drawerMember && (
        <UserDetailDrawer
          member={drawerMember}
          orgId={activeOrgId}
          onClose={() => setDrawerMember(null)}
        />
      )}
      <InviteDialog open={showInvite} onClose={() => setShowInvite(false)} orgId={activeOrgId} />
      <CSVUploadDialog open={showCSV} onClose={() => setShowCSV(false)} orgId={activeOrgId} />
    </div>
  );
}




