import React, { useState } from 'react';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { api } from '@/lib/apiClient';
import { format } from 'date-fns';
import { Search, ShieldAlert, Database, User } from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function AuditLogs() {
  const [search, setSearch] = useState('');

  const { data: logs = [], isLoading, isError } = useAuthQuery({
    queryKey: ['audit_logs'],
    queryFn: async () => {
      try {
        return await api.entities.AuditLog.list('-created_at');
      } catch (err) {
        console.error('Error fetching audit logs:', err);
        throw err;
      }
    },
    refetchInterval: 60000,
  });

  const filteredLogs = logs.filter(log => {
    const term = search.toLowerCase();
    return (
      log.action?.toLowerCase().includes(term) ||
      log.table_name?.toLowerCase().includes(term) ||
      log.user_id?.toLowerCase().includes(term)
    );
  });

  const getActionColor = (action) => {
    switch (action?.toUpperCase()) {
      case 'INSERT': return 'bg-green-100 text-green-700';
      case 'UPDATE': return 'bg-blue-100 text-blue-700';
      case 'DELETE': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-teal-600" />
            Audit Logs
          </h1>
          <p className="text-slate-500 mt-1">Track organization-wide activity and security events</p>
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by action, table, or user ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>User ID</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-8 h-8 border-4 border-slate-200 border-t-teal-600 rounded-full animate-spin"></div>
                        <p className="text-sm text-slate-500">Loading audit history...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : isError ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-red-500">
                      Failed to load audit logs. Verify permissions.
                    </TableCell>
                  </TableRow>
                ) : filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                      No matching audit records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-slate-600">
                        {log.created_at ? format(new Date(log.created_at), 'MMM d, yyyy HH:mm:ss') : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${getActionColor(log.action)} font-mono text-[10px]`}>
                          {log.action?.toUpperCase() || 'UNKNOWN'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          <Database className="h-3 w-3 text-slate-400" />
                          <span className="font-medium text-slate-700">{log.table_name}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-[150px]">
                          {log.record_id}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm text-slate-600 font-mono text-xs">
                          <User className="h-3 w-3 text-slate-400" />
                          <span className="truncate max-w-[120px]">{log.user_id}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-slate-500 max-w-sm truncate">
                          {log.action === 'UPDATE' && 'Modified record values'}
                          {log.action === 'INSERT' && 'Created new record'}
                          {log.action === 'DELETE' && 'Removed record'}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
