import React, { useState } from 'react';
import { CreditCard, Building2, FileCheck, Wallet, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

import StripePaymentForm from './StripePaymentForm';
import PayPalPaymentForm from './PayPalPaymentForm';
import BankTransferForm from './BankTransferForm';

export default function PaymentGatewayModal({
  open,
  onOpenChange,
  payment,
  onPaymentComplete,
}) {
  const [completed, setCompleted] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState('stripe');
  const [processing, setProcessing] = useState(false);

  // Manual payment state
  const [manualForm, setManualForm] = useState({
    type: 'cheque',
    cheque_number: '',
    reference: '',
    notes: '',
  });

  const resetForms = () => {
    setManualForm({ type: 'cheque', cheque_number: '', reference: '', notes: '' });
    setCompleted(false);
    setProcessing(false);
  };

  const handleClose = () => {
    resetForms();
    onOpenChange(false);
  };

  const handlePaymentSuccess = async (paymentData) => {
    setCompleted(true);
    try {
      await onPaymentComplete(paymentData);
    } catch (err) {
      toast.error('Failed to record payment: ' + err.message);
    }
    setTimeout(() => handleClose(), 2000);
  };

  const handlePaymentError = (err) => {
    toast.error('Payment failed: ' + (err?.message || 'Unknown error'));
  };

  const processManualPayment = async () => {
    setProcessing(true);
    await new Promise(r => setTimeout(r, 800));

    const transactionId = `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const paymentData = {
      payment_method: manualForm.type,
      status: 'completed',
      transaction_id: transactionId,
      payment_date: new Date().toISOString().split('T')[0],
      ...(manualForm.type === 'cheque' && { cheque_number: manualForm.cheque_number }),
      bank_reference: manualForm.reference,
      notes: manualForm.notes,
    };

    setProcessing(false);
    await handlePaymentSuccess(paymentData);
  };

  if (!payment) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-teal-600" />
            Process Payment
          </DialogTitle>
          <DialogDescription>
            Pay ${payment.amount?.toLocaleString()} to {payment.vendor_name}
          </DialogDescription>
        </DialogHeader>

        {completed ? (
          <div className="py-8 text-center">
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4 animate-in zoom-in-50">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">Payment Successful!</h3>
            <p className="text-sm text-slate-500 mt-1">Transaction has been recorded.</p>
          </div>
        ) : (
          <>
            {/* Payment summary */}
            <div className="bg-secondary/40 border border-border/50 rounded-lg p-4 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vendor</span>
                <span className="font-medium text-foreground">{payment.vendor_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice #</span>
                <span className="font-medium text-foreground">{payment.invoice_number}</span>
              </div>
              {payment.due_date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Due Date</span>
                  <span className="font-medium text-foreground">{payment.due_date}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border/50 pt-2 mt-2">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-bold text-lg text-foreground">${payment.amount?.toLocaleString()}</span>
              </div>
            </div>

            <Tabs value={selectedMethod} onValueChange={setSelectedMethod} className="mt-2">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="stripe" className="text-xs gap-1">
                  <CreditCard className="h-3.5 w-3.5" />
                  Card
                </TabsTrigger>
                <TabsTrigger value="paypal" className="text-xs gap-1">
                  <Wallet className="h-3.5 w-3.5" />
                  PayPal
                </TabsTrigger>
                <TabsTrigger value="bank_transfer" className="text-xs gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  Bank
                </TabsTrigger>
                <TabsTrigger value="manual" className="text-xs gap-1">
                  <FileCheck className="h-3.5 w-3.5" />
                  Manual
                </TabsTrigger>
              </TabsList>

              {/* Stripe / Card */}
              <TabsContent value="stripe" className="mt-4">
                <StripePaymentForm
                  amount={payment.amount}
                  vendorName={payment.vendor_name}
                  invoiceNumber={payment.invoice_number}
                  onSuccess={handlePaymentSuccess}
                  onError={handlePaymentError}
                />
              </TabsContent>

              {/* PayPal */}
              <TabsContent value="paypal" className="mt-4">
                <PayPalPaymentForm
                  amount={payment.amount}
                  vendorName={payment.vendor_name}
                  invoiceNumber={payment.invoice_number}
                  onSuccess={handlePaymentSuccess}
                  onError={handlePaymentError}
                />
              </TabsContent>

              {/* Bank Transfer */}
              <TabsContent value="bank_transfer" className="mt-4">
                <BankTransferForm
                  amount={payment.amount}
                  vendorName={payment.vendor_name}
                  invoiceNumber={payment.invoice_number}
                  onSuccess={handlePaymentSuccess}
                />
              </TabsContent>

              {/* Manual Payment */}
              <TabsContent value="manual" className="mt-4 space-y-3">
                <div>
                  <Label>Payment Type</Label>
                  <Select value={manualForm.type} onValueChange={(v) => setManualForm({ ...manualForm, type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="manual">Other / Manual Record</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {manualForm.type === 'cheque' && (
                  <div>
                    <Label>Cheque Number</Label>
                    <Input
                      placeholder="Cheque #"
                      value={manualForm.cheque_number}
                      onChange={(e) => setManualForm({ ...manualForm, cheque_number: e.target.value })}
                    />
                  </div>
                )}
                <div>
                  <Label>Reference / Transaction ID</Label>
                  <Input
                    placeholder="Reference number"
                    value={manualForm.reference}
                    onChange={(e) => setManualForm({ ...manualForm, reference: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Additional payment notes..."
                    value={manualForm.notes}
                    onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })}
                    rows={2}
                  />
                </div>
                <Button
                  className="w-full bg-teal-600 hover:bg-teal-700"
                  disabled={processing}
                  onClick={processManualPayment}
                >
                  {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileCheck className="h-4 w-4 mr-2" />}
                  {processing ? 'Recording...' : 'Record Payment'}
                </Button>
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
