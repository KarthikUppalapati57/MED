import React, { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { logAudit } from '@/lib/audit';
import { sendInvitationEmail } from '@/lib/emailService';
import posthog from '@/lib/posthog';
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
  FileText, Settings, ShieldCheck,
  UserCheck, UserX, PlusCircle, Clock, LayoutDashboard, Package, Receipt, ShoppingCart, Upload, AlertCircle, Key
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// â”€â”€â”€ Restops Roles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const Restops_ROLES = {
  org_owner:        { label: "Organization Owner", color: "rose",   description: "Full access to organization, users, and accounting", icon: ShieldCheck },
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
  slate:  { badge: "bg-secondary text-muted-foreground border-border",    dot: "bg-slate-400" },
};

// â”€â”€â”€ Restops Permission Groups â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const PAGE_PERMISSION_GROUPS = [
  {
    key: "core", label: "General", icon: <LayoutDashboard className="w-4 h-4" />,
    pages: [
      { key: "Dashboard", label: "Main Dashboard" },
      { key: "AuditLogs", label: "Audit Logs" },
      { key: "Performance", label: "Performance" },
    ],
  },
  {
    key: "inventory", label: "Inventory & Products", icon: <Package className="w-4 h-4" />,
    pages: [
      { key: "Inventory", label: "Stock Management" },
      { key: "Products", label: "Product Master" },
      { key: "Recipes", label: "Recipe Costing" },
      { key: "MenuEngineering", label: "Menu Engineering" },
      { key: "AvTCosting", label: "AvT Costing" },
    ],
  },
  {
    key: "finance", label: "Finance", icon: <Receipt className="w-4 h-4" />,
    pages: [
      { key: "Invoices", label: "Invoice Processing" },
      { key: "Payments", label: "Vendor Payments" },
      { key: "Accounting", label: "Accounting" },
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
      { key: "Labor", label: "Labor & Scheduling" },
      { key: "Integrations", label: "Integrations" },
      { key: "RestaurantSetup", label: "Restaurant Setup" },
    ],
  },
];

const ACCESS_LEVELS = {
  full: { label: "Full", chipClass: "bg-resend-green/10 text-resend-green border-resend-green/20", btnActive: "bg-emerald-600 text-white border-transparent" },
  read: { label: "Read", chipClass: "bg-sky-100 text-sky-700 border-sky-200",             btnActive: "bg-sky-600 text-white border-transparent" },
  none: { label: "None", chipClass: "bg-secondary text-muted-foreground border-border",       btnActive: "bg-secondary text-muted-foreground border-transparent" },
};

// â”€â”€â”€ Signing Authority Levels (Adapted for Restops) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SIGNING_LEVELS = [
  { value: 0, label: "None",         badgeClass: "bg-secondary text-muted-foreground border-border" },
  { value: 1, label: "L1 – Review",  badgeClass: "bg-sky-100 text-sky-700 border-sky-200" },
  { value: 2, label: "L2 – Approve", badgeClass: "bg-resend-blue/10 text-resend-blue border-resend-blue/20" },
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
  active:   { label: "Active",   badgeClass: "bg-resend-green/10 text-resend-green", icon: CheckCircle2 },
  invited:  { label: "Invited",  badgeClass: "bg-resend-yellow/10 text-resend-yellow",     icon: Mail },
  inactive: { label: "Inactive", badgeClass: "bg-resend-red/10 text-resend-red",         icon: UserX },
  archived: { label: "Archived", badgeClass: "bg-secondary text-foreground",     icon: UserX },
  no_access:{ label: "No Access",badgeClass: "bg-secondary text-muted-foreground",     icon: AlertCircle },
};

