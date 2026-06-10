import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { filterByContext } from '@/lib/contextUtils';
import { supabase } from '@/lib/supabaseClient';
import { notifyManagers } from '@/lib/notificationService';
import { sendInvoiceUploadNotification, sendInvoiceStatusEmail } from '@/lib/emailService';
import posthog from '@/lib/posthog';
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
  Save,
  Mail
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
import EmailIngestionDialog from '../components/invoices/EmailIngestionDialog';

const statusColors = {
  pending_review: 'bg-resend-yellow/10 text-resend-yellow',
  validated: 'bg-resend-blue/10 text-resend-blue',
  approved: 'bg-resend-green/10 text-resend-green',
  rejected: 'bg-resend-red/10 text-resend-red',
  paid: 'bg-resend-green/10 text-resend-green',
  flagged: 'bg-resend-orange/10 text-resend-orange',
  duplicate: 'bg-secondary text-muted-foreground',
};

export default function Invoices() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [emailConfigOpen, setEmailConfigOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);

  const { userProfile, role, organization, brand, location } = useAuth();
  const queryClient = useQueryClient();
  const isHigherRole = ['org_owner', 'branch_manager', 'location_manager', 'platform_admin'].includes(role);

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

  const { data: invoices = [], isLoading: loadingInvoices } = useAuthQuery({
    queryKey: ['invoices-dashboard', organization?.id],
    queryFn: () => api.entities.Invoice.list('-created_at'),
    select: React.useCallback((data) => filterByContext(data, { organization, brand, location }), [organization, brand, location]),
    enabled: !!(organization?.id),
  });

  useEffect(() => {
    const channel = supabase.channel('invoices-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => {
        queryClient.invalidateQueries({ queryKey: ['invoices-dashboard', organization?.id] });
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Sanitize invoice data before saving to Supabase
  const sanitizeInvoiceData = (invoiceData) => {
    const cleaned = {
      ...invoiceData,
      status: 'pending',
      line_items: JSON.stringify(invoiceData.line_items || []),
      validation_results: JSON.stringify({}),
      organization_id: organization?.id || userProfile?.organization_id,
    };

    // Assign to active Location context if available, fallback to userProfile location
    if (!cleaned.location_id && location?.id) {
      cleaned.location_id = location.id;
    } else if (!cleaned.location_id && userProfile?.location_id) {
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
    mutationFn: async (data) => {
      const lineItems = data.line_items || [];
      const cleaned = sanitizeInvoiceData(data);
      delete cleaned.id; // Ensure no id on create
      
      const invoice = await api.entities.Invoice.create(cleaned);
      
      if (lineItems.length > 0) {
        await Promise.all(lineItems.map(item => 
          api.entities.InvoiceLineItem.create({
            invoice_id: invoice.id,
            organization_id: invoice.organization_id,
            inventory_item_id: item.product_id || null,
            item_name: item.description || 'Unknown Item',
            quantity: item.quantity || 1,
            unit_price: item.unit_price || 0,
            total_price: item.extended_price || 0
          })
        ));
      }
      return { ...invoice, line_items: lineItems };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Invoice saved successfully');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const lineItems = data.line_items || [];
      const cleaned = sanitizeInvoiceData(data);
      delete cleaned.id; // Don't update id
      
      const invoice = await api.entities.Invoice.update(id, cleaned);
      
      // Delete old line items and insert new ones to keep them synced
      const oldItems = await api.entities.InvoiceLineItem.filter({ invoice_id: id });
      if (oldItems && oldItems.length > 0) {
        await Promise.all(oldItems.map(item => api.entities.InvoiceLineItem.delete(item.id)));
      }
      
      if (lineItems.length > 0) {
        await Promise.all(lineItems.map(item => 
          api.entities.InvoiceLineItem.create({
            invoice_id: invoice.id,
            organization_id: invoice.organization_id,
            inventory_item_id: item.product_id || null,
            item_name: item.description || 'Unknown Item',
            quantity: item.quantity || 1,
            unit_price: item.unit_price || 0,
            total_price: item.extended_price || 0
          })
        ));
      }
      return { ...invoice, line_items: lineItems };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Invoice updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.Invoice.delete(id),
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ['invoices'] });
      const previousData = queryClient.getQueryData(['invoices']);
      queryClient.setQueryData(['invoices'], (old) => 
        old ? old.filter(item => item.id !== deletedId) : []
      );
      return { previousData };
    },
    onError: (err, deletedId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['invoices'], context.previousData);
      }
      toast.error('Failed to delete');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onSuccess: () => {
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
        posthog.capture('invoice_processed', { invoiceId: savedInvoice.id, status: 'approved' });
        toast.success('Invoice approved & products/inventory updated');
      } else {
        posthog.capture('invoice_uploaded', { invoiceId: savedInvoice.id });
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

    // O(1) Precomputed Lookups
    const productByProductIdMap = new Map();
    const productByNameMap = new Map();
    existingProducts.forEach(p => {
      if (p.product_id) {
        productByProductIdMap.set(p.product_id, p);
      }
      if (p.name) {
        productByNameMap.set(p.name.toLowerCase(), p);
      }
    });

    const inventoryByNameMap = new Map();
    existingInventory.forEach(i => {
      if (i.product_name) {
        inventoryByNameMap.set(i.product_name.toLowerCase(), i);
      }
    });

    // Aggregate line items by product name to sum quantities and prevent race conditions/duplicate creations
    const aggregatedItems = [];
    const aggregatedByName = new Map();
    for (const item of items) {
      const name = (item.description || item.product_name || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (aggregatedByName.has(key)) {
        const existing = aggregatedByName.get(key);
        existing.quantity = (existing.quantity || 0) + (item.quantity || 0);
        existing.unit_price = item.unit_price || existing.unit_price || 0;
      } else {
        const itemCopy = { ...item, description: name };
        aggregatedByName.set(key, itemCopy);
        aggregatedItems.push(itemCopy);
      }
    }

    const pendingUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const vendorName = invoice.vendor_name || '';

    // Parallelize operations safely using Promise.allSettled
    const syncOperations = aggregatedItems.map(async (item) => {
      const name = item.description;
      const unitPrice = item.unit_price || 0;
      const unit = item.unit || 'ea';
      const qty = item.quantity || 0;
      const itemProductId = item.product_id || '';

      // O(1) Product Lookup
      let existingProduct = itemProductId ? productByProductIdMap.get(`PRD-${itemProductId}`) : null;
      if (!existingProduct) {
        existingProduct = productByNameMap.get(name.toLowerCase());
      }

      let productId;
      if (existingProduct) {
        productId = existingProduct.product_id;
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
      } else {
        productId = itemProductId ? `PRD-${itemProductId}` : `PRD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        try {
          const newProd = await api.entities.Product.create({
            name,
            description: name,
            product_id: productId,
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
          productByNameMap.set(name.toLowerCase(), newProd);
          productByProductIdMap.set(productId, newProd);
        } catch (e) {
          console.warn('Could not create product:', e);
        }
      }

      // O(1) Inventory Lookup
      const existingInv = inventoryByNameMap.get(name.toLowerCase());
      if (existingInv) {
        const newQty = (existingInv.current_quantity || 0) + qty;
        try {
          await api.entities.Inventory.update(existingInv.id, {
            current_quantity: newQty,
            unit_cost: unitPrice,
            current_value: newQty * unitPrice,
            pending_until: pendingUntil,
            pending_source_invoice: invoice.invoice_number || invoice.id,
          });
        } catch (e) {
          console.warn('Could not update inventory (likely ground_staff RLS):', e);
        }
      } else {
        try {
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
            pending_until: pendingUntil,
            pending_source_invoice: invoice.invoice_number || invoice.id,
          });
        } catch (e) {
          console.warn('Could not create inventory:', e);
        }
      }
    });

    await Promise.allSettled(syncOperations);

    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
  };

  const handleApprove = async (invoice) => {
    try {
      await updateMutation.mutateAsync({ 
        id: invoice.id, 
        data: { status: 'approved', line_items: invoice.line_items }
      });
      await syncInvoiceToProductsAndInventory(invoice);
      
      // Generate a LedgerBill to satisfy double-entry accounting
      try {
        await api.entities.LedgerBill.create({
          organization_id: invoice.organization_id,
          vendor_id: invoice.vendor_id || null,
          invoice_id: invoice.id,
          subtotal: invoice.subtotal || 0,
          tax: invoice.tax_amount || 0,
          total: invoice.total_amount || 0,
          due_date: invoice.due_date,
          status: 'pending' // pending payment
        });
      } catch (billErr) {
        console.warn('Could not create LedgerBill:', billErr);
      }
      
      posthog.capture('invoice_processed', { invoiceId: invoice.id, status: 'approved' });
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
    posthog.capture('invoice_failed', { invoiceId: invoice.id, reason: 'rejected' });
  };

  const handleEditorSave = async () => {
    try {
      // Ground staff: force status to pending_review so RLS allows the operation
      const invoiceData = { ...editingInvoice };
      if (role === 'ground_staff') {
        invoiceData.status = 'pending_review';
      }

      let savedInvoice;
      if (invoiceData.id) {
        savedInvoice = await updateMutation.mutateAsync({ id: invoiceData.id, data: invoiceData });
      } else {
        savedInvoice = await createMutation.mutateAsync(invoiceData);
        setEditingInvoice(savedInvoice);
      }
      posthog.capture('invoice_uploaded', { invoiceId: savedInvoice.id });
      toast.success('Invoice saved for later');

      // â”€â”€ Notify managers (in-app + email) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const orgId = savedInvoice?.organization_id || userProfile?.organization_id;
      const uploaderName = userProfile?.full_name || userProfile?.email || 'A team member';
      const invNum = savedInvoice?.invoice_number || 'New Invoice';
      const vendorName = savedInvoice?.vendor_name || 'Unknown Vendor';
      const totalAmt = savedInvoice?.total_amount || 0;

      // 1. In-app notifications (realtime via Layout.jsx bell icon)
      notifyManagers({
        organization_id: orgId,
        title: `New Invoice: ${invNum}`,
        message: `${uploaderName} uploaded invoice ${invNum} from ${vendorName} ($${Number(totalAmt).toFixed(2)}). Please review.`,
        type: 'invoice',
        metadata: { invoice_id: savedInvoice?.id, invoice_number: invNum },
        exclude_user_id: userProfile?.id,
      }).then(({ managers }) => {
        // 2. Email notifications to each manager
        if (managers && managers.length > 0) {
          managers.forEach(mgr => {
            sendInvoiceUploadNotification({
              to_email: mgr.email,
              to_name: mgr.full_name,
              uploader_name: uploaderName,
              invoice_number: invNum,
              vendor_name: vendorName,
              total_amount: totalAmt,
            }).catch(e => console.warn('Email to manager failed:', e));
          });
        }
      }).catch(e => console.warn('Manager notification failed (non-fatal):', e));

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
      posthog.capture('invoice_processed', { invoiceId: savedInvoice.id, status: 'approved' });
      toast.success('Invoice approved â€” items staged for 24h review before finalizing in inventory');

      // Email the original uploader that their invoice was approved
      if (savedInvoice?.created_by) {
        try {
          const { data: uploaderProfile } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', savedInvoice.created_by)
            .single();
          if (uploaderProfile?.email) {
            sendInvoiceStatusEmail({
              to_email: uploaderProfile.email,
              to_name: uploaderProfile.full_name,
              invoice_number: savedInvoice.invoice_number,
              status: 'approved',
              reviewer_name: userProfile?.full_name || 'Manager',
            }).catch(e => console.warn('Approval email failed:', e));
          }
        } catch { /* non-critical */ }
      }

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
      let savedInvoice;
      if (editingInvoice.id) {
        savedInvoice = await updateMutation.mutateAsync({ id: editingInvoice.id, data });
      } else {
        savedInvoice = await createMutation.mutateAsync(data);
      }
      posthog.capture('invoice_failed', { invoiceId: savedInvoice.id, reason: 'rejected' });

      // Email the original uploader that their invoice was rejected
      const createdBy = savedInvoice?.created_by || editingInvoice?.created_by;
      if (createdBy) {
        try {
          const { data: uploaderProfile } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', createdBy)
            .single();
          if (uploaderProfile?.email) {
            sendInvoiceStatusEmail({
              to_email: uploaderProfile.email,
              to_name: uploaderProfile.full_name,
              invoice_number: savedInvoice?.invoice_number || editingInvoice?.invoice_number,
              status: 'rejected',
              reviewer_name: userProfile?.full_name || 'Manager',
            }).catch(e => console.warn('Rejection email failed:', e));
          }
        } catch { /* non-critical */ }
      }

      setEditorOpen(false);
      setEditingInvoice(null);
    } catch (err) {
      console.error('Editor reject failed:', err);
      toast.error(`Failed to reject invoice: ${err.message}`);
    }
  };

  const filteredInvoices = React.useMemo(() => {
    return invoices.filter(inv => {
      const matchesSearch = !search || 
        inv.vendor_name?.toLowerCase().includes(search.toLowerCase()) ||
        inv.invoice_number?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [invoices, search, statusFilter]);

  const stats = React.useMemo(() => {
    let validatedCount = 0;
    let approvedCount = 0;
    let totalApprovedAmount = 0;
    for (const inv of invoices) {
      if (inv.status === 'validated') {
        validatedCount++;
      } else if (inv.status === 'approved') {
        approvedCount++;
        totalApprovedAmount += (inv.total_amount || 0);
      }
    }
    return { validatedCount, approvedCount, totalApprovedAmount };
  }, [invoices]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
          <p className="text-muted-foreground mt-1">Manage and process vendor invoices</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEmailConfigOpen(true)}>
            <Mail className="h-4 w-4 mr-2 text-brand" />
            Email Settings
          </Button>
          <Button onClick={() => setUploadOpen(true)} className="bg-primary hover:bg-primary">
            <Upload className="h-4 w-4 mr-2" />
            Upload Invoice
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Validated</p>
            <p className="text-2xl font-bold text-resend-blue">
              {stats.validatedCount}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Approved</p>
            <p className="text-2xl font-bold text-resend-green">
              {stats.approvedCount}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Approved</p>
            <p className="text-2xl font-bold text-foreground">
              ${stats.totalApprovedAmount.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
                  <TableHead>Destination</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No invoices found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map((invoice) => (
                    <TableRow key={invoice.id} className="cursor-pointer hover:bg-secondary">
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
                        <Badge variant="outline" className={invoice.file_destination === 'payments' ? 'border-purple-200 text-purple-600 bg-purple-50' : 'border-slate-200 text-slate-600 bg-slate-50'}>
                          {invoice.file_destination === 'payments' ? 'Payments' : 'Storage'}
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
                            {isHigherRole && (invoice.status === 'validated' || invoice.status === 'pending_review') && (
                              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleApprove(invoice); }}>
                                <Check className="h-4 w-4 mr-2" /> Approve
                              </DropdownMenuItem>
                            )}
                            {isHigherRole && (invoice.status === 'validated' || invoice.status === 'approved') && (
                              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleReject(invoice); }} className="text-resend-red">
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
                            {isHigherRole && (
                              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleDelete(invoice); }} className="text-resend-red">
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            )}
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
              "absolute left-0 top-0 w-1.5 h-full cursor-w-resize transition-colors hover:bg-primary/30 active:bg-primary/50 z-50 flex items-center justify-center",
              isResizing && "bg-primary/40"
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
                    className="flex-1 border-blue-300 text-resend-blue hover:bg-resend-blue/5"
                  >
                    <Save className="h-4 w-4 mr-1" /> Save
                  </Button>
                  {userProfile?.role !== 'ground_staff' && (
                    <>
                      <Button
                    variant="outline"
                    onClick={handleEditorReject}
                    className="flex-1 border-red-300 text-resend-red hover:bg-resend-red/5"
                  >
                    <X className="h-4 w-4 mr-1" /> Reject
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleEditorApprove}
                    className="flex-1 border-green-300 text-resend-green hover:bg-resend-green/5"
                  >
                    <Check className="h-4 w-4 mr-1" /> Approve
                  </Button>
                  <Button
                    onClick={handleAcceptInvoice}
                    className="flex-1 bg-primary hover:bg-primary"
                  >
                    Validate
                  </Button>
                    </>
                  )}
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

      {/* Email Ingestion Dialog */}
      <EmailIngestionDialog 
        open={emailConfigOpen} 
        onClose={() => setEmailConfigOpen(false)} 
      />
    </div>
  );
}
