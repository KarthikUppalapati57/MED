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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { format } from 'date-fns';
import { toast } from 'sonner';
import { getApRoutingLabel, isPaymentQueueRouted } from '@/lib/apRouting';
import { isInvoicePaymentReady } from '@/lib/invoiceAp';
import { Calendar as CalendarIcon, DollarSign, CheckCircle2, AlertTriangle, Building2, CheckSquare, Mail, CreditCard } from 'lucide-react';
import StripePaymentForm from '@/modules/payments/components/StripePaymentForm';

// Labels only -- process-payout dispatches to the right rail off this same string, see
// _shared/payoutProviders/index.ts.
const PAYOUT_METHODS = [
  { value: 'stripe_connect_custom', label: 'ACH', detail: 'Bank transfer', icon: Building2, enabled: true },
  { value: 'stripe_card', label: 'Card', detail: 'Card payment', icon: CreditCard, enabled: true, schedulable: false },
  { value: 'checkbook_digital', label: 'Digital Check', detail: 'Email delivery', icon: CheckSquare, enabled: true },
  { value: 'checkbook_physical', label: 'Mailed Check', detail: 'Postal delivery', icon: Mail, enabled: true },
];

const PAYOUT_METHOD_LABELS = Object.fromEntries(PAYOUT_METHODS.map((method) => [method.value, method.label]));

