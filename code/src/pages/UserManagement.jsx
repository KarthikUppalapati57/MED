import React, { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { logAudit } from '@/lib/audit';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Search, Edit2, Trash2, Users, Mail, Shield, MoreVertical,
  CheckCircle2, X, Loader2, Building2, Globe, ChevronDown, ChevronRight,
  FileText, Settings, ShieldAlert, ShieldCheck,
  UserCheck, UserX, PlusCircle, Clock, LayoutDashboard, Package, Receipt, ShoppingCart, Upload, AlertCircle, RefreshCw
} from 'lucide-react';

// ─── MEVS Roles ─────────────────────────────────────────────────────────────
const MEVS_ROLES = {
  admin:          { label: "System Admin",    color: "rose",   description: "Full system access across the entire organization",   icon: ShieldAlert },
  owner:          { label: "Owner",           color: "purple", description: "Organization owner with billing and management access", icon: ShieldCheck },
  manager:        { label: "Manager",         color: "blue",   description: "Manages daily operations, inventory, and approvals",   icon: UserCheck },
  ground_staff:   { label: "Ground Staff",    color: "teal",   description: "Can upload invoices and perform inventory counts",     icon: Users },
  platform_admin: { label: "Platform Admin",  color: "amber",  description: "Cross-platform architectural management (Super User)", icon: Globe },
};

const ROLE_COLOR_CLASSES = {
  rose:   { badge: "bg-rose-100 text-rose-700 border-rose-200",       dot: "bg-rose-500" },
  purple: { badge: "bg-purple-100 text-purple-700 border-purple-200", dot: "bg-purple-500" },
  blue:   { badge: "bg-blue-100 text-blue-700 border-blue-200",       dot: "bg-blue-500" },
  teal:   { badge: "bg-teal-100 text-teal-700 border-teal-200",       dot: "bg-teal-500" },
  amber:  { badge: "bg-amber-100 text-amber-700 border-amber-200",   dot: "bg-amber-500" },
  slate:  { badge: "bg-slate-100 text-slate-600 border-slate-200",    dot: "bg-slate-400" },
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
  read: { label: "Read", chipClass: "bg-sky-100 text-sky-700 border-sky-200",             btnActive: "bg-sky-600 text-white border-transparent" },
  none: { label: "None", chipClass: "bg-slate-100 text-slate-400 border-slate-200",       btnActive: "bg-slate-200 text-slate-600 border-transparent" },
};

// ─── Signing Authority Levels (Adapted for MEVS) ───────────────────────────
const SIGNING_LEVELS = [
  { value: 0, label: "None",         badgeClass: "bg-slate-100 text-slate-500 border-slate-200" },
  { value: 1, label: "L1 – Review",  badgeClass: "bg-sky-100 text-sky-700 border-sky-200" },
  { value: 2, label: "L2 – Approve", badgeClass: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: 3, label: "L3 – Execute", badgeClass: "bg-violet-100 text-violet-700 border-violet-200" },
  { value: 4, label: "L4 – Final",   badgeClass: "bg-rose-100 text-rose-700 border-rose-200" },
];

const DOCUMENT_TYPES = [
  { key: "invoices",         label: "Invoices" },
  { key: "purchase_orders",  label: "Purchase Orders" },
  { key: "inventory_counts", label: "Inventory Counts" },
  { key: "payments",         label: "Payments" },
  { key: "expense_reports",  label: "Expense Reports" },
];

