import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { format } from 'date-fns';
import {
  Plus,
  Search,
  Filter,
  FileText,
  Eye,
  Check,
  X,
  Download,
  MoreVertical,
  Upload,
  Trash2
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";

import InvoiceUploader from '../components/invoices/InvoiceUploader';
import InvoiceEditor from '../components/invoices/InvoiceEditor';
import ValidationDialog from '../components/invoices/ValidationDialog';

const statusColors = {
  validated: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function Invoices() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);

  const queryClient = useQueryClient();

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.entities.Invoice.list('-created_at'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.entities.Invoice.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Invoice saved successfully');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.entities.Invoice.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Invoice updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.Invoice.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Invoice deleted');
    },
  });

  const handleDelete = (invoice) => {
    if (confirm(`Delete invoice ${invoice.invoice_number}? This cannot be undone.`)) {
      deleteMutation.mutate(invoice.id);
    }
  };

  const handleInvoiceExtracted = (data) => {
    console.log('Invoices Page received extraction data:', data);
    setEditingInvoice(data);
    setEditorOpen(true);
  };

  const handleAcceptInvoice = () => {
    setValidationOpen(true);
  };

  const handleSaveValidated = async (validatedInvoice) => {
    if (editingInvoice.id) {
      await updateMutation.mutateAsync({ id: editingInvoice.id, data: validatedInvoice });
    } else {
      await createMutation.mutateAsync(validatedInvoice);
    }
    if (validatedInvoice.status === 'approved') {
      await syncInvoiceToProductsAndInventory(validatedInvoice);
      toast.success('Invoice approved & products/inventory updated');
    }
    setEditorOpen(false);
    setEditingInvoice(null);
  };

  const syncInvoiceToProductsAndInventory = async (invoice) => {
    const items = invoice.line_items;
    if (!items || items.length === 0) {
      toast.warning('Invoice has no line items to sync');
      return;
    }

    const [existingProducts, existingInventory] = await Promise.all([
      api.entities.Product.list(),
      api.entities.Inventory.list(),
    ]);

    for (const item of items) {
      const name = (item.description || item.product_name || '').trim();
      if (!name) continue;
      const unitPrice = item.unit_price || 0;
      const unit = item.unit || 'ea';
      const qty = item.quantity || 0;

      // Upsert product
      const existingProduct = existingProducts.find(
        p => p.name?.toLowerCase() === name.toLowerCase()
      );

      let productId;
      if (existingProduct) {
        await api.entities.Product.update(existingProduct.id, {
          latest_price: unitPrice,
          price_history: [
            ...(existingProduct.price_history || []),
            { price: unitPrice, date: new Date().toISOString(), vendor_id: invoice.vendor_id }
          ]
        });
        productId = existingProduct.product_id;
      } else {
        const newProd = await api.entities.Product.create({
          name,
          product_id: `PRD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          latest_price: unitPrice,
          report_by_unit: unit,
          base_unit: unit,
          is_inventoried: true,
          accounting_category: 'food',
          price_history: [{ price: unitPrice, date: new Date().toISOString(), vendor_id: invoice.vendor_id }]
        });
        productId = newProd.product_id;
      }

      // Upsert inventory
      const existingInv = existingInventory.find(
        i => i.product_name?.toLowerCase() === name.toLowerCase()
      );

      if (existingInv) {
        const newQty = (existingInv.current_quantity || 0) + qty;
        await api.entities.Inventory.update(existingInv.id, {
          current_quantity: newQty,
          unit_cost: unitPrice,
          current_value: newQty * unitPrice,
        });
      } else {
        await api.entities.Inventory.create({
          product_id: productId,
          product_name: name,
          current_quantity: qty,
          current_unit: unit,
          unit_cost: unitPrice,
          current_value: qty * unitPrice,
          location: invoice.location || '',
        });
      }
    }

    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
  };

  const handleApprove = async (invoice) => {
    await updateMutation.mutateAsync({ 
      id: invoice.id, 
      data: { status: 'approved' }
    });
    await syncInvoiceToProductsAndInventory(invoice);
    toast.success('Invoice approved & products/inventory updated');
  };

  const handleReject = async (invoice) => {
    await updateMutation.mutateAsync({ 
      id: invoice.id, 
      data: { status: 'rejected' }
    });
  };

  const handleEditorApprove = async () => {
    const data = { ...editingInvoice, status: 'approved' };
    if (editingInvoice.id) {
      await updateMutation.mutateAsync({ id: editingInvoice.id, data });
    } else {
      await createMutation.mutateAsync(data);
    }
    await syncInvoiceToProductsAndInventory(editingInvoice);
    toast.success('Invoice approved & products/inventory updated');
    setEditorOpen(false);
    setEditingInvoice(null);
  };

  const handleEditorReject = async () => {
    const data = { ...editingInvoice, status: 'rejected' };
    if (editingInvoice.id) {
      await updateMutation.mutateAsync({ id: editingInvoice.id, data });
    } else {
      await createMutation.mutateAsync(data);
    }
    setEditorOpen(false);
    setEditingInvoice(null);
  };

  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = !search || 
      inv.vendor_name?.toLowerCase().includes(search.toLowerCase()) ||
      inv.invoice_number?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
          <p className="text-slate-500 mt-1">Manage and process vendor invoices</p>
        </div>
        <Button onClick={() => setUploadOpen(true)} className="bg-teal-600 hover:bg-teal-700">
          <Upload className="h-4 w-4 mr-2" />
          Upload Invoice
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Validated</p>
            <p className="text-2xl font-bold text-blue-700">
              {invoices.filter(i => i.status === 'validated').length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Approved</p>
            <p className="text-2xl font-bold text-green-700">
              {invoices.filter(i => i.status === 'approved').length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-slate-500">Total Approved</p>
            <p className="text-2xl font-bold text-slate-900">
              ${invoices.filter(i => i.status === 'approved').reduce((sum, i) => sum + (i.total_amount || 0), 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search invoices..."
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
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="validated">Validated</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
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
                  filteredInvoices.map((invoice) => (
                    <TableRow key={invoice.id} className="cursor-pointer hover:bg-slate-50">
                      <TableCell className="font-medium">{invoice.vendor_name}</TableCell>
                      <TableCell>{invoice.invoice_number}</TableCell>
                      <TableCell>
                        {invoice.invoice_date && format(new Date(invoice.invoice_date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        {invoice.due_date && format(new Date(invoice.due_date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="font-semibold">
                        ${invoice.total_amount?.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[invoice.status]}>
                          {invoice.status?.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              setEditingInvoice(invoice);
                              setEditorOpen(true);
                            }}>
                              <Eye className="h-4 w-4 mr-2" /> View/Edit
                            </DropdownMenuItem>
                            {invoice.status === 'validated' && (
                              <DropdownMenuItem onClick={() => handleApprove(invoice)}>
                                <Check className="h-4 w-4 mr-2" /> Approve
                              </DropdownMenuItem>
                            )}
                            {(invoice.status === 'validated' || invoice.status === 'approved') && (
                              <DropdownMenuItem onClick={() => handleReject(invoice)} className="text-red-600">
                                <X className="h-4 w-4 mr-2" /> Reject
                              </DropdownMenuItem>
                            )}
                            {invoice.file_url && (
                              <DropdownMenuItem asChild>
                                <a href={invoice.file_url} target="_blank" rel="noopener noreferrer">
                                  <Download className="h-4 w-4 mr-2" /> Download
                                </a>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleDelete(invoice)} className="text-red-600">
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <InvoiceUploader
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onInvoiceExtracted={handleInvoiceExtracted}
      />

      {/* Editor Sheet */}
      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {editingInvoice?.id ? 'Edit Invoice' : 'Review Invoice'}
            </SheetTitle>
          </SheetHeader>
          {editingInvoice && (
            <div className="mt-6">
              <InvoiceEditor
                invoice={editingInvoice}
                onChange={setEditingInvoice}
              />
              <div className="flex flex-wrap gap-3 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setEditorOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  onClick={handleEditorReject}
                  className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
                >
                  <X className="h-4 w-4 mr-1" /> Reject
                </Button>
                <Button
                  variant="outline"
                  onClick={handleEditorApprove}
                  className="flex-1 border-green-300 text-green-700 hover:bg-green-50"
                >
                  <Check className="h-4 w-4 mr-1" /> Approve
                </Button>
                <Button
                  onClick={handleAcceptInvoice}
                  className="flex-1 bg-teal-600 hover:bg-teal-700"
                >
                  Validate
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Validation Dialog */}
      <ValidationDialog
        open={validationOpen}
        onOpenChange={setValidationOpen}
        invoice={editingInvoice}
        onSave={handleSaveValidated}
        onCancel={() => setValidationOpen(false)}
      />
    </div>
  );
}