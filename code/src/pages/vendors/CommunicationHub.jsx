import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MessageSquare, AlertCircle, CheckCircle2, Clock, Send, Plus } from 'lucide-react';

export default function CommunicationHub({ vendorId }) {
  const { organization, user } = useAuth();
  const queryClient = useQueryClient();
  const [newIssue, setNewIssue] = useState({ issue_type: 'late_delivery', description: '' });

  const { data: issues = [], isLoading: loadingIssues } = useQuery({
    queryKey: ['vendor_issues', vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendor_issues')
        .select('*, reported_by (email), resolved_by (email)')
        .eq('vendor_id', vendorId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!vendorId
  });

  const { data: vendor } = useQuery({
    queryKey: ['vendor', vendorId],
    queryFn: async () => {
      const { data } = await supabase.from('vendors').select('notes').eq('id', vendorId).single();
      return data;
    },
    enabled: !!vendorId
  });

  const [notes, setNotes] = useState('');
  React.useEffect(() => { if (vendor) setNotes(vendor.notes || ''); }, [vendor]);

  const updateNotesMutation = useMutation({
    mutationFn: async (newNotes) => {
      const { error } = await supabase.from('vendors').update({ notes: newNotes }).eq('id', vendorId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['vendor', vendorId]);
      toast.success('Notes updated');
    }
  });

  const createIssueMutation = useMutation({
    mutationFn: async (issueData) => {
      const { error } = await supabase.from('vendor_issues').insert([{
        ...issueData,
        vendor_id: vendorId,
        organization_id: organization?.id,
        reported_by: user?.id
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['vendor_issues', vendorId]);
      toast.success('Issue logged successfully');
      setNewIssue({ issue_type: 'late_delivery', description: '' });
    }
  });

  const resolveIssueMutation = useMutation({
    mutationFn: async (issueId) => {
      const { error } = await supabase.from('vendor_issues').update({
        status: 'resolved',
        resolved_by: user?.id,
        updated_at: new Date().toISOString()
      }).eq('id', issueId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['vendor_issues', vendorId]);
      toast.success('Issue marked as resolved');
    }
  });

  const handleLogIssue = () => {
    if (!newIssue.description) {
      toast.error('Description is required');
      return;
    }
    createIssueMutation.mutate(newIssue);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'resolved': return <Badge className="bg-resend-green/10 text-resend-green border-0"><CheckCircle2 className="w-3 h-3 mr-1" /> Resolved</Badge>;
      case 'open': return <Badge className="bg-resend-red/10 text-resend-red border-0"><AlertCircle className="w-3 h-3 mr-1" /> Open</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* Left Column: Messages & Notes */}
      <div className="lg:col-span-1 space-y-6">
        <Card className="bg-card shadow-sm border-border/40">
          <CardHeader>
            <CardTitle className="text-lg">Vendor Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea 
              rows={6}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Internal notes about this vendor..."
              className="resize-none"
            />
            <Button 
              className="w-full" 
              onClick={() => updateNotesMutation.mutate(notes)}
              disabled={updateNotesMutation.isPending || notes === vendor?.notes}
            >
              Save Notes
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-card shadow-sm border-border/40">
          <CardHeader>
            <CardTitle className="text-lg">Send Message</CardTitle>
            <CardDescription>Email or WhatsApp the vendor directly.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea rows={4} placeholder="Type your message here..." />
            <div className="flex gap-2">
              <Button className="flex-1" variant="outline"><Send className="w-4 h-4 mr-2" /> WhatsApp</Button>
              <Button className="flex-1"><Mail className="w-4 h-4 mr-2" /> Email</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Column: Issue Log */}
      <div className="lg:col-span-2">
        <Card className="bg-card shadow-sm border-border/40 h-full">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-resend-red" />
              Issue Log
            </CardTitle>
            <CardDescription>Track disputes, late deliveries, and missing items.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            {/* Log New Issue Form */}
            <div className="flex gap-3 items-start p-4 bg-secondary/30 rounded-lg border border-border/50">
              <Select 
                value={newIssue.issue_type} 
                onValueChange={v => setNewIssue({...newIssue, issue_type: v})}
              >
                <SelectTrigger className="w-[180px] bg-background">
                  <SelectValue placeholder="Issue Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="late_delivery">Late Delivery</SelectItem>
                  <SelectItem value="missing_item">Missing Item</SelectItem>
                  <SelectItem value="price_mismatch">Price Mismatch</SelectItem>
                  <SelectItem value="invoice_dispute">Invoice Dispute</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Input 
                className="flex-1 bg-background" 
                placeholder="Describe the issue..."
                value={newIssue.description}
                onChange={e => setNewIssue({...newIssue, description: e.target.value})}
              />
              <Button onClick={handleLogIssue} disabled={createIssueMutation.isPending}>
                <Plus className="w-4 h-4 mr-2" /> Log Issue
              </Button>
            </div>

            {/* Issues List */}
            <div className="rounded-md border border-border/40 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingIssues ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : issues.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No issues logged for this vendor.</TableCell></TableRow>
                  ) : (
                    issues.map(issue => (
                      <TableRow key={issue.id} className={issue.status === 'open' ? 'bg-resend-red/5' : ''}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {new Date(issue.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="capitalize">{issue.issue_type.replace('_', ' ')}</TableCell>
                        <TableCell className="max-w-xs truncate" title={issue.description}>
                          {issue.description}
                        </TableCell>
                        <TableCell>{getStatusBadge(issue.status)}</TableCell>
                        <TableCell className="text-right">
                          {issue.status === 'open' && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-resend-green hover:text-resend-green/80 hover:bg-resend-green/10"
                              onClick={() => resolveIssueMutation.mutate(issue.id)}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-1" /> Resolve
                            </Button>
                          )}
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

    </div>
  );
}
