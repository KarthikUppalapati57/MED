import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { supabase } from '@/lib/supabaseClient';
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
  CheckCircle2,
  X,
  Loader2,
  Building2,
  Globe,
  ChevronDown,
  ChevronRight,
  FileText,
  DollarSign,
  BarChart2,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  PlusCircle,
  Clock,
  LayoutDashboard,
  Package,
  Receipt,
  Utensils,
  CreditCard,
  ShoppingCart,
  History
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from '@/lib/AuthContext';

// ─── MEVS Roles ─────────────────────────────────────────────────────────────
const MEVS_ROLES = {
  admin: { 
    label: "System Admin", 
    color: "rose", 
    description: "Full system access across the entire organization",
    icon: ShieldAlert
  },
  owner: { 
    label: "Owner", 
    color: "purple", 
    description: "Organization owner with billing and management access",
    icon: ShieldCheck
  },
  manager: { 
    label: "Manager", 
    color: "blue", 
    description: "Manages daily operations, inventory, and approvals",
    icon: UserCheck
  },
  ground_staff: { 
    label: "Ground Staff", 
    color: "teal", 
    description: "Can upload invoices and perform inventory counts",
    icon: Users
  },
  platform_admin: { 
    label: "Platform Admin", 
    color: "amber", 
    description: "Cross-platform architectural management (Super User)",
    icon: Globe
  }
};

const ROLE_COLOR_CLASSES = {
  rose:   { badge: "bg-rose-100 text-rose-700 border-rose-200",   dot: "bg-rose-500" },
  purple: { badge: "bg-purple-100 text-purple-700 border-purple-200", dot: "bg-purple-500" },
  blue:   { badge: "bg-blue-100 text-blue-700 border-blue-200",     dot: "bg-blue-500" },
  teal:   { badge: "bg-teal-100 text-teal-700 border-teal-200",     dot: "bg-teal-500" },
  amber:  { badge: "bg-amber-100 text-amber-700 border-amber-200",  dot: "bg-amber-500" },
  slate:  { badge: "bg-slate-100 text-slate-600 border-slate-200",   dot: "bg-slate-400" },
};

// ─── MEVS Permission Groups ────────────────────────────────────────────────
const PAGE_PERMISSION_GROUPS = [
  {
    key: "core", label: "General", icon: <LayoutDashboard className="w-4 h-4" />,
    pages: [
      { key: "Dashboard", label: "Main Dashboard" },
      { key: "AuditLogs", label: "Audit Logs" },
    ],
  },
  {
    key: "inventory", label: "Inventory & Products", icon: <Package className="w-4 h-4" />,
    pages: [
      { key: "Inventory", label: "Stock Management" },
      { key: "Products", label: "Product Master" },
      { key: "Recipes", label: "Recipe Costing" },
    ],
  },
  {
    key: "finance", label: "Finance", icon: <Receipt className="w-4 h-4" />,
    pages: [
      { key: "Invoices", label: "Invoice Processing" },
      { key: "Payments", label: "Vendor Payments" },
    ],
  },
  {
    key: "supply", label: "Supply Chain", icon: <ShoppingCart className="w-4 h-4" />,
    pages: [
      { key: "Vendors", label: "Vendor Management" },
      { key: "AutoOrdering", label: "Intelligent Ordering" },
    ],
  },
  {
    key: "admin", label: "Administration", icon: <Settings className="w-4 h-4" />,
    pages: [
      { key: "UserManagement", label: "Team Management" },
      { key: "Onboarding", label: "Onboarding Flow" },
    ],
  },
];

const ACCESS_LEVELS = {
  full: { label: "Full", chipClass: "bg-emerald-100 text-emerald-700 border-emerald-200", btnActive: "bg-emerald-600 text-white border-transparent" },
  read: { label: "Read", chipClass: "bg-sky-100 text-sky-700 border-sky-200", btnActive: "bg-sky-600 text-white border-transparent" },
  none: { label: "None", chipClass: "bg-slate-100 text-slate-400 border-slate-200", btnActive: "bg-slate-200 text-slate-600 border-transparent" },
};

const STATUS_CONFIG = {
  active:   { label: "Active", badgeClass: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  invited:  { label: "Invited", badgeClass: "bg-amber-100 text-amber-700", icon: Mail },
  inactive: { label: "Inactive", badgeClass: "bg-red-100 text-red-600", icon: UserX },
};

// ─── Utilities ─────────────────────────────────────────────────────────────
function avatarColor(email = "") {
  const colors = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#14b8a6"];
  let h = 0;
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) % colors.length;
  return colors[h];
}

