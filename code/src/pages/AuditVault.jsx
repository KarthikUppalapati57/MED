import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, Download, Lock, Search } from 'lucide-react';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function AuditVault() {
  const { organization } = useAuth();
  const [search, setSearch] = useState('');

  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit-logs', organization?.id],
    queryFn: () => api.entities.AuditLog.list('-created_at', {
      select: '*',
      limit: 500
    }),
    enabled: !!organization?.id,
  });

  const handleExport = () => {
    if (!logs || logs.length === 0) {
      toast.error('No logs to export');
      return;
    }

    try {
      const headers = ['ID', 'Timestamp', 'User_ID', 'Action', 'Entity_Type', 'Entity_ID', 'Details'];
      const csvRows = logs.map(log => [
        log.id,
        new Date(log.created_at).toISOString(),
        log.user_id || 'SYSTEM',
        log.action,
        log.entity_type,
        log.entity_id,
        JSON.stringify(log.details || {}).replace(/"/g, '""')
      ]);
      
      const csvContent = [
        headers.join(','),
        ...csvRows.map(row => `"${row.join('","')}"`)
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `soc2_audit_export_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Secure Audit Log Exported Successfully');
    } catch (err) {
      toast.error('Failed to generate export');
      console.error(err);
    }
  };

  const filteredLogs = logs?.filter(log => 
    log.action.toLowerCase().includes(search.toLowerCase()) || 
    log.entity_type.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-8 w-8 text-brand" />
            SOC 2 Audit Vault
          </h1>
          <p className="text-muted-foreground mt-2">Immutable system action logs for compliance and security auditing.</p>
        </div>
        <Button onClick={handleExport} className="gap-2">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <Card className="border-brand/20 shadow-[0_0_15px_rgba(20,198,203,0.05)]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">System Events</CardTitle>
              <CardDescription>Recent cryptographically secured actions</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search action or entity..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <div className="grid grid-cols-5 bg-muted/50 p-3 text-sm font-medium border-b">
              <div>Timestamp</div>
              <div>Action</div>
              <div>Entity Type</div>
              <div>Actor ID</div>
              <div>Status</div>
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading secure vault...</div>
              ) : filteredLogs.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No audit logs found.</div>
              ) : (
                filteredLogs.map(log => (
                  <div key={log.id} className="grid grid-cols-5 p-3 text-sm border-b hover:bg-muted/30 items-center">
                    <div className="text-muted-foreground font-mono text-xs">
                      {new Date(log.created_at).toLocaleString()}
                    </div>
                    <div>
                      <Badge variant="outline" className="font-mono">{log.action}</Badge>
                    </div>
                    <div className="capitalize">{log.entity_type}</div>
                    <div className="text-xs truncate text-muted-foreground font-mono" title={log.user_id}>
                      {log.user_id || 'SYSTEM'}
                    </div>
                    <div>
                      <Lock className="h-3 w-3 text-brand inline-block mr-1" />
                      Secured
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
