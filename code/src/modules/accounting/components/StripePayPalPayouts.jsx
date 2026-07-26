import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Loader2, DollarSign, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { api } from '@/lib/apiClient';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { format } from 'date-fns';
import JustPayVendorDialog from './JustPayVendorDialog';

// Real payout rails only -- Stripe Connect ACH and Checkbook.io, the same edge function
// BillPayWidget.jsx uses for a single invoice.
const PAYOUT_METHODS = [
  { value: 'stripe_connect_custom', label: 'Stripe Connect ACH', badge: 'Bank Transfer' },
  { value: 'checkbook_digital', label: 'Digital Check', badge: 'Checkbook.io' },
  { value: 'checkbook_physical', label: 'Mailed Check', badge: 'Checkbook.io' },
];

export default function StripePayPalPayouts() {
  const { organization } = useAuth();
  const queryClient = useQueryClient();
  const [selectedInvoices, setSelectedInvoices] = useState([]);
  const [payoutMethod, setPayoutMethod] = useState('stripe_connect_custom');
  const [isProcessing, setIsProcessing] = useState(false);
  const [justPayOpen, setJustPayOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('');
  const [results, setResults] = useState({}); // { [invoiceId]: { status: 'success'|'failed', error? } }

  // Fetch only approved invoices that are unpaid
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices', 'approved', organization?.id],
    queryFn: () => api.entities.Invoice.filter({
      organization_id: organization?.id,
      status: 'approved'
    }),
    enabled: !!organization?.id,
  });

  const handleSelect = (id) => {
    setSelectedInvoices(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectedTotal = invoices
    .filter(i => selectedInvoices.includes(i.id))
    .reduce((sum, inv) => sum + parseFloat(inv.total_amount || 0), 0);

  const processPayout = async () => {
    if (selectedInvoices.length === 0) {
      toast.error("Please select at least one invoice to pay.");
      return;
    }

    setIsProcessing(true);
    setResults({});
    const totalCredit = parseFloat(creditAmount) || 0;
    let creditRemaining = totalCredit;
    let successCount = 0;
    let failCount = 0;

    // Sequential, not parallel: each call mutates the invoice's own payment_status/status
    // via release_invoice_funds, and running these concurrently against the same organization's
    // rate-limited Stripe/Checkbook credentials is asking for trouble.
    for (const id of selectedInvoices) {
      const inv = invoices.find(i => i.id === id);
      const invTotal = parseFloat(inv.total_amount || 0);
      let appliedToThisInvoice = 0;

      if (creditRemaining > 0) {
        appliedToThisInvoice = Math.min(invTotal, creditRemaining);
        creditRemaining -= appliedToThisInvoice;
      }

      try {
        if (appliedToThisInvoice > 0) {
          // Apply the credit BEFORE releasing funds so the real payout call computes
          // total_amount - paid_amount correctly (release_invoice_funds/process-payout
          // recompute the transfer amount server-side, they don't trust a client-supplied one).
          await api.financial.saveInvoice({
            invoiceId: id,
            invoice: {
              paid_amount: appliedToThisInvoice,
              credit_applied: appliedToThisInvoice,
              credit_reason: creditReason || null,
            },
          });
        }

        // Which rail runs is just a payout_method value now -- one function for all of them,
        // see _shared/payoutProviders/index.ts.
        const { data, error } = await supabase.functions.invoke('process-payout', {
          body: { invoice_id: id, payout_method: payoutMethod },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        setResults(prev => ({ ...prev, [id]: { status: 'success' } }));
        successCount += 1;
      } catch (err) {
        setResults(prev => ({ ...prev, [id]: { status: 'failed', error: err.message } }));
        failCount += 1;
      }
    }

    if (successCount > 0) toast.success(`${successCount} payout${successCount === 1 ? '' : 's'} released successfully.`);
    if (failCount > 0) toast.error(`${failCount} payout${failCount === 1 ? '' : 's'} failed -- see status below.`);
    setSelectedInvoices([]);
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    setIsProcessing(false);
  };

  if (isLoading) {
    return <div className="p-8 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm bg-gradient-to-br from-indigo-50 via-white to-blue-50">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-xl flex items-center gap-2">
              <DollarSign className="h-6 w-6 text-indigo-600" />
              Bulk Vendor Payouts
            </CardTitle>
            <CardDescription className="mt-1">
              Select approved invoices and release real payouts via Stripe Connect ACH or Checkbook.io.
            </CardDescription>
          </div>
          <Button variant="outline" className="border-indigo-200 text-indigo-700 hover:bg-indigo-50" onClick={() => setJustPayOpen(true)}>
            Record Manual Payment
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            {/* Left: Invoice Selection */}
            <div className="xl:col-span-2 space-y-4">
              <h3 className="font-semibold text-lg">Approved Invoices Awaiting Payment</h3>
              <div className="bg-card border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-secondary/50">
                    <TableRow>
                      <TableHead className="w-[50px]"></TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-[100px]">Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-resend-green/50" />
                          No approved invoices pending payment.
                        </TableCell>
                      </TableRow>
                    ) : (
                      invoices.map(inv => (
                        <TableRow key={inv.id} className="cursor-pointer" onClick={() => handleSelect(inv.id)}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedInvoices.includes(inv.id)}
                              onChange={() => {}} // handled by row click
                              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                            />
                          </TableCell>
                          <TableCell className="font-medium">{inv.vendors?.name || 'Unknown Vendor'}</TableCell>
                          <TableCell>{inv.invoice_number}</TableCell>
                          <TableCell>{inv.due_date ? format(new Date(inv.due_date), 'MMM d, yyyy') : 'Net 30'}</TableCell>
                          <TableCell className="text-right font-bold">${parseFloat(inv.total_amount || 0).toFixed(2)}</TableCell>
                          <TableCell>
                            {results[inv.id]?.status === 'success' && (
                              <Badge className="bg-resend-green/10 text-resend-green border-0"><CheckCircle2 className="w-3 h-3 mr-1" /> Sent</Badge>
                            )}
                            {results[inv.id]?.status === 'failed' && (
                              <Badge className="bg-resend-red/10 text-resend-red border-0" title={results[inv.id].error}><XCircle className="w-3 h-3 mr-1" /> Failed</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Right: Payment Execution */}
            <div className="space-y-6">
              <div className="bg-card p-6 rounded-xl border shadow-sm space-y-6">
                <div>
                  <h3 className="font-semibold mb-4">Select Payout Method</h3>
                  <RadioGroup value={payoutMethod} onValueChange={setPayoutMethod} className="space-y-3">
                    {PAYOUT_METHODS.map(method => (
                      <div key={method.value} className="flex items-center space-x-3 border p-4 rounded-lg cursor-pointer hover:bg-muted/60">
                        <RadioGroupItem value={method.value} id={method.value} />
                        <Label htmlFor={method.value} className="flex-1 cursor-pointer font-medium flex items-center justify-between">
                          {method.label}
                          <Badge variant="outline" className="bg-indigo-50 text-indigo-700">{method.badge}</Badge>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                <div className="border-t pt-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-muted-foreground">Invoices Selected</span>
                    <span className="font-medium">{selectedInvoices.length}</span>
                  </div>
                  <div className="flex justify-between mb-4">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium">${selectedTotal.toFixed(2)}</span>
                  </div>

                  <div className="bg-muted/40 p-3 rounded-lg border border-border mb-4 space-y-3">
                    <Label className="text-sm font-medium flex items-center justify-between text-muted-foreground">
                      Apply Vendor Credit
                      <span className="text-xs font-normal text-muted-foreground">(Optional Short Pay)</span>
                    </Label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="number"
                          placeholder="0.00"
                          className="pl-8 bg-card h-9"
                          value={creditAmount}
                          onChange={(e) => setCreditAmount(e.target.value)}
                        />
                      </div>
                      <Input
                        type="text"
                        placeholder="Reason (e.g. Bad tomatoes)"
                        className="flex-[2] bg-card h-9"
                        value={creditReason}
                        onChange={(e) => setCreditReason(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex justify-between mb-4 pt-2 border-t">
                    <span className="font-semibold">Final Payout Amount</span>
                    <span className="font-bold text-xl text-indigo-600">
                      ${Math.max(0, selectedTotal - (parseFloat(creditAmount) || 0)).toFixed(2)}
                    </span>
                  </div>

                  <Button
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-12"
                    disabled={selectedInvoices.length === 0 || isProcessing}
                    onClick={processPayout}
                  >
                    {isProcessing ? (
                      <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Releasing funds...</>
                    ) : (
                      <><ArrowRight className="h-5 w-5 mr-2" /> Release Funds via {PAYOUT_METHODS.find(m => m.value === payoutMethod)?.label}</>
                    )}
                  </Button>
                  <p className="text-xs text-center text-muted-foreground mt-3">
                    Each invoice is a real Stripe Connect/Checkbook.io call -- failures revert automatically and can be retried.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <JustPayVendorDialog open={justPayOpen} onOpenChange={setJustPayOpen} />
    </div>
  );
}
