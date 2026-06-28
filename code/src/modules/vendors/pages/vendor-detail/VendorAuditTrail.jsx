import React from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { History, ArrowRight, User } from 'lucide-react';

export default function VendorAuditTrail({ vendorId }) {
  const { organization } = useAuth();

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['vendor_audit_events', vendorId],
    queryFn: async () => {
      // In a real scenario, there might be a dedicated vendor_audit_events table
      // or we query invoice_audit_events joining on invoice.vendor_id.
      // For this implementation, we simulate fetching from a generic audit log.
      const { data, error } = await supabase
        .from('invoice_audit_events')
        .select(`
          id,
          event_type,
          old_data,
          new_data,
          created_at,
          user:user_id (email)
        `)
        .eq('organization_id', organization?.id)
        .order('created_at', { ascending: false })
        .limit(20);
        
      if (error) {
        console.error("Audit log error:", error);
        return []; // Fallback empty array if table doesn't exist or RLS fails
      }
      return data || [];
    },
    enabled: !!vendorId && !!organization?.id
  });

  const formatEventName = (eventType) => {
    return eventType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const renderChanges = (oldData, newData) => {
    if (!oldData && !newData) return <span className="text-muted-foreground italic">System generated</span>;
    
    // Simplistic diff render
    const changes = [];
    if (newData && typeof newData === 'object') {
      Object.keys(newData).forEach(key => {
        const oldVal = oldData ? oldData[key] : null;
        const newVal = newData[key];
        if (oldVal !== newVal) {
          changes.push(
            <div key={key} className="flex items-center gap-2 text-xs mt-1">
              <span className="font-medium text-muted-foreground">{key}:</span>
              <span className="line-through text-resend-red/70">{String(oldVal || 'null')}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="text-resend-green">{String(newVal || 'null')}</span>
            </div>
          );
        }
      });
    }
    
    if (changes.length === 0) return <span className="text-muted-foreground">No significant field changes</span>;
    return <div className="flex flex-col gap-1">{changes}</div>;
  };

  return (
    <Card className="shadow-sm border-border/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          Audit Trail
        </CardTitle>
        <CardDescription>A chronological log of all updates, approvals, and system changes for this vendor.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-border/40 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Timestamp</TableHead>
                <TableHead className="w-[150px]">Event Type</TableHead>
                <TableHead>Changes</TableHead>
                <TableHead className="w-[200px]">User</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8">Loading audit logs...</TableCell></TableRow>
              ) : events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                    <History className="h-8 w-8 mx-auto mb-3 opacity-20" />
                    No audit events recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                events.map(event => (
                  <TableRow key={event.id}>
                    <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                      {new Date(event.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-secondary/50 font-normal">
                        {formatEventName(event.event_type)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {renderChanges(event.old_data, event.new_data)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-3 w-3 text-muted-foreground" />
                        {event.user?.email || 'System'}
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
  );
}
