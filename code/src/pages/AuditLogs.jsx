import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
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

  const queryClient = useQueryClient();

  const { data: logs = [], isLoading, isError } = useAuthQuery({
    queryKey: ['audit_logs'],
    queryFn: async () => {
      try {
        return await api.entities.AuditLog.list('-created_at', { limit: 500 });
      } catch (err) {
        console.error('Error fetching audit logs:', err);
        throw err;
      }
    },
  });

  useEffect(() => {
    const channel = supabase.channel('audit-logs-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['audit_logs'] });
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const filteredLogs = React.useMemo(() => {
    const term = search.toLowerCase();
    return logs.filter(log => {
      return (
        log.action?.toLowerCase().includes(term) ||
        log.table_name?.toLowerCase().includes(term) ||
        log.user_id?.toLowerCase().includes(term)
      );
    });
  }, [logs, search]);

  const getActionColor = (action) => {
    switch (action?.toUpperCase()) {
      case 'INSERT': return 'bg-resend-green/10 text-resend-green';
      case 'UPDATE': return 'bg-resend-blue/10 text-resend-blue';
      case 'DELETE': return 'bg-resend-red/10 text-resend-red';
      default: return 'bg-secondary text-foreground';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-primary" />
            Audit Logs
          </h1>
          <p className="text-muted-foreground mt-1">Track organization-wide activity and security events</p>
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
                        <div className="w-8 h-8 border-4 border-border border-t-teal-600 rounded-full animate-spin"></div>
                        <p className="text-sm text-muted-foreground">Loading audit history...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : isError ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-resend-red">
                      Failed to load audit logs. Verify permissions.
                    </TableCell>
                  </TableRow>
                ) : filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No matching audit records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {log.created_at ? format(new Date(log.created_at), 'MMM d, yyyy HH:mm:ss') : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${getActionColor(log.action)} font-mono text-[10px]`}>
                          {log.action?.toUpperCase() || 'UNKNOWN'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          <Database className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium text-foreground">{log.table_name}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate max-w-[150px]">
                          {log.record_id}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono text-xs">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="truncate max-w-[120px]">{log.user_id}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground max-w-sm truncate">
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