export function BillPayWidget({ invoice }) {
  const { organization, profile } = useAuth();
  const queryClient = useQueryClient();

  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleData, setScheduleData] = useState({
    payment_account_id: invoice?.payment_account_id || '',
    date: invoice?.scheduled_payment_date || '',
    payout_method: invoice?.ap_metadata?.scheduled_payout_method || 'stripe_connect_custom'
  });

  const [isRecording, setIsRecording] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);
  const [releaseData, setReleaseData] = useState({
    payment_account_id: invoice?.payment_account_id || '',
    payout_method: invoice?.ap_metadata?.scheduled_payout_method || 'stripe_connect_custom'
  });
  const [recordData, setRecordData] = useState({
    amount: invoice ? (invoice.total_amount - (invoice.paid_amount || 0)).toFixed(2) : '',
    reference: '',
    method: 'cheque'
  });

  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ['payment-accounts', organization?.id],
    queryFn: () => api.entities.PaymentAccount.filter(
      { organization_id: organization.id, is_active: true },
      { orderBy: 'name' }
    ),
    enabled: !!organization?.id
  });

  const { data: latestPayment } = useQuery({
    queryKey: ['invoice-latest-payment', invoice?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('id, status, payout_status, failure_reason, created_at')
        .eq('invoice_id', invoice.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!invoice?.id
  });

  const scheduleMutation = useMutation({
    mutationFn: async (data) => {
      const { error } = await supabase.rpc('schedule_invoice_payment', {
        p_invoice_id: invoice.id,
        p_payment_account_id: data.payment_account_id,
        p_date: data.date
      });
      if (error) throw error;

      const nextMetadata = { ...(invoice.ap_metadata || {}), scheduled_payout_method: data.payout_method };
      const { error: metadataError } = await supabase
        .from('invoices')
        .update({ ap_metadata: nextMetadata })
        .eq('id', invoice.id);
      if (metadataError) throw metadataError;
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

  const releaseFundsMutation = useMutation({
    mutationFn: async ({ payoutMethod, paymentAccountId }) => {
      if (!paymentAccountId || paymentAccountId === 'none') throw new Error('Select the operating payment account to fund this payout.');
      const { data, error } = await supabase.functions.invoke('process-payout', {
        body: {
          invoice_id: invoice.id,
          payout_method: payoutMethod,
          payment_account_id: paymentAccountId
        }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_data, variables) => {
      toast.success(`Funds released via ${PAYOUT_METHOD_LABELS[variables.payoutMethod] || variables.payoutMethod}`);
      setIsReleasing(false);
      queryClient.invalidateQueries({ queryKey: ['invoice', invoice.id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-latest-payment', invoice.id] });
    },
    onError: (err) => {
      toast.error(err.message || "Failed to release funds");
      queryClient.invalidateQueries({ queryKey: ['invoice', invoice.id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-latest-payment', invoice.id] });
    }
  });
  const openReleaseDialog = (payoutMethod) => {
    const selectedMethod = PAYOUT_METHODS.find((method) => method.value === payoutMethod);
    if (!selectedMethod?.enabled) {
      toast.error(`${selectedMethod?.label || 'This'} payout rail is not configured yet.`);
      return;
    }
    setReleaseData({
      payment_account_id: invoice.payment_account_id || '',
      payout_method: payoutMethod
    });
    setIsReleasing(true);
  };

  const handleRelease = () => {
    releaseFundsMutation.mutate({
      payoutMethod: releaseData.payout_method,
      paymentAccountId: releaseData.payment_account_id
    });
  };
  const handleCardReleaseSuccess = async (paymentData) => {
    try {
      await recordMutation.mutateAsync({
        amount: remainingBalance.toFixed(2),
        reference: paymentData.transaction_id,
        method: 'stripe',
      });
      setIsReleasing(false);
      toast.success('Funds released via Card');
    } catch (err) {
      toast.error(err.message || 'Card payment succeeded, but recording failed.');
    }
  };
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

  const isPaid = ['paid', 'auto_pay'].includes(invoice.payment_status) || invoice.status === 'paid';
  const paymentReady = isInvoicePaymentReady(invoice);

  if (!paymentReady && !isPaid) {
    return null;
  }
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
  const scheduledRailLabel = PAYOUT_METHOD_LABELS[invoice.ap_metadata?.scheduled_payout_method] || 'Not selected';

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            Bill Pay & Payments
          </CardTitle>
          <div className="flex gap-2">
            {!isFullyPaid && paymentReady && (
              <Button size="sm" variant="outline" onClick={() => setIsScheduling(true)}>
                <CalendarIcon className="w-4 h-4 mr-2" />
                Schedule
              </Button>
            )}
            {!isFullyPaid && paymentReady &&
             ['location_manager', 'branch_manager', 'org_manager', 'tenant_super_admin', 'platform_admin'].includes(profile?.role) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700"
                    disabled={releaseFundsMutation.isPending}
                  >
                    {releaseFundsMutation.isPending ? 'Releasing...' : 'Release Funds'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {PAYOUT_METHODS.map((method) => {
                    const MethodIcon = method.icon;
                    return (
                      <DropdownMenuItem
                        key={method.value}
                        disabled={!method.enabled}
                        onClick={() => openReleaseDialog(method.value)}
                        className="flex items-start gap-2"
                      >
                        <MethodIcon className="mt-0.5 h-4 w-4" />
                        <span className="flex min-w-0 flex-col">
                          <span>{method.label}</span>
                          <span className="text-xs text-muted-foreground">{method.detail}</span>
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
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

        {latestPayment?.payout_status === 'failed' && !isFullyPaid && (
          <div className="flex items-center gap-3 p-3 mb-4 bg-resend-red/5 text-resend-red rounded-lg border border-resend-red/20">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <div className="text-sm">
              <span className="font-medium">Last payout attempt failed:</span> {latestPayment.failure_reason || 'Unknown error'}. It's safe to retry with Release Funds above.
            </div>
          </div>
        )}

        {invoice.status === 'scheduled' && !isFullyPaid && (
          <div className="flex items-center gap-3 p-3 bg-amber-50 text-amber-900 rounded-lg border border-amber-200">
            <CalendarIcon className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="text-sm">
              This invoice is scheduled to be paid on <strong>{format(new Date(invoice.scheduled_payment_date), 'MMM dd, yyyy')}</strong> from <strong>{selectedAccountName}</strong> via <strong>{scheduledRailLabel}</strong>.
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

      {/* Release Funds Dialog */}
      <Dialog open={isReleasing} onOpenChange={setIsReleasing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release Vendor Payment</DialogTitle>
            <DialogDescription>
              Choose the operating account and rail before sending funds. Vendor destination details come from the vendor profile/provider connection.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-slate-50 p-3 text-sm">
              <div>
                <p className="text-slate-500">Vendor</p>
                <p className="font-semibold text-slate-900">{invoice.vendor_name || '-'}</p>
              </div>
              <div>
                <p className="text-slate-500">Amount</p>
                <p className="font-semibold text-slate-900">${remainingBalance.toFixed(2)}</p>
              </div>
            </div>
            {releaseData.payout_method !== 'stripe_card' && (
              <div className="space-y-2">
                <Label>Payment Account</Label>
                <Select value={releaseData.payment_account_id} onValueChange={v => setReleaseData({...releaseData, payment_account_id: v})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select funding account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map(acc => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name} ({acc.account_type.replace('_', ' ')})
                      </SelectItem>
                    ))}
                    {accounts.length === 0 && <SelectItem value="none" disabled>No active accounts found</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Payment Rail</Label>
              <Select value={releaseData.payout_method} onValueChange={v => setReleaseData({...releaseData, payout_method: v})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select rail" />
                </SelectTrigger>
                <SelectContent>
                  {PAYOUT_METHODS.map((method) => (
                    <SelectItem key={method.value} value={method.value} disabled={!method.enabled}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {releaseData.payout_method === 'stripe_card' ? (
            <>
              <div className="pb-2">
                <StripePaymentForm
                  amount={remainingBalance}
                  invoiceId={invoice.id}
                  vendorName={invoice.vendor_name}
                  invoiceNumber={invoice.invoice_number}
                  metadata={{ payout_method: 'stripe_card' }}
                  buttonLabel={`Pay by Card $${remainingBalance.toFixed(2)}`}
                  onSuccess={handleCardReleaseSuccess}
                  onError={(err) => toast.error(err?.message || 'Card payment failed')}
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setIsReleasing(false)}>Cancel</Button>
              </DialogFooter>
            </>
          ) : (
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsReleasing(false)}>Cancel</Button>
              <Button onClick={handleRelease} disabled={releaseFundsMutation.isPending || !releaseData.payment_account_id || releaseData.payment_account_id === 'none'}>
                {releaseFundsMutation.isPending ? 'Releasing...' : 'Release Funds'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
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
            <div className="space-y-2">
              <Label>Payment Rail</Label>
              <Select value={scheduleData.payout_method} onValueChange={v => setScheduleData({...scheduleData, payout_method: v})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a rail" />
                </SelectTrigger>
                <SelectContent>
                  {PAYOUT_METHODS.map((method) => (
                    <SelectItem key={method.value} value={method.value} disabled={!method.enabled || method.schedulable === false}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  <SelectItem value="cheque">Paper Check Already Sent</SelectItem>
                  <SelectItem value="bank_transfer">ACH Already Sent Outside RestOps</SelectItem>
                  <SelectItem value="credit_card">Card Paid Outside RestOps</SelectItem>
                  <SelectItem value="cash">Cash / Other Manual Record</SelectItem>
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