// ─── PagePermissionMatrix ──────────────────────────────────────────────────
function PagePermissionMatrix({ permissions, onChange, readonly = false }) {
  const [expanded, setExpanded] = useState({ core: true, inventory: true, finance: true });

  const toggleGroup = (key) => setExpanded(e => ({ ...e, [key]: !e[key] }));

  const groupAccess = (group) => {
    const levels = group.pages.map(p => permissions?.[p.key] || "none");
    if (levels.every(l => l === "full")) return "full";
    if (levels.every(l => l === "none")) return "none";
    return "mixed";
  };

  const setGroupAccess = (group, level) => {
    group.pages.forEach(p => onChange(p.key, level));
  };

  return (
    <div className="space-y-1">
      {PAGE_PERMISSION_GROUPS.map(group => {
        const isOpen = expanded[group.key];
        const groupLevel = groupAccess(group);
        return (
          <div key={group.key} className="border border-slate-200 rounded-xl overflow-hidden mb-2">
            <div
              className={cn(
                "flex items-center justify-between px-3 py-2.5 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors",
                !isOpen && "bg-white"
              )}
              onClick={() => toggleGroup(group.key)}
            >
              <div className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  {group.icon}
                  {group.label}
                </span>
                {groupLevel === "mixed" && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 font-semibold border border-amber-200">Mixed Access</span>}
              </div>
              {!readonly && (
                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                  {Object.entries(ACCESS_LEVELS).map(([l, cfg]) => (
                    <button
                      key={l}
                      onClick={() => setGroupAccess(group, l)}
                      className={`text-[9px] px-2 py-0.5 rounded-lg font-semibold border transition-all ${
                        groupLevel === l ? cfg.btnActive : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                      }`}
                    >
                      {cfg.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {isOpen && (
              <div className="divide-y divide-slate-100 px-1 pb-1">
                {group.pages.map(page => {
                  const current = permissions?.[page.key] || "none";
                  return (
                    <div key={page.key} className="flex items-center justify-between px-3 py-2">
                      <span className="text-xs text-slate-600">{page.label}</span>
                      {readonly ? (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${ACCESS_LEVELS[current]?.chipClass}`}>
                          {ACCESS_LEVELS[current]?.label}
                        </span>
                      ) : (
                        <div className="flex gap-1">
                          {Object.entries(ACCESS_LEVELS).map(([l, cfg]) => (
                            <button
                              key={l}
                              onClick={() => onChange(page.key, l)}
                              className={`text-[9px] px-2.5 py-1 rounded-lg font-semibold border transition-all ${
                                current === l ? cfg.btnActive : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 shadow-sm"
                              }`}
                            >
                              {cfg.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── UserDetailDrawer ───────────────────────────────────────────────────────
function UserDetailDrawer({ member, onClose }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("permissions");
  const [form, setForm] = useState({
    role: member.role || 'ground_staff',
    department: member.department || '',
    location: member.location || '',
    status: member.status || 'active',
    permissions: member.permissions || {}
  });
  const [saving, setSaving] = useState(false);
  
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.admin.updateUserRole({
      targetUserId: id,
      newRole: data.role,
      newStatus: data.status,
      newDepartment: data.department,
      newLocation: data.location,
      newPermissions: data.permissions
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User updated successfully');
      onClose();
    },
    onError: (err) => {
      toast.error('Failed to update: ' + err.message);
    }
  });

  const handleSave = () => {
    setSaving(true);
    updateMutation.mutate({ id: member.id, data: form });
  };

  const roleDef = MEVS_ROLES[form.role] || MEVS_ROLES.ground_staff;
  const statusDef = STATUS_CONFIG[form.status] || STATUS_CONFIG.active;
  const RoleIcon = roleDef.icon;

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-50 animate-in fade-in" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-200">
              <Users className="w-5 h-5 text-teal-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Edit Team Member</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl hover:bg-slate-100">
            <X className="w-5 h-5 text-slate-500" />
          </Button>
        </div>

        {/* Profile Card */}
        <div className="px-6 py-6 border-b border-slate-100">
          <div className="flex items-start gap-4 p-4 rounded-2xl bg-teal-50/30 border border-teal-100">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-lg ring-4 ring-white"
              style={{ backgroundColor: avatarColor(member.email) }}>
              {member.full_name?.charAt(0) || member.email?.charAt(0) || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-slate-900 truncate">{member.full_name || 'Anonymous User'}</h3>
              <p className="text-sm text-slate-600 truncate mb-2">{member.email}</p>
              <div className="flex flex-wrap gap-2">
                <Badge className={cn("px-2.5 py-0.5 border flex items-center gap-1.5", ROLE_COLOR_CLASSES[roleDef.color].badge)}>
                  <RoleIcon className="w-3 h-3" />
                  {roleDef.label}
                </Badge>
                <Badge className={cn("px-2.5 py-0.5 border flex items-center gap-1.5 shadow-sm bg-white text-slate-700")}>
                  {statusDef.label}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Custom Tabs */}
        <div className="flex border-b border-slate-100 px-6 bg-white sticky top-0 z-10">
          {[
            { id: 'permissions', label: 'Access Rights', icon: ShieldCheck },
            { id: 'profile', label: 'Organization Info', icon: Building2 }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-4 text-sm font-semibold border-b-2 transition-all",
                activeTab === tab.id
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {activeTab === 'permissions' ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">System Role</Label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(MEVS_ROLES).map(([r, def]) => {
                    const isSelected = form.role === r;
                    const Icon = def.icon;
                    return (
                      <button
                        key={r}
                        onClick={() => setForm({ ...form, role: r })}
                        className={cn(
                          "flex flex-col items-start p-3 rounded-xl border text-left transition-all group",
                          isSelected 
                            ? "bg-teal-50 border-teal-600 ring-4 ring-teal-50" 
                            : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                        )}
                      >
                        <div className={cn("p-1.5 rounded-lg mb-2 transition-colors", isSelected ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-500 group-hover:bg-white")}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className={cn("text-xs font-bold", isSelected ? "text-teal-900" : "text-slate-700")}>{def.label}</span>
                        <span className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">{def.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3 pt-6 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Granular Page Access</Label>
                  <Button variant="ghost" size="sm" className="h-7 text-[10px] text-teal-600 font-bold" onClick={() => setForm({...form, permissions: {}})}>Reset All</Button>
                </div>
                <PagePermissionMatrix
                  permissions={form.permissions}
                  onChange={(page, level) => setForm({
                    ...form,
                    permissions: { ...form.permissions, [page]: level }
                  })}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Department</Label>
                  <Input 
                    placeholder="e.g. Kitchen, Admin" 
                    value={form.department}
                    onChange={e => setForm({...form, department: e.target.value})}
                    className="rounded-xl border-slate-200 focus:ring-teal-500/10 focus:border-teal-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-600 uppercase">Primary Location</Label>
                  <Input 
                    placeholder="e.g. Main Branch" 
                    value={form.location}
                    onChange={e => setForm({...form, location: e.target.value})}
                    className="rounded-xl border-slate-200 focus:ring-teal-500/10 focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold text-slate-600 uppercase">Account Status</Label>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(STATUS_CONFIG).map(([s, def]) => (
                    <button
                      key={s}
                      onClick={() => setForm({ ...form, status: s })}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border transition-all",
                        form.status === s 
                          ? "bg-slate-50 border-slate-900 shadow-sm" 
                          : "bg-white border-slate-200 text-slate-500 grayscale opacity-60 hover:grayscale-0 hover:opacity-100"
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
        <div className="px-6 py-6 border-t border-slate-100 bg-slate-50 mt-auto">
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-xl h-11 border-slate-200" onClick={onClose} disabled={saving}>
              Discard Changes
            </Button>
            <Button 
              className="flex-1 rounded-xl h-11 bg-teal-600 hover:bg-teal-700 text-white shadow-lg shadow-teal-500/20" 
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

// ─── Main UserManagement Component ──────────────────────────────────────────
export default function UserManagement() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'ground_staff' });
  const [inviting, setInviting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(null);
  
  const queryClient = useQueryClient();
  const { user: currentUser, role: userRole, userProfile } = useAuth();

  const { data: users = [], isLoading, isError, error: queryError, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const data = await api.entities.User.list('-created_at');
      return data;
    },
    retry: 1,
    staleTime: 30000,
  });

  const handleInvite = async () => {
    if (!inviteForm.email) {
      toast.error('Email is required');
      return;
    }

    setInviting(true);
    try {
      const isOrgLevel = ['admin', 'owner'].includes(inviteForm.role);
      const invite = await api.entities.Invitation.create({
        email: inviteForm.email,
        role: inviteForm.role,
        invited_by: currentUser?.id,
        organization_id: userProfile?.organization_id,
        brand_id: isOrgLevel ? null : userProfile?.brand_id,
        location_id: isOrgLevel ? null : userProfile?.location_id,
        access_level: isOrgLevel ? 'organization' : 'location',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });

      if (invite?.token) {
        const link = `${window.location.origin}/signup/${invite.token}`;
        setCopiedLink(link);
        await navigator.clipboard.writeText(link);
        toast.success('Invitation link copied!');
      }
    } catch (error) {
      toast.error('Invitation failed: ' + error.message);
    } finally {
      setInviting(false);
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = !search || 
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const canEdit = (targetUser) => {
    if (userRole === 'platform_admin') return true;
    if (userRole === 'admin') return targetUser.role !== 'platform_admin';
    if (userRole === 'owner') return !['platform_admin', 'admin'].includes(targetUser.role);
    return false;
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Dynamic Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white rounded-2xl shadow-sm border border-slate-200">
              <Users className="w-6 h-6 text-teal-600" />
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Team Management</h1>
          </div>
          <p className="text-slate-500 font-medium pl-14">Configure granular access and organizational roles for your staff.</p>
        </div>
        <Button 
          onClick={() => setInviteDialogOpen(true)} 
          className="bg-teal-600 hover:bg-teal-700 text-white shadow-lg shadow-teal-500/20 px-6 h-12 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <PlusCircle className="h-5 w-5 mr-2" />
          Add New Member
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {[
          { label: 'Total Members', value: users.length, icon: Users, color: 'text-slate-900', bg: 'bg-white' },
          { label: 'active accounts', value: users.filter(u => u.status === 'active').length, icon: UserCheck, color: 'text-emerald-600', bg: 'bg-emerald-50/30' },
          { label: 'pending invites', value: users.filter(u => u.status === 'invited').length, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50/50' },
          { label: 'admin roles', value: users.filter(u => ['admin', 'owner', 'platform_admin'].includes(u.role)).length, icon: ShieldCheck, color: 'text-rose-600', bg: 'bg-rose-50/20' },
        ].map((stat, i) => (
          <Card key={i} className={cn("border-0 shadow-sm rounded-[24px]", stat.bg)}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{stat.label}</p>
                  <p className={cn("text-3xl font-black", stat.color)}>{stat.value}</p>
                </div>
                <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-100">
                  <stat.icon className={cn("w-6 h-6", stat.color)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table & Controls Section */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 transition-colors group-focus-within:text-teal-600" />
            <Input
              placeholder="Filter by name or email address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-11 h-12 rounded-2xl border-slate-200 bg-white/50 backdrop-blur-sm focus:bg-white transition-all shadow-sm"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full md:w-56 h-12 rounded-2xl border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-slate-400" />
                <SelectValue placeholder="All Roles" />
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-2xl border-slate-100 shadow-xl">
              <SelectItem value="all">All Access Levels</SelectItem>
              {Object.entries(MEVS_ROLES).map(([r, def]) => (
                <SelectItem key={r} value={r}>{def.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card className="border-0 shadow-xl shadow-slate-200/50 rounded-[32px] overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/50 border-b border-slate-100">
                <TableRow className="hover:bg-transparent border-0 h-14">
                  <TableHead className="pl-8 text-xs font-bold text-slate-500 uppercase">Identity</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 uppercase">Access Level</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 uppercase">Organization</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 uppercase">Permissions</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 uppercase">Last Seen</TableHead>
                  <TableHead className="w-20 pr-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-64 text-center">
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-12 h-12 border-4 border-teal-50 border-t-teal-600 rounded-full animate-spin"></div>
                        <p className="text-sm font-bold text-slate-400">Syncing user database...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-64 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="p-4 bg-slate-50 rounded-full">
                          <UserX className="w-8 h-8 text-slate-300" />
                        </div>
                        <p className="text-sm font-bold text-slate-400">No matching team members found.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => {
                    const role = MEVS_ROLES[user.role] || MEVS_ROLES.ground_staff;
                    const status = STATUS_CONFIG[user.status] || STATUS_CONFIG.active;
                    const hasElevatedAccess = ['admin', 'owner', 'platform_admin'].includes(user.role);
                    
                    return (
                      <TableRow key={user.id} className="group hover:bg-slate-50/50 transition-colors border-slate-50 h-20">
                        <TableCell className="pl-8">
                          <div className="flex items-center gap-4">
                            <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-bold text-sm shadow-sm transition-transform group-hover:scale-105"
                              style={{ backgroundColor: avatarColor(user.email) }}>
                              {user.full_name?.charAt(0) || user.email?.charAt(0)}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900 leading-tight">
                                {user.full_name || 'Verification Pending'}
                              </span>
                              <span className="text-xs text-slate-500">{user.email}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("px-3 py-1 rounded-xl font-bold text-[10px] items-center gap-1.5 border shadow-sm", ROLE_COLOR_CLASSES[role.color].badge)}>
                            <role.icon className="w-3 h-3" />
                            {role.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                              <Building2 className="w-3 h-3 text-slate-400" />
                              {user.department || 'N/A'}
                            </div>
                            <span className="text-[10px] text-slate-400 font-medium pl-4.5">{user.location || 'Central Office'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {hasElevatedAccess ? (
                              <Badge variant="outline" className="text-[9px] uppercase font-bold bg-amber-50 text-amber-700 border-amber-200">System Root</Badge>
                            ) : (
                              Object.entries(user.permissions || {}).slice(0, 3).map(([key, value]) => (
                                value === 'full' && (
                                  <Badge key={key} variant="outline" className="text-[9px] uppercase font-bold bg-teal-50 text-teal-700 border-teal-200">
                                    {key.replace('can_', '').slice(0, 5)}
                                  </Badge>
                                )
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-700">
                              {user.last_login ? format(new Date(user.last_login), 'MMM d, yyyy') : 'Invited'}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {user.last_login ? 'Last authenticated' : 'Registration pending'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="pr-8">
                          {canEdit(user) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="group-hover:bg-white rounded-xl">
                                  <MoreVertical className="h-4 w-4 text-slate-400" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="rounded-2xl border-slate-100 shadow-xl p-2 w-48">
                                <DropdownMenuItem onClick={() => setEditingUser(user)} className="rounded-xl px-3 py-2 cursor-pointer font-bold text-xs text-slate-700">
                                  <Edit2 className="h-4 w-4 mr-3 text-teal-600" /> Advanced Settings
                                </DropdownMenuItem>
                                <DropdownMenuItem className="rounded-xl px-3 py-2 cursor-pointer font-bold text-xs text-red-600 hover:bg-red-50">
                                  <Trash2 className="h-4 w-4 mr-3" /> Deactivate account
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {/* Invite Member Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="max-w-md rounded-[32px] p-8">
          <DialogHeader className="space-y-3 pb-4">
            <div className="w-12 h-12 bg-teal-100 rounded-2xl flex items-center justify-center mb-2 shadow-inner">
              <Mail className="w-6 h-6 text-teal-600" />
            </div>
            <DialogTitle className="text-2xl font-black text-slate-900 tracking-tight">Expand Your Team</DialogTitle>
            <DialogDescription className="font-medium text-slate-500">
              New members will receive an invite to secure their account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider pl-1">Email Address</Label>
              <Input
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                placeholder="colleague@yourcompany.com"
                className="h-12 rounded-2xl border-slate-200 focus:ring-teal-500/10 focus:border-teal-500 text-sm font-medium"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider pl-1">Default Access Level</Label>
              <Select value={inviteForm.role} onValueChange={(r) => setInviteForm({ ...inviteForm, role: r })}>
                <SelectTrigger className="h-12 rounded-2xl border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-slate-100">
                  {Object.entries(MEVS_ROLES).map(([r, def]) => (
                    <SelectItem key={r} value={r} className="rounded-xl font-bold py-2.5">
                      <div className="flex items-center gap-2">
                        <def.icon className="w-4 h-4 text-slate-400" />
                        {def.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="pt-6">
            {copiedLink ? (
              <div className="p-4 bg-emerald-50 rounded-[20px] border border-emerald-100 flex items-center justify-between animate-in zoom-in-95">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500 rounded-xl text-white shadow-sm">
                    <Check className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-emerald-900">Link Generated & Copied!</p>
                    <p className="text-[10px] text-emerald-600 font-medium">Ready to share via Slack or Whatsapp</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setCopiedLink(null)} className="text-xs font-bold text-emerald-700">Reset</Button>
              </div>
            ) : (
              <Button 
                onClick={handleInvite} 
                disabled={inviting || !inviteForm.email}
                className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl shadow-xl shadow-slate-200 transition-all active:scale-95"
              >
                {inviting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <PlusCircle className="h-5 w-5 mr-2" />}
                Generate Secure Invite Link
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* User settings drawer */}
      {editingUser && (
        <UserDetailDrawer 
          member={editingUser} 
          onClose={() => setEditingUser(null)} 
        />
      )}
    </div>
  );
}