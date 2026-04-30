import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, Search, Download, Loader2, FileText, Activity, Database, AlertTriangle, Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function PlatformAuditLogs() {
  const { user, role: userRole } = useAuth();
  const queryClient = useQueryClient();
  const authChecked = !!user;

  const [logModuleFilter, setLogModuleFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

  // ── Audit Logs Query ───────────────────────────────────────
  const { data: auditLogs = [], isLoading: isLoadingLogs } = useAuthQuery({
    queryKey: ['platform-audit-logs', logModuleFilter],
    queryFn: async () => {
      let q = supabase
        .from('audit_logs')
        .select('*, profiles:user_id(email, full_name)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (logModuleFilter !== 'All') {
        q = q.eq('table_name', logModuleFilter.toLowerCase());
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: authChecked && (userRole === 'admin' || userRole === 'platform_admin'),
  });

  // Filter logs by search
  const filteredLogs = auditLogs.filter(log => {
    if (!searchQuery) return true;
    const term = searchQuery.toLowerCase();
    return (
      log.action?.toLowerCase().includes(term) ||
      log.table_name?.toLowerCase().includes(term) ||
      log.profiles?.email?.toLowerCase().includes(term) ||
      log.profiles?.full_name?.toLowerCase().includes(term) ||
      log.record_id?.toLowerCase().includes(term)
    );
  });

  // Stats
  const todayLogs = auditLogs.filter(l => {
    if (!l.created_at) return false;
    const today = new Date();
    const logDate = new Date(l.created_at);
    return logDate.toDateString() === today.toDateString();
  });

  const actionCounts = auditLogs.reduce((acc, l) => {
    const action = l.action?.toUpperCase() || 'UNKNOWN';
    acc[action] = (acc[action] || 0) + 1;
    return acc;
  }, {});

  const getActionColor = (action) => {
    switch (action?.toUpperCase()) {
      case 'INSERT': return 'bg-emerald-100 text-emerald-700';
      case 'UPDATE': return 'bg-blue-100 text-blue-700';
      case 'DELETE': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const moduleFilters = ['All', 'invoices', 'payments', 'inventory', 'products', 'vendors', 'recipes', 'auto_orders', 'organizations', 'profiles', 'invitations', 'brands', 'locations'];

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
        <p className="text-slate-500 max-w-md">Platform Audit Logs are restricted to platform administrators only.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
            <FileText className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Platform Audit Logs</h1>
            <p className="text-sm text-slate-500">Platform-wide activity tracking · All organizations</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => {
          const csv = ['Timestamp,User,Email,Action,Table,Record ID', ...auditLogs.map(l => `${l.created_at},${l.profiles?.full_name || ''},${l.profiles?.email || ''},${l.action},${l.table_name},${l.record_id || ''}`)].join('\n');
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = 'platform_audit_logs.csv'; a.click();
        }}>
          <Download className="w-4 h-4 mr-1" />Export CSV
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase">Total Entries</p>
                <p className="text-2xl font-bold mt-1">{auditLogs.length}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">All time records</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
                <Database className="h-5 w-5 text-slate-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase">Today's Activity</p>
                <p className="text-2xl font-bold mt-1">{todayLogs.length}</p>
                <p className="text-[10px] text-blue-500 mt-0.5">Actions today</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Activity className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase">Deletions</p>
                <p className="text-2xl font-bold mt-1">{actionCounts['DELETE'] || 0}</p>
                <p className="text-[10px] text-red-500 mt-0.5">Delete operations</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase">Tables Tracked</p>
                <p className="text-2xl font-bold mt-1">{new Set(auditLogs.map(l => l.table_name)).size}</p>
                <p className="text-[10px] text-violet-500 mt-0.5">Unique resources</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-violet-100 flex items-center justify-center">
                <FileText className="h-5 w-5 text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Logs Card */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-5 w-5" /> Audit Trail
            </CardTitle>
            <p className="text-xs text-slate-400">{filteredLogs.length} entries · Filter by module or search</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search logs..."
              className="pl-9 w-56 h-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {/* Module Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            {moduleFilters.map(mod => (
              <Badge
                key={mod}
                variant={logModuleFilter === mod ? 'default' : 'secondary'}
                className={`cursor-pointer transition-colors text-xs ${logModuleFilter === mod ? 'bg-teal-600 text-white' : 'hover:bg-teal-100 hover:text-teal-700'}`}
                onClick={() => setLogModuleFilter(mod)}
              >
                {mod === 'All' ? mod : mod.replace('_', ' ')}
              </Badge>
            ))}
          </div>

          {isLoadingLogs ? (
            <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" /></div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No audit logs{logModuleFilter !== 'All' ? ` for "${logModuleFilter}"` : ''}{searchQuery ? ` matching "${searchQuery}"` : ''}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-[11px]">TIMESTAMP</TableHead>
                  <TableHead className="text-[11px]">USER</TableHead>
                  <TableHead className="text-[11px]">ACTION</TableHead>
                  <TableHead className="text-[11px]">TABLE</TableHead>
                  <TableHead className="text-[11px]">RECORD</TableHead>
                  <TableHead className="text-[11px]">DETAILS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map(log => (
                  <TableRow key={log.id} className="hover:bg-slate-50/50">
                    <TableCell className="text-xs text-slate-500">
                      {log.created_at ? new Date(log.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[9px] font-bold text-slate-600">
                          {(log.profiles?.full_name || log.profiles?.email || '?').substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-medium truncate max-w-[120px]">{log.profiles?.full_name || '—'}</p>
                          <p className="text-[10px] text-slate-400 truncate max-w-[120px]">{log.profiles?.email || log.user_id?.slice(0, 8) || '—'}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${getActionColor(log.action)} text-[10px] capitalize border-none`}>{log.action}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{log.table_name}</Badge>
                    </TableCell>
                    <TableCell className="text-[10px] text-slate-400 font-mono">{log.record_id?.slice(0, 8) || '—'}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-slate-400 hover:text-slate-600"
                        onClick={() => setSelectedLog(log)}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Log Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" /> Audit Log Detail
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Action</p>
                  <Badge className={`${getActionColor(selectedLog.action)} capitalize`}>{selectedLog.action}</Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Table</p>
                  <Badge variant="outline">{selectedLog.table_name}</Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">User</p>
                  <p className="text-sm font-medium">{selectedLog.profiles?.full_name || '—'}</p>
                  <p className="text-xs text-slate-400">{selectedLog.profiles?.email || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Timestamp</p>
                  <p className="text-sm">{selectedLog.created_at ? new Date(selectedLog.created_at).toLocaleString() : '—'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-500 mb-1">Record ID</p>
                  <p className="text-sm font-mono bg-slate-50 p-2 rounded">{selectedLog.record_id || '—'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-500 mb-1">User ID</p>
                  <p className="text-sm font-mono bg-slate-50 p-2 rounded">{selectedLog.user_id || '—'}</p>
                </div>
              </div>
              {(selectedLog.old_data || selectedLog.new_data) && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">Change Data</p>
                  <pre className="text-[10px] bg-slate-50 p-3 rounded-md border border-slate-100 overflow-x-auto max-h-40">
                    {JSON.stringify({ old: selectedLog.old_data, new: selectedLog.new_data }, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
