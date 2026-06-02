import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { api } from '@/lib/apiClient';
import { confirmBankTransfer } from '@/lib/paymentService';
import { format } from 'date-fns';
import {
  Search,
  CreditCard,
  Building2,
  Banknote,
  CheckSquare,
  DollarSign,
  Clock,
  AlertCircle,
  Check,
  X,
  History,
  Wallet,
  CheckCircle2,
  ArrowRightLeft,
  Settings,
  FileText,
  Mail,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import PaymentGatewayModal from '../components/payments/PaymentGatewayModal';

const paymentMethodIcons = {
  stripe: CreditCard,
  paypal: Wallet,
  bank_transfer: Building2,
  cheque: CheckSquare,
  cash: Banknote,
  manual: Banknote,
};

const paymentMethodColors = {
  stripe: 'bg-purple-500/50/10 text-purple-400',
  paypal: 'bg-resend-blue/10 text-resend-blue',
  bank_transfer: 'bg-resend-green/10 text-resend-green',
  cheque: 'bg-resend-orange/10 text-resend-orange',
  cash: 'bg-resend-green/10 text-resend-green',
  manual: 'bg-secondary text-foreground',
};

const paymentStatusColors = {
  completed: 'bg-resend-green/10 text-resend-green',
  pending: 'bg-resend-yellow/10 text-resend-yellow',
  failed: 'bg-resend-red/10 text-resend-red',
  refunded: 'bg-purple-500/50/10 text-purple-400',
};

const invoiceStatusColors = {
  approved: 'bg-resend-green/10 text-resend-green',
  paid: 'bg-primary/10 text-primary',
  rejected: 'bg-resend-red/10 text-resend-red',
  pending_review: 'bg-resend-orange/10 text-resend-orange',
  validated: 'bg-resend-blue/10 text-resend-blue',
  flagged: 'bg-resend-yellow/10 text-resend-yellow',
};

export default function Payments() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'invoices';
  const setActiveTab = (tab) => setSearchParams({ tab }, { replace: true });

  const queryClient = useQueryClient();

  const { data: invoices = [], isLoading: invoicesLoading } = useAuthQuery({
    queryKey: ['invoices-payments'],
    queryFn: () => api.entities.Invoice.list('-created_at'),
  });

  const { data: payments = [], isLoading: paymentsLoading } = useAuthQuery({
    queryKey: ['payments'],
    queryFn: () => api.entities.Payment.list('-created_at'),
  });

  const { data: orgPlans = [] } = useAuthQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data } = await supabase.from('plans').select('*').eq('is_active', true);
      return data || [];
    }
  });

  const [portalLoading, setPortalLoading] = useState(false);
  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-portal-session', {
        body: { returnUrl: window.location.href }
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to open billing portal. Please contact support.');
    } finally {
      setPortalLoading(false);
    }
  };

  useEffect(() => {
    const channel = supabase.channel('payments-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
        queryClient.invalidateQueries({ queryKey: ['payments'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => {
        queryClient.invalidateQueries({ queryKey: ['invoices-payments'] });
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const createPayment = useMutation({
    mutationFn: (data) => api.entities.Payment.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payments'] }),
  });

  const updateInvoice = useMutation({
    mutationFn: (params) => api.entities.Invoice.update(params.id, params.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoices-payments'] }),
  });

  const handleApprove = async (invoice) => {
    await updateInvoice.mutateAsync({ id: invoice.id, data: { status: 'approved' } });
    toast.success('Invoice approved');
  };

  const handleReject = async (invoice) => {
    await updateInvoice.mutateAsync({ id: invoice.id, data: { status: 'rejected' } });
    toast.success('Invoice rejected');
  };

  // Stats
  const { approvedUnpaid, totalDue, totalPaid, pendingPayments, overdue } = React.useMemo(() => {
    const appUnpaid = invoices.filter(i => i.status === 'approved' && !['paid', 'auto_pay'].includes(i.payment_status));
    const dueSum = appUnpaid.reduce((sum, i) => sum + (i.total_amount || 0), 0);
    const paidSum = payments.filter(p => p.status === 'completed').reduce((sum, p) => sum + (p.amount || 0), 0);
    const pending = payments.filter(p => p.status === 'pending').length;
    const now = new Date();
    const overdueCount = appUnpaid.filter(i => i.due_date && new Date(i.due_date) < now).length;
    return {
      approvedUnpaid: appUnpaid,
      totalDue: dueSum,
      totalPaid: paidSum,
      pendingPayments: pending,
      overdue: overdueCount,
    };
  }, [invoices, payments]);

  const handlePayNow = (invoice) => {
    setSelectedInvoice(invoice);
    setPaymentDialogOpen(true);
  };

  const handleConfirmBankTransfer = async (payment) => {
    try {
      await confirmBankTransfer(payment.id);
      // Also update invoice to paid
      if (payment.invoice_id) {
        let fileDestination = 'storage';
        if (payment.vendor_id) {
          try {
            const vendor = await api.entities.Vendor.get(payment.vendor_id);
            if (vendor && vendor.file_routing_preference) {
              fileDestination = vendor.file_routing_preference;
            }
          } catch (e) {
            console.warn('Failed to fetch vendor for file routing:', e);
          }
        }

        await updateInvoice.mutateAsync({
          id: payment.invoice_id,
          data: { payment_status: 'paid', status: 'paid', file_destination: fileDestination },
        });
      }
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast.success('Bank transfer confirmed!');
    } catch (err) {
      toast.error('Failed to confirm: ' + err.message);
    }
  };

  const filteredInvoices = React.useMemo(() => {
    const searchLower = search.toLowerCase();
    return invoices.filter(inv => {
      const matchesSearch = !search ||
        inv.vendor_name?.toLowerCase().includes(searchLower) ||
        inv.invoice_number?.toLowerCase().includes(searchLower);
      const matchesStatus = statusFilter === 'all' || inv.payment_status === statusFilter || inv.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [invoices, search, statusFilter]);

  const filteredPayments = React.useMemo(() => {
    const searchLower = search.toLowerCase();
    return payments.filter(p => {
      const matchesSearch = !search ||
        p.vendor_name?.toLowerCase().includes(searchLower) ||
        p.invoice_number?.toLowerCase().includes(searchLower) ||
        p.transaction_id?.toLowerCase().includes(searchLower);
      return matchesSearch;
    });
  }, [payments, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Payments</h1>
        <p className="text-muted-foreground mt-1">Process and track invoice payments</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Due</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  ${totalDue.toLocaleString()}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Paid</p>
                <p className="text-2xl font-bold text-resend-green mt-1">
                  ${totalPaid.toLocaleString()}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-resend-green/10 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-resend-green" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-resend-red mt-1">{overdue}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-resend-red/10 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-resend-red" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-resend-yellow mt-1">{pendingPayments}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-resend-yellow/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-resend-yellow" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by vendor, invoice, or transaction..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {activeTab === 'invoices' && (
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Invoices</SelectItem>
                  <SelectItem value="approved">Approved (Unpaid)</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="auto_pay">Auto-Pay</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="pending_review">Pending Review</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="border-b border-border">
          <TabsList className="h-auto p-0 bg-transparent gap-6 justify-start w-full overflow-x-auto">
            <TabsTrigger value="invoices" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 py-3">Vendor Invoices</TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 py-3">Payment History</TabsTrigger>
            <TabsTrigger value="reconciliation" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 py-3">Reconciliation</TabsTrigger>
            <TabsTrigger value="setup" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 py-3">Payment Setup</TabsTrigger>
            <TabsTrigger value="subscription" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 py-3">Platform Subscription</TabsTrigger>
          </TabsList>
        </div>


        {/* Invoices Tab */}
        <TabsContent value="invoices" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>All Invoices</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Invoice Status</TableHead>
                      <TableHead>Payment Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoicesLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : filteredInvoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No invoices found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredInvoices.map((invoice) => {
                        const dueDate = invoice.due_date ? new Date(invoice.due_date) : null;
                        const isOverdue = dueDate && dueDate < new Date() && !['paid', 'auto_pay'].includes(invoice.payment_status);
                        const isDueSoon = dueDate && !isOverdue && dueDate <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) && !['paid', 'auto_pay'].includes(invoice.payment_status);
                        const canPay = invoice.status === 'approved' && !['paid', 'auto_pay'].includes(invoice.payment_status);

                        return (
                          <TableRow key={invoice.id}>
                            <TableCell className="font-medium">{invoice.vendor_name}</TableCell>
                            <TableCell>{invoice.invoice_number}</TableCell>
                            <TableCell>
                              <span className={cn(
                                isOverdue && 'text-resend-red font-medium',
                                isDueSoon && 'text-resend-orange font-medium'
                              )}>
                                {dueDate ? format(dueDate, 'MMM d, yyyy') : 'â€”'}
                              </span>
                            </TableCell>
                            <TableCell className="font-semibold">
                              ${invoice.total_amount?.toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge className={invoiceStatusColors[invoice.status] || 'bg-secondary text-foreground'}>
                                {invoice.status?.replace(/_/g, ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {isOverdue ? (
                                <Badge className="bg-resend-red/10 text-resend-red">Overdue</Badge>
                              ) : invoice.payment_status === 'paid' ? (
                                <Badge className="bg-primary/10 text-primary">Paid</Badge>
                              ) : invoice.payment_status === 'auto_pay' ? (
                                <Badge className="bg-purple-500/50/10 text-purple-400 border-purple-200">Auto-Pay</Badge>
                              ) : isDueSoon ? (
                                <Badge className="bg-resend-orange/10 text-resend-orange">Due Soon</Badge>
                              ) : (
                                <Badge variant="secondary">{invoice.payment_status || 'Unpaid'}</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {(invoice.status === 'validated' || invoice.status === 'pending_review' || invoice.status === 'flagged') && (
                                  <>
                                    <Button
                                      size="sm"
                                      onClick={() => handleApprove(invoice)}
                                      className="bg-resend-green hover:bg-green-700 h-8 px-2"
                                    >
                                      <Check className="h-3 w-3 mr-1" /> Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleReject(invoice)}
                                      className="border-red-300 text-resend-red hover:bg-resend-red/5 h-8 px-2"
                                    >
                                      <X className="h-3 w-3 mr-1" /> Reject
                                    </Button>
                                  </>
                                )}
                                {canPay && (
                                  <Button
                                    size="sm"
                                    onClick={() => handlePayNow(invoice)}
                                    className="bg-primary hover:bg-primary h-8 px-3"
                                  >
                                    <CreditCard className="h-3 w-3 mr-1" /> Pay Now
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payment History Tab */}
        <TabsContent value="history" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                Payment History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Transaction ID</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentsLoading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : filteredPayments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No payments recorded yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPayments.map((p) => {
                        const MethodIcon = paymentMethodIcons[p.payment_method] || Banknote;
                        return (
                          <TableRow key={p.id}>
                            <TableCell>
                              {p.payment_date ? format(new Date(p.payment_date), 'MMM d, yyyy') : 'â€”'}
                            </TableCell>
                            <TableCell className="font-medium">{p.vendor_name}</TableCell>
                            <TableCell>{p.invoice_number}</TableCell>
                            <TableCell>
                              <Badge className={paymentMethodColors[p.payment_method] || 'bg-secondary text-foreground'}>
                                <MethodIcon className="h-3 w-3 mr-1" />
                                {p.payment_method?.replace(/_/g, ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {p.transaction_id?.slice(0, 20)}...
                            </TableCell>
                            <TableCell className="font-semibold">
                              ${p.amount?.toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge className={paymentStatusColors[p.status] || 'bg-secondary text-foreground'}>
                                {p.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {p.status === 'pending' && p.payment_method === 'bank_transfer' && (
                                <Button
                                  size="sm"
                                  onClick={() => handleConfirmBankTransfer(p)}
                                  className="bg-resend-green hover:bg-green-700 h-8 px-2"
                                >
                                  <ArrowRightLeft className="h-3 w-3 mr-1" /> Confirm
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reconciliation Tab */}
        <TabsContent value="reconciliation" className="mt-4">
          <div className="space-y-6">
            {/* Open Invoices for Reconciliation */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Open Invoices Awaiting Reconciliation
                </CardTitle>
                <p className="text-xs text-muted-foreground">Invoices that have been paid but not yet reconciled with bank statements</p>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Payment Method</TableHead>
                      <TableHead>Payment Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.filter(p => p.status === 'completed').length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No payments pending reconciliation
                        </TableCell>
                      </TableRow>
                    ) : (
                      payments.filter(p => p.status === 'completed').slice(0, 10).map(p => {
                        const MethodIcon = paymentMethodIcons[p.payment_method] || Banknote;
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.vendor_name}</TableCell>
                            <TableCell>{p.invoice_number}</TableCell>
                            <TableCell className="font-semibold">${p.amount?.toLocaleString()}</TableCell>
                            <TableCell>
                              <Badge className={paymentMethodColors[p.payment_method] || 'bg-secondary text-foreground'}>
                                <MethodIcon className="h-3 w-3 mr-1" />
                                {p.payment_method?.replace(/_/g, ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {p.payment_date ? format(new Date(p.payment_date), 'MMM d, yyyy') : 'â€”'}
                            </TableCell>
                            <TableCell>
                              <Badge className="bg-resend-green/10 text-resend-green">Paid</Badge>
                            </TableCell>
                            <TableCell>
                              <Button size="sm" variant="outline" className="h-7 text-xs">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Reconcile
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Email Tracked Invoices */}
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-resend-blue" />
                  Email Awaiting
                </CardTitle>
                <p className="text-xs text-muted-foreground">Invoices received via email that need to be matched and processed</p>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No email invoices pending</p>
                  <p className="text-sm text-muted-foreground mt-1">Email invoices will appear here when the email integration is configured</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Setup Tab */}
        <TabsContent value="setup" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="h-4 w-4" /> Payment Defaults
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-secondary rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Auto-Pay Approved Invoices</p>
                    <p className="text-sm text-muted-foreground">Automatically process payment for approved invoices</p>
                  </div>
                  <Switch />
                </div>
                <div className="p-4 bg-secondary rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Default Payment Method</p>
                    <p className="text-sm text-muted-foreground">Method used for automatic payments</p>
                  </div>
                  <Badge className="bg-purple-500/50/10 text-purple-400">
                    <CreditCard className="h-3 w-3 mr-1" /> Stripe
                  </Badge>
                </div>
                <div className="p-4 bg-secondary rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Payment Approval Threshold</p>
                    <p className="text-sm text-muted-foreground">Auto-pay limit without manual approval</p>
                  </div>
                  <Input className="w-28" type="number" step="100" defaultValue="1000" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Notifications
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-secondary rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Payment Confirmation Email</p>
                    <p className="text-sm text-muted-foreground">Send email when payment is processed</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="p-4 bg-secondary rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Overdue Invoice Alerts</p>
                    <p className="text-sm text-muted-foreground">Get notified when invoices become overdue</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="p-4 bg-secondary rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium">Weekly Payment Summary</p>
                    <p className="text-sm text-muted-foreground">Receive a weekly digest of all payment activity</p>
                  </div>
                  <Switch />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Subscription Tab */}
        <TabsContent value="subscription" className="mt-4">
          <Card className="border-0 shadow-sm max-w-2xl mx-auto overflow-hidden">
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 p-8 text-white relative">
              <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10 flex items-center gap-4">
                <div className="p-4 bg-card/10 backdrop-blur-md rounded-2xl border border-white/10">
                  <Sparkles className="w-8 h-8 text-teal-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Platform Subscription</h2>
                  <p className="text-muted-foreground mt-1">Manage your Restops workspace plan and billing</p>
                </div>
              </div>
            </div>
            <CardContent className="p-8">
              <div className="space-y-6">
                <div className="p-6 bg-secondary rounded-2xl border border-border flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="space-y-2 text-center md:text-left">
                    <h3 className="font-bold text-foreground text-lg">Billing Portal</h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      Update your payment methods, view past invoices, or change your subscription plan securely via Stripe.
                    </p>
                  </div>
                  <Button 
                    onClick={handleManageBilling} 
                    disabled={portalLoading}
                    className="bg-primary hover:bg-primary text-white min-w-[180px] h-12 rounded-xl shadow-lg shadow-teal-600/20"
                  >
                    {portalLoading ? (
                      <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading Portal...</>
                    ) : (
                      <>Manage Billing <ExternalLink className="w-5 h-5 ml-2" /></>
                    )}
                  </Button>
                </div>
                
                <div className="bg-primary/5 border border-teal-100 rounded-xl p-4 text-sm text-teal-800">
                  <p className="font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary" /> 
                    Secure Payment Processing
                  </p>
                  <p className="mt-1 text-primary/80">
                    We use Stripe to manage all platform billing. Your credit card details are never stored on our servers.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Payment Gateway Modal */}
      <PaymentGatewayModal
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        payment={selectedInvoice ? {
          invoice_id: selectedInvoice.id,
          vendor_id: selectedInvoice.vendor_id,
          vendor_name: selectedInvoice.vendor_name,
          invoice_number: selectedInvoice.invoice_number,
          amount: selectedInvoice.total_amount,
          due_date: selectedInvoice.due_date,
        } : null}
        onPaymentComplete={async (paymentData) => {
          await createPayment.mutateAsync({
            invoice_id: selectedInvoice.id,
            vendor_id: selectedInvoice.vendor_id,
            vendor_name: selectedInvoice.vendor_name,
            invoice_number: selectedInvoice.invoice_number,
            amount: selectedInvoice.total_amount,
            ...paymentData,
          });
          // Only mark as paid if payment is completed (not pending bank transfer)
          if (paymentData.status === 'completed') {
            let fileDestination = 'storage';
            if (selectedInvoice.vendor_id) {
              try {
                const vendor = await api.entities.Vendor.get(selectedInvoice.vendor_id);
                if (vendor && vendor.file_routing_preference) {
                  fileDestination = vendor.file_routing_preference;
                }
              } catch (e) {
                console.warn('Failed to fetch vendor for file routing:', e);
              }
            }

            await updateInvoice.mutateAsync({
              id: selectedInvoice.id,
              data: { payment_status: 'paid', status: 'paid', file_destination: fileDestination },
            });
          } else if (paymentData.status === 'pending') {
            await updateInvoice.mutateAsync({
              id: selectedInvoice.id,
              data: { payment_status: 'pending' },
            });
          }
          toast.success(
            paymentData.status === 'pending'
              ? 'Bank transfer recorded as pending'
              : 'Payment processed successfully'
          );
        }}
      />
    </div>
  );
}
