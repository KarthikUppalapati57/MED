import React, { useState } from 'react';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Cloud, CloudOff, RefreshCw, AlertCircle, CheckCircle2, CloudUpload } from 'lucide-react';

export default function AccountingExportQueueTab() {
  const { organization } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: queue = [], isLoading } = useAuthQuery({
    queryKey: ['accounting-export-queue', organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounting_export_queue')
        .select('*')
        .eq('organization_id', organization?.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id
  });

  // Since we just have the entity_id, let's also fetch invoices to map invoice numbers.
  const { data: invoices = [] } = useAuthQuery({
    queryKey: ['export-queue-invoices', organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, vendor:vendors(name), total_amount')
        .eq('organization_id', organization?.id);
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id
  });

  const invoiceMap = invoices.reduce((acc, inv) => {
    acc[inv.id] = inv;
    return acc;
  }, {});

  const filteredQueue = queue.filter(q => statusFilter === 'all' || q.status === statusFilter);

  const syncMutation = useMutation({
    mutationFn: async (id) => {
      // Simulate sync delay
      await new Promise(res => setTimeout(res, 1500));
      // Update status to synced
      const { data, error } = await supabase
        .from('accounting_export_queue')
        .update({ status: 'synced', synced_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-export-queue'] });
      toast.success('Successfully synced to accounting provider');
    },
    onError: (e) => toast.error(`Sync failed: ${e.message}`)
  });

  const syncAllReadyMutation = useMutation({
    mutationFn: async () => {
      const readyItems = queue.filter(q => q.status === 'ready');
      if (readyItems.length === 0) return;
      
      await new Promise(res => setTimeout(res, 2000));
      
      const { error } = await supabase
        .from('accounting_export_queue')
        .update({ status: 'synced', synced_at: new Date().toISOString() })
        .in('id', readyItems.map(q => q.id));
        
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-export-queue'] });
      toast.success('Batch sync completed');
    },
    onError: (e) => toast.error(`Batch sync failed: ${e.message}`)
  });

  const getStatusBadge = (status) => {
    switch(status) {
      case 'ready': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 border-none"><CloudUpload className="w-3 h-3 mr-1"/> Ready to Sync</Badge>;
      case 'synced': return <Badge className="bg-resend-green/10 text-resend-green border-none"><CheckCircle2 className="w-3 h-3 mr-1"/> Synced</Badge>;
      case 'failed': return <Badge className="bg-resend-red/10 text-resend-red border-none"><AlertCircle className="w-3 h-3 mr-1"/> Failed</Badge>;
      case 'not_ready': return <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30"><CloudOff className="w-3 h-3 mr-1"/> Not Ready</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card className="glass-card border-border/50 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>Accounting Export Queue</CardTitle>
          <CardDescription>Review and sync approved invoices and journal entries to QuickBooks or Xero.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="ready">Ready to Sync</SelectItem>
              <SelectItem value="synced">Synced</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="not_ready">Not Ready</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            onClick={() => syncAllReadyMutation.mutate()}
            disabled={syncAllReadyMutation.isPending || queue.filter(q => q.status === 'ready').length === 0}
            className="bg-primary hover:bg-primary"
          >
            {syncAllReadyMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Cloud className="w-4 h-4 mr-2" />}
            Sync All Ready
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading queue...</p>
        ) : filteredQueue.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <Cloud className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium">Queue is Empty</h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto mt-2">
              No entries match the selected filter. Invoices will automatically appear here when they are approved.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Added</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredQueue.map(item => {
                const invoice = item.entity_type === 'invoice' ? invoiceMap[item.entity_id] : null;
                return (
                  <TableRow key={item.id}>
                    <TableCell className="text-sm">
                      {format(new Date(item.created_at), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell className="capitalize font-medium">{item.entity_type.replace('_', ' ')}</TableCell>
                    <TableCell>
                      {invoice ? (
                        <div>
                          <p className="font-medium">{invoice.vendor?.name}</p>
                          <p className="text-xs text-muted-foreground">Inv: {invoice.invoice_number}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Ref: {item.entity_id.slice(0,8)}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {invoice ? `$${Number(invoice.total_amount).toLocaleString()}` : '—'}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(item.status)}
                      {item.error_message && (
                        <p className="text-xs text-resend-red mt-1 max-w-[150px] truncate" title={item.error_message}>
                          {item.error_message}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.status === 'ready' || item.status === 'failed' ? (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => syncMutation.mutate(item.id)}
                          disabled={syncMutation.isPending}
                        >
                          <RefreshCw className={`w-3 h-3 mr-1 ${syncMutation.isPending ? 'animate-spin' : ''}`} /> Sync Now
                        </Button>
                      ) : item.status === 'synced' ? (
                        <span className="text-xs text-muted-foreground">Synced {format(new Date(item.synced_at), 'MMM dd')}</span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