// â”€â”€â”€ Utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ PagePermissionMatrix â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
          <div key={group.key} className="border border-border rounded-xl overflow-hidden mb-2">
            <div
              className={cn(
                "flex items-center justify-between px-3 py-2.5 bg-secondary cursor-pointer hover:bg-secondary transition-colors",
                !isOpen && "bg-card"
              )}
              onClick={() => toggleGroup(group.key)}
            >
              <div className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  {group.icon}
                  {group.label}
                </span>
                {groupLevel === "mixed" && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-resend-yellow/10 text-resend-yellow font-semibold border border-resend-yellow/20">Mixed Access</span>}
              </div>
              {!readonly && (
                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                  {Object.entries(ACCESS_LEVELS).map(([l, cfg]) => (
                    <button
                      key={l}
                      onClick={() => setGroupAccess(group, l)}
                      className={`text-[9px] px-2 py-0.5 rounded-lg font-semibold border transition-all ${
                        groupLevel === l ? cfg.btnActive : "bg-card border-border text-muted-foreground hover:border-border"
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
                      <span className="text-xs text-muted-foreground">{page.label}</span>
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
                                current === l ? cfg.btnActive : "bg-card border-border text-muted-foreground hover:border-border shadow-sm"
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

// â”€â”€â”€ SigningPrivilegesMatrix â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SigningPrivilegesMatrix({ privileges = {}, onChange, readonly = false }) {
  return (
    <div className="space-y-2">
      {DOCUMENT_TYPES.map(doc => {
        const current = privileges[doc.key] || 0;
        const lvl = SIGNING_LEVELS.find(s => s.value === current) || SIGNING_LEVELS[0];
        return (
          <div key={doc.key} className="flex items-center justify-between px-3 py-2 rounded-xl border border-border hover:bg-secondary transition-colors">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">{doc.label}</span>
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
                      current === sl.value ? sl.badgeClass + ' ring-1 ring-offset-1' : 'bg-card border-border text-muted-foreground hover:border-border'
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

// â”€â”€â”€ RoleBadges â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function RoleBadges({ member, maxVisible = 2 }) {
  const role = member.role || member.capabilities?.role || 'ground_staff';
  const roleDef = Restops_ROLES[role] || Restops_ROLES.ground_staff;
  const colors = ROLE_COLOR_CLASSES[roleDef.color] || ROLE_COLOR_CLASSES.slate;
  const Icon = roleDef.icon;
  return (
    <Badge className={cn("px-2 py-0.5 text-[10px] font-bold border gap-1", colors.badge)}>
      <Icon className="w-3 h-3" />
      {roleDef.label}
    </Badge>
  );
}

// â”€â”€â”€ PageAccessChips â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function PageAccessChips({ pagePerms = {}, maxVisible = 3 }) {
  const entries = Object.entries(pagePerms).filter(([, v]) => v !== 'none');
  if (entries.length === 0) return <span className="text-[10px] text-muted-foreground italic">Default</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.slice(0, maxVisible).map(([key, level]) => (
        <span key={key} className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${ACCESS_LEVELS[level]?.chipClass || ''}`}>
          {key}
        </span>
      ))}
      {entries.length > maxVisible && (
        <span className="text-[9px] text-muted-foreground">+{entries.length - maxVisible}</span>
      )}
    </div>
  );
}

// â”€â”€â”€ UserDetailDrawer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function UserDetailDrawer({ member, orgId, onClose }) {
  const queryClient = useQueryClient();
  const { role: currentUserRole, userProfile } = useAuth();
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
      // Use secure RPC to update role and privileges
      const userId = member.user_id || member.profiles?.id || member.id;
      const { error } = await supabase.rpc('admin_update_user_role', {
        target_user_id: userId,
        new_role: form.role,
        new_status: form.status,
        new_department: form.department,
        new_location: form.location,
        new_permissions: form.permissions,
        new_signing_privileges: form.signingPrivileges
      });
      if (error) throw error;

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
          {activeTab === 'permissions' ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">System Role</Label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(Restops_ROLES)
                    .filter(([r]) => r !== 'platform_admin')
                    .map(([r, def]) => {
                    const isSelected = form.role === r;
                    const Icon = def.icon;
                    return (
                      <button
                        key={r}
                        onClick={() => setForm({ ...form, role: r })}
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
                        <span className={cn("text-xs font-bold", isSelected ? "text-teal-900" : "text-foreground")}>{def.label}</span>
                        <span className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{def.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3 pt-6 border-t border-border">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Granular Page Access</Label>
                  <Button variant="ghost" size="sm" className="h-7 text-[10px] text-primary font-bold" onClick={() => setForm({...form, permissions: {}})}>Reset All</Button>
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
              <div className="p-3 rounded-xl bg-resend-blue/5 border border-blue-100">
                <p className="text-xs text-resend-blue font-medium">Signing authority determines what level of approval a user can provide for each document type.</p>
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

// â”€â”€â”€ InviteDialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function InviteDialog({ open, onClose, orgId }) {
  const queryClient = useQueryClient();
  const { user: currentUser, role: currentUserRole, userProfile } = useAuth();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('ground_staff');
  const [permissions, setPermissions] = useState({});
  const [signingPrivileges, setSigningPrivileges] = useState({});
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState(0); // 0=email, 1=role, 2=permissions, 3=signing
  const [generatedLink, setGeneratedLink] = useState('');

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

      let token = null;

      if (fnError) {
        // Fallback: Direct invitation insert
        const { data: insertData, error: insertErr } = await supabase
          .from("invitations")
          .insert([{
            email,
            role,
            invited_by: currentUser?.id,
            organization_id: orgId || userProfile?.organization_id,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
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
          details: { role, org_id: orgId },
        });
      } catch { /* audit non-critical */ }

      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });

      // Optimistic update so it shows immediately
      queryClient.setQueryData(['team-members', activeOrgId, activeBrandId, activeLocationId, false], (old) => {
        if (!old) return old;
        return [...old, {
          id: 'inv_temp_' + Date.now(),
          membership_id: 'inv_temp_' + Date.now(),
          user_id: 'inv_temp_' + Date.now(),
          email,
          role,
          status: 'invited',
          profiles: { email, full_name: 'Pending Invite' },
          created_at: new Date().toISOString()
        }];
      });

      if (token) {
        const link = `${window.location.origin}/signup/${token}`;
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
        setEmail(''); setRole('ground_staff'); setPermissions({}); setSigningPrivileges({}); setStep(0);
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
                setGeneratedLink(''); setEmail(''); setRole('ground_staff'); setPermissions({}); setSigningPrivileges({}); setStep(0);
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
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider pl-1">Default Access Level</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="h-12 rounded-2xl border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-border">
                {Object.entries(Restops_ROLES)
                  .filter(([r]) => r !== 'platform_admin')
                  .map(([r, def]) => (
                  <SelectItem key={r} value={r} className="rounded-xl font-bold py-2.5">
                    <div className="flex items-center gap-2">
                      <def.icon className="w-4 h-4 text-muted-foreground" />
                      {def.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Page Permissions (Collapsed) */}
          <details className="group">
            <summary className="flex items-center gap-2 cursor-pointer text-xs font-bold text-primary uppercase tracking-wider pl-1">
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
            <summary className="flex items-center gap-2 cursor-pointer text-xs font-bold text-primary uppercase tracking-wider pl-1">
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

// â”€â”€â”€ CSVUploadDialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Main UserManagement Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function UserManagement() {
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memberships' }, () => {
        queryClient.invalidateQueries({ queryKey: ['team-members'] });
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

  // —— Fetch custom roles —————————————————————————————————
  useAuthQuery({
    queryKey: ['custom-roles', activeOrgId],
    queryFn: async () => {
      if (!activeOrgId) return [];
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .eq('organization_id', activeOrgId)
        .eq('is_system', false);
      if (error) throw error;
      setCustomRoles(data || []);
      return data;
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
        default_page_permissions: r.default_page_permissions,
        default_signing_privileges: r.default_signing_privileges
      };
    });
    return merged;
  }, [customRoles]);

  // â”€â”€ Fetch team members â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const { data: members = [], isLoading } = useAuthQuery({
    queryKey: ['team-members', activeOrgId, activeBrandId, activeLocationId, showArchived],
    queryFn: async () => {
      let finalUsers = [];
      try {
        let memQuery = supabase
          .from('memberships')
          .select('*, profiles(id, email, full_name, updated_at, location_id, brand_id)')
          .eq('org_id', activeOrgId);
          
        const { data, error } = await memQuery;
        
        if (!error && data && data.length > 0) {
          finalUsers = data.map(m => ({
            ...m,
            membership_id: m.id,
            email: m.profiles?.email,
            full_name: m.profiles?.full_name,
            location_id: m.profiles?.location_id || m.location_id,
            brand_id: m.profiles?.brand_id || m.brand_id,
          }));
        }
      } catch { /* fall through */ }

      if (finalUsers.length === 0) {
        // Fallback: profiles table (Restops-style)
        let q = supabase
          .from('profiles')
          .select('*')
          .eq('organization_id', activeOrgId);
          
        const { data, error } = await q;
        if (error) throw error;
        finalUsers = (data || []).map(p => ({
          ...p,
          membership_id: p.id,
          user_id: p.id,
          profiles: p,
        }));
      }

      // Merge pending invitations
      try {
        const { data: invs } = await supabase.from('invitations')
          .select('*')
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
                status: 'invited',
                token: inv.token,
                profiles: { email: inv.email, full_name: 'Pending Invite' },
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
      if (isPlatformAdmin || !userRole || userRole === 'org_owner') return true;
      if (isBranchManager) return m.brand_id === activeBrandId || m.profiles?.brand_id === activeBrandId;
      if (isLocationManager) return m.location_id === activeLocationId || m.profiles?.location_id === activeLocationId;
      return false; // Ground staff shouldn't be here, but just in case
    });
  }, [members, isPlatformAdmin, userRole, isBranchManager, isLocationManager, activeBrandId, activeLocationId]);

  // â”€â”€ Filtering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const stats = useMemo(() => {
    const total = scopedMembers.length;
    const active = scopedMembers.filter(m => m.status === 'active').length;
    const invited = scopedMembers.filter(m => m.status === 'invited').length;
    const admins = scopedMembers.filter(m => ['org_owner', 'platform_admin'].includes(m.role || m.capabilities?.role)).length;
    return { total, active, invited, admins };
  }, [scopedMembers]);

  const canEdit = React.useCallback((targetMember) => {
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
            <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Team Management</h1>
          </div>
          <p className="text-muted-foreground font-medium pl-14">Configure granular access, signing authority, and organizational roles for your staff.</p>
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
          {(userRole === 'org_owner' || isPlatformAdmin) && (
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
                <SelectItem value="all">All Access Levels</SelectItem>
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

        <Card className="border-0 shadow-xl shadow-slate-200/50 rounded-[32px] overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-secondary/50 border-b border-border">
                <TableRow className="hover:bg-transparent border-0 h-14">
                  <TableHead className="pl-8 text-xs font-bold text-muted-foreground uppercase">Identity</TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground uppercase">Access Level</TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground uppercase">Page Access</TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground uppercase">Signing Authority</TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground uppercase">Status</TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground uppercase">Last Active</TableHead>
                  <TableHead className="w-20 pr-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-64 text-center">
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-12 h-12 border-4 border-teal-50 border-t-teal-600 rounded-full animate-spin"></div>
                        <p className="text-sm font-bold text-muted-foreground">Syncing user database...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredMembers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-64 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="p-4 bg-secondary rounded-full">
                          <UserX className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-bold text-muted-foreground">No matching team members found.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMembers.map((member) => {
                    const memberRole = member.role || member.capabilities?.role || 'ground_staff';
                    const roleDef = Restops_ROLES[memberRole] || Restops_ROLES.ground_staff;
                    const status = member.status || 'active';
                    const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.active;
                    const StatusIcon = statusCfg.icon;
                    const pagePerms = member.page_permissions || member.permissions || {};
                    const signingPrivs = member.signing_privileges || member.capabilities?.signing_privileges || {};
                    const privValues = Object.values(signingPrivs).map(Number);
                    const highestSigning = privValues.length > 0 ? Math.max(0, ...privValues) : 0;
                    const highestSlvl = SIGNING_LEVELS.find(s => s.value === highestSigning) || SIGNING_LEVELS[0];

                    return (
                      <TableRow 
                        key={member.membership_id || member.id} 
                        className="group hover:bg-secondary/50 transition-colors border-slate-50 h-20 cursor-pointer"
                        onClick={() => canEdit(member) && setDrawerMember(member)}
                      >
                        <TableCell className="pl-8">
                          <div className="flex items-center gap-4">
                            <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-bold text-sm shadow-sm transition-transform group-hover:scale-105"
                              style={{ backgroundColor: avatarColor(member.profiles?.email || member.email || '') }}>
                              {(member.profiles?.full_name || member.full_name || member.profiles?.email || member.email || '?').charAt(0)}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-bold text-foreground leading-tight">
                                {member.profiles?.full_name || member.full_name || 'Verification Pending'}
                              </span>
                              <span className="text-xs text-muted-foreground">{member.profiles?.email || member.email}</span>
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
                            <span className="text-xs text-muted-foreground italic">None</span>
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
                          <span className="text-xs text-muted-foreground">
                            {formatLastActive(member.profiles?.updated_at || member.updated_at)}
                          </span>
                        </TableCell>
                        <TableCell onClick={e => e.stopPropagation()} className="pr-8">
                          {canEdit(member) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="group-hover:bg-card rounded-xl">
                                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="rounded-2xl border-border shadow-xl p-2 w-48">
                                <DropdownMenuItem onClick={() => setDrawerMember(member)} className="rounded-xl px-3 py-2 cursor-pointer font-bold text-xs text-foreground">
                                  <Edit2 className="h-4 w-4 mr-3 text-primary" /> Advanced Settings
                                </DropdownMenuItem>
                                {member.token && (
                                  <>
                                    <DropdownMenuItem 
                                      className="rounded-xl px-3 py-2 cursor-pointer font-bold text-xs text-resend-blue hover:bg-resend-blue/5"
                                      onClick={() => {
                                        const link = `${window.location.origin}/signup/${member.token}`;
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
                                            org_id: activeOrgId,
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
                                    if (!window.confirm(`Delete ${member.profiles?.email || member.email}? This cannot be undone.`)) return;
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
