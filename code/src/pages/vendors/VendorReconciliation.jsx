import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UploadCloud, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { toast } from "sonner";

export default function VendorReconciliation({ vendorId }) {
  // In a real implementation, this reads from a 3-way matching backend table or runs an RPC matching statements to invoices.
  const [statementData, setStatementData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleUploadStatement = () => {
    setIsProcessing(true);
    // Simulate Dockling parsing + Vertex AI matching
    setTimeout(() => {
      setStatementData({
        matched: [
          { invoice_num: 'INV-10042', statement_amount: 450.00, app_amount: 450.00, status: 'matched' },
          { invoice_num: 'INV-10043', statement_amount: 125.50, app_amount: 125.50, status: 'matched' }
        ],
        unpaid: [
          { invoice_num: 'INV-10044', statement_amount: 320.00, app_amount: 320.00, status: 'unpaid_in_app' }
        ],
        missing: [
          { invoice_num: 'INV-10045', statement_amount: 85.00, app_amount: 0, status: 'missing_in_app' }
        ],
        mismatch: [
          { invoice_num: 'INV-10046', statement_amount: 500.00, app_amount: 450.00, status: 'amount_mismatch' }
        ]
      });
      setIsProcessing(false);
      toast.success("Statement processed. 2 matched, 3 exceptions found.");
    }, 2000);
  };

  const allRows = statementData ? [
    ...statementData.matched,
    ...statementData.unpaid,
    ...statementData.missing,
    ...statementData.mismatch
  ] : [];

  const getStatusBadge = (status) => {
    switch (status) {
      case 'matched': return <Badge className="bg-resend-green/10 text-resend-green border-0"><CheckCircle2 className="w-3 h-3 mr-1" /> Matched</Badge>;
      case 'unpaid_in_app': return <Badge variant="outline" className="text-amber-500 border-amber-500/50"><AlertTriangle className="w-3 h-3 mr-1" /> Unpaid in App</Badge>;
      case 'missing_in_app': return <Badge className="bg-resend-red/10 text-resend-red border-0"><AlertTriangle className="w-3 h-3 mr-1" /> Missing Invoice</Badge>;
      case 'amount_mismatch': return <Badge className="bg-resend-red/10 text-resend-red border-0"><AlertTriangle className="w-3 h-3 mr-1" /> Amount Mismatch</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-sm border-border/40">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Statement Reconciliation</CardTitle>
            <CardDescription>Upload a vendor statement to perform a 3-way match against RestOps invoices and payments.</CardDescription>
          </div>
          <Button onClick={handleUploadStatement} disabled={isProcessing} className="bg-primary">
            {isProcessing ? <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full mr-2" /> : <UploadCloud className="w-4 h-4 mr-2" />}
            Upload Statement
          </Button>
        </CardHeader>
        <CardContent>
          {!statementData ? (
            <div className="py-12 flex flex-col items-center justify-center text-center border-2 border-dashed border-border/60 rounded-xl bg-secondary/10">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <FileSpreadsheet className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-1">No Active Reconciliation</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Upload a PDF or CSV statement from the vendor. Our AI will automatically match it against your invoice and payment history.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-4 gap-4">
                <div className="p-4 rounded-lg border border-border/40 bg-card text-center">
                  <p className="text-2xl font-bold text-resend-green">{statementData.matched.length}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Perfect Match</p>
                </div>
                <div className="p-4 rounded-lg border border-border/40 bg-card text-center">
                  <p className="text-2xl font-bold text-amber-500">{statementData.unpaid.length}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Unpaid in App</p>
                </div>
                <div className="p-4 rounded-lg border border-border/40 bg-card text-center">
                  <p className="text-2xl font-bold text-resend-red">{statementData.missing.length}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Missing Invoices</p>
                </div>
                <div className="p-4 rounded-lg border border-border/40 bg-card text-center">
                  <p className="text-2xl font-bold text-resend-red">{statementData.mismatch.length}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Amount Mismatch</p>
                </div>
              </div>

              <div className="rounded-md border border-border/40 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead className="text-right">Statement Amount</TableHead>
                      <TableHead className="text-right">RestOps Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allRows.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono font-medium">{row.invoice_num}</TableCell>
                        <TableCell className="text-right">${row.statement_amount.toFixed(2)}</TableCell>
                        <TableCell className="text-right">${row.app_amount.toFixed(2)}</TableCell>
                        <TableCell>{getStatusBadge(row.status)}</TableCell>
                        <TableCell>
                          {row.status !== 'matched' && (
                            <Button variant="outline" size="sm" className="text-xs">Resolve</Button>
                          )}
                        </TableCell>
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
