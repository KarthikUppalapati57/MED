import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
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
  X
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const paymentMethods = [
  { id: 'stripe', name: 'Stripe', icon: CreditCard, color: 'bg-purple-100 text-purple-600' },
  { id: 'paypal', name: 'PayPal', icon: DollarSign, color: 'bg-blue-100 text-blue-600' },
  { id: 'bank_transfer', name: 'Bank Transfer', icon: Building2, color: 'bg-green-100 text-green-600' },
  { id: 'cheque', name: 'Cheque', icon: CheckSquare, color: 'bg-orange-100 text-orange-600' },
  { id: 'manual', name: 'Manual Record', icon: Banknote, color: 'bg-slate-100 text-slate-600' },
];

export default function Payments() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [paymentDetails, setPaymentDetails] = useState({});
  const [processing, setProcessing] = useState(false);

  const queryClient = useQueryClient();

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices-payments'],
    queryFn: () => base44.entities.Invoice.list('-created_date'),
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['payments'],
    queryFn: () => base44.entities.Payment.list('-created_date'),
  });

  const createPayment = useMutation({
    mutationFn: (data) => base44.entities.Payment.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payments'] }),
  });

  const updateInvoice = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Invoice.update(id, data),
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

  // Stats based on approved unpaid invoices
  const approvedUnpaid = invoices.filter(i => i.status === 'approved' && i.payment_status !== 'paid');
  const totalDue = approvedUnpaid.reduce((sum, i) => sum + (i.total_amount || 0), 0);
  const overdue = approvedUnpaid.filter(i => i.due_date && new Date(i.due_date) < new Date()).length;
  const dueSoon = approvedUnpaid.filter(i => {
    if (!i.due_date) return false;
    const due = new Date(i.due_date);
    const now = new Date();
    return due >= now && due <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }).length;

  const handlePayNow = (invoice) => {
    setSelectedInvoice(invoice);
    setSelectedMethod(null);
    setPaymentDetails({});
    setPaymentDialogOpen(true);
  };

  const processPayment = async () => {
    if (!selectedMethod) {
      toast.error('Please select a payment method');
      return;
    }

    setProcessing(true);
    try {
      // Create payment record
      await createPayment.mutateAsync({
        invoice_id: selectedInvoice.id,
        vendor_id: selectedInvoice.vendor_id,
        vendor_name: selectedInvoice.vendor_name,
        invoice_number: selectedInvoice.invoice_number,
        amount: selectedInvoice.total_amount,
        payment_method: selectedMethod,
        status: 'completed',
        payment_date: new Date().toISOString().split('T')[0],
        transaction_id: `TXN-${Date.now()}`,
        ...paymentDetails,
      });

      // Update invoice status
      await updateInvoice.mutateAsync({
        id: selectedInvoice.id,
        data: { 
          payment_status: 'paid',
          status: 'paid'
        }
      });

      toast.success('Payment processed successfully');
      setPaymentDialogOpen(false);
    } catch (error) {
      toast.error('Payment failed');
    } finally {
      setProcessing(false);
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = !search || 
      inv.vendor_name?.toLowerCase().includes(search.toLowerCase()) ||
      inv.invoice_number?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || inv.payment_status === statusFilter || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Payments</h1>
        <p className="text-slate-500 mt-1">Process and track invoice payments</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Due</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">
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
                <p className="text-sm text-slate-500">Overdue</p>
                <p className="text-3xl font-bold text-red-600 mt-1">{overdue}</p>
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
                <p className="text-sm text-slate-500">Due in 7 days</p>
                <p className="text-3xl font-bold text-orange-600 mt-1">{dueSoon}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-orange-100 flex items-center justify-center">
                <Clock className="h-6 w-6 text-orange-600" />
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
                placeholder="Search by vendor or invoice number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
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
                <SelectItem value="flagged">Flagged</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Payments Table */}
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
                {isLoading ? (
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
                                className="bg-teal-600 hover:bg-teal-700 h-8 px-2"
                              >
                                Pay Now
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

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Process Payment</DialogTitle>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-6">
              {/* Invoice Summary */}
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="flex justify-between mb-2">
                  <span className="text-slate-500">Vendor</span>
                  <span className="font-medium">{selectedInvoice.vendor_name}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-slate-500">Invoice #</span>
                  <span className="font-medium">{selectedInvoice.invoice_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Amount</span>
                  <span className="font-bold text-lg">${selectedInvoice.total_amount?.toLocaleString()}</span>
                </div>
              </div>

              {/* Payment Methods */}
              <div className="space-y-3">
                <Label>Select Payment Method</Label>
                <div className="grid grid-cols-2 gap-3">
                  {paymentMethods.map((method) => (
                    <button
                      key={method.id}
                      onClick={() => setSelectedMethod(method.id)}
                      className={cn(
                        "flex items-center gap-3 p-4 rounded-lg border-2 transition-all",
                        selectedMethod === method.id
                          ? "border-teal-500 bg-teal-50"
                          : "border-slate-200 hover:border-slate-300"
                      )}
                    >
                      <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", method.color)}>
                        <method.icon className="h-5 w-5" />
                      </div>
                      <span className="font-medium">{method.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Additional Fields based on method */}
              {selectedMethod === 'cheque' && (
                <div className="space-y-3">
                  <Label>Cheque Number</Label>
                  <Input
                    value={paymentDetails.cheque_number || ''}
                    onChange={(e) => setPaymentDetails({ ...paymentDetails, cheque_number: e.target.value })}
                    placeholder="Enter cheque number"
                  />
                </div>
              )}

              {selectedMethod === 'bank_transfer' && (
                <div className="space-y-3">
                  <Label>Bank Reference</Label>
                  <Input
                    value={paymentDetails.bank_reference || ''}
                    onChange={(e) => setPaymentDetails({ ...paymentDetails, bank_reference: e.target.value })}
                    placeholder="Enter bank reference"
                  />
                </div>
              )}

              {selectedMethod === 'manual' && (
                <div className="space-y-3">
                  <Label>Notes</Label>
                  <Textarea
                    value={paymentDetails.notes || ''}
                    onChange={(e) => setPaymentDetails({ ...paymentDetails, notes: e.target.value })}
                    placeholder="Enter payment notes"
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={processPayment}
              disabled={!selectedMethod || processing}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {processing ? 'Processing...' : 'Confirm Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}