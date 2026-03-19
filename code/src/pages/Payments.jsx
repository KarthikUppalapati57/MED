import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  stripe: 'bg-purple-100 text-purple-700',
  paypal: 'bg-blue-100 text-blue-700',
  bank_transfer: 'bg-green-100 text-green-700',
  cheque: 'bg-orange-100 text-orange-700',
  cash: 'bg-emerald-100 text-emerald-700',
  manual: 'bg-slate-100 text-slate-700',
};

const paymentStatusColors = {
  completed: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700',
  refunded: 'bg-purple-100 text-purple-700',
};

export default function Payments() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [activeTab, setActiveTab] = useState('invoices');

  const queryClient = useQueryClient();

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices-payments'],
    queryFn: () => api.entities.Invoice.list('-created_at'),
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: () => api.entities.Payment.list('-created_at'),
  });

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
  const approvedUnpaid = invoices.filter(i => i.status === 'approved' && i.payment_status !== 'paid');
  const totalDue = approvedUnpaid.reduce((sum, i) => sum + (i.total_amount || 0), 0);
  const totalPaid = payments.filter(p => p.status === 'completed').reduce((sum, p) => sum + (p.amount || 0), 0);
  const pendingPayments = payments.filter(p => p.status === 'pending').length;
  const overdue = approvedUnpaid.filter(i => i.due_date && new Date(i.due_date) < new Date()).length;

  const handlePayNow = (invoice) => {
    setSelectedInvoice(invoice);
    setPaymentDialogOpen(true);
  };

  const handleConfirmBankTransfer = async (payment) => {
    try {
      await confirmBankTransfer(payment.id);
      // Also update invoice to paid
      if (payment.invoice_id) {
        await updateInvoice.mutateAsync({
          id: payment.invoice_id,
          data: { payment_status: 'paid', status: 'paid' },
        });
      }
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast.success('Bank transfer confirmed!');
    } catch (err) {
      toast.error('Failed to confirm: ' + err.message);
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = !search ||
      inv.vendor_name?.toLowerCase().includes(search.toLowerCase()) ||
      inv.invoice_number?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || inv.payment_status === statusFilter || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredPayments = payments.filter(p => {
    const matchesSearch = !search ||
      p.vendor_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
      p.transaction_id?.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Payments</h1>
        <p className="text-slate-500 mt-1">Process and track invoice payments</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Due</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  ${totalDue.toLocaleString()}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-teal-100 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-teal-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Paid</p>
                <p className="text-2xl font-bold text-green-600 mt-1">
                  ${totalPaid.toLocaleString()}
                </p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Overdue</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{overdue}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-red-100 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Pending</p>
                <p className="text-2xl font-bold text-yellow-600 mt-1">{pendingPayments}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-yellow-100 flex items-center justify-center">
                <Clock className="h-6 w-6 text-yellow-600" />
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
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
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="invoices" className="gap-2">
            <DollarSign className="h-4 w-4" />
            Invoices
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" />
            Payment History
          </TabsTrigger>
        </TabsList>

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
                        <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : filteredInvoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                          No invoices found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredInvoices.map((invoice) => {
                        const dueDate = invoice.due_date ? new Date(invoice.due_date) : null;
                        const isOverdue = dueDate && dueDate < new Date() && invoice.payment_status !== 'paid';
                        const isDueSoon = dueDate && !isOverdue && dueDate <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) && invoice.payment_status !== 'paid';
                        const canPay = invoice.status === 'approved' && invoice.payment_status !== 'paid';

                        const invoiceStatusColors = {
                          approved: 'bg-green-100 text-green-700',
                          paid: 'bg-teal-100 text-teal-700',
                          rejected: 'bg-red-100 text-red-700',
                          pending_review: 'bg-orange-100 text-orange-700',
                          validated: 'bg-blue-100 text-blue-700',
                          flagged: 'bg-yellow-100 text-yellow-700',
                        };

                        return (
                          <TableRow key={invoice.id}>
                            <TableCell className="font-medium">{invoice.vendor_name}</TableCell>
                            <TableCell>{invoice.invoice_number}</TableCell>
                            <TableCell>
                              <span className={cn(
                                isOverdue && 'text-red-600 font-medium',
                                isDueSoon && 'text-orange-600 font-medium'
                              )}>
                                {dueDate ? format(dueDate, 'MMM d, yyyy') : '—'}
                              </span>
                            </TableCell>
                            <TableCell className="font-semibold">
                              ${invoice.total_amount?.toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge className={invoiceStatusColors[invoice.status] || 'bg-slate-100 text-slate-700'}>
                                {invoice.status?.replace(/_/g, ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {isOverdue ? (
                                <Badge className="bg-red-100 text-red-700">Overdue</Badge>
                              ) : invoice.payment_status === 'paid' ? (
                                <Badge className="bg-teal-100 text-teal-700">Paid</Badge>
                              ) : isDueSoon ? (
                                <Badge className="bg-orange-100 text-orange-700">Due Soon</Badge>
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
                                      className="bg-green-600 hover:bg-green-700 h-8 px-2"
                                    >
                                      <Check className="h-3 w-3 mr-1" /> Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleReject(invoice)}
                                      className="border-red-300 text-red-600 hover:bg-red-50 h-8 px-2"
                                    >
                                      <X className="h-3 w-3 mr-1" /> Reject
                                    </Button>
                                  </>
                                )}
                                {canPay && (
                                  <Button
                                    size="sm"
                                    onClick={() => handlePayNow(invoice)}
                                    className="bg-teal-600 hover:bg-teal-700 h-8 px-3"
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
                <History className="h-5 w-5 text-teal-600" />
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
                        <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : filteredPayments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                          No payments recorded yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPayments.map((p) => {
                        const MethodIcon = paymentMethodIcons[p.payment_method] || Banknote;
                        return (
                          <TableRow key={p.id}>
                            <TableCell>
                              {p.payment_date ? format(new Date(p.payment_date), 'MMM d, yyyy') : '—'}
                            </TableCell>
                            <TableCell className="font-medium">{p.vendor_name}</TableCell>
                            <TableCell>{p.invoice_number}</TableCell>
                            <TableCell>
                              <Badge className={paymentMethodColors[p.payment_method] || 'bg-slate-100 text-slate-700'}>
                                <MethodIcon className="h-3 w-3 mr-1" />
                                {p.payment_method?.replace(/_/g, ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-slate-500">
                              {p.transaction_id?.slice(0, 20)}...
                            </TableCell>
                            <TableCell className="font-semibold">
                              ${p.amount?.toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge className={paymentStatusColors[p.status] || 'bg-slate-100 text-slate-700'}>
                                {p.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {p.status === 'pending' && p.payment_method === 'bank_transfer' && (
                                <Button
                                  size="sm"
                                  onClick={() => handleConfirmBankTransfer(p)}
                                  className="bg-green-600 hover:bg-green-700 h-8 px-2"
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
            await updateInvoice.mutateAsync({
              id: selectedInvoice.id,
              data: { payment_status: 'paid', status: 'paid' },
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