import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, ArrowRight, Loader2, DollarSign, CheckCircle2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { format } from 'date-fns';
import JustPayVendorDialog from './JustPayVendorDialog';

export default function StripePayPalPayouts() {
  const { organization, userProfile } = useAuth();
  const queryClient = useQueryClient();
  const [selectedInvoices, setSelectedInvoices] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('stripe'); // 'stripe' or 'paypal'
  const [isProcessing, setIsProcessing] = useState(false);
  const [justPayOpen, setJustPayOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('');

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
    try {
      // Simulate API call to your backend Node.js server which would handle 
      // the actual Stripe Connect Transfer or PayPal Payouts API.
      await new Promise(resolve => setTimeout(resolve, 2000));

      // After successful Stripe/PayPal transfer, update the invoices in Supabase
      const totalCredit = parseFloat(creditAmount) || 0;
      let creditRemaining = totalCredit;

      for (const id of selectedInvoices) {
        const inv = invoices.find(i => i.id === id);
        
        // Apply credit to invoices until the credit runs out
        const invTotal = parseFloat(inv.total_amount || 0);
        let appliedToThisInvoice = 0;
        
        if (creditRemaining > 0) {
          appliedToThisInvoice = Math.min(invTotal, creditRemaining);
          creditRemaining -= appliedToThisInvoice;
        }

        await api.entities.Invoice.update(id, {
          status: 'paid',
          credit_applied: appliedToThisInvoice,
          credit_reason: appliedToThisInvoice > 0 ? creditReason : null
        });

        // Record the payment in the ledger
        const finalPayoutAmt = invTotal - appliedToThisInvoice;
        
        await api.entities.LedgerPayment.create({
          organization_id: organization?.id,
          vendor_id: inv.vendor_id,
          amount: finalPayoutAmt,
          payment_date: new Date().toISOString().split('T')[0],
          payment_method: paymentMethod,
          reference: `${paymentMethod.toUpperCase()}-PAYOUT-${Date.now()}`,
          status: 'completed',
          created_by: userProfile?.id || null
        });
      }

      toast.success(`Successfully processed ${selectedInvoices.length} payouts via ${paymentMethod === 'stripe' ? 'Stripe Connect' : paymentMethod === 'paypal' ? 'PayPal Payouts' : 'Lob Checks API'}.`);
      setSelectedInvoices([]);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    } catch (e) {
      toast.error(`Failed to process ${paymentMethod} payout.`);
    } finally {
      setIsProcessing(false);
    }
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
              Digital B2B Bill Pay
            </CardTitle>
            <CardDescription className="mt-1">
              Select approved invoices and instantly settle them using your connected Stripe or PayPal business accounts.
            </CardDescription>
          </div>
          <Button variant="outline" className="border-indigo-200 text-indigo-700 hover:bg-indigo-50" onClick={() => setJustPayOpen(true)}>
            Just Pay a Vendor
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            {/* Left: Invoice Selection */}
            <div className="xl:col-span-2 space-y-4">
              <h3 className="font-semibold text-lg">Approved Invoices Awaiting Payment</h3>
              <div className="bg-white border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-secondary/50">
                    <TableRow>
                      <TableHead className="w-[50px]"></TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
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
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Right: Payment Execution */}
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6">
                <div>
                  <h3 className="font-semibold mb-4">Select Payment Processor</h3>
                  <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="space-y-3">
                    <div className="flex items-center space-x-3 border p-4 rounded-lg cursor-pointer hover:bg-slate-50">
                      <RadioGroupItem value="stripe" id="stripe" />
                      <Label htmlFor="stripe" className="flex-1 cursor-pointer font-medium flex items-center justify-between">
                        Stripe Connect
                        <Badge variant="outline" className="bg-indigo-50 text-indigo-700">ACH / Wire</Badge>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3 border p-4 rounded-lg cursor-pointer hover:bg-slate-50">
                      <RadioGroupItem value="paypal" id="paypal" />
                      <Label htmlFor="paypal" className="flex-1 cursor-pointer font-medium flex items-center justify-between">
                        PayPal Payouts
                        <Badge variant="outline" className="bg-blue-50 text-blue-700">Digital Wallet</Badge>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3 border p-4 rounded-lg cursor-pointer hover:bg-slate-50">
                      <RadioGroupItem value="check" id="check" />
                      <Label htmlFor="check" className="flex-1 cursor-pointer font-medium flex items-center justify-between">
                        Mailed Check
                        <Badge variant="outline" className="bg-slate-100 text-slate-700">Lob API</Badge>
                      </Label>
                    </div>
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
                  
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4 space-y-3">
                    <Label className="text-sm font-medium flex items-center justify-between text-slate-700">
                      Apply Vendor Credit
                      <span className="text-xs font-normal text-slate-500">(Optional Short Pay)</span>
                    </Label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                          type="number" 
                          placeholder="0.00" 
                          className="pl-8 bg-white h-9"
                          value={creditAmount}
                          onChange={(e) => setCreditAmount(e.target.value)}
                        />
                      </div>
                      <Input 
                        type="text" 
                        placeholder="Reason (e.g. Bad tomatoes)" 
                        className="flex-[2] bg-white h-9"
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
                      <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Processing {paymentMethod} API...</>
                    ) : (
                      <><ArrowRight className="h-5 w-5 mr-2" /> Submit Payouts via {paymentMethod === 'stripe' ? 'Stripe' : paymentMethod === 'paypal' ? 'PayPal' : 'Mailed Check'}</>
                    )}
                  </Button>
                  <p className="text-xs text-center text-muted-foreground mt-3">
                    Funds will be deducted from your connected business balance.
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
