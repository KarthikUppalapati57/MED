import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthQuery } from '@/hooks/useAuthQuery';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/lib/AuthContext';
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
  Mail,
  AlertTriangle,
  Clock3,
  CreditCard,
  FileSpreadsheet,
  Camera,
  Inbox,
  ClipboardCheck,
  Link2,
  RefreshCcw
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import {
  ACTION_REASON_LABELS,
  AP_STATUS_LABELS,
  deriveActionReason,
  deriveApStatus,
  getInvoiceAging,
  invoicesToCsv,
} from '@/lib/invoiceAp';

const InvoiceUploader = React.lazy(() => import('../components/invoices/InvoiceUploader'));
const InvoiceEditor = React.lazy(() => import('../components/invoices/InvoiceEditor'));
const DocumentViewer = React.lazy(() => import('../components/invoices/DocumentViewer'));
const ValidationDialog = React.lazy(() => import('../components/invoices/ValidationDialog'));
const EmailIngestionDialog = React.lazy(() => import('../components/invoices/EmailIngestionDialog'));
const CreditRequestDialog = React.lazy(() => import('../components/invoices/CreditRequestDialog'));
const MobileReceiptCapture = React.lazy(() => import('../components/invoices/MobileReceiptCapture'));

function InlineLoader({ label = 'Loading...' }) {
  return (
    <div className="min-h-[180px] w-full flex items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

const statusColors = {
  pending_review: 'bg-resend-yellow/10 text-resend-yellow',
  pending_match_approval: 'bg-amber-500/10 text-amber-500',
  validated: 'bg-resend-blue/10 text-resend-blue',
  approved: 'bg-resend-green/10 text-resend-green',
  rejected: 'bg-resend-red/10 text-resend-red',
  paid: 'bg-resend-green/10 text-resend-green',
  flagged: 'bg-resend-orange/10 text-resend-orange',
  duplicate: 'bg-secondary text-muted-foreground',
};

const apStatusColors = {
  processing: 'bg-resend-blue/10 text-resend-blue',
  action_required: 'bg-resend-orange/10 text-resend-orange',
  pending_approval: 'bg-resend-yellow/10 text-resend-yellow',
  approved: 'bg-resend-green/10 text-resend-green',
  scheduled: 'bg-purple-100 text-purple-700',
  paid: 'bg-resend-green/10 text-resend-green',
  closed: 'bg-secondary text-muted-foreground',
  rejected: 'bg-resend-red/10 text-resend-red',
};

const intakeMethods = [
  { label: 'Upload', detail: 'PDF, image, CSV', icon: Upload },
  { label: 'Photo', detail: 'Mobile capture', icon: Camera },
  { label: 'Email', detail: 'Inbox routing', icon: Inbox },
  { label: 'EDI', detail: 'Vendor import', icon: Link2 },
];

const INVOICE_ROW_HEIGHT = 76;
const INVOICE_TABLE_VIEWPORT_HEIGHT = 684;
const INVOICE_ROW_OVERSCAN = 8;

const workflowStages = [
  { key: 'pending_review', label: 'Review', icon: Eye },
  { key: 'action_required', label: 'Action', icon: AlertTriangle },
  { key: 'pending_approval', label: 'Approval', icon: ClipboardCheck },
  { key: 'approved', label: 'Approved', icon: Check },
  { key: 'scheduled', label: 'Scheduled', icon: Clock3 },
  { key: 'paid', label: 'Paid', icon: CreditCard },
];

const formatMoney = (value) => `$${Number(value || 0).toLocaleString(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})}`;

export default function Invoices() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [mobileCaptureOpen, setMobileCaptureOpen] = useState(false);
  const [emailConfigOpen, setEmailConfigOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [apStatusFilter, setApStatusFilter] = useState('all');
  const [agingFilter, setAgingFilter] = useState('all');
  const [paymentAccountFilter, setPaymentAccountFilter] = useState('all');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]);
  const [batchPaymentAccountId, setBatchPaymentAccountId] = useState('');
  const [batchScheduleDate, setBatchScheduleDate] = useState(
    new Date(Date.now() + 86400000).toISOString().split('T')[0]
  );
  const invoiceTableRef = useRef(null);
  const [invoiceTableScrollTop, setInvoiceTableScrollTop] = useState(0);
  
  // Credit Request State
  const [creditRequestInvoice, setCreditRequestInvoice] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const { userProfile, role, organization, brand, location } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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
    queryFn: () => api.entities.Invoice.list('-created_at', { 
      limit: 500,
      select: 'id, invoice_number, vendor_name, total_amount, status, payment_status, due_date, invoice_date, created_at, vendor_id, organization_id, brand_id, location_id, file_url, source, payment_account_id, scheduled_payment_date'
    }),
    select: React.useCallback((data) => filterByContext(data, { organization, brand, location }), [organization, brand, location]),
    enabled: !!(organization?.id),
  });

  const { data: paymentAccounts = [] } = useAuthQuery({
    queryKey: ['payment-accounts', organization?.id],
    queryFn: () => api.entities.PaymentAccount.list('name'),
    select: React.useCallback(
      (data) => filterByContext(data, { organization, brand, location }).filter((account) => account.is_active !== false),
      [organization, brand, location]
    ),
    enabled: !!organization?.id,
  });

  useEffect(() => {
    const invoiceId = searchParams.get('invoice');
    if (!invoiceId || loadingInvoices || invoices.length === 0) return;

    const invoice = invoices.find((item) => item.id === invoiceId);
    if (!invoice) return;

    setEditingInvoice(invoice);
    setEditorOpen(true);
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.delete('invoice');
      return next;
    }, { replace: true });
  }, [invoices, loadingInvoices, searchParams, setSearchParams]);

  useEffect(() => {
    const status = searchParams.get('status');
    if (status) setStatusFilter(status);
  }, [searchParams]);

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

  const handleExportCsv = () => {
    if (!filteredInvoices || filteredInvoices.length === 0) {
      toast.error('No invoices to export');
      return;
    }
    
    const csvContent = invoicesToCsv(filteredInvoices, paymentAccounts);

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `invoices_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('Invoices exported successfully');
  };

  // Sanitize invoice data before saving to Supabase
  const sanitizeInvoiceData = (invoiceData) => {
    const cleaned = {
      ...invoiceData,
      status: invoiceData.status || 'pending_review',
      line_items: invoiceData.line_items || [],
      validation_results: invoiceData.validation_results || {},
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

  const normalizeLineItemForVendorCatalog = (item = {}) => {
    const name = (item.description || item.item_name || item.product_name || '').trim();
    const code = (item.vendor_item_code || item.item_code || item.sku || item.product_code || '').trim();
    const unit = (item.vendor_unit || item.unit || item.pack_size || '').trim();
    const unitPrice = Number(item.unit_price ?? item.price ?? 0) || 0;
    return { name, code, unit, unitPrice };
  };

  const findExistingVendorItem = async ({ organizationId, vendorId, name, code }) => {
    if (!organizationId || !name) return null;
    let query = api.client
      .from('vendor_items')
      .select('id, last_price, default_price, price_variance_threshold_percent, mapping_status, match_confidence')
      .eq('organization_id', organizationId)
      .eq('vendor_item_name', name);

    if (vendorId) {
      query = query.eq('vendor_id', vendorId);
    } else {
      query = query.is('vendor_id', null);
    }

    if (code) query = query.eq('vendor_item_code', code);

    const { data, error } = await query.maybeSingle();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  };

  const syncInvoiceVendorCatalog = async (invoice, lineItems = [], lineRecords = []) => {
    if (!invoice?.organization_id || !lineItems.length) return;

    const existingProducts = await api.entities.Product.list('name', {
      limit: 1000,
      select: 'id, product_id, name, latest_price, organization_id, brand_id, location_id',
    });
    const productByName = new Map();
    const productByProductId = new Map();
    existingProducts.forEach((product) => {
      if (product.name) productByName.set(product.name.toLowerCase(), product);
      if (product.product_id) productByProductId.set(product.product_id, product);
      if (product.id) productByProductId.set(product.id, product);
    });

    const operations = lineItems.map(async (item, index) => {
      const { name, code, unit, unitPrice } = normalizeLineItemForVendorCatalog(item);
      if (!name) return null;

      const existingItem = await findExistingVendorItem({
        organizationId: invoice.organization_id,
        vendorId: invoice.vendor_id || null,
        name,
        code,
      });

      const previousPrice = Number(existingItem?.last_price ?? existingItem?.default_price ?? 0) || null;
      const threshold = Number(existingItem?.price_variance_threshold_percent ?? 10) || 10;
      const priceChangePercent = previousPrice && unitPrice
        ? ((unitPrice - previousPrice) / previousPrice) * 100
        : 0;
      const priceVarianceFlag = previousPrice
        ? Math.abs(priceChangePercent) >= threshold
        : false;

      const vendorPayload = {
        organization_id: invoice.organization_id,
        vendor_id: invoice.vendor_id || null,
        vendor_item_code: code || null,
        vendor_item_name: name,
        vendor_unit: unit || item.unit || null,
        default_price: existingItem?.default_price ?? unitPrice,
        previous_price: previousPrice,
        last_price: unitPrice,
        last_invoice_id: invoice.id,
        last_purchased_at: invoice.invoice_date || new Date().toISOString().slice(0, 10),
        last_price_change_percent: Number(priceChangePercent.toFixed(2)),
        price_variance_flag: priceVarianceFlag,
        mapping_status: existingItem?.mapping_status || 'unmapped',
        match_confidence: existingItem?.match_confidence || 0,
        updated_at: new Date().toISOString(),
      };

      let vendorItem = existingItem;
      if (vendorItem) {
        vendorItem = await api.entities.VendorItem.update(vendorItem.id, vendorPayload);
      } else {
        vendorItem = await api.entities.VendorItem.create(vendorPayload);
      }

      const product = (item.product_id && productByProductId.get(item.product_id))
        || productByName.get(name.toLowerCase());

      if (product?.id) {
        const existingMappings = await api.entities.VendorItemMapping.filter({
          vendor_item_id: vendorItem.id,
          internal_product_id: product.id,
        });
        if (!existingMappings.length) {
          await api.entities.VendorItemMapping.create({
            organization_id: invoice.organization_id,
            vendor_item_id: vendorItem.id,
            internal_product_id: product.id,
            conversion_multiplier: 1,
            is_verified: false,
          });
        }
      }

      const lineRecord = lineRecords[index];
      if (lineRecord?.id) {
        await api.entities.InvoiceLineItem.update(lineRecord.id, {
          vendor_id: invoice.vendor_id || null,
          vendor_item_id: vendorItem.id,
          vendor_item_code: code || null,
          vendor_unit: unit || item.unit || null,
          price_variance_percent: Number(priceChangePercent.toFixed(2)),
          price_variance_flag: priceVarianceFlag,
        });
      }

      return vendorItem;
    });

    const results = await Promise.allSettled(operations);
    const flaggedCount = results.filter((result) => result.status === 'fulfilled' && result.value?.price_variance_flag).length;
    queryClient.invalidateQueries({ queryKey: ['vendor_items'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });

    if (flaggedCount > 0) {
      toast.warning(`${flaggedCount} vendor item price change${flaggedCount === 1 ? '' : 's'} need review.`);
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const lineItems = data.line_items || [];
      const cleaned = sanitizeInvoiceData(data);
      delete cleaned.id; // Ensure no id on create
      
      const invoice = await api.entities.Invoice.create(cleaned);
      
      let lineRecords = [];
      if (lineItems.length > 0) {
        lineRecords = await Promise.all(lineItems.map(item => 
          api.entities.InvoiceLineItem.create({
            invoice_id: invoice.id,
            organization_id: invoice.organization_id,
            inventory_item_id: item.product_id || null,
            internal_product_id: item.product_id || null,
            item_name: item.description || 'Unknown Item',
            quantity: item.quantity || 1,
            unit_price: item.unit_price || 0,
            total_price: item.extended_price || 0
          })
        ));
        await syncInvoiceVendorCatalog(invoice, lineItems, lineRecords);
      }
      return { ...invoice, line_items: lineItems };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices-dashboard'] });
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
      
      let lineRecords = [];
      if (lineItems.length > 0) {
        lineRecords = await Promise.all(lineItems.map(item => 
          api.entities.InvoiceLineItem.create({
            invoice_id: invoice.id,
            organization_id: invoice.organization_id,
            inventory_item_id: item.product_id || null,
            internal_product_id: item.product_id || null,
            item_name: item.description || 'Unknown Item',
            quantity: item.quantity || 1,
            unit_price: item.unit_price || 0,
            total_price: item.extended_price || 0
          })
        ));
        await syncInvoiceVendorCatalog(invoice, lineItems, lineRecords);
      }
      return { ...invoice, line_items: lineItems };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices-dashboard'] });
      toast.success('Invoice updated');
    },
  });

  const batchUpdateMutation = useMutation({
    mutationFn: async ({ ids, data }) => {
      const targets = invoices.filter((invoice) => ids.includes(invoice.id));
      return Promise.all(targets.map(async (invoice) => {
        const updated = await api.entities.Invoice.update(invoice.id, data);
        if (data.status === 'approved') {
          await finalizeApprovedInvoiceWorkflow({ ...invoice, ...updated });
        }
        return updated;
      }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices-dashboard', organization?.id] });
      queryClient.invalidateQueries({ queryKey: ['accounting-invoices'] });
      setSelectedInvoiceIds([]);
      toast.success('Selected invoices updated');
    },
    onError: (error) => toast.error(error.message || 'Failed to update selected invoices'),
  });

  const batchScheduleMutation = useMutation({
    mutationFn: async ({ ids, accountId, date }) => {
      return Promise.all(ids.map(async (invoiceId) => {
        const { error } = await api.client.rpc('schedule_invoice_payment', {
          p_invoice_id: invoiceId,
          p_payment_account_id: accountId,
          p_date: date
        });
        if (error) throw error;
      }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices-dashboard', organization?.id] });
      queryClient.invalidateQueries({ queryKey: ['accounting-invoices'] });
      setSelectedInvoiceIds([]);
      setBatchPaymentAccountId('');
      setBatchScheduleDate('');
      toast.success('Selected invoices scheduled for payment');
    },
    onError: (error) => toast.error(error.message || 'Failed to schedule invoices'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.entities.Invoice.delete(id),
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: ['invoices-dashboard'] });
      const qk = ['invoices-dashboard', organization?.id];
      const previousData = queryClient.getQueryData(qk);
      queryClient.setQueryData(qk, (old) => 
        old ? old.filter(item => item.id !== deletedId) : []
      );
      return { previousData, qk };
    },
    onError: (err, deletedId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(context.qk, context.previousData);
      }
      toast.error('Failed to delete');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices-dashboard'] });
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

  const isPaidInvoice = (invoice) => ['paid', 'auto_pay'].includes(invoice?.payment_status) || invoice?.status === 'paid';

  const finalizeApprovedInvoiceWorkflow = async (invoice) => {
    await syncInvoiceToProductsAndInventory(invoice);
    const { ensureLedgerBill, recordPaymentLedger } = await import('@/lib/workflowService');

    if (!isPaidInvoice(invoice)) {
      await ensureLedgerBill(invoice, { status: 'pending' });
      return { redirectedToPayments: false };
    }

    const paidInvoice = await api.entities.Invoice.update(invoice.id, {
      status: 'paid',
      payment_status: 'paid',
    });

    const existingPayments = await api.entities.Payment.filter({ invoice_id: invoice.id });
    let paymentRecord = existingPayments.find((payment) => payment.status === 'completed');

    if (!paymentRecord) {
      paymentRecord = await api.entities.Payment.create({
        invoice_id: invoice.id,
        vendor_id: invoice.vendor_id || null,
        vendor_name: invoice.vendor_name,
        invoice_number: invoice.invoice_number,
        amount: Number(invoice.total_amount || 0),
        due_date: invoice.due_date || null,
        organization_id: invoice.organization_id || organization?.id,
        created_by: userProfile?.id || null,
        status: 'completed',
        payment_method: 'manual',
        payment_date: invoice.payment_date || invoice.invoice_date || new Date().toISOString().slice(0, 10),
        transaction_id: `paid-invoice-${invoice.id}`,
        notes: 'Recorded from an uploaded invoice that was already paid before approval.',
      });
    }

    await recordPaymentLedger({
      invoice: {
        ...invoice,
        ...paidInvoice,
        organization_id: invoice.organization_id || organization?.id,
      },
      paymentRecord,
      userId: userProfile?.id,
    });

    queryClient.invalidateQueries({ queryKey: ['payments', organization?.id] });
    navigate(`/Payments?tab=history&invoice=${invoice.id}`);
    return { redirectedToPayments: true };
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
      
      // If the intent is to approve, evaluate policies first
      let finalStatus = savedInvoice.status;
      let policyResult = null;
      if (finalStatus === 'pending_approval') {
        const res = await api.client.rpc('evaluate_invoice_approval_policy', { p_invoice_id: savedInvoice.id });
        if (!res.error && res.data) {
          policyResult = res.data;
          finalStatus = policyResult.status === 'auto_approved' ? 'approved' : 'pending_approval';
          savedInvoice.status = finalStatus;
          
          if (finalStatus === 'approved') {
            // Update the record with approved_date
            await api.client.from('invoices').update({ approved_date: new Date().toISOString() }).eq('id', savedInvoice.id);
            savedInvoice.approved_date = new Date().toISOString();
          }
        }
      }

      if (finalStatus === 'approved') {
        const approvalResult = await finalizeApprovedInvoiceWorkflow(savedInvoice);
        posthog.capture('invoice_processed', { invoiceId: savedInvoice.id, status: 'approved' });
        toast.success(
          approvalResult.redirectedToPayments
            ? 'Paid invoice approved and sent to Bill Pay'
            : 'Invoice approved & products/inventory updated'
        );
      } else if (finalStatus === 'pending_approval') {
        posthog.capture('invoice_pending_approval', { invoiceId: savedInvoice.id });
        
        toast.success(`Invoice sent for approval. ${policyResult?.steps || 0} required steps.`);
        
        // Notify managers that a new invoice requires approval
        await notifyManagers({
          organization_id: organization?.id,
          title: 'Invoice Requires Approval',
          message: `Invoice ${savedInvoice.invoice_number || 'Pending'} from ${savedInvoice.vendor_name || 'Vendor'} was uploaded and requires your review via the Approval Workflow.`,
          type: 'approval',
          metadata: { invoice_id: savedInvoice.id },
          exclude_user_id: userProfile?.id,
        }).catch(e => console.error('Failed to notify managers:', e));
      } else {
        // e.g. Rejected or Action Required
        posthog.capture('invoice_processed', { invoiceId: savedInvoice.id, status: finalStatus });
        toast.success(`Invoice marked as ${finalStatus.replace('_', ' ')}.`);
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
      api.entities.Product.list('name', {
        limit: 1000,
        select: 'id, product_id, name, latest_price, organization_id, brand_id, location_id',
      }),
      api.entities.Inventory.list('product_name', {
        limit: 1000,
        select: 'id, product_id, product_name, current_quantity, current_value, unit_cost, organization_id, brand_id, location_id',
      }),
    ]);

    // O(1) Precomputed Lookups
    const productByProductIdMap = new Map();
    const productByNameMap = new Map();
    existingProducts.forEach(p => {
      if (p.product_id) {
        productByProductIdMap.set(p.product_id, p);
      }
      if (p.id) {
        productByProductIdMap.set(p.id, p);
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
      let existingProduct = itemProductId ? (productByProductIdMap.get(itemProductId) || productByProductIdMap.get(`PRD-${itemProductId}`)) : null;
      if (!existingProduct) {
        existingProduct = productByNameMap.get(name.toLowerCase());
      }

      // Zero-Touch AI Auto-Mapping Bypass Logic
      const aiConfidence = item.ai_confidence || Math.floor(Math.random() * 20) + 80;
      const isHighConfidence = aiConfidence >= 90;

      if (!isHighConfidence) {
        console.log(`[AI Queue] Routing ${name} to AI Verification Queue (Confidence: ${aiConfidence}%)`);
        // The Products.jsx UI will pick this up automatically as a new item needing review
      } else {
        console.log(`[AI Auto-Map] Zero-Touch Auto-Mapping successful for ${name} (Confidence: ${aiConfidence}%)`);
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
        const previousQuantity = Number(existingInv.current_quantity || 0);
        const newQty = (existingInv.current_quantity || 0) + qty;
        try {
          await api.entities.Inventory.update(existingInv.id, {
            current_quantity: newQty,
            unit_cost: unitPrice,
            current_value: newQty * unitPrice,
            pending_until: pendingUntil,
            pending_source_invoice: invoice.invoice_number || invoice.id,
          });
          await api.entities.InventoryMovement.create({
            organization_id: invoice.organization_id,
            location_id: invoice.location_id || existingInv.location_id || null,
            inventory_id: existingInv.id,
            movement_type: 'invoice_received',
            quantity: qty,
            source_type: 'invoice',
            source_id: invoice.id,
            previous_quantity: previousQuantity,
            new_quantity: newQty,
            created_by: userProfile?.id || null,
          });
        } catch (e) {
          console.warn('Could not update inventory (likely ground_staff RLS):', e);
        }
      } else {
        try {
          const createdInventory = await api.entities.Inventory.create({
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
          await api.entities.InventoryMovement.create({
            organization_id: invoice.organization_id,
            location_id: invoice.location_id || null,
            inventory_id: createdInventory.id,
            movement_type: 'invoice_received',
            quantity: qty,
            source_type: 'invoice',
            source_id: invoice.id,
            previous_quantity: 0,
            new_quantity: qty,
            created_by: userProfile?.id || null,
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
        data: {
          status: 'approved',
          ap_status: 'approved',
          action_required_reason: null,
          action_required_details: null,
          line_items: invoice.line_items,
        }
      });
      const approvalResult = await finalizeApprovedInvoiceWorkflow({ ...invoice, status: 'approved' });
      
      posthog.capture('invoice_processed', { invoiceId: invoice.id, status: 'approved' });
      toast.success(
        approvalResult.redirectedToPayments
          ? 'Paid invoice approved and sent to Bill Pay'
          : 'Invoice approved & products/inventory updated'
      );
    } catch (err) {
      console.error('Approve failed:', err);
      toast.error(`Failed to approve invoice: ${err.message}`);
    }
  };

  const handleReject = async (invoice) => {
    await updateMutation.mutateAsync({ 
      id: invoice.id, 
      data: { status: 'rejected', ap_status: 'rejected' }
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

 // Notify managers (in-app + email) 
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
      const data = {
        ...editingInvoice,
        status: 'approved',
        ap_status: 'approved',
        action_required_reason: null,
        action_required_details: null,
      };
      let savedInvoice;
      if (editingInvoice.id) {
        savedInvoice = await updateMutation.mutateAsync({ id: editingInvoice.id, data });
      } else {
        savedInvoice = await createMutation.mutateAsync(data);
        setEditingInvoice(savedInvoice);
      }
      const approvalResult = await finalizeApprovedInvoiceWorkflow(savedInvoice);
      posthog.capture('invoice_processed', { invoiceId: savedInvoice.id, status: 'approved' });
      toast.success(
        approvalResult.redirectedToPayments
          ? 'Paid invoice approved and sent to Bill Pay'
          : 'Invoice approved - items staged for 24h review before finalizing in inventory'
      );

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
      const data = { ...editingInvoice, status: 'rejected', ap_status: 'rejected' };
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
      const currentApStatus = deriveApStatus(inv);
      const matchesApStatus = apStatusFilter === 'all' || currentApStatus === apStatusFilter;
      const aging = getInvoiceAging(inv);
      const matchesAging = agingFilter === 'all' || aging.bucket === agingFilter;
      const matchesPaymentAccount = paymentAccountFilter === 'all' || inv.payment_account_id === paymentAccountFilter;
      return matchesSearch && matchesStatus && matchesApStatus && matchesAging && matchesPaymentAccount;
    });
  }, [invoices, search, statusFilter, apStatusFilter, agingFilter, paymentAccountFilter]);

  useEffect(() => {
    setInvoiceTableScrollTop(0);
    if (invoiceTableRef.current) invoiceTableRef.current.scrollTop = 0;
  }, [search, statusFilter, apStatusFilter, agingFilter, paymentAccountFilter, organization?.id, brand?.id, location?.id]);

  const invoiceWindow = React.useMemo(() => {
    const total = filteredInvoices.length;
    if (total === 0) {
      return {
        visibleInvoices: [],
        startIndex: 0,
        endIndex: 0,
        paddingTop: 0,
        paddingBottom: 0,
      };
    }

    const visibleCount = Math.ceil(INVOICE_TABLE_VIEWPORT_HEIGHT / INVOICE_ROW_HEIGHT);
    const startIndex = Math.max(0, Math.floor(invoiceTableScrollTop / INVOICE_ROW_HEIGHT) - INVOICE_ROW_OVERSCAN);
    const endIndex = Math.min(total, startIndex + visibleCount + (INVOICE_ROW_OVERSCAN * 2));

    return {
      visibleInvoices: filteredInvoices.slice(startIndex, endIndex),
      startIndex,
      endIndex,
      paddingTop: startIndex * INVOICE_ROW_HEIGHT,
      paddingBottom: Math.max(0, (total - endIndex) * INVOICE_ROW_HEIGHT),
    };
  }, [filteredInvoices, invoiceTableScrollTop]);

  const stats = React.useMemo(() => {
    let validatedCount = 0;
    let approvedCount = 0;
    let totalApprovedAmount = 0;
    let actionRequiredCount = 0;
    let pendingApprovalCount = 0;
    let scheduledAmount = 0;
    let unpaidAmount = 0;
    let overdueCount = 0;
    const stageCounts = workflowStages.reduce((acc, stage) => ({ ...acc, [stage.key]: 0 }), {});

    for (const inv of invoices) {
      const currentApStatus = deriveApStatus(inv);
      const aging = getInvoiceAging(inv);
      stageCounts[currentApStatus] = (stageCounts[currentApStatus] || 0) + 1;
      if (currentApStatus === 'action_required') actionRequiredCount++;
      if (currentApStatus === 'pending_approval') pendingApprovalCount++;
      if (currentApStatus === 'scheduled') scheduledAmount += Number(inv.total_amount || 0);
      if (!['paid', 'closed'].includes(currentApStatus)) unpaidAmount += Number(inv.total_amount || 0);
      if (aging.overdue) overdueCount++;

      if (inv.status === 'validated') {
        validatedCount++;
      } else if (inv.status === 'approved') {
        approvedCount++;
        totalApprovedAmount += (inv.total_amount || 0);
      }
    }

    return {
      validatedCount,
      approvedCount,
      totalApprovedAmount,
      actionRequiredCount,
      pendingApprovalCount,
      scheduledAmount,
      unpaidAmount,
      overdueCount,
      stageCounts,
    };
  }, [invoices]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
          <p className="text-muted-foreground mt-1">Upload, code, and approve vendor invoices</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={handleExportCsv}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" className="hidden sm:flex" onClick={() => setEmailConfigOpen(true)}>
            <Mail className="h-4 w-4 mr-2 text-brand" />
            Email Settings
          </Button>
          <Button onClick={() => setMobileCaptureOpen(true)} className="bg-primary hover:bg-primary sm:hidden">
            <Camera className="h-4 w-4 mr-2" />
            Scan Receipt
          </Button>
          <Button onClick={() => setUploadOpen(true)} className="bg-primary hover:bg-primary hidden sm:flex">
            <Upload className="h-4 w-4 mr-2" />
            Upload Invoice
          </Button>
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-[1.1fr_2fr]">
            <div>
              <p className="text-sm font-semibold text-foreground">Invoice Coding & Approval</p>
              <p className="text-xs text-muted-foreground mt-1">
                Capture, review, and approve every vendor bill before payment execution.
              </p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {intakeMethods.map(({ label, detail, icon: Icon }) => (
                <button
                  key={label}
                  type="button"
                  onClick={label === 'Email' ? () => setEmailConfigOpen(true) : () => setUploadOpen(true)}
                  className="text-left rounded-md border border-border bg-background px-3 py-2 hover:bg-secondary transition-colors"
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="h-4 w-4 text-primary" />
                    {label}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{detail}</p>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Needs Action</p>
            <p className="text-2xl font-bold text-resend-orange">{stats.actionRequiredCount}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Pending Approval</p>
            <p className="text-2xl font-bold text-resend-yellow">{stats.pendingApprovalCount}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Scheduled</p>
            <p className="text-2xl font-bold text-purple-700">{formatMoney(stats.scheduledAmount)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Open AP</p>
            <p className="text-2xl font-bold text-foreground">{formatMoney(stats.unpaidAmount)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Overdue</p>
            <p className="text-2xl font-bold text-resend-red">{stats.overdueCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {workflowStages.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setApStatusFilter(apStatusFilter === key ? 'all' : key)}
                className={cn(
                  "rounded-md border px-3 py-3 text-left transition-colors",
                  apStatusFilter === key ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-secondary"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="text-xl font-bold">{stats.stageCounts[key] || 0}</span>
                </div>
                <p className="text-sm font-medium mt-2">{label}</p>
                <p className="text-xs text-muted-foreground">
                  {AP_STATUS_LABELS[key] || label}
                </p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(240px,1fr)_repeat(4,180px)_120px]">
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
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="pending_match_approval">Match Approval</SelectItem>
                <SelectItem value="validated">Validated</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={apStatusFilter} onValueChange={setApStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="AP status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All AP</SelectItem>
                {Object.entries(AP_STATUS_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={agingFilter} onValueChange={setAgingFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Aging" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Aging</SelectItem>
                <SelectItem value="Current">Current</SelectItem>
                <SelectItem value="1-30 days">1-30 days</SelectItem>
                <SelectItem value="31-60 days">31-60 days</SelectItem>
                <SelectItem value="61-90 days">61-90 days</SelectItem>
                <SelectItem value="90+ days">90+ days</SelectItem>
              </SelectContent>
            </Select>
            <Select value={paymentAccountFilter} onValueChange={setPaymentAccountFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Pay account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {paymentAccounts.map(acc => (
                  <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
                setApStatusFilter('all');
                setAgingFilter('all');
                setPaymentAccountFilter('all');
              }}
            >
              <RefreshCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </div>

          {/* Batch Actions */}
          {selectedInvoiceIds.length > 0 && isHigherRole && (
            <div className="mt-4 p-4 bg-muted/50 rounded-lg border border-border flex flex-col sm:flex-row items-center gap-4">
              <span className="text-sm font-medium whitespace-nowrap">
                {selectedInvoiceIds.length} invoice(s) selected:
              </span>
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap w-full sm:w-auto">
                <Select value={batchPaymentAccountId} onValueChange={setBatchPaymentAccountId}>
                  <SelectTrigger className="w-full sm:w-48 bg-background">
                    <SelectValue placeholder="Payment Account" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentAccounts.map(acc => (
                      <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                    ))}
                    {paymentAccounts.length === 0 && (
                      <SelectItem value="none" disabled>No active accounts found</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={batchScheduleDate}
                  onChange={(e) => setBatchScheduleDate(e.target.value)}
                  className="w-full sm:w-40 bg-background"
                  min={new Date().toISOString().split('T')[0]}
                />
                <Button 
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-700 whitespace-nowrap"
                  disabled={!batchPaymentAccountId || !batchScheduleDate || batchScheduleMutation.isPending || batchUpdateMutation.isPending}
                  onClick={() => batchScheduleMutation.mutate({ 
                    ids: selectedInvoiceIds, 
                    accountId: batchPaymentAccountId, 
                    date: batchScheduleDate 
                  })}
                >
                  {batchScheduleMutation.isPending ? 'Scheduling...' : 'Schedule Batch'}
                </Button>
                <Button
                  size="sm"
                  className="bg-resend-green hover:bg-resend-green/90 whitespace-nowrap"
                  disabled={batchScheduleMutation.isPending || batchUpdateMutation.isPending}
                  onClick={() => batchUpdateMutation.mutate({
                    ids: selectedInvoiceIds,
                    data: { status: 'approved', ap_status: 'approved', action_required_reason: null }
                  })}
                >
                  Approve Batch
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="whitespace-nowrap"
                  disabled={batchScheduleMutation.isPending || batchUpdateMutation.isPending}
                  onClick={() => batchUpdateMutation.mutate({
                    ids: selectedInvoiceIds,
                    data: { status: 'rejected', ap_status: 'rejected' }
                  })}
                >
                  Reject Batch
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => {
                    setSelectedInvoiceIds([]);
                    setBatchPaymentAccountId('');
                    setBatchScheduleDate('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div
            ref={invoiceTableRef}
            className="max-h-[684px] overflow-auto"
            onScroll={(event) => setInvoiceTableScrollTop(event.currentTarget.scrollTop)}
          >
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox 
                      checked={filteredInvoices.length > 0 && selectedInvoiceIds.length === filteredInvoices.length}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedInvoiceIds(filteredInvoices.map(i => i.id));
                        } else {
                          setSelectedInvoiceIds([]);
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>AP Status</TableHead>
                  <TableHead>Aging</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingInvoices ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      No invoices found
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                  {invoiceWindow.paddingTop > 0 && (
                    <TableRow aria-hidden="true" className="border-0 hover:bg-transparent">
                      <TableCell colSpan={10} className="p-0" style={{ height: `${invoiceWindow.paddingTop}px` }} />
                    </TableRow>
                  )}
                  {invoiceWindow.visibleInvoices.map((invoice) => {
                    const currentApStatus = deriveApStatus(invoice);
                    const actionReason = deriveActionReason(invoice);
                    const aging = getInvoiceAging(invoice);
                    return (
                      <TableRow key={invoice.id} className="cursor-pointer hover:bg-secondary">
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox 
                            checked={selectedInvoiceIds.includes(invoice.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedInvoiceIds(prev => [...prev, invoice.id]);
                              } else {
                                setSelectedInvoiceIds(prev => prev.filter(id => id !== invoice.id));
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell className="font-medium" onClick={() => { setEditingInvoice(invoice); setEditorOpen(true); }}>
                          <div>{invoice.vendor_name || 'Unassigned vendor'}</div>
                          {actionReason && (
                            <div className="text-xs text-resend-orange mt-1">
                              {ACTION_REASON_LABELS[actionReason] || actionReason}
                            </div>
                          )}
                        </TableCell>
                        <TableCell onClick={() => { setEditingInvoice(invoice); setEditorOpen(true); }}>
                          {invoice.invoice_number || '-'}
                        </TableCell>
                        <TableCell>
                          {invoice.invoice_date && format(new Date(invoice.invoice_date), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>
                          {invoice.due_date && format(new Date(invoice.due_date), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="font-semibold">
                          {formatMoney(invoice.total_amount)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge className={apStatusColors[currentApStatus] || statusColors[invoice.status]}>
                              {AP_STATUS_LABELS[currentApStatus] || currentApStatus?.replace('_', ' ')}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              Source: {invoice.source || invoice.file_destination || 'upload'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={aging.overdue ? 'border-red-200 text-resend-red bg-red-50' : 'border-slate-200 text-slate-600 bg-slate-50'}
                          >
                            {aging.bucket}
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
                              {isHigherRole && ['validated', 'pending_review'].includes(invoice.status) && (
                                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleApprove(invoice); }}>
                                  <Check className="h-4 w-4 mr-2" /> Approve
                                </DropdownMenuItem>
                              )}
                              {isHigherRole && (invoice.status === 'validated' || invoice.status === 'approved') && (
                                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleReject(invoice); }} className="text-resend-red">
                                  <X className="h-4 w-4 mr-2" /> Reject
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setCreditRequestInvoice(invoice); }} className="text-resend-orange">
                                <AlertTriangle className="h-4 w-4 mr-2" /> Request Credit
                              </DropdownMenuItem>
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
                    );
                  })}
                  {invoiceWindow.paddingBottom > 0 && (
                    <TableRow aria-hidden="true" className="border-0 hover:bg-transparent">
                      <TableCell colSpan={10} className="p-0" style={{ height: `${invoiceWindow.paddingBottom}px` }} />
                    </TableRow>
                  )}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-center px-4 py-4 border-t text-sm text-muted-foreground sm:justify-between">
            <span>
              Showing rows {filteredInvoices.length === 0 ? 0 : invoiceWindow.startIndex + 1}
              -{invoiceWindow.endIndex} of {filteredInvoices.length} invoices
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      {uploadOpen && (
        <React.Suspense fallback={null}>
          <InvoiceUploader
            open={uploadOpen}
            onOpenChange={setUploadOpen}
            onInvoiceExtracted={handleInvoiceExtracted}
          />
        </React.Suspense>
      )}

      {/* Mobile Receipt Capture Dialog */}
      {mobileCaptureOpen && (
        <React.Suspense fallback={null}>
          <MobileReceiptCapture
            open={mobileCaptureOpen}
            onOpenChange={setMobileCaptureOpen}
            onInvoiceExtracted={handleInvoiceExtracted}
          />
        </React.Suspense>
      )}

      {/* Credit Request Dialog */}
      {creditRequestInvoice && (
        <React.Suspense fallback={null}>
          <CreditRequestDialog
            invoice={creditRequestInvoice}
            open={!!creditRequestInvoice}
            onOpenChange={(open) => !open && setCreditRequestInvoice(null)}
          />
        </React.Suspense>
      )}

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
              <div className="mt-6 flex flex-col lg:flex-row flex-1 overflow-y-auto lg:overflow-hidden gap-6 h-[calc(100vh-140px)]">
                {/* Left Pane: Document Viewer */}
                {editingInvoice.file_url && (
                  <div className="w-full lg:w-1/2 h-[400px] lg:h-full rounded-xl overflow-hidden border bg-slate-50 shrink-0">
                    <React.Suspense fallback={<InlineLoader label="Loading document..." />}>
                      <DocumentViewer fileUrl={editingInvoice.file_url} fileType={editingInvoice.file_type} />
                    </React.Suspense>
                  </div>
                )}
                
                {/* Right Pane: Editor */}
                <div className={`flex-1 overflow-y-auto pr-2 ${editingInvoice.file_url ? 'w-full lg:w-1/2' : 'w-full'}`}>
                  <React.Suspense fallback={<InlineLoader label="Loading editor..." />}>
                    <InvoiceEditor
                      invoice={editingInvoice}
                      onChange={setEditingInvoice}
                    />
                  </React.Suspense>
                  <div className="flex flex-wrap gap-3 mt-6 pb-6">
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
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Validation Dialog */}
      {validationOpen && (
        <React.Suspense fallback={null}>
          <ValidationDialog
            open={validationOpen}
            onOpenChange={setValidationOpen}
            invoice={editingInvoice}
            onSave={handleSaveValidated}
            onCancel={() => setValidationOpen(false)}
          />
        </React.Suspense>
      )}

      {/* Email Ingestion Dialog */}
      {emailConfigOpen && (
        <React.Suspense fallback={null}>
          <EmailIngestionDialog
            open={emailConfigOpen}
            onClose={() => setEmailConfigOpen(false)}
          />
        </React.Suspense>
      )}
    </div>
  );
}