const STATUS_CONFIG = {
  active:   { label: "Active",   badgeClass: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  invited:  { label: "Invited",  badgeClass: "bg-amber-100 text-amber-700",     icon: Mail },
  inactive: { label: "Inactive", badgeClass: "bg-red-100 text-red-600",         icon: UserX },
  archived: { label: "Archived", badgeClass: "bg-slate-200 text-slate-700",     icon: UserX },
  no_access:{ label: "No Access",badgeClass: "bg-slate-100 text-slate-500",     icon: AlertCircle },
};

// ─── Utilities ─────────────────────────────────────────────────────────────
function avatarColor(email = "") {
  const colors = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#14b8a6"];
  let h = 0;
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) % colors.length;
  return colors[h];
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

// ─── SigningPrivilegesMatrix ───────────────────────────────────────────────
function SigningPrivilegesMatrix({ privileges = {}, onChange, readonly = false }) {
  return (
    <div className="space-y-2">
      {DOCUMENT_TYPES.map(doc => {
        const current = privileges[doc.key] || 0;
        const lvl = SIGNING_LEVELS.find(s => s.value === current) || SIGNING_LEVELS[0];
        return (
          <div key={doc.key} className="flex items-center justify-between px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-700">{doc.label}</span>
            </div>
            {readonly ? (
              <span className={`text-[10px] px-2.5 py-0.5 rounded-full border font-semibold ${lvl.badgeClass}`}>{lvl.label}</span>
            ) : (
              <div className="flex gap-1">
                {SIGNING_LEVELS.map(sl => (
                  <button
                    key={sl.value}
                    onClick={() => onChange(doc.key, sl.value)}
                    className={`text-[9px] px-2 py-0.5 rounded-lg font-semibold border transition-all ${
                      current === sl.value ? sl.badgeClass + ' ring-1 ring-offset-1' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    {sl.value === 0 ? '—' : `L${sl.value}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── RoleBadges ────────────────────────────────────────────────────────────
function RoleBadges({ member, maxVisible = 2 }) {
  const role = member.role || member.capabilities?.role || 'ground_staff';
  const roleDef = MEVS_ROLES[role] || MEVS_ROLES.ground_staff;
  const colors = ROLE_COLOR_CLASSES[roleDef.color] || ROLE_COLOR_CLASSES.slate;
  const Icon = roleDef.icon;
  return (
    <Badge className={cn("px-2 py-0.5 text-[10px] font-bold border gap-1", colors.badge)}>
      <Icon className="w-3 h-3" />
      {roleDef.label}
    </Badge>
  );
}

// ─── PageAccessChips ───────────────────────────────────────────────────────
function PageAccessChips({ pagePerms = {}, maxVisible = 3 }) {
  const entries = Object.entries(pagePerms).filter(([, v]) => v !== 'none');
  if (entries.length === 0) return <span className="text-[10px] text-slate-400 italic">Default</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.slice(0, maxVisible).map(([key, level]) => (
        <span key={key} className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${ACCESS_LEVELS[level]?.chipClass || ''}`}>
          {key}
        </span>
      ))}
      {entries.length > maxVisible && (
        <span className="text-[9px] text-slate-400">+{entries.length - maxVisible}</span>
      )}
    </div>
  );
}

// ─── UserDetailDrawer ───────────────────────────────────────────────────────
function UserDetailDrawer({ member, orgId, onClose }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("permissions");
  const [form, setForm] = useState({
    role: member.role || member.capabilities?.role || 'ground_staff',
    department: member.department || '',
    location: member.location || '',
    status: member.status || 'active',
    permissions: member.page_permissions || member.permissions || {},
    signingPrivileges: member.signing_privileges || member.capabilities?.signing_privileges || {},
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Try updating memberships first (CRE-style)
      const membershipId = member.membership_id || member.id;
      const capabilities = {
        role: form.role,
        signing_privileges: form.signingPrivileges,
      };

      let updated = false;
      
      // Try memberships table
      try {
        const { error } = await supabase
          .from('memberships')
          .update({
            role: form.role,
            status: form.status,
            capabilities,
            page_permissions: form.permissions,
            updated_at: new Date().toISOString(),
          })
          .eq('id', membershipId);
        if (!error) updated = true;
      } catch { /* try fallback */ }

      // Fallback: update profiles table
      if (!updated) {
        const userId = member.user_id || member.profiles?.id || member.id;
        const { error } = await supabase
          .from('profiles')
          .update({
            role: form.role,
            status: form.status,
            permissions: form.permissions,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);
        if (error) throw error;
      }

      // Audit
      try {
        await logAudit({
          action: 'update_user_permissions',
          entityType: 'User',
          entityId: member.user_id || member.id,
          details: { role: form.role, permissions: form.permissions },
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

  const roleDef = MEVS_ROLES[form.role] || MEVS_ROLES.ground_staff;
  const statusDef = STATUS_CONFIG[form.status] || STATUS_CONFIG.active;
  const RoleIcon = roleDef.icon;
  const StatusIcon = statusDef.icon;

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
              style={{ backgroundColor: avatarColor(member.profiles?.email || member.email || '') }}>
              {(member.profiles?.full_name || member.full_name || member.profiles?.email || member.email || '?').charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-slate-900 truncate">{member.profiles?.full_name || member.full_name || 'Anonymous User'}</h3>
              <p className="text-sm text-slate-600 truncate mb-2">{member.profiles?.email || member.email}</p>
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
        <div className="flex border-b border-slate-100 px-6 bg-white sticky top-0 z-10">
          {[
            { id: 'permissions', label: 'Access Rights', icon: ShieldCheck },
            { id: 'signing', label: 'Signing Authority', icon: FileText },
            { id: 'profile', label: 'Organization Info', icon: Building2 },
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
          ) : activeTab === 'signing' ? (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
                <p className="text-xs text-blue-700 font-medium">Signing authority determines what level of approval a user can provide for each document type.</p>
              </div>
              <SigningPrivilegesMatrix
                privileges={form.signingPrivileges}
                onChange={(docKey, level) => setForm({
                  ...form,
                  signingPrivileges: { ...form.signingPrivileges, [docKey]: level }
                })}
              />
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
                  {Object.entries(STATUS_CONFIG).filter(([k]) => k !== 'no_access').map(([s, def]) => (
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

// ─── InviteDialog ──────────────────────────────────────────────────────────
function InviteDialog({ open, onClose, orgId }) {
  const queryClient = useQueryClient();
  const { user: currentUser, userProfile } = useAuth();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('ground_staff');
  const [permissions, setPermissions] = useState({});
  const [signingPrivileges, setSigningPrivileges] = useState({});
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState(0); // 0=email, 1=role, 2=permissions, 3=signing

  const handleSubmit = async () => {
    if (!email) { toast.error('Email is required'); return; }
    setSending(true);
    try {
      // Try Edge Function first
      const { data: result, error: fnError } = await supabase.functions.invoke('invite-user', {
        body: {
          email,
          role,
          org_id: orgId || userProfile?.organization_id,
          page_permissions: permissions,
          signing_privileges: signingPrivileges,
          onboarding_type: 'invited',
        }
      });

      if (fnError) {
        // Fallback: Direct invitation insert
        const { error: insertErr } = await supabase
          .from("invitations")
          .insert([{
            email,
            role,
            invited_by: currentUser?.id,
            organization_id: orgId || userProfile?.organization_id,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          }]);
        if (insertErr) throw insertErr;
      }

      try {
        await logAudit({
          action: 'invite_user',
          entityType: 'User',
          entityId: email,
          details: { role, org_id: orgId },
        });
      } catch { /* audit non-critical */ }

      toast.success(`Invitation sent to ${email}`);
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEmail(''); setRole('ground_staff'); setPermissions({}); setSigningPrivileges({}); setStep(0);
      onClose();
    } catch (err) {
      toast.error('Invitation failed: ' + (err.message || 'Unknown error'));
    }
    setSending(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md rounded-[32px] p-8 max-h-[85vh] overflow-y-auto">
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
          {/* Step 0: Email */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider pl-1">Email Address</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@yourcompany.com"
              className="h-12 rounded-2xl border-slate-200"
            />
          </div>

          {/* Step 1: Role */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider pl-1">Default Access Level</Label>
            <Select value={role} onValueChange={setRole}>
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

          {/* Page Permissions (Collapsed) */}
          <details className="group">
            <summary className="flex items-center gap-2 cursor-pointer text-xs font-bold text-teal-600 uppercase tracking-wider pl-1">
              <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
              Custom Page Access (optional)
            </summary>
            <div className="mt-3">
              <PagePermissionMatrix
                permissions={permissions}
                onChange={(page, level) => setPermissions(prev => ({ ...prev, [page]: level }))}
              />
            </div>
          </details>

          {/* Signing Privileges (Collapsed) */}
          <details className="group">
            <summary className="flex items-center gap-2 cursor-pointer text-xs font-bold text-teal-600 uppercase tracking-wider pl-1">
              <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
              Signing Authority (optional)
            </summary>
            <div className="mt-3">
              <SigningPrivilegesMatrix
                privileges={signingPrivileges}
                onChange={(docKey, level) => setSigningPrivileges(prev => ({ ...prev, [docKey]: level }))}
              />
            </div>
          </details>
        </div>

        <div className="flex gap-3 pt-4">
          <Button variant="outline" className="flex-1 rounded-2xl h-12" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1 rounded-2xl h-12 bg-teal-600 hover:bg-teal-700 text-white shadow-lg shadow-teal-500/20"
            onClick={handleSubmit}
            disabled={sending || !email}
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
            Send Invitation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── CSVUploadDialog ───────────────────────────────────────────────────────
function CSVUploadDialog({ open, onClose, orgId }) {
  const queryClient = useQueryClient();
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
    setUploading(true);
    let successCount = 0;
    for (const row of parsed) {
      try {
        const email = row.email;
        const role = row.role || 'ground_staff';
        if (!email) continue;

        const { error: fnError } = await supabase.functions.invoke('invite-user', {
          body: { email, role, org_id: orgId, onboarding_type: 'invited' }
        });
        if (fnError) {
          // Fallback
          await supabase.from("invitations").insert([{
            email, role, organization_id: orgId,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          }]);
        }
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
            <Upload className="w-5 h-5 text-teal-600" /> Bulk Invite via CSV
          </DialogTitle>
          <DialogDescription>
            Upload a CSV with columns: <code className="text-xs bg-slate-100 px-1 rounded">email, role</code>
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:border-teal-300 transition-colors">
            <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" id="csv-upload" />
            <label htmlFor="csv-upload" className="cursor-pointer">
              <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-600">{file ? file.name : 'Click to upload CSV file'}</p>
              <p className="text-xs text-slate-400 mt-1">Supports .csv files</p>
            </label>
          </div>

          {parsed.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-500">{parsed.length} users found:</p>
              <div className="max-h-40 overflow-y-auto border rounded-xl">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-[10px]">EMAIL</TableHead>
                      <TableHead className="text-[10px]">ROLE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{row.email}</TableCell>
                        <TableCell className="text-xs">{MEVS_ROLES[row.role]?.label || row.role || 'Ground Staff'}</TableCell>
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
          <Button onClick={handleUpload} disabled={uploading || parsed.length === 0} className="bg-teal-600 hover:bg-teal-700 text-white">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Invite {parsed.length} Users
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main UserManagement Component ──────────────────────────────────────────
export default function UserManagement() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showInvite, setShowInvite] = useState(false);
  const [showCSV, setShowCSV] = useState(false);
  const [drawerMember, setDrawerMember] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showArchived, setShowArchived] = useState(false);

  const queryClient = useQueryClient();
  const { user: currentUser, role: userRole, userProfile } = useAuth();
  const { isPlatformAdmin, isBranchManager, isLocationManager, roleLevel } = usePermissions();
  const activeOrgId = userProfile?.organization_id;
  const activeBrandId = userProfile?.brand_id;
  const activeLocationId = userProfile?.location_id;

  // ── Fetch team members ─────────────────────────────────────
  const { data: members = [], isLoading } = useAuthQuery({
    queryKey: ['team-members', activeOrgId, activeBrandId, activeLocationId, showArchived],
    queryFn: async () => {
      // Try memberships table first (CRE-style)
      try {
        let memQuery = supabase
          .from('memberships')
          .select('*, profiles(id, email, full_name, phone, last_sign_in_at, location_id, brand_id)')
          .eq('org_id', activeOrgId);
          
        const { data, error } = await memQuery;
        
        if (!error && data && data.length > 0) {
          return data.map(m => ({
            ...m,
            membership_id: m.id,
            email: m.profiles?.email,
            full_name: m.profiles?.full_name,
            location_id: m.profiles?.location_id || m.location_id,
            brand_id: m.profiles?.brand_id || m.brand_id,
          }));
        }
      } catch { /* fall through */ }

      // Fallback: profiles table (MEVS-style)
      let q = supabase
        .from('profiles')
        .select('*')
        .eq('organization_id', activeOrgId);
        
      // No deleted_at filter needed for hard deletes
      
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(p => ({
        ...p,
        membership_id: p.id,
        user_id: p.id,
        profiles: p,
      }));
    },
    enabled: !!activeOrgId,
    staleTime: 30000,
  });

  // Client-side filtering for scope if needed (since memberships query might not filter by brand_id/location_id at DB level if they reside in profiles)
  const scopedMembers = useMemo(() => {
    return members.filter(m => {
      if (isPlatformAdmin || !userRole || userRole === 'org_owner' || userRole === 'owner' || userRole === 'admin') return true;
      if (isBranchManager) return m.brand_id === activeBrandId || m.profiles?.brand_id === activeBrandId;
      if (isLocationManager) return m.location_id === activeLocationId || m.profiles?.location_id === activeLocationId;
      return false; // Ground staff shouldn't be here, but just in case
    });
  }, [members, isPlatformAdmin, userRole, isBranchManager, isLocationManager, activeBrandId, activeLocationId]);

  // ── Filtering ──────────────────────────────────────────────
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

  // ── Stats ──────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = scopedMembers.length;
    const active = scopedMembers.filter(m => m.status === 'active').length;
    const invited = scopedMembers.filter(m => m.status === 'invited').length;
    const admins = scopedMembers.filter(m => ['admin', 'owner', 'platform_admin', 'super_admin', 'org_admin'].includes(m.role || m.capabilities?.role)).length;
    return { total, active, invited, admins };
  }, [scopedMembers]);

  const canEdit = (targetMember) => {
    if (isPlatformAdmin) return true;
    const targetRole = targetMember.role || targetMember.capabilities?.role || 'ground_staff';
    const myLevel = roleLevel?.[userRole] ?? 0;
    const targetLevel = roleLevel?.[targetRole] ?? 0;
    
    // Org Owner can edit anyone in their org except Platform Admin
    if (myLevel >= 3 && targetLevel < 4) return true;
    
    // Branch Manager can edit Location Managers and Ground Staff (in their branch)
    if (myLevel === 2 && targetLevel < 2) return true;
    
    // Location Manager can edit Ground Staff (in their location)
    if (myLevel === 1 && targetLevel < 1) return true;
    
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
          <p className="text-slate-500 font-medium pl-14">Configure granular access, signing authority, and organizational roles for your staff.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-12 rounded-2xl" onClick={() => setShowCSV(true)}>
            <Upload className="h-4 w-4 mr-2" /> CSV Import
          </Button>
          <Button 
            onClick={() => setShowInvite(true)} 
            className="bg-teal-600 hover:bg-teal-700 text-white shadow-lg shadow-teal-500/20 px-6 h-12 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <PlusCircle className="h-5 w-5 mr-2" />
            Add New Member
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {[
          { label: 'Total Members', value: stats.total, icon: Users, color: 'text-slate-900', bg: 'bg-white' },
          { label: 'Active Accounts', value: stats.active, icon: UserCheck, color: 'text-emerald-600', bg: 'bg-emerald-50/30' },
          { label: 'Pending Invites', value: stats.invited, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50/50' },
          { label: 'Admin Roles', value: stats.admins, icon: ShieldCheck, color: 'text-rose-600', bg: 'bg-rose-50/20' },
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
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="flex-1 flex flex-col md:flex-row gap-4 w-full">
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
          <div className="flex items-center gap-2 px-2 shrink-0">
            <input 
              type="checkbox" 
              id="showArchived" 
              checked={showArchived} 
              onChange={e => setShowArchived(e.target.checked)} 
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-600 cursor-pointer w-4 h-4" 
            />
            <label htmlFor="showArchived" className="text-sm font-semibold text-slate-600 cursor-pointer">Show Past Users</label>
          </div>
        </div>

        <Card className="border-0 shadow-xl shadow-slate-200/50 rounded-[32px] overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/50 border-b border-slate-100">
                <TableRow className="hover:bg-transparent border-0 h-14">
                  <TableHead className="pl-8 text-xs font-bold text-slate-500 uppercase">Identity</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 uppercase">Access Level</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 uppercase">Page Access</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 uppercase">Signing Authority</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 uppercase">Status</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 uppercase">Last Active</TableHead>
                  <TableHead className="w-20 pr-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-64 text-center">
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-12 h-12 border-4 border-teal-50 border-t-teal-600 rounded-full animate-spin"></div>
                        <p className="text-sm font-bold text-slate-400">Syncing user database...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredMembers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-64 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="p-4 bg-slate-50 rounded-full">
                          <UserX className="w-8 h-8 text-slate-300" />
                        </div>
                        <p className="text-sm font-bold text-slate-400">No matching team members found.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMembers.map((member) => {
                    const memberRole = member.role || member.capabilities?.role || 'ground_staff';
                    const roleDef = MEVS_ROLES[memberRole] || MEVS_ROLES.ground_staff;
                    const status = member.status || 'active';
                    const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.active;
                    const StatusIcon = statusCfg.icon;
                    const pagePerms = member.page_permissions || member.permissions || {};
                    const signingPrivs = member.signing_privileges || member.capabilities?.signing_privileges || {};
                    const highestSigning = Math.max(0, ...Object.values(signingPrivs).map(Number));
                    const highestSlvl = SIGNING_LEVELS.find(s => s.value === highestSigning) || SIGNING_LEVELS[0];

                    return (
                      <TableRow 
                        key={member.membership_id || member.id} 
                        className="group hover:bg-slate-50/50 transition-colors border-slate-50 h-20 cursor-pointer"
                        onClick={() => canEdit(member) && setDrawerMember(member)}
                      >
                        <TableCell className="pl-8">
                          <div className="flex items-center gap-4">
                            <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-bold text-sm shadow-sm transition-transform group-hover:scale-105"
                              style={{ backgroundColor: avatarColor(member.profiles?.email || member.email || '') }}>
                              {(member.profiles?.full_name || member.full_name || member.profiles?.email || member.email || '?').charAt(0)}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900 leading-tight">
                                {member.profiles?.full_name || member.full_name || 'Verification Pending'}
                              </span>
                              <span className="text-xs text-slate-500">{member.profiles?.email || member.email}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <RoleBadges member={member} />
                        </TableCell>
                        <TableCell>
                          <PageAccessChips pagePerms={pagePerms} />
                        </TableCell>
                        <TableCell>
                          {highestSigning === 0 ? (
                            <span className="text-xs text-slate-400 italic">None</span>
                          ) : (
                            <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold ${highestSlvl.badgeClass}`}>
                              {highestSlvl.label}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold ${statusCfg.badgeClass}`}>
                            <StatusIcon className="w-3 h-3" />{statusCfg.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-slate-400">
                            {formatLastActive(member.profiles?.last_sign_in_at || member.last_sign_in_at)}
                          </span>
                        </TableCell>
                        <TableCell onClick={e => e.stopPropagation()} className="pr-8">
                          {canEdit(member) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="group-hover:bg-white rounded-xl">
                                  <MoreVertical className="h-4 w-4 text-slate-400" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="rounded-2xl border-slate-100 shadow-xl p-2 w-48">
                                <DropdownMenuItem onClick={() => setDrawerMember(member)} className="rounded-xl px-3 py-2 cursor-pointer font-bold text-xs text-slate-700">
                                  <Edit2 className="h-4 w-4 mr-3 text-teal-600" /> Advanced Settings
                                </DropdownMenuItem>
                                <DropdownMenuItem className="rounded-xl px-3 py-2 cursor-pointer font-bold text-xs text-red-600 hover:bg-red-50"
                                  onClick={async () => {
                                    if (!window.confirm(`Delete ${member.profiles?.email || member.email}? This cannot be undone.`)) return;
                                    const userId = member.user_id || member.id;
                                    
                                    // Optimistic update
                                    await queryClient.cancelQueries({ queryKey: ['team-members'] });
                                    const previousMembers = queryClient.getQueryData(['team-members']);
                                    queryClient.setQueryData(['team-members'], (old) => 
                                      old ? old.filter(m => (m.user_id || m.id) !== userId) : []
                                    );

                                    try {
                                      const { error } = await supabase.from('profiles').delete().eq('id', userId);
                                      if (error) throw error;
                                      toast.success('User deleted');
                                      queryClient.invalidateQueries({ queryKey: ['team-members'] });
                                    } catch (e) { 
                                      if (previousMembers) queryClient.setQueryData(['team-members'], previousMembers);
                                      toast.error(e.message || 'Failed to delete user'); 
                                    }
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 mr-3" /> Delete Account
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