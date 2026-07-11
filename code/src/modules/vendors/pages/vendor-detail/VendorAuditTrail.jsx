import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { History, ArrowRight, User } from 'lucide-react';

export default function VendorAuditTrail({ vendorId }) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['vendor_onboarding_events', vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendor_onboarding_events')
        .select(`
          id,
          event_type,
          from_status,
          to_status,
          actor_type,
          metadata,
          created_at,
          actor:actor_id (email)
        `)
        .eq('vendor_id', vendorId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
    enabled: !!vendorId,
  });

  const formatEventName = (eventType) => {
    return eventType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatStatus = (status) => {
    if (!status) return null;
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <Card className="shadow-sm border-border/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="w-5 h-5 text-primary" /> Vendor Audit Trail
        </CardTitle>
        <CardDescription>Append-only onboarding and approval activity for this vendor.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-border/40 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Transition</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">Loading vendor activity...</TableCell>
                </TableRow>
              )}

              {!isLoading && events.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">No vendor onboarding events have been recorded.</TableCell>
                </TableRow>
              )}

              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {formatEventName(event.event_type)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {event.from_status || event.to_status ? (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">{formatStatus(event.from_status) || 'Start'}</span>
                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        <span className="font-medium">{formatStatus(event.to_status) || 'Recorded'}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-3 h-3 text-muted-foreground" />
                      <span>{event.actor?.email || event.actor_type}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(event.created_at).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}