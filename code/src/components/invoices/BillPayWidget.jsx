import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { format } from 'date-fns';
import { toast } from 'sonner';
import { getApRoutingLabel, isPaymentQueueRouted } from '@/lib/apRouting';
import { Calendar as CalendarIcon, DollarSign, CheckCircle2 } from 'lucide-react';

export function BillPayWidget({ invoice }) {
  const { organization } = useAuth();
  const queryClient = useQueryClient();

  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleData, setScheduleData] = useState({
    payment_account_id: invoice?.payment_account_id || '',
    date: invoice?.scheduled_payment_date || ''
  });

  const [isRecording, setIsRecording] = useState(false);
  const [recordData, setRecordData] = useState({
    amount: invoice ? (invoice.total_amount - (invoice.paid_amount || 0)).toFixed(2) : '',
    reference: '',
    method: 'manual'
  });

  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ['payment-accounts', organization?.id],
    queryFn: () => api.entities.PaymentAccount.filter(
      { organization_id: organization.id, is_active: true },
      { orderBy: 'name' }
    ),
    enabled: !!organization?.id
  });

  const scheduleMutation = useMutation({
    mutationFn: async (data) => {
      const { error } = await supabase.rpc('schedule_invoice_payment', {
        p_invoice_id: invoice.id,
        p_payment_account_id: data.payment_account_id,
        p_date: data.date
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment scheduled");
      queryClient.invalidateQueries({ queryKey: ['invoice', invoice.id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setIsScheduling(false);
    },
    onError: (err) => toast.error(err.message)
  });

  const recordMutation = useMutation({
    mutationFn: async (data) => {
      const { error } = await supabase.rpc('record_invoice_payment', {
        p_invoice_id: invoice.id,
        p_amount: parseFloat(data.amount),
        p_reference: data.reference,
        p_payment_method: data.method
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      queryClient.invalidateQueries({ queryKey: ['invoice', invoice.id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setIsRecording(false);
      setRecordData({ ...recordData, reference: '' }); // Reset reference, amount recalculates on next open
    },
    onError: (err) => toast.error(err.message)
  });

  const handleSchedule = () => {
    if (!scheduleData.payment_account_id) return toast.error("Select a payment account");
    if (!scheduleData.date) return toast.error("Select a payment date");
    scheduleMutation.mutate(scheduleData);
  };

  const handleRecord = () => {
    const amt = parseFloat(recordData.amount);
    if (isNaN(amt) || amt <= 0) return toast.error("Enter a valid amount");
    if (!recordData.reference.trim()) return toast.error("Reference is required");
    recordMutation.mutate(recordData);
  };

  if (!invoice) return null;

  // Only show this widget if the invoice is approved, scheduled, partially paid, or paid
  if (!['approved', 'scheduled', 'partially_paid', 'paid'].includes(invoice.status)) {
    return null;
  }

  const isPaid = ['paid', 'auto_pay'].includes(invoice.payment_status) || invoice.status === 'paid';
  if (!isPaid && !isPaymentQueueRouted(invoice)) {
    return (
      <Card className="border-border shadow-sm bg-muted/30">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Bill Pay & Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This vendor is routed to {getApRoutingLabel(invoice.ap_routing_destination)}, so this invoice is excluded from Bill Pay.
          </p>
        </CardContent>
      </Card>
    );
  }

  const remainingBalance = invoice.total_amount - (invoice.paid_amount || 0);
  const isFullyPaid = remainingBalance <= 0 || invoice.status === 'paid';
  const selectedAccountName = accounts.find(a => a.id === invoice.payment_account_id)?.name || 'Unknown Account';

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            Bill Pay & Payments
          </CardTitle>
          <div className="flex gap-2">
            {!isFullyPaid && invoice.status === 'approved' && (
              <Button size="sm" variant="outline" onClick={() => setIsScheduling(true)}>
                <CalendarIcon className="w-4 h-4 mr-2" />
                Schedule
              </Button>
            )}
            {!isFullyPaid && (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => {
                setRecordData(prev => ({ ...prev, amount: remainingBalance.toFixed(2) }));
                setIsRecording(true);
              }}>
                Record Payment
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-50 p-3 rounded-lg border">
            <div className="text-xs text-slate-500 mb-1">Total Amount</div>
            <div className="font-semibold text-slate-900">${invoice.total_amount?.toFixed(2)}</div>
          </div>
          <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100">
            <div className="text-xs text-emerald-700 mb-1">Paid Amount</div>
            <div className="font-semibold text-emerald-900">${(invoice.paid_amount || 0).toFixed(2)}</div>
          </div>
          <div className="bg-rose-50 p-3 rounded-lg border border-rose-100">
            <div className="text-xs text-rose-700 mb-1">Balance Due</div>
            <div className="font-semibold text-rose-900">${remainingBalance.toFixed(2)}</div>
          </div>
          <div className="bg-slate-50 p-3 rounded-lg border">
            <div className="text-xs text-slate-500 mb-1">Status</div>
            <div className="font-semibold text-slate-900 capitalize">
              {isFullyPaid ? 'Paid in Full' : invoice.status.replace('_', ' ')}
            </div>
          </div>
        </div>

        {invoice.status === 'scheduled' && !isFullyPaid && (
          <div className="flex items-center gap-3 p-3 bg-amber-50 text-amber-900 rounded-lg border border-amber-200">
            <CalendarIcon className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="text-sm">
              This invoice is scheduled to be paid on <strong>{format(new Date(invoice.scheduled_payment_date), 'MMM dd, yyyy')}</strong> from <strong>{selectedAccountName}</strong>.
            </div>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setIsScheduling(true)}>
              Reschedule
            </Button>
          </div>
        )}

        {isFullyPaid && (
          <div className="flex items-center gap-3 p-3 bg-emerald-50 text-emerald-900 rounded-lg border border-emerald-200">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="text-sm font-medium">
              This invoice has been paid in full.
            </div>
          </div>
        )}
      </CardContent>

      {/* Schedule Dialog */}
      <Dialog open={isScheduling} onOpenChange={setIsScheduling}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Payment</DialogTitle>
            <DialogDescription>
              Assign a payment account and scheduled date for this invoice.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Payment Account</Label>
              <Select value={scheduleData.payment_account_id} onValueChange={v => setScheduleData({...scheduleData, payment_account_id: v})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map(acc => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name} ({acc.account_type.replace('_', ' ')})
                    </SelectItem>
                  ))}
                  {accounts.length === 0 && (
                    <SelectItem value="none" disabled>No active accounts found</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Scheduled Date</Label>
              <Input 
                type="date" 
                value={scheduleData.date} 
                onChange={e => setScheduleData({...scheduleData, date: e.target.value})} 
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsScheduling(false)}>Cancel</Button>
            <Button onClick={handleSchedule} disabled={scheduleMutation.isPending}>
              {scheduleMutation.isPending ? 'Scheduling...' : 'Confirm Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={isRecording} onOpenChange={setIsRecording}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Manually record a payment made outside of RestOps (e.g., written check, vendor portal).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Amount Paid</Label>
              <Input 
                type="number" 
                step="0.01"
                min="0.01"
                max={remainingBalance}
                value={recordData.amount} 
                onChange={e => setRecordData({...recordData, amount: e.target.value})} 
              />
              <p className="text-xs text-slate-500">Maximum: ${remainingBalance.toFixed(2)}</p>
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={recordData.method} onValueChange={v => setRecordData({...recordData, method: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual / Check</SelectItem>
                  <SelectItem value="bank_transfer">ACH / Bank Transfer</SelectItem>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                  <SelectItem value="cash">Petty Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reference / Check Number</Label>
              <Input 
                value={recordData.reference} 
                onChange={e => setRecordData({...recordData, reference: e.target.value})} 
                placeholder="e.g. Check #1234 or confirmation code"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsRecording(false)}>Cancel</Button>
            <Button onClick={handleRecord} className="bg-emerald-600 hover:bg-emerald-700" disabled={recordMutation.isPending}>
              {recordMutation.isPending ? 'Recording...' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

