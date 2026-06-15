import React, { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { supabase } from '@/lib/supabaseClient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  FileText,
  Upload,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  MessageSquare
} from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function VendorStatementsTab({ vendors }) {
  const { organization } = useAuth();
  const queryClient = useQueryClient();
  const [selectedVendorId, setSelectedVendorId] = useState('all');
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false);
  const [selectedStatement, setSelectedStatement] = useState(null);
  const [disputeNotes, setDisputeNotes] = useState('');
  
  // File upload state mockup
  const [isUploading, setIsUploading] = useState(false);
  const [uploadVendorId, setUploadVendorId] = useState('');
  const [uploadDate, setUploadDate] = useState('');
  const [uploadAmount, setUploadAmount] = useState('');

  // Fetch statements
  const { data: statements = [], isLoading } = useAuthQuery({
    queryKey: ['vendor-statements', organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendor_statements')
        .select(`
          *,
          vendor:vendors(name),
          lines:vendor_statement_lines(*)
        `)
        .eq('organization_id', organization?.id)
        .order('statement_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id
  });

  const filteredStatements = statements.filter(s => 
    selectedVendorId === 'all' ? true : s.vendor_id === selectedVendorId
  );

  const autoMatchMutation = useMutation({
    mutationFn: async (statementId) => {
      const { data, error } = await supabase.rpc('auto_match_statement_lines', { p_statement_id: statementId });
      if (error) throw error;
      return data;
    },
    onSuccess: (matchedCount) => {
      queryClient.invalidateQueries({ queryKey: ['vendor-statements'] });
      toast.success(`Auto-matched ${matchedCount} lines`);
    },
    onError: (e) => toast.error(`Matching failed: ${e.message}`)
  });

  const mockUploadMutation = useMutation({
    mutationFn: async () => {
      setIsUploading(true);
      // Simulate OCR delay
      await new Promise(res => setTimeout(res, 2000));
      
      const { data: st, error: stErr } = await supabase
        .from('vendor_statements')
        .insert({
          organization_id: organization.id,
          vendor_id: uploadVendorId,
          statement_date: uploadDate,
          total_amount: Number(uploadAmount)
        })
        .select()
        .single();
        
      if (stErr) throw stErr;

      // Mock creating 3 statement lines, one matched, one unmatched, one missing credit
      await supabase.from('vendor_statement_lines').insert([
        { statement_id: st.id, invoice_number: 'INV-101', amount: Number(uploadAmount) * 0.5, status: 'unmatched' },
        { statement_id: st.id, invoice_number: 'INV-102', amount: Number(uploadAmount) * 0.6, status: 'unmatched' },
        { statement_id: st.id, invoice_number: 'CR-99', amount: -Number(uploadAmount) * 0.1, status: 'unmatched' }
      ]);
      
      return st;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-statements'] });
      toast.success('Statement uploaded and parsed');
      setUploadDialogOpen(false);
      setIsUploading(false);
      setUploadVendorId('');
      setUploadAmount('');
      setUploadDate('');
    },
    onError: (e) => {
      setIsUploading(false);
      toast.error(e.message);
    }
  });

  const handleDispute = async () => {
    try {
      await supabase.from('vendor_statements').update({ status: 'disputed' }).eq('id', selectedStatement.id);
      // Ideally send email or log
      toast.success('Dispute sent to vendor');
      queryClient.invalidateQueries({ queryKey: ['vendor-statements'] });
      setDisputeDialogOpen(false);
    } catch (e) {
      toast.error('Failed to dispute: ' + e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Statement Reconciliation</h2>
          <p className="text-muted-foreground text-sm">Upload vendor statements to auto-match against open invoices and catch missing credits.</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by Vendor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vendors</SelectItem>
              {vendors.map(v => (
                <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setUploadDialogOpen(true)} className="bg-primary hover:bg-primary">
            <Upload className="h-4 w-4 mr-2" /> Upload Statement
          </Button>
        </div>
      </div>

      {filteredStatements.length === 0 ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground">No Statements Found</h3>
            <p className="text-muted-foreground max-w-sm mt-1">
              Upload a vendor PDF statement to automatically reconcile invoices and detect missing credits.
            </p>
            <Button onClick={() => setUploadDialogOpen(true)} variant="outline" className="mt-4">
              <Upload className="h-4 w-4 mr-2" /> Upload First Statement
            </Button>
          </CardContent>
        </Card>
      ) : (
        filteredStatements.map(statement => {
          const lines = statement.lines || [];
          const matchedLines = lines.filter(l => l.status === 'matched');
          const unmatchedLines = lines.filter(l => l.status === 'unmatched');
          
          return (
            <Card key={statement.id} className="overflow-hidden border-0 shadow-sm">
              <div className="bg-muted/50 p-4 border-b flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-background rounded shadow-sm">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{statement.vendor?.name} Statement</h3>
                    <p className="text-sm text-muted-foreground">
                      Statement Date: {new Date(statement.statement_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Total Amount</p>
                    <p className="font-semibold text-lg">${Number(statement.total_amount).toLocaleString()}</p>
                  </div>
                  <Badge className={
                    statement.status === 'matched' ? 'bg-resend-green/10 text-resend-green' :
                    statement.status === 'disputed' ? 'bg-resend-red/10 text-resend-red' :
                    'bg-yellow-100 text-yellow-800'
                  }>
                    {statement.status.replace('_', ' ')}
                  </Badge>
                  
                  {statement.status === 'needs_review' && (
                    <>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => autoMatchMutation.mutate(statement.id)}
                        disabled={autoMatchMutation.isPending}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" /> Auto-Match
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={() => {
                          setSelectedStatement(statement);
                          setDisputeDialogOpen(true);
                        }}
                      >
                        <MessageSquare className="h-4 w-4 mr-2" /> Dispute
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice / Credit #</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>RestOps Match</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map(line => (
                      <TableRow key={line.id}>
                        <TableCell className="font-medium">{line.invoice_number}</TableCell>
                        <TableCell className={line.amount < 0 ? 'text-resend-green font-medium' : ''}>
                          ${Math.abs(line.amount).toLocaleString()} {line.amount < 0 && '(Credit)'}
                        </TableCell>
                        <TableCell>
                          {line.status === 'matched' ? (
                            <span className="flex items-center text-resend-green text-sm">
                              <CheckCircle2 className="h-4 w-4 mr-1" /> Matched
                            </span>
                          ) : line.status === 'unmatched' ? (
                            <span className="flex items-center text-yellow-600 text-sm">
                              <AlertTriangle className="h-4 w-4 mr-1" /> Missing from RestOps
                            </span>
                          ) : (
                            <Badge variant="outline">{line.status}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {line.status === 'matched' ? (
                            <Badge variant="outline" className="font-mono">{line.matched_invoice_id?.slice(0,8)}</Badge>
                          ) : (
                            <Button size="sm" variant="ghost" className="h-7 text-xs">
                              <Search className="h-3 w-3 mr-1" /> Manual Find
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {lines.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                          No line items extracted from statement yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Vendor Statement</DialogTitle>
            <DialogDescription>
              Upload a PDF statement. Our OCR will extract the line items and auto-reconcile them with your RestOps invoices.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Vendor</label>
              <Select value={uploadVendorId} onValueChange={setUploadVendorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Statement Date</label>
              <Input type="date" value={uploadDate} onChange={e => setUploadDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Total Amount</label>
              <Input type="number" step="0.01" value={uploadAmount} onChange={e => setUploadAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center bg-muted/20 mt-4 cursor-pointer hover:bg-muted/50 transition-colors">
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Click to upload or drag and drop</p>
              <p className="text-xs text-muted-foreground">PDF statements only</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => mockUploadMutation.mutate()} 
              disabled={isUploading || !uploadVendorId || !uploadDate || !uploadAmount}
              className="bg-primary hover:bg-primary"
            >
              {isUploading ? 'Processing OCR...' : 'Upload & Reconcile'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispute Dialog */}
      <Dialog open={disputeDialogOpen} onOpenChange={setDisputeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dispute Statement</DialogTitle>
            <DialogDescription>
              Send an email to the vendor identifying missing invoices or credits that were not on the statement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Dispute Notes</label>
              <Textarea 
                placeholder="E.g., We are missing credit for the spoiled tomatoes on INV-101. Please issue a credit memo."
                value={disputeNotes}
                onChange={e => setDisputeNotes(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisputeDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleDispute} variant="destructive">
              Send Dispute Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
