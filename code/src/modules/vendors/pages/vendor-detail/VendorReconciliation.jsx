import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react';

export default function VendorReconciliation({ vendorId }) {
  const { data: lines = [], isLoading } = useQuery({
    queryKey: ['vendor_statement_lines_reconciliation', vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendor_statement_lines')
        .select('*, vendor_statements!inner(vendor_id, statement_date)')
        .eq('vendor_statements.vendor_id', vendorId)
        .order('invoice_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!vendorId,
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'matched': return <Badge className="bg-resend-green/10 text-resend-green border-0"><CheckCircle2 className="w-3 h-3 mr-1" /> Matched</Badge>;
      case 'unmatched': return <Badge variant="outline" className="text-amber-500 border-amber-500/50"><AlertTriangle className="w-3 h-3 mr-1" /> Unmatched</Badge>;
      case 'disputed': return <Badge className="bg-resend-red/10 text-resend-red border-0"><AlertTriangle className="w-3 h-3 mr-1" /> Disputed</Badge>;
      case 'missing_credit': return <Badge className="bg-resend-red/10 text-resend-red border-0"><AlertTriangle className="w-3 h-3 mr-1" /> Missing Credit</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const counts = React.useMemo(() => ({
    matched: lines.filter(l => l.status === 'matched').length,
    unmatched: lines.filter(l => l.status === 'unmatched').length,
    disputed: lines.filter(l => l.status === 'disputed').length,
  }), [lines]);

  return (
    <div className="space-y-6">
      <Card className="shadow-sm border-border/40">
        <CardHeader>
          <CardTitle>Statement Reconciliation</CardTitle>
          <CardDescription>Statement lines matched against this vendor's invoices. Upload statements from Vendors → Statements.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading...</div>
          ) : lines.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center border-2 border-dashed border-border/60 rounded-xl bg-secondary/10">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <FileSpreadsheet className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-1">No Statement Lines Yet</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Upload a statement for this vendor from the Vendors → Statements tab to see reconciliation status here.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 rounded-lg border border-border/40 bg-card text-center">
                  <p className="text-2xl font-bold text-resend-green">{counts.matched}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Matched</p>
                </div>
                <div className="p-4 rounded-lg border border-border/40 bg-card text-center">
                  <p className="text-2xl font-bold text-amber-500">{counts.unmatched}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Unmatched</p>
                </div>
                <div className="p-4 rounded-lg border border-border/40 bg-card text-center">
                  <p className="text-2xl font-bold text-resend-red">{counts.disputed}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Disputed</p>
                </div>
              </div>

              <div className="rounded-md border border-border/40 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="font-mono font-medium">{line.invoice_number}</TableCell>
                        <TableCell className="text-right">${Number(line.amount).toFixed(2)}</TableCell>
                        <TableCell>{getStatusBadge(line.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate" title={line.notes}>{line.notes || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
