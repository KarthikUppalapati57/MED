import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthInfiniteQuery } from '@/hooks/useAuthQuery';
import { useDebounce } from '@/hooks/useDebounce';
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
import { Button } from "@/components/ui/button";

const AUDIT_ROW_HEIGHT = 72;
const AUDIT_TABLE_VIEWPORT_HEIGHT = 648;
const AUDIT_ROW_OVERSCAN = 8;

export default function AuditLogs() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  const [sortBy, setSortBy] = useState('-created_at');
  const tableRef = React.useRef(null);
  const [tableScrollTop, setTableScrollTop] = useState(0);

  const queryClient = useQueryClient();

  const {
    data = {},
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError
  } = useAuthInfiniteQuery({
    queryKey: ['audit_logs', debouncedSearch, sortBy],
    queryFn: async ({ pageParam = 0 }) => {
      try {
        return await api.entities.AuditLog.list(sortBy, {
          page: pageParam,
          pageSize: 50,
          search: debouncedSearch || undefined,
          searchColumn: 'action'
        });
      } catch (err) {
        console.error('Error fetching audit logs:', err);
        throw err;
      }
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === 50 ? allPages.length : undefined;
    }
  });

  const logs = React.useMemo(() => data.pages ? data.pages.flat() : [], [data.pages]);

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
    return logs;
  }, [logs]);

  useEffect(() => {
    setTableScrollTop(0);
    if (tableRef.current) tableRef.current.scrollTop = 0;
  }, [debouncedSearch, sortBy]);

  const logWindow = React.useMemo(() => {
    const total = filteredLogs.length;
    if (total === 0) {
      return {
        visibleLogs: [],
        startIndex: 0,
        endIndex: 0,
        paddingTop: 0,
        paddingBottom: 0,
      };
    }

    const visibleCount = Math.ceil(AUDIT_TABLE_VIEWPORT_HEIGHT / AUDIT_ROW_HEIGHT);
    const startIndex = Math.max(0, Math.floor(tableScrollTop / AUDIT_ROW_HEIGHT) - AUDIT_ROW_OVERSCAN);
    const endIndex = Math.min(total, startIndex + visibleCount + (AUDIT_ROW_OVERSCAN * 2));

    return {
      visibleLogs: filteredLogs.slice(startIndex, endIndex),
      startIndex,
      endIndex,
      paddingTop: startIndex * AUDIT_ROW_HEIGHT,
      paddingBottom: Math.max(0, (total - endIndex) * AUDIT_ROW_HEIGHT),
    };
  }, [filteredLogs, tableScrollTop]);

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
          <div
            ref={tableRef}
            className="max-h-[648px] overflow-auto"
            onScroll={(event) => setTableScrollTop(event.currentTarget.scrollTop)}
          >
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                <TableRow>
                  <TableHead
                    className="cursor-pointer hover:text-foreground group"
                    onClick={() => setSortBy(sortBy === 'created_at' ? '-created_at' : 'created_at')}
                  >
                    <div className="flex items-center gap-1">
                      Timestamp
                      <span className="opacity-0 group-hover:opacity-100 text-xs">
                        {sortBy === 'created_at' ? '↑' : sortBy === '-created_at' ? '↓' : '↕'}
                      </span>
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-foreground group"
                    onClick={() => setSortBy(sortBy === 'action' ? '-action' : 'action')}
                  >
                    <div className="flex items-center gap-1">
                      Action
                      <span className="opacity-0 group-hover:opacity-100 text-xs">
                        {sortBy === 'action' ? '↑' : sortBy === '-action' ? '↓' : '↕'}
                      </span>
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-foreground group"
                    onClick={() => setSortBy(sortBy === 'table_name' ? '-table_name' : 'table_name')}
                  >
                    <div className="flex items-center gap-1">
                      Resource
                      <span className="opacity-0 group-hover:opacity-100 text-xs">
                        {sortBy === 'table_name' ? '↑' : sortBy === '-table_name' ? '↓' : '↕'}
                      </span>
                    </div>
                  </TableHead>
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
                  <>
                  {logWindow.paddingTop > 0 && (
                    <TableRow aria-hidden="true" className="border-0 hover:bg-transparent">
                      <TableCell colSpan={5} className="p-0" style={{ height: `${logWindow.paddingTop}px` }} />
                    </TableRow>
                  )}
                  {logWindow.visibleLogs.map((log) => (
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
                  ))}
                  {logWindow.paddingBottom > 0 && (
                    <TableRow aria-hidden="true" className="border-0 hover:bg-transparent">
                      <TableCell colSpan={5} className="p-0" style={{ height: `${logWindow.paddingBottom}px` }} />
                    </TableRow>
                  )}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col items-center gap-2 p-4 border-t border-border/50 text-sm text-muted-foreground sm:flex-row sm:justify-between">
            <span>
              Showing rows {filteredLogs.length === 0 ? 0 : logWindow.startIndex + 1}
              -{logWindow.endIndex} of {filteredLogs.length} loaded audit logs
            </span>
            {hasNextPage && (
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Load More Logs'
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

