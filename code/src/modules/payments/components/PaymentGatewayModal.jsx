import React, { useState } from 'react';
import { CreditCard, Building2, FileCheck, Wallet, Loader2, CheckCircle2, ClipboardList } from 'lucide-react';
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
import { useAuth } from '@/lib/AuthContext';

import StripePaymentForm from './StripePaymentForm';

export default function PaymentGatewayModal({
  open,
  onOpenChange,
  payment,
  onPaymentComplete,
}) {
  const { organization } = useAuth();
  const [confirmed, setConfirmed] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState('card');
  const [processing, setProcessing] = useState(false);
  const [recordingFailed, setRecordingFailed] = useState(false);
  const [lastPaymentData, setLastPaymentData] = useState(null);

  const [manualForm, setManualForm] = useState({
    type: 'external_card',
    cheque_number: '',
    reference: '',
    notes: '',
  });

  const resetForms = () => {
    setManualForm({ type: 'external_card', cheque_number: '', reference: '', notes: '' });
    setSelectedMethod('card');
    setConfirmed(false);
    setCompleted(false);
    setProcessing(false);
    setRecordingFailed(false);
    setLastPaymentData(null);
  };

  const handleClose = () => {
    resetForms();
    onOpenChange(false);
  };

  const handlePaymentSuccess = async (paymentData) => {
    setLastPaymentData(paymentData);
    setRecordingFailed(false);
    setProcessing(true);
    try {
      await onPaymentComplete(paymentData);
      setCompleted(true);
      setTimeout(() => handleClose(), 2000);
    } catch (err) {
      setRecordingFailed(true);
      toast.error('Failed to record payment: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleRetryRecording = () => {
    if (lastPaymentData) handlePaymentSuccess(lastPaymentData);
  };

  const handlePaymentError = (err) => {
    toast.error('Payment failed: ' + (err?.message || 'Unknown error'));
  };

  const recordOutsidePayment = async (method) => {
    if (method === 'cheque' && !manualForm.cheque_number.trim()) {
      toast.error('Enter the check number.');
      return;
    }
    if (method !== 'cheque' && !manualForm.reference.trim()) {
      toast.error('Enter a reference or transaction ID.');
      return;
    }

    setProcessing(true);
    const transactionId = manualForm.reference.trim() || manualForm.cheque_number.trim() || `MANUAL-${crypto.randomUUID()}`;
    const paymentData = {
      payment_method: method,
      status: 'completed',
      transaction_id: transactionId,
      payment_date: new Date().toISOString().split('T')[0],
      ...(method === 'cheque' && { cheque_number: manualForm.cheque_number }),
      bank_reference: manualForm.reference,
      notes: manualForm.notes,
    };

    await handlePaymentSuccess(paymentData);
  };

  if (!payment) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-teal-600" />
            Collect or Record Payment
          </DialogTitle>
          <DialogDescription>
            Use Card for Stripe collection. Use ACH, Check, or Manual only to record a payment completed outside RestOps.
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
        ) : recordingFailed ? (
          <div className="py-8 text-center">
            <div className="h-16 w-16 rounded-full bg-resend-red/10 flex items-center justify-center mx-auto mb-4">
              <FileCheck className="h-8 w-8 text-resend-red" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">Payment Charged, Recording Failed</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              {lastPaymentData?.payment_method === 'stripe'
                ? 'Your card was already charged, but we could not save the payment record. Do not re-enter card details - just try recording again.'
                : 'The payment could not be saved. It is safe to try recording it again.'}
            </p>
            <Button className="mt-4" onClick={handleRetryRecording} disabled={processing}>
              {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Try Again
            </Button>
          </div>
        ) : (
          <>
            <div className="bg-secondary/40 border border-border/50 rounded-lg p-4 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">From</span>
                <span className="font-medium text-foreground">{organization?.name || 'Your organization'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">To</span>
                <span className="font-medium text-foreground">{payment.vendor_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice #</span>
                <span className="font-medium text-foreground">{payment.invoice_number}</span>
              </div>
              <div className="flex justify-between border-t border-border/50 pt-2 mt-2">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-bold text-lg text-foreground">${payment.amount?.toLocaleString()}</span>
              </div>
            </div>

            {!confirmed ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Confirm the invoice details before choosing how to collect or record this payment.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={handleClose}>Cancel</Button>
                  <Button className="flex-1 bg-teal-600 hover:bg-teal-700" onClick={() => setConfirmed(true)}>
                    Confirm &amp; Continue
                  </Button>
                </div>
              </div>
            ) : (
              <Tabs value={selectedMethod} onValueChange={setSelectedMethod} className="mt-2">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="card" className="text-xs gap-1"><CreditCard className="h-3.5 w-3.5" />Card</TabsTrigger>
                  <TabsTrigger value="ach" className="text-xs gap-1"><Building2 className="h-3.5 w-3.5" />ACH</TabsTrigger>
                  <TabsTrigger value="check" className="text-xs gap-1"><FileCheck className="h-3.5 w-3.5" />Check</TabsTrigger>
                  <TabsTrigger value="manual" className="text-xs gap-1"><ClipboardList className="h-3.5 w-3.5" />Manual</TabsTrigger>
                </TabsList>

                <TabsContent value="card" className="mt-4">
                  <StripePaymentForm
                    amount={payment.amount}
                    invoiceId={payment.invoice_id}
                    vendorName={payment.vendor_name}
                    invoiceNumber={payment.invoice_number}
                    onSuccess={handlePaymentSuccess}
                    onError={handlePaymentError}
                  />
                </TabsContent>

                <TabsContent value="ach" className="mt-4 space-y-3">
                  <p className="rounded-md border bg-secondary/40 p-3 text-sm text-muted-foreground">
                    Record an ACH or bank transfer that was already initiated outside RestOps. Real vendor ACH payouts should use Release Funds with Stripe Connect.
                  </p>
                  <div>
                    <Label>ACH Reference / Confirmation #</Label>
                    <Input placeholder="ACH confirmation number" value={manualForm.reference} onChange={(e) => setManualForm({ ...manualForm, reference: e.target.value })} />
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Textarea placeholder="Additional payment notes..." value={manualForm.notes} onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })} rows={2} />
                  </div>
                  <Button className="w-full bg-teal-600 hover:bg-teal-700" disabled={processing} onClick={() => recordOutsidePayment('bank_transfer')}>
                    {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Building2 className="h-4 w-4 mr-2" />}
                    Record ACH Payment
                  </Button>
                </TabsContent>

                <TabsContent value="check" className="mt-4 space-y-3">
                  <p className="rounded-md border bg-secondary/40 p-3 text-sm text-muted-foreground">
                    Record a paper check that was already sent outside RestOps. To issue a new digital or mailed check, use Release Funds and choose a Checkbook rail.
                  </p>
                  <div>
                    <Label>Check Number</Label>
                    <Input placeholder="Check #" value={manualForm.cheque_number} onChange={(e) => setManualForm({ ...manualForm, cheque_number: e.target.value })} />
                  </div>
                  <div>
                    <Label>Reference / Memo</Label>
                    <Input placeholder="Optional memo or reference" value={manualForm.reference} onChange={(e) => setManualForm({ ...manualForm, reference: e.target.value })} />
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Textarea placeholder="Additional payment notes..." value={manualForm.notes} onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })} rows={2} />
                  </div>
                  <Button className="w-full bg-teal-600 hover:bg-teal-700" disabled={processing} onClick={() => recordOutsidePayment('cheque')}>
                    {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileCheck className="h-4 w-4 mr-2" />}
                    Record Check Payment
                  </Button>
                </TabsContent>

                <TabsContent value="manual" className="mt-4 space-y-3">
                  <div>
                    <Label>Manual Payment Type</Label>
                    <Select value={manualForm.type} onValueChange={(v) => setManualForm({ ...manualForm, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="external_card">External Card</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="manual">Other Manual Record</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Reference / Transaction ID</Label>
                    <Input placeholder="Reference number" value={manualForm.reference} onChange={(e) => setManualForm({ ...manualForm, reference: e.target.value })} />
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Textarea placeholder="Additional payment notes..." value={manualForm.notes} onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })} rows={2} />
                  </div>
                  <Button className="w-full bg-teal-600 hover:bg-teal-700" disabled={processing} onClick={() => recordOutsidePayment(manualForm.type)}>
                    {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ClipboardList className="h-4 w-4 mr-2" />}
                    Record Manual Payment
                  </Button>
                </TabsContent>
              </Tabs>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
