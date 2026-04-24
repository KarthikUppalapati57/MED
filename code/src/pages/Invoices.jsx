import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { format } from 'date-fns';
import {
  Search,
  Eye,
  Check,
  X,
  Download,
  MoreVertical,
  Upload,
  Trash2,
  Save
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";

import InvoiceUploader from '../components/invoices/InvoiceUploader';
import InvoiceEditor from '../components/invoices/InvoiceEditor';
import ValidationDialog from '../components/invoices/ValidationDialog';

const statusColors = {
  pending_review: 'bg-yellow-100 text-yellow-700',
  validated: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  paid: 'bg-emerald-100 text-emerald-700',
  flagged: 'bg-orange-100 text-orange-700',
  duplicate: 'bg-slate-100 text-slate-600',
};

export default function Invoices() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);

  const { userProfile } = useAuth();
  const queryClient = useQueryClient();

  // Resizing state
  const [sheetWidth, setSheetWidth] = useState(() => {
    const saved = localStorage.getItem('invoice_editor_width');
    return saved ? parseInt(saved, 10) : 800;
  });
  const [isResizing, setIsResizing] = useState(false);
  const sheetRef = useRef(null);

  const startResizing = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e) => {
    if (isResizing) {
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 400 && newWidth < window.innerWidth * 0.95) {
        setSheetWidth(newWidth);
        localStorage.setItem('invoice_editor_width', newWidth.toString());
      }
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
      // Change body cursor while resizing
      document.body.style.cursor = 'w-resize';
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      document.body.style.cursor = 'default';
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      document.body.style.cursor = 'default';
    };
  }, [isResizing, resize, stopResizing]);

  const { data: invoices = [], isLoading } = useAuthQuery({
    queryKey: ['invoices'],
    queryFn: () => api.entities.Invoice.list('-created_at'),
  });

  // Sanitize invoice data before saving to Supabase
  const sanitizeInvoiceData = (data) => {
    const cleaned = { ...data };
    
    // Auto-inject context fields for RLS if missing
    if (!cleaned.organization_id && userProfile?.organization_id) {
      cleaned.organization_id = userProfile.organization_id;
    }
    if (!cleaned.location_id && userProfile?.location_id) {
      cleaned.location_id = userProfile.location_id;
    }
    if (!cleaned.created_by && userProfile?.id) {
      cleaned.created_by = userProfile.id;
    }

    // Remove blob URLs (they won't persist across sessions)
    if (cleaned.file_url && cleaned.file_url.startsWith('blob:')) {
      delete cleaned.file_url;
    }
    
    // Remove extremely large texts that cause Supabase timeout errors
    delete cleaned.raw_text;
    
    // Convert empty date strings to null (PostgreSQL rejects "" for date columns)
    ['invoice_date', 'due_date', 'approved_date'].forEach(field => {
      if (cleaned[field] === '' || cleaned[field] === undefined) {
        cleaned[field] = null;
      }
    });

    // Remove fields that are not in the DB schema
    delete cleaned.id; // Don't send id on create, it's auto-generated
    // Ensure numeric fields are properly typed
    ['subtotal', 'tax_amount', 'fuel_surcharge', 'delivery_fee', 'other_charges', 'total_amount'].forEach(field => {
      if (cleaned[field] !== undefined && cleaned[field] !== null) {
        cleaned[field] = parseFloat(cleaned[field]) || 0;
      }
    });
    // Remove null/undefined vendor_id (it's a UUID column)
    if (!cleaned.vendor_id) delete cleaned.vendor_id;
    // Remove null/undefined approved_by (it's a UUID column) 
    if (!cleaned.approved_by) delete cleaned.approved_by;
    // Remove null/undefined organization_id and location_id (if still missing)
    if (!cleaned.organization_id) delete cleaned.organization_id;
    if (!cleaned.location_id) delete cleaned.location_id;
    if (!cleaned.created_by) delete cleaned.created_by;
    return cleaned;
  };

  const createMutation = useMutation({
    mutationFn: (data) => {
      const cleaned = sanitizeInvoiceData(data);
      delete cleaned.id; // Ensure no id on create
      return api.entities.Invoice.create(cleaned);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Invoice saved successfully');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => {
      const cleaned = sanitizeInvoiceData(data);
      delete cleaned.id; // Don't update id
      return api.entities.Invoice.update(id, cleaned);
    },
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
    try {
      let savedInvoice = validatedInvoice;
      if (editingInvoice.id) {
        savedInvoice = await updateMutation.mutateAsync({ id: editingInvoice.id, data: validatedInvoice });
      } else {
        savedInvoice = await createMutation.mutateAsync(validatedInvoice);
        // Important: Update local state with the new ID so we don't recreate it if sync fails
        setEditingInvoice(savedInvoice);
      }
      
      if (savedInvoice.status === 'approved') {
        await syncInvoiceToProductsAndInventory(savedInvoice);
        toast.success('Invoice approved & products/inventory updated');
      }
      
      setEditorOpen(false);
      setEditingInvoice(null);
    } catch (err) {
      console.error('Save validated invoice failed:', err);
      toast.error(`Failed to process invoice: ${err.message}`);
    }
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
      const vendorName = invoice.vendor_name || '';
      const itemProductId = item.product_id || '';

      // Upsert product
      const existingProduct = existingProducts.find(
        p => (itemProductId && p.product_id === `PRD-${itemProductId}`) || 
             (p.name?.toLowerCase() === name.toLowerCase())
      );

      let productId;
      if (existingProduct) {
        try {
          await api.entities.Product.update(existingProduct.id, {
            latest_price: unitPrice,
            vendor_name: vendorName,
            description: name,
            price_history: [
              ...(existingProduct.price_history || []),
              { price: unitPrice, date: new Date().toISOString(), vendor_id: invoice.vendor_id }
            ]
          });
        } catch (e) {
          console.warn('Could not update product (likely ground_staff RLS):', e);
        }
        productId = existingProduct.product_id;
      } else {
        const genProductId = itemProductId ? `PRD-${itemProductId}` : `PRD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const newProd = await api.entities.Product.create({
          name,
          description: name,
          product_id: genProductId,
          latest_price: unitPrice,
          report_by_unit: unit,
          base_unit: unit,
          is_inventoried: true,
          accounting_category: 'food',
          vendor_name: vendorName,
          organization_id: invoice.organization_id,
          location_id: invoice.location_id,
          price_history: [{ price: unitPrice, date: new Date().toISOString(), vendor_id: invoice.vendor_id }]
        });
        productId = newProd.product_id;
        existingProducts.push(newProd);
      }

      // Upsert inventory
      const existingInv = existingInventory.find(
        i => i.product_name?.toLowerCase() === name.toLowerCase()
      );

      if (existingInv) {
        const newQty = (existingInv.current_quantity || 0) + qty;
        try {
          await api.entities.Inventory.update(existingInv.id, {
            current_quantity: newQty,
            unit_cost: unitPrice,
            current_value: newQty * unitPrice,
          });
        } catch (e) {
          console.warn('Could not update inventory (likely ground_staff RLS):', e);
        }
      } else {
        await api.entities.Inventory.create({
          product_id: productId,
          product_name: name,
          current_quantity: qty,
          current_unit: unit,
          unit_cost: unitPrice,
          current_value: qty * unitPrice,
          accounting_category: 'food',
          par_level: 0,
          reorder_point: 0,
          previous_quantity: 0,
          previous_value: 0,
          location: invoice.location || '',
          organization_id: invoice.organization_id,
          location_id: invoice.location_id,
        });
        existingInventory.push({
          id: 'temp-' + Date.now(),
          product_name: name,
          current_quantity: qty,
          unit_cost: unitPrice,
          current_value: qty * unitPrice,
        });
      }
    }

    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
  };

  const handleApprove = async (invoice) => {
    try {
      await updateMutation.mutateAsync({ 
        id: invoice.id, 
        data: { status: 'approved' }
      });
      await syncInvoiceToProductsAndInventory(invoice);
      toast.success('Invoice approved & products/inventory updated');
    } catch (err) {
      console.error('Approve failed:', err);
      toast.error(`Failed to approve invoice: ${err.message}`);
    }
  };

  const handleReject = async (invoice) => {
    await updateMutation.mutateAsync({ 
      id: invoice.id, 
      data: { status: 'rejected' }
    });
  };

  const handleEditorSave = async () => {
    try {
      let savedInvoice;
      if (editingInvoice.id) {
        savedInvoice = await updateMutation.mutateAsync({ id: editingInvoice.id, data: editingInvoice });
      } else {
        savedInvoice = await createMutation.mutateAsync(editingInvoice);
        setEditingInvoice(savedInvoice);
      }
      toast.success('Invoice saved for later');
      setEditorOpen(false);
      setEditingInvoice(null);
    } catch (err) {
      console.error('Editor save failed:', err);
      toast.error(`Failed to save invoice: ${err.message}`);
    }
  };

  const handleEditorApprove = async () => {
    try {
      const data = { ...editingInvoice, status: 'approved' };
      let savedInvoice;
      if (editingInvoice.id) {
        savedInvoice = await updateMutation.mutateAsync({ id: editingInvoice.id, data });
      } else {
        savedInvoice = await createMutation.mutateAsync(data);
        setEditingInvoice(savedInvoice);
      }
      await syncInvoiceToProductsAndInventory(savedInvoice);
      toast.success('Invoice approved & products/inventory updated');
      setEditorOpen(false);
      setEditingInvoice(null);
    } catch (err) {
      console.error('Editor approve failed:', err);
      toast.error(`Failed to approve invoice: ${err.message}`);
    }
  };

  const handleEditorReject = async () => {
    try {
      const data = { ...editingInvoice, status: 'rejected' };
      if (editingInvoice.id) {
        await updateMutation.mutateAsync({ id: editingInvoice.id, data });
      } else {
        await createMutation.mutateAsync(data);
      }
      setEditorOpen(false);
      setEditingInvoice(null);
    } catch (err) {
      console.error('Editor reject failed:', err);
      toast.error(`Failed to reject invoice: ${err.message}`);
    }
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
                            <DropdownMenuItem onSelect={(e) => {
                              e.preventDefault();
                              setEditingInvoice(invoice);
                              setEditorOpen(true);
                            }}>
                              <Eye className="h-4 w-4 mr-2" /> View/Edit
                            </DropdownMenuItem>
                            {(invoice.status === 'validated' || invoice.status === 'pending_review') && (
                              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleApprove(invoice); }}>
                                <Check className="h-4 w-4 mr-2" /> Approve
                              </DropdownMenuItem>
                            )}
                            {(invoice.status === 'validated' || invoice.status === 'approved') && (
                              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleReject(invoice); }} className="text-red-600">
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
                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDelete(invoice); }} className="text-red-600">
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
        <SheetContent 
          className="p-0 sm:max-w-none overflow-hidden flex flex-col"
          style={{ width: `${sheetWidth}px`, maxWidth: '100vw' }}
        >
          {/* Resize Handle */}
          <div
            onMouseDown={startResizing}
            className={cn(
              "absolute left-0 top-0 w-1.5 h-full cursor-w-resize transition-colors hover:bg-teal-500/30 active:bg-teal-500/50 z-50 flex items-center justify-center",
              isResizing && "bg-teal-500/40"
            )}
          >
             <div className="w-0.5 h-12 bg-slate-300 rounded-full opacity-0 group-hover:opacity-100" />
          </div>

          <div className="p-6 overflow-y-auto flex-1 h-full">
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
                    onClick={handleEditorSave}
                    className="flex-1 border-blue-300 text-blue-700 hover:bg-blue-50"
                  >
                    <Save className="h-4 w-4 mr-1" /> Save
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
          </div>
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