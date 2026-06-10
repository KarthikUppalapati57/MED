import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { format } from 'date-fns';
import { RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';

export default function WebhookLogsTab() {
  const { supabase, organizationId } = useSupabaseAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);
  const [isPayloadOpen, setIsPayloadOpen] = useState(false);
  const [isResponseOpen, setIsResponseOpen] = useState(false);

  useEffect(() => {
    if (organizationId) fetchLogs();
  }, [organizationId]);

  async function fetchLogs() {
    setLoading(true);
    // Join with queue to get payload and event_type
    const { data, error } = await supabase
      .from('webhook_delivery_logs')
      .select(`
        *,
        webhook_events_queue(event_type, payload),
        webhook_endpoints(url)
      `)
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (error) toast.error("Failed to load logs");
    else setLogs(data || []);
    setLoading(false);
  }

  async function handleRetry(eventId) {
    if (!eventId) return;
    const { error } = await supabase.from('webhook_events_queue').update({
      status: 'pending',
      next_retry_at: new Date().toISOString()
    }).eq('id', eventId);

    if (error) toast.error("Failed to retry event");
    else {
      toast.success("Event queued for retry");
      fetchLogs();
    }
  }

  function viewPayload(log) {
    setSelectedLog(log);
    setIsPayloadOpen(true);
  }

  function viewResponse(log) {
    setSelectedLog(log);
    setIsResponseOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-lg font-medium">Delivery Logs</h2>
          <p className="text-sm text-muted-foreground">Recent webhook delivery attempts and their status.</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs}><RefreshCw className="h-4 w-4 mr-2" /> Refresh</Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event / Time</TableHead>
              <TableHead>Endpoint</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Response</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center">Loading...</TableCell></TableRow>
            ) : logs.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No logs found.</TableCell></TableRow>
            ) : logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>
                  <div className="font-medium">{log.webhook_events_queue?.event_type || 'Unknown Event'}</div>
                  <div className="text-xs text-muted-foreground">{format(new Date(log.created_at), 'MMM d, yyyy HH:mm:ss')}</div>
                </TableCell>
                <TableCell className="max-w-[200px] truncate text-xs" title={log.webhook_endpoints?.url}>
                  {log.webhook_endpoints?.url || 'Unknown Endpoint'}
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    log.status === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                  }`}>
                    {log.status}
                  </span>
                </TableCell>
                <TableCell className="text-xs">
                  {log.response_code ? (
                    <span className={log.response_code >= 400 ? 'text-red-500 font-bold' : 'text-green-600'}>
                      {log.response_code}
                    </span>
                  ) : 'N/A'}
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="ghost" size="sm" onClick={() => viewPayload(log)}>Payload</Button>
                  <Button variant="ghost" size="sm" onClick={() => viewResponse(log)}>Response</Button>
                  {log.status === 'failed' && log.event_id && (
                    <Button variant="outline" size="sm" onClick={() => handleRetry(log.event_id)}>Retry</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isPayloadOpen} onOpenChange={setIsPayloadOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Event Payload</DialogTitle>
          </DialogHeader>
          <pre className="bg-muted p-4 rounded-md text-xs overflow-x-auto">
            {selectedLog && JSON.stringify(selectedLog.webhook_events_queue?.payload, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>

      <Dialog open={isResponseOpen} onOpenChange={setIsResponseOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Server Response</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <span className="font-semibold text-sm">HTTP Status: </span>
              <span>{selectedLog?.response_code || 'N/A'}</span>
            </div>
            <pre className="bg-muted p-4 rounded-md text-xs overflow-x-auto whitespace-pre-wrap">
              {selectedLog?.response_body || 'No response body recorded.'}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
